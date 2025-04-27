// Load configuration
let config;

// Fetch configuration and initialize
async function loadConfig() {
  try {
    const response = await fetch('/config.json');
    config = await response.json();
    initDashboard();
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
}

// Initialize the dashboard
function initDashboard() {
  fetchAirQualityData();
  
  // Set up auto-refresh based on config
  const refreshInterval = (config.refreshIntervalSec || 600) * 1000;
  setInterval(fetchAirQualityData, refreshInterval);
}

// Fetch the air quality data from the server
async function fetchAirQualityData() {
  try {
    const response = await fetch('/api/airquality');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    updateDashboard(data);
  } catch (error) {
    console.error('Error fetching air quality data:', error);
    document.getElementById('lastUpdatedTime').textContent = 
      `Error: ${error.message}`;
  }
}

// Update the dashboard with the latest data
function updateDashboard(data) {
  if (!data || !data.current) {
    console.error('Invalid data format');
    return;
  }
  
  // Update last updated time
  const currentTime = new Date();
  document.getElementById('lastUpdatedTime').textContent = 
    currentTime.toLocaleString();
  
  // Update AQI display
  const mainPollutant = data.current.mainus;
  const aqiValue = data.current.aqius;
  
  document.getElementById('aqiDisplay').textContent = aqiValue;
  document.getElementById('mainPollutantValue').textContent = 
    formatPollutantName(mainPollutant);
  
  // Set AQI category and color
  const aqiCategory = getAQICategory(aqiValue);
  const categoryElement = document.getElementById('aqiCategory');
  categoryElement.textContent = aqiCategory.name;
  
  // Remove all category classes
  categoryElement.classList.remove(
    'good', 'moderate', 'unhealthy-sensitive', 
    'unhealthy', 'very-unhealthy', 'hazardous'
  );
  
  // Add the current category class
  categoryElement.classList.add(aqiCategory.className);
  
  // Update pollutant values
  if (data.current.pm1) {
    document.getElementById('pm1Aqi').textContent = data.current.pm1.aqius || '-';
    document.getElementById('pm1Conc').textContent = 
      data.current.pm1.conc ? `${data.current.pm1.conc} μg/m³` : '-';
  }
  
  if (data.current.pm25) {
    document.getElementById('pm25Aqi').textContent = data.current.pm25.aqius || '-';
    document.getElementById('pm25Conc').textContent = 
      data.current.pm25.conc ? `${data.current.pm25.conc} μg/m³` : '-';
  }
  
  if (data.current.pm10) {
    document.getElementById('pm10Aqi').textContent = data.current.pm10.aqius || '-';
    document.getElementById('pm10Conc').textContent = 
      data.current.pm10.conc ? `${data.current.pm10.conc} μg/m³` : '-';
  }
  
  // Update weather data
  document.getElementById('temperature').textContent = 
    data.current.tp ? `${data.current.tp}°C` : '-';
  document.getElementById('humidity').textContent = 
    data.current.hm ? `${data.current.hm}%` : '-';
  document.getElementById('pressure').textContent = 
    data.current.pr ? `${(data.current.pr / 100).toFixed(1)} hPa` : '-';
}

// Format pollutant name for display
function formatPollutantName(pollutant) {
  switch (pollutant) {
    case 'pm25': return 'PM2.5';
    case 'pm10': return 'PM10';
    case 'pm1': return 'PM1';
    default: return pollutant;
  }
}

// Get AQI category based on AQI value and thresholds from config
function getAQICategory(aqi) {
  if (aqi <= config.aqiThresholds.good) {
    return { name: 'Good', className: 'good' };
  } else if (aqi <= config.aqiThresholds.moderate) {
    return { name: 'Moderate', className: 'moderate' };
  } else if (aqi <= config.aqiThresholds.unhealthySensitive) {
    return { name: 'Unhealthy for Sensitive Groups', className: 'unhealthy-sensitive' };
  } else if (aqi <= config.aqiThresholds.unhealthy) {
    return { name: 'Unhealthy', className: 'unhealthy' };
  } else if (aqi <= config.aqiThresholds.veryUnhealthy) {
    return { name: 'Very Unhealthy', className: 'very-unhealthy' };
  } else {
    return { name: 'Hazardous', className: 'hazardous' };
  }
}

// Start the dashboard
document.addEventListener('DOMContentLoaded', loadConfig); 