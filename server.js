const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const winston = require('winston');
const cors = require('cors');

// Check if config.json exists, if not, copy from example
const configPath = path.join(__dirname, 'config.json');
const configExamplePath = path.join(__dirname, 'config.json.example');

// Create config.json from example if it doesn't exist
if (!fs.existsSync(configPath) && fs.existsSync(configExamplePath)) {
  try {
    fs.copyFileSync(configExamplePath, configPath);
    console.log('Created new config.json from example template');
  } catch (error) {
    console.error('Error creating config.json from template:', error);
    process.exit(1);
  }
}

// Load configuration
const serverConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Configure logger
const logger = winston.createLogger({
  level: serverConfig.logLevel || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, 'airquality.log') })
  ]
});

// Add console logging in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const app = express();
const PORT = serverConfig.port || process.env.PORT || 3000;

// Create client config with necessary server config included
const clientConfigPath = path.join(__dirname, 'public', 'config.json');
const clientConfig = JSON.parse(fs.readFileSync(clientConfigPath, 'utf8'));
clientConfig.location = serverConfig.location;

// Write updated client config
fs.writeFileSync(clientConfigPath, JSON.stringify(clientConfig, null, 2));

// Enable CORS
app.use(cors());

// Request stats tracking - just for monitoring, not for rate limiting
const requestStats = {
  totalRequests: 0,
  apiCalls: 0,
  clientRequests: new Map(),
  lastLogTime: Date.now(),
  logInterval: 60000, // Log stats every minute
  
  trackRequest: function(ip) {
    this.totalRequests++;
    this.clientRequests.set(ip, (this.clientRequests.get(ip) || 0) + 1);
    
    const now = Date.now();
    if (now - this.lastLogTime > this.logInterval) {
      const clientList = Array.from(this.clientRequests.entries())
        .map(([ip, count]) => `${ip}: ${count}`)
        .join(', ');
      
      logger.info(`Stats: ${this.totalRequests} client requests, ${this.apiCalls} external API calls. Clients: ${clientList}`);
      
      // Reset counters but keep the client list
      this.totalRequests = 0;
      this.apiCalls = 0;
      this.lastLogTime = now;
    }
  },
  
  trackApiCall: function() {
    this.apiCalls++;
  }
};

// Helper function to get client IP
function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.ip || 'unknown';
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Data cache and control variables
let lastFetchedData = null;
let lastFetchTime = 0;
let fetchPromise = null;
let externalApiTimer = null;
const externalApiInterval = (serverConfig.pollingIntervalSec || 20) * 1000;

// Start the polling for external API
function startExternalApiPolling() {
  if (serverConfig.externalApiUrl) {
    console.log(`Starting polling of external API at interval ${serverConfig.pollingIntervalSec || 20} seconds`);
    // Initial fetch
    fetchExternalData(serverConfig.externalApiUrl)
      .then(data => {
        lastFetchedData = data;
        console.log('Initial data fetched from external API');
      })
      .catch(error => {
        console.error('Failed to fetch initial data:', error.message);
      });

    // Set up interval for polling
    externalApiTimer = setInterval(() => {
      fetchExternalData(serverConfig.externalApiUrl)
        .then(data => {
          lastFetchedData = data;
          console.log('Data updated from external API');
        })
        .catch(error => {
          console.error('Failed to update data:', error.message);
        });
    }, externalApiInterval);
  } else {
    console.log('External API URL not configured, polling disabled');
  }
}

// Stop polling for external API
function stopExternalApiPolling() {
  if (externalApiTimer) {
    clearInterval(externalApiTimer);
    externalApiTimer = null;
    logger.info('Stopped external API polling');
  }
}

// Fetch data from external API
async function fetchExternalData(apiUrl) {
  try {
    // Handle the case when apiUrl is not provided
    if (!apiUrl) {
      apiUrl = serverConfig.externalApiUrl;
      if (!apiUrl) {
        throw new Error('External API URL not configured');
      }
    }
    
    // Ensure the API URL has a protocol
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
      // For local network addresses, default to http
      if (apiUrl.includes('192.168.') || apiUrl.includes('127.0.0.1') || apiUrl.includes('localhost')) {
        apiUrl = 'http://' + apiUrl;
      } else {
        apiUrl = 'https://' + apiUrl;
      }
    }
    
    // Use the API URL directly without appending lat/lon parameters
    const url = apiUrl;
    console.log(`Attempting to connect to: ${url} at ${new Date().toISOString()}`);
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      // Log DNS lookup attempt
      console.log(`Performing DNS lookup for: ${url.replace('http://', '').replace('https://', '').split('/')[0]}`);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AirQualityDashboard/1.0',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        timeout: 10000,
        size: 0, // No size limit
        follow: 5, // Follow up to 5 redirects
        agent: null // Use the default agent (important for Node.js connections)
      });
      
      clearTimeout(timeoutId);
      
      console.log(`Received response with status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Successfully parsed JSON data from: ${url}`);
      return data;
    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        throw new Error('API request timed out after 10 seconds');
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Error in fetchExternalData:', error.message);
    throw error;
  }
}

