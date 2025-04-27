const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const winston = require('winston');
const cors = require('cors');

// Load configuration
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Configure logger
const logger = winston.createLogger({
  level: 'info',
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
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to fetch air quality data
app.get('/api/airquality', async (req, res) => {
  try {
    logger.info('Fetching air quality data');
    const response = await fetch(config.apiUrl);
    const data = await response.json();
    
    // Log the successful data fetch
    logger.info('Air quality data fetched successfully', {
      timestamp: new Date().toISOString(),
      mainus: data.current.mainus,
      aqius: data.current.aqius
    });
    
    res.json(data);
  } catch (error) {
    logger.error('Error fetching air quality data', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch air quality data' });
  }
});

// API endpoint to fetch UV index data
app.get('/api/uvindex', async (req, res) => {
  try {
    logger.info('Fetching UV index data');
    // Use latitude and longitude from config or default to a specific location
    const lat = config.location?.latitude || 24.4667;
    const lon = config.location?.longitude || 54.3667;
    
    const response = await fetch(`https://currentuvindex.com/api/v1/uvi?latitude=${lat}&longitude=${lon}`);
    const data = await response.json();
    
    // Log the successful data fetch
    logger.info('UV index data fetched successfully', {
      timestamp: new Date().toISOString(),
      current_uvi: data.now.uvi
    });
    
    res.json(data);
  } catch (error) {
    logger.error('Error fetching UV index data', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch UV index data' });
  }
});

// Serve index.html for all routes to support SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
}); 