const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const winston = require('winston');
const cors = require('cors');

// Load configuration
const configPath = path.join(__dirname, 'config.json');
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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Data cache and control variables
let lastFetchedData = null;
let lastFetchTime = 0;
let fetchPromise = null;
let externalApiTimer = null;
const externalApiInterval = (serverConfig.pollingIntervalSec || 20) * 1000;

// Start timed polling of external API
function startExternalApiPolling() {
  // Clear any existing timer
  if (externalApiTimer) {
    clearInterval(externalApiTimer);
  }
  
  // Initial fetch
  fetchExternalData();
  
  // Set up recurring timer
  externalApiTimer = setInterval(fetchExternalData, externalApiInterval);
  
  logger.info(`Started external API polling every ${externalApiInterval/1000} seconds`);
}

// Fetch data from external API
async function fetchExternalData() {
  // If a fetch is already in progress, don't start another one
  if (fetchPromise) {
    logger.debug('Skipping scheduled API poll - previous fetch still in progress');
    return;
  }
  
  logger.info(`Polling external API: ${serverConfig.externalApiUrl}`);
  requestStats.trackApiCall();
  
  try {
    fetchPromise = fetch(serverConfig.externalApiUrl);
    const response = await fetchPromise;
    const data = await response.json();
    
    // Update cache
    lastFetchedData = data;
    lastFetchTime = Date.now();
    
    logger.info('External API data refreshed successfully', {
      timestamp: new Date().toISOString(),
      mainus: data.current?.mainus,
      aqius: data.current?.aqius
    });
  } catch (error) {
    logger.error('Error fetching from external API', { 
      error: error.message,
      url: serverConfig.externalApiUrl
    });
  } finally {
    // Always clear the promise
    fetchPromise = null;
  }
}

// API endpoint to fetch air quality data
app.get('/api/airquality', async (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.ip;
  requestStats.trackRequest(clientIP);
  
  // If we have cached data, return it immediately
  if (lastFetchedData) {
    return res.json(lastFetchedData);
  }
  
  // If we don't have data yet, fetch it now
  try {
    if (!fetchPromise) {
      logger.info(`First-time data fetch triggered by client ${clientIP}`);
      fetchPromise = fetch(serverConfig.externalApiUrl);
      requestStats.trackApiCall();
    } else {
      logger.debug(`Client ${clientIP} waiting for in-progress fetch`);
    }
    
    const response = await fetchPromise;
    const data = await response.json();
    
    // Update cache
    lastFetchedData = data;
    lastFetchTime = Date.now();
    fetchPromise = null;
    
    return res.json(data);
  } catch (error) {
    logger.error('Error fetching air quality data', { error: error.message });
    fetchPromise = null;
    res.status(500).json({ error: 'Failed to fetch air quality data' });
  }
});

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
  
  const lat = serverConfig.location.latitude;
  const lon = serverConfig.location.longitude;
  const url = `https://currentuvindex.com/api/v1/uvi?latitude=${lat}&longitude=${lon}`;
  
  logger.info(`Polling UV API: ${url}`);
  requestStats.trackApiCall();
  
  try {
    uvFetchPromise = fetch(url);
    const response = await uvFetchPromise;
    const data = await response.json();
    
    // Update cache
    lastUvData = data;
    lastUvFetchTime = Date.now();
    
    logger.info('UV API data refreshed successfully', {
      timestamp: new Date().toISOString(),
      current_uvi: data.now?.uvi
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

// API endpoint to fetch UV index data
app.get('/api/uvindex', async (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.ip;
  requestStats.trackRequest(clientIP);
  
  // If we have cached data, return it immediately
  if (lastUvData) {
    return res.json(lastUvData);
  }
  
  // If we don't have data yet, fetch it now
  try {
    if (!uvFetchPromise) {
      const lat = serverConfig.location.latitude;
      const lon = serverConfig.location.longitude;
      const url = `https://currentuvindex.com/api/v1/uvi?latitude=${lat}&longitude=${lon}`;
      
      logger.info(`First-time UV data fetch triggered by client ${clientIP}`);
      uvFetchPromise = fetch(url);
      requestStats.trackApiCall();
    } else {
      logger.debug(`Client ${clientIP} waiting for in-progress UV fetch`);
    }
    
    const response = await uvFetchPromise;
    const data = await response.json();
    
    // Update cache
    lastUvData = data;
    lastUvFetchTime = Date.now();
    uvFetchPromise = null;
    
    return res.json(data);
  } catch (error) {
    logger.error('Error fetching UV index data', { error: error.message });
    uvFetchPromise = null;
    res.status(500).json({ error: 'Failed to fetch UV index data' });
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
    uvPollingInterval: `${serverConfig.uvRefreshIntervalSec || 1800}s`
  });
  
  // Start the polling timers
  startExternalApiPolling();
  startUvApiPolling();
}); 