// UV data cache
let lastUvData = null;
let lastUvFetchTime = 0;
let uvFetchPromise = null;
let uvApiTimer = null;
const uvApiInterval = (serverConfig.uvRefreshIntervalSec || 1800) * 1000;

// Start timed polling of UV API
function startUvApiPolling() {
  // Clear any existing timer
  if (uvApiTimer) {
    clearInterval(uvApiTimer);
  }
  
  // Initial fetch
  fetchUvData();
  
  // Set up recurring timer
  uvApiTimer = setInterval(fetchUvData, uvApiInterval);
  
  logger.info(`Started UV API polling every ${uvApiInterval/1000} seconds`);
}

// Fetch data from UV API
async function fetchUvData() {
  // If a fetch is already in progress, don't start another one
  if (uvFetchPromise) {
    logger.debug('Skipping scheduled UV API poll - previous fetch still in progress');
    return;
  }
  
  // Check if UV API config is available
  if (!serverConfig.uvApi || !serverConfig.uvApi.apiKey) {
    logger.error('UV API key not configured in config.json');
    return;
  }
  
  const lat = serverConfig.location.latitude;
  const lon = serverConfig.location.longitude;
  let apiUrl = serverConfig.uvApi.url || 'https://api.openuv.io/api/v1/forecast';
  
  // Ensure URL has protocol
  if (apiUrl && !apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
    apiUrl = 'https://' + apiUrl;
  }
  
  const url = `${apiUrl}?lat=${lat}&lng=${lon}`;
  
  logger.info(`Polling OpenUV API: ${url}`);
  requestStats.trackApiCall();
  
  try {
    uvFetchPromise = fetch(url, {
      headers: {
        'x-access-token': serverConfig.uvApi.apiKey
      }
    });
    
    const response = await uvFetchPromise;
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Transform the OpenUV API data format to match our expected format
    const transformedData = transformOpenUvData(data);
    
    // Update cache
    lastUvData = transformedData;
    lastUvFetchTime = Date.now();
    
    logger.info('UV API data refreshed successfully', {
      timestamp: new Date().toISOString(),
      current_uvi: transformedData.now?.uvi
    });
  } catch (error) {
    logger.error('Error fetching from UV API', { 
      error: error.message,
      url: url
    });
  } finally {
    // Always clear the promise
    uvFetchPromise = null;
  }
}

// Transform OpenUV API data to our expected format
function transformOpenUvData(openUvData) {
  if (!openUvData || !openUvData.result || !Array.isArray(openUvData.result) || openUvData.result.length === 0) {
    logger.error('Invalid or empty data from OpenUV API');
    return null;
  }
  
  try {
    // Sort the forecast data by time
    const sortedForecast = [...openUvData.result].sort((a, b) => {
      return new Date(a.uv_time) - new Date(b.uv_time);
    });
    
    // Find the current UV index (closest to current time)
    const now = new Date();
    let closestIndex = 0;
    let minTimeDiff = Infinity;
    
    for (let i = 0; i < sortedForecast.length; i++) {
      const forecastTime = new Date(sortedForecast[i].uv_time);
      const timeDiff = Math.abs(forecastTime - now);
      
      if (timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff;
        closestIndex = i;
      }
    }
    
    const currentUvi = sortedForecast[closestIndex].uv;
    
    // Create a forecast array in the format our frontend expects
    const forecast = sortedForecast.map(item => {
      return {
        uvi: item.uv,
        time: item.uv_time
      };
    });
    
    // Return in the format expected by our frontend
    return {
      now: {
        uvi: currentUvi
      },
      forecast: forecast
    };
  } catch (error) {
    logger.error('Error transforming OpenUV data', { error: error.message });
    return null;
  }
}

// Cache for API requests
const dataCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes default TTL

