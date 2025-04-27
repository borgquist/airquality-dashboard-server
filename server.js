const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const winston = require('winston');
const cors = require('cors');

// Load configuration
const serverConfig = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Configure logger
const logger = winston.createLogger({
  level: serverConfig.logLevel || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'airquality.log' })
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
const clientConfig = JSON.parse(fs.readFileSync('./public/config.json', 'utf8'));
clientConfig.location = serverConfig.location;

// Write updated client config
fs.writeFileSync('./public/config.json', JSON.stringify(clientConfig, null, 2));

// Enable CORS
app.use(cors());

// Track client requests for debugging
const requestTracker = {
  totalRequests: 0,
  clientIPs: {},
  lastLogTime: Date.now(),
  logInterval: 10000, // Log request stats every 10 seconds
  trackRequest: function(ip) {
    this.totalRequests++;
    this.clientIPs[ip] = (this.clientIPs[ip] || 0) + 1;
    
    const now = Date.now();
    if (now - this.lastLogTime > this.logInterval) {
      const ips = Object.keys(this.clientIPs).map(ip => `${ip}: ${this.clientIPs[ip]} requests`).join(', ');
      logger.info(`Request stats: ${this.totalRequests} total requests from ${Object.keys(this.clientIPs).length} clients (${ips})`);
      this.totalRequests = 0;
      this.clientIPs = {};
      this.lastLogTime = now;
    }
  }
};

// Global rate limiter middleware
const RATE_LIMIT_WINDOW = 5000; // 5 seconds
const RATE_LIMIT_MAX = 1; // max 1 request per window
const rateLimits = new Map();

function rateLimiter(req, res, next) {
  const identifier = req.ip;
  const now = Date.now();
  
  // Clean up old rate limit entries
  if (Math.random() < 0.1) { // 10% chance to clean up to avoid doing it on every request
    for (const [key, value] of rateLimits.entries()) {
      if (now - value.timestamp > RATE_LIMIT_WINDOW) {
        rateLimits.delete(key);
      }
    }
  }
  
  // Check if this client has a rate limit entry
  if (!rateLimits.has(identifier)) {
    rateLimits.set(identifier, { count: 1, timestamp: now });
    return next();
  }
  
  const clientLimit = rateLimits.get(identifier);
  
  // Reset rate limit if window has passed
  if (now - clientLimit.timestamp > RATE_LIMIT_WINDOW) {
    clientLimit.count = 1;
    clientLimit.timestamp = now;
    return next();
  }
  
  // Enforce rate limit
  if (clientLimit.count >= RATE_LIMIT_MAX) {
    logger.warn(`Rate limit exceeded for ${identifier}: ${clientLimit.count} requests in ${RATE_LIMIT_WINDOW}ms`);
    return res.status(429).json({ error: 'Rate limit exceeded, please try again later' });
  }
  
  // Increment count and allow request
  clientLimit.count++;
  return next();
}

