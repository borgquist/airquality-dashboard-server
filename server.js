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

// Keep track of connected SSE clients
const sseClients = new Set();

// Start a heartbeat timer to keep SSE connections alive
let heartbeatTimer = null;

function startHeartbeat() {
  // Clear any existing timer
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  
  // Send a ping every 10 seconds to all connected clients
  heartbeatTimer = setInterval(() => {
    if (sseClients.size > 0) {
      // Reduce log verbosity - only log heartbeats in debug mode
      if (serverConfig.logLevel === 'debug') {
        console.log(`💓 Sending heartbeat ping to ${sseClients.size} clients`);
      }
      
      // Create a ping event
      const pingEvent = {
        timestamp: new Date().toISOString()
      };
      
      // Send the ping
      let successCount = 0;
      sseClients.forEach(client => {
        try {
          client.write(`event: ping\ndata: ${JSON.stringify(pingEvent)}\n\n`);
          successCount++;
        } catch (error) {
          console.error(`❌ Error sending ping to client: ${error.message}`);
          sseClients.delete(client);
        }
      });
      
      if (sseClients.size !== successCount) {
        console.log(`💓 Heartbeat cleaned up stale connections, now ${sseClients.size} active clients`);
      }
    }
  }, 10000); // Every 10 seconds
}

// SSE endpoint for real-time updates
app.get('/api/events', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send an initial ping
  res.write('event: ping\ndata: connected\n\n');
  
  // Add this client to the set of connected clients
  sseClients.add(res);
  
  const clientIp = getClientIp(req);
  console.log(`👋 Client ${clientIp} connected to SSE, total clients: ${sseClients.size}`);
  logger.info(`Client ${clientIp} connected to SSE`);
  
  // Remove client when connection closes
  req.on('close', () => {
    sseClients.delete(res);
    console.log(`👋 Client ${clientIp} disconnected from SSE, remaining clients: ${sseClients.size}`);
    logger.info(`Client ${clientIp} disconnected from SSE`);
  });
});

// Function to notify all connected clients of a data update
function notifyClients(eventType) {
  const event = {
    type: eventType,
    timestamp: new Date().toISOString()
  };
  
  // Consolidate notification logs
  let logMessage = `📢 Notifying ${sseClients.size} clients of ${eventType} update`;
  
  // Add PM2.5 data if available
  if (eventType === 'aqi-update' && lastFetchedData && lastFetchedData.current && lastFetchedData.current.pm25) {
    logMessage += ` (PM2.5 AQI US: ${lastFetchedData.current.pm25.aqius}, conc: ${lastFetchedData.current.pm25.conc})`;
    
    // Keep detailed structured logging for the log file but not console
    logger.info(`SSE ${eventType} notification data`, {
      pm25_aqius: lastFetchedData.current.pm25.aqius,
      pm25_conc: lastFetchedData.current.pm25.conc,
      timestamp: new Date().toISOString()
    });
  }
  
  console.log(logMessage);
  logger.info(`Notifying ${sseClients.size} clients of ${eventType} update`);
  
  // Send the event to all connected clients
  let successCount = 0;
  sseClients.forEach(client => {
    try {
      client.write(`event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`);
      successCount++;
    } catch (error) {
      // If there's an error sending to a client, remove it from the set
      console.error(`❌ Error sending ${eventType} event to client: ${error.message}`);
      logger.error(`Error sending ${eventType} event to client: ${error.message}`);
      sseClients.delete(client);
    }
  });
  
  // Only log result if there were issues or in debug mode
  if (successCount < sseClients.size || serverConfig.logLevel === 'debug') {
    console.log(`✅ Sent ${eventType} event to ${successCount}/${sseClients.size} clients`);
  }
  
  logger.info(`Sent ${eventType} event to ${sseClients.size} clients`);
}