// API endpoint to fetch air quality data
app.get('/api/airquality', async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    console.log(`[${clientIp}] Fetching air quality data`);

    if (!serverConfig.externalApiUrl) {
      console.warn('External API URL is not configured');
      return res.json({ 
        error: 'Air quality API not configured',
        current: null
      });
    }

    // Ensure the API URL has a protocol
    let apiUrl = serverConfig.externalApiUrl;
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
      // For local network addresses, default to http
      if (apiUrl.includes('192.168.') || apiUrl.includes('127.0.0.1') || apiUrl.includes('localhost')) {
        apiUrl = 'http://' + apiUrl;
      } else {
        apiUrl = 'https://' + apiUrl;
      }
    }
    
    // Create a simple cache key for the data
    const cacheKey = `airquality-data`;
    
    // Check if we have cached data and it's not expired
    if (dataCache[cacheKey] && Date.now() - dataCache[cacheKey].timestamp < CACHE_TTL) {
      console.log(`[${clientIp}] Using cached air quality data`);
      return res.json(dataCache[cacheKey].data);
    }
    
    console.log(`[${clientIp}] First time fetch or cache expired, fetching new air quality data`);
    
    // Fetch data directly from the API without appending lat/lon
    const data = await fetchExternalData(apiUrl);
    
    // Cache the response
    dataCache[cacheKey] = {
      timestamp: Date.now(),
      data: data
    };
    
    return res.json(data);
  } catch (error) {
    console.error('Error fetching air quality data:', error.message);
    return res.json({ 
      error: 'Failed to fetch air quality data: ' + error.message,
      current: null 
    });
  }
});

// API endpoint to fetch UV index data
app.get('/api/uvindex', async (req, res) => {
  const clientIP = getClientIp(req);
  requestStats.trackRequest(clientIP);
  
  // Check if UV API is configured
  if (!serverConfig.uvApi || !serverConfig.uvApi.apiKey) {
    logger.warn('UV API key not configured in config.json');
    return res.json({
      error: 'UV API not configured',
      now: { uvi: null },
      forecast: []
    });
  }
  
  // If we have cached data, return it immediately
  if (lastUvData) {
    return res.json(lastUvData);
  }
  
  // If we don't have data yet, fetch it now
  try {
    if (!uvFetchPromise) {
      const lat = serverConfig.location.latitude;
      const lon = serverConfig.location.longitude;
      let apiUrl = serverConfig.uvApi.url || 'https://api.openuv.io/api/v1/forecast';
      
      // Ensure URL has protocol
      if (apiUrl && !apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
        apiUrl = 'https://' + apiUrl;
      }
      
      const url = `${apiUrl}?lat=${lat}&lng=${lon}`;
      
      logger.info(`First-time UV data fetch triggered by client ${clientIP}`);
      
      uvFetchPromise = fetch(url, {
        headers: {
          'x-access-token': serverConfig.uvApi.apiKey
        }
      });
      
      requestStats.trackApiCall();
    } else {
      logger.debug(`Client ${clientIP} waiting for in-progress UV fetch`);
    }
    
    const response = await uvFetchPromise;
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Transform the OpenUV API data format to match our expected format
    const transformedData = transformOpenUvData(data);
    
    if (!transformedData) {
      throw new Error('Failed to transform UV data');
    }
    
    // Update cache
    lastUvData = transformedData;
    lastUvFetchTime = Date.now();
    uvFetchPromise = null;
    
    return res.json(transformedData);
  } catch (error) {
    logger.error('Error fetching UV index data', { error: error.message });
    uvFetchPromise = null;
    
    // Return a valid but empty response structure instead of an error
    return res.json({
      error: error.message,
      now: { uvi: null },
      forecast: []
    });
  }
});

// API endpoint to fetch version information
app.get('/api/version', (req, res) => {
  try {
    const versionPath = path.join(__dirname, 'version.json');
    const versionInfo = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    res.json(versionInfo);
  } catch (error) {
    logger.error('Error reading version information', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch version information' });
  }
});

// Serve index.html for all routes to support SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
  
  // Log configuration
  logger.info('Server configuration:', {
    apiUrl: serverConfig.externalApiUrl,
    pollingInterval: `${serverConfig.pollingIntervalSec || 20}s`,
    uvPollingInterval: `${serverConfig.uvRefreshIntervalSec || 1800}s`,
    uvApi: serverConfig.uvApi ? 'Configured with OpenUV API' : 'Not configured'
  });
  
  // Start the polling timers
  startExternalApiPolling();
  startUvApiPolling();
}); 