// Apply rate limiter to API routes
app.use('/api/airquality', rateLimiter);
app.use('/api/uvindex', rateLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Data cache
let lastFetchedData = null;
let lastFetchTime = 0;
let fetchPromise = null;
let lastUvData = null;
let lastUvFetchTime = 0;
let uvFetchPromise = null;

// API endpoint to fetch air quality data
app.get('/api/airquality', async (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.ip;
  requestTracker.trackRequest(clientIP);
  
  try {
    const now = Date.now();
    const pollingInterval = (serverConfig.pollingIntervalSec || 20) * 1000;
    
    // First check if we have fresh data in cache
    if (lastFetchedData && (now - lastFetchTime) < pollingInterval) {
      logger.debug(`Returning cached air quality data to ${clientIP}`, { 
        age: Math.round((now - lastFetchTime) / 1000) + 's'
      });
      return res.json(lastFetchedData);
    }
    
    // If a fetch is already in progress, wait for it instead of starting a new one
    if (fetchPromise) {
      logger.debug(`Client ${clientIP} waiting for in-progress fetch`);
      await fetchPromise;
      return res.json(lastFetchedData);
    }
    
    // Start a new fetch
    logger.info(`Client ${clientIP} triggered fresh air quality data fetch`);
    fetchPromise = fetchAirQualityData();
    
    try {
      lastFetchedData = await fetchPromise;
      lastFetchTime = now;
      
      // Reset promise
      fetchPromise = null;
      
      return res.json(lastFetchedData);
    } catch (error) {
      // Reset promise on error too
      fetchPromise = null;
      throw error;
    }
  } catch (error) {
    logger.error('Error fetching air quality data', { error: error.message });
    
    // Return cached data if available, even if it's old
    if (lastFetchedData) {
      logger.warn('Returning stale cache due to fetch error');
      return res.json(lastFetchedData);
    }
    
    res.status(500).json({ error: 'Failed to fetch air quality data' });
  }
});

// Helper function to fetch air quality data
async function fetchAirQualityData() {
  logger.info(`Fetching air quality data from ${serverConfig.externalApiUrl}`);
  const response = await fetch(serverConfig.externalApiUrl);
  const data = await response.json();
  
  logger.info('Air quality data fetched successfully', {
    timestamp: new Date().toISOString(),
    mainus: data.current.mainus,
    aqius: data.current.aqius
  });
  
  return data;
}

// API endpoint to fetch UV index data
app.get('/api/uvindex', async (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.ip;
  requestTracker.trackRequest(clientIP);
  
  try {
    const now = Date.now();
    const uvPollingInterval = (serverConfig.uvRefreshIntervalSec || 1800) * 1000;
    
    // First check if we have fresh data in cache
    if (lastUvData && (now - lastUvFetchTime) < uvPollingInterval) {
      logger.debug(`Returning cached UV index data to ${clientIP}`, { 
        age: Math.round((now - lastUvFetchTime) / 1000) + 's'
      });
      return res.json(lastUvData);
    }
    
    // If a fetch is already in progress, wait for it instead of starting a new one
    if (uvFetchPromise) {
      logger.debug(`Client ${clientIP} waiting for in-progress UV fetch`);
      await uvFetchPromise;
      return res.json(lastUvData);
    }
    
    // Start a new fetch
    logger.info(`Client ${clientIP} triggered fresh UV index data fetch`);
    uvFetchPromise = fetchUvIndexData();
    
    try {
      lastUvData = await uvFetchPromise;
      lastUvFetchTime = now;
      
      // Reset promise
      uvFetchPromise = null;
      
      return res.json(lastUvData);
    } catch (error) {
      // Reset promise on error too
      uvFetchPromise = null;
      throw error;
    }
  } catch (error) {
    logger.error('Error fetching UV index data', { error: error.message });
    
    // Return cached data if available, even if it's old
    if (lastUvData) {
      logger.warn('Returning stale cache due to fetch error');
      return res.json(lastUvData);
    }
    
    res.status(500).json({ error: 'Failed to fetch UV index data' });
  }
});

// Helper function to fetch UV index data
async function fetchUvIndexData() {
  // Use latitude and longitude from config
  const lat = serverConfig.location.latitude;
  const lon = serverConfig.location.longitude;
  
  const url = `https://currentuvindex.com/api/v1/uvi?latitude=${lat}&longitude=${lon}`;
  logger.info(`Fetching UV index data from ${url}`);
  
  const response = await fetch(url);
  const data = await response.json();
  
  logger.info('UV index data fetched successfully', {
    timestamp: new Date().toISOString(),
    current_uvi: data.now.uvi
  });
  
  return data;
}

// API endpoint to fetch version information
app.get('/api/version', (req, res) => {
  try {
    const versionInfo = JSON.parse(fs.readFileSync('./version.json', 'utf8'));
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

app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}, polling external API every ${serverConfig.pollingIntervalSec || 20} seconds`);
  
  // Log server-side settings
  logger.info(`Server configuration:`, {
    apiUrl: serverConfig.externalApiUrl,
    pollingInterval: `${serverConfig.pollingIntervalSec || 20}s`,
    uvPollingInterval: `${serverConfig.uvRefreshIntervalSec || 1800}s`,
    location: serverConfig.location
  });
  
  // Log client-side settings
  logger.info(`Client configuration:`, {
    refreshInterval: `${clientConfig.refreshIntervalSec}s`,
    uvRefreshInterval: `${clientConfig.uvRefreshIntervalSec}s`
  });
}); 