// Start the polling for external API
function startExternalApiPolling() {
  if (serverConfig.externalApiUrl) {
    console.log(`Starting polling of external API at interval ${serverConfig.pollingIntervalSec || 20} seconds`);
    // Initial fetch
    fetchExternalData(serverConfig.externalApiUrl)
      .then(data => {
        // Log PM2.5 AQI US value if present (for initial fetch)
        if (data && data.current && data.current.pm25 && data.current.pm25.aqius !== undefined) {
          console.log(`PM2.5 AQI US: ${data.current.pm25.aqius} (conc: ${data.current.pm25.conc}) at ${new Date().toISOString()}`);
          logger.info('Initial PM2.5 AQI US value', {
            aqius: data.current.pm25.aqius,
            concentration: data.current.pm25.conc,
            timestamp: new Date().toISOString()
          });
        }
        
        lastFetchedData = data;
        console.log('Initial data fetched from external API');
        // Notify clients on initial fetch
        notifyClients('aqi-update');
      })
      .catch(error => {
        console.error('Failed to fetch initial data:', error.message);
      });

    // Set up interval for polling
    externalApiTimer = setInterval(() => {
      fetchExternalData(serverConfig.externalApiUrl)
        .then(data => {
          // Check if the data has changed
          const hasChanged = JSON.stringify(data) !== JSON.stringify(lastFetchedData);
          
          // Consolidate logging - only log detailed info when data changes
          if (data && data.current && data.current.pm25 && data.current.pm25.aqius !== undefined) {
            // Only log the value if it changed or in debug mode
            if (hasChanged || serverConfig.logLevel === 'debug') {
              console.log(`📊 PM2.5 AQI US: ${data.current.pm25.aqius} (conc: ${data.current.pm25.conc}) at ${new Date().toISOString()}`);
            }
            
            // Keep structured logging for log files
            logger.info('PM2.5 AQI US value', {
              aqius: data.current.pm25.aqius,
              concentration: data.current.pm25.conc,
              timestamp: new Date().toISOString()
            });
          }
          
          // Update the cached data
          lastFetchedData = data;
          
          if (hasChanged) {
            console.log('📊 Data updated from external API');
            // Invalidate the cache when data changes
            const cacheKey = `airquality-data`;
            if (dataCache[cacheKey]) {
              dataCache[cacheKey].data = data;
              dataCache[cacheKey].timestamp = Date.now();
            }
            // Notify clients on each update
            notifyClients('aqi-update');
          } else if (serverConfig.logLevel === 'debug') {
            // Only log unchanged data in debug mode
            console.log('📊 Data unchanged from external API');
          }
        })
        .catch(error => {
          console.error('❌ Failed to update data:', error.message);
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
    
    // Reduce verbosity - combine DNS lookup and connection messages
    console.log(`🔄 Fetching data from ${url}`);
    
    // Use a simple timeout approach instead of AbortController
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out after 10 seconds')), 10000);
    });
    
    // Race the fetch against the timeout
    const response = await Promise.race([
      fetch(url),
      timeoutPromise
    ]);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Only log detailed data in debug mode
    if (serverConfig.logLevel === 'debug') {
      console.log(`✅ Successfully fetched data from: ${url}`);
    }
    return data;
  } catch (error) {
    console.error(`❌ Error in fetchExternalData: ${error.message}`);
    throw error;
  }
}

// Cache for API requests
const dataCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes default TTL

// API endpoint to fetch air quality data
app.get('/api/airquality', async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const forceRefresh = req.query.force === '1';
    
    // Consolidate client request logging
    const requestType = forceRefresh ? 'forced refresh' : 'regular';
    
    if (!serverConfig.externalApiUrl) {
      console.warn('⚠️ External API URL is not configured');
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
    
    // Check if we have cached data and it's not expired (and not a forced refresh)
    if (!forceRefresh && dataCache[cacheKey] && Date.now() - dataCache[cacheKey].timestamp < CACHE_TTL) {
      
      // Only log in debug mode or if it's a forced refresh
      if (serverConfig.logLevel === 'debug') {
        console.log(`👤 [${clientIp}] Using cached air quality data`);
      }
      
      // Consolidate logging for client responses
      if (dataCache[cacheKey].data && dataCache[cacheKey].data.current && dataCache[cacheKey].data.current.pm25 && serverConfig.logLevel === 'debug') {
        console.log(`📤 To [${clientIp}]: Cached PM2.5 AQI US: ${dataCache[cacheKey].data.current.pm25.aqius} (conc: ${dataCache[cacheKey].data.current.pm25.conc})`);
      }
      
      // Keep detailed structured logging for log files
      logger.info(`Sent cached data to client ${clientIp}`, {
        pm25_aqius: dataCache[cacheKey].data.current?.pm25?.aqius,
        pm25_conc: dataCache[cacheKey].data.current?.pm25?.conc,
        cached: true,
        timestamp: new Date().toISOString()
      });
      
      return res.json(dataCache[cacheKey].data);
    }
    
    console.log(`👤 [${clientIp}] ${forceRefresh ? 'Forced refresh' : 'Cache expired'}, fetching new air quality data`);
    
    // Fetch data directly from the API without appending lat/lon
    const data = await fetchExternalData(apiUrl);
    
    // Consolidate client response logging
    if (data && data.current && data.current.pm25 && data.current.pm25.aqius !== undefined) {
      console.log(`📤 To [${clientIp}]: Fresh PM2.5 AQI US: ${data.current.pm25.aqius} (conc: ${data.current.pm25.conc})`);
      
      // Keep detailed structured logging for log files
      logger.info(`Sent fresh data to client ${clientIp}`, {
        pm25_aqius: data.current.pm25.aqius,
        pm25_conc: data.current.pm25.conc,
        cached: false,
        timestamp: new Date().toISOString()
      });
    }
    
    // Cache the response
    dataCache[cacheKey] = {
      timestamp: Date.now(),
      data: data
    };
    
    return res.json(data);
  } catch (error) {
    console.error('❌ Error fetching air quality data:', error.message);
    return res.json({ 
      error: 'Failed to fetch air quality data: ' + error.message,
      current: null 
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
    pollingInterval: `${serverConfig.pollingIntervalSec || 20}s`
  });
  
  // Start the polling timers
  startExternalApiPolling();
  
  // Start the heartbeat
  startHeartbeat();
  
  // Emit a server-started event after a delay to allow clients to connect
  setTimeout(() => {
    notifyClients('server-started');
    logger.info('Sent server-started event to any connected clients');
  }, 5000);
}); 