// Load configuration
let config;
let uvChart;

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
  fetchUvIndexData();
  fetchVersionInfo();
  
  // Set up auto-refresh based on config
  const refreshIntervalAqi = (config.refreshIntervalSec || 600) * 1000;
  const refreshIntervalUv = (config.uvRefreshIntervalSec || 1800) * 1000;
  
  setInterval(fetchAirQualityData, refreshIntervalAqi);
  setInterval(fetchUvIndexData, refreshIntervalUv);
}

// Fetch the air quality data from the server
async function fetchAirQualityData() {
  try {
    const response = await fetch('/api/airquality');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    updateAirQualityDisplay(data);
  } catch (error) {
    console.error('Error fetching air quality data:', error);
    document.getElementById('lastUpdatedTime').textContent = 
      `Error: ${error.message}`;
  }
}

// Fetch UV index data
async function fetchUvIndexData() {
  try {
    const response = await fetch('/api/uvindex');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    updateUvIndexDisplay(data);
  } catch (error) {
    console.error('Error fetching UV index data:', error);
    document.getElementById('uvIndexValue').textContent = 'Error';
  }
}

// Fetch version information
async function fetchVersionInfo() {
  try {
    const response = await fetch('/api/version');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    updateVersionDisplay(data);
  } catch (error) {
    console.error('Error fetching version information:', error);
    document.getElementById('appVersion').textContent = 'v?.?.?';
  }
}

// Update the version display
function updateVersionDisplay(data) {
  if (!data || !data.version) {
    return;
  }
  
  document.getElementById('appVersion').textContent = `v${data.version}`;
  
  // Add title attribute with more details
  const versionInfo = document.getElementById('appVersion');
  versionInfo.setAttribute('title', `${data.name} - Last updated: ${data.lastUpdated}`);
}

// Update the air quality dashboard with the latest data
function updateAirQualityDisplay(data) {
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
  document.getElementById('mainPollutant').textContent = formatPollutantName(mainPollutant);
  
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
  
  // Update page background based on AQI
  updatePageBackground(aqiValue);
  
  // Update weather data
  document.getElementById('temperature').textContent = 
    data.current.tp ? `${data.current.tp}°C` : '-';
  document.getElementById('humidity').textContent = 
    data.current.hm ? `${data.current.hm}%` : '-';
  document.getElementById('pressure').textContent = 
    data.current.pr ? `${(data.current.pr / 100).toFixed(1)} hPa` : '-';
}

// Update the UV index display
function updateUvIndexDisplay(data) {
  if (!data || !data.now) {
    console.error('Invalid UV index data format');
    return;
  }
  
  // Update current UV index value
  const currentUvIndex = data.now.uvi;
  document.getElementById('uvIndexValue').textContent = currentUvIndex;
  
  // Set UV category and color
  const uvCategory = getUVCategory(currentUvIndex);
  const categoryElement = document.getElementById('uvIndexCategory');
  categoryElement.textContent = uvCategory.name;
  
  // Remove all category classes
  categoryElement.classList.remove(
    'uv-low', 'uv-moderate', 'uv-high', 
    'uv-very-high', 'uv-extreme'
  );
  
  // Add the current category class
  categoryElement.classList.add(uvCategory.className);
  
  // Create or update the UV forecast graph
  createUvForecastGraph(data.forecast);
  
  // Add safety time information
  addUvSafetyTimes(data.forecast);
}

// Add UV safety times information
function addUvSafetyTimes(forecastData) {
  if (!forecastData || !forecastData.length) {
    return;
  }
  
  const today = new Date();
  const todayForecasts = forecastData.filter(entry => {
    const entryDate = new Date(entry.time);
    return entryDate.getDate() === today.getDate() && 
           entryDate.getMonth() === today.getMonth() &&
           entryDate.getFullYear() === today.getFullYear();
  });
  
  if (todayForecasts.length === 0) {
    return;
  }
  
  // Find first and last time when UV index > 4
  let morningUnsafe = null;
  let eveningUnsafe = null;
  
  // Find morning transition (safe to unsafe)
  for (let i = 0; i < todayForecasts.length; i++) {
    if (todayForecasts[i].uvi > 4) {
      morningUnsafe = new Date(todayForecasts[i].time);
      break;
    }
  }
  
  // Find evening transition (unsafe to safe)
  for (let i = todayForecasts.length - 1; i >= 0; i--) {
    if (todayForecasts[i].uvi > 4) {
      // The next entry after this one would be safe
      if (i < todayForecasts.length - 1) {
        eveningUnsafe = new Date(todayForecasts[i+1].time);
      }
      break;
    }
  }
  
  // Create safety message
  let safetyMessage = '';
  const safetyElement = document.createElement('div');
  safetyElement.className = 'uv-safety-info';
  
  if (morningUnsafe && eveningUnsafe) {
    const morningTime = morningUnsafe.toLocaleTimeString([], {hour: 'numeric'});
    const eveningTime = eveningUnsafe.toLocaleTimeString([], {hour: 'numeric'});
    safetyMessage = `UV safe before ${morningTime} and after ${eveningTime}`;
  } else if (morningUnsafe) {
    const morningTime = morningUnsafe.toLocaleTimeString([], {hour: 'numeric'});
    safetyMessage = `UV safe before ${morningTime}`;
  } else if (eveningUnsafe) {
    const eveningTime = eveningUnsafe.toLocaleTimeString([], {hour: 'numeric'});
    safetyMessage = `UV safe after ${eveningTime}`;
  } else {
    // Check if all values are <= 4 (safe all day)
    const allSafe = todayForecasts.every(entry => entry.uvi <= 4);
    if (allSafe) {
      safetyMessage = 'UV safe all day';
    } else {
      safetyMessage = 'UV safety data unavailable';
    }
  }
  
  // Remove any existing safety info
  const existingSafetyInfo = document.querySelector('.uv-safety-info');
  if (existingSafetyInfo) {
    existingSafetyInfo.remove();
  }
  
  // Add the safety message to the page
  safetyElement.textContent = safetyMessage;
  const forecastContainer = document.querySelector('.uv-forecast-container');
  forecastContainer.insertBefore(safetyElement, forecastContainer.firstChild);
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

// Get UV category based on UV index value
function getUVCategory(uvi) {
  if (uvi < 3) {
    return { name: 'Low', className: 'uv-low' };
  } else if (uvi < 6) {
    return { name: 'Moderate', className: 'uv-moderate' };
  } else if (uvi < 8) {
    return { name: 'High', className: 'uv-high' };
  } else if (uvi < 11) {
    return { name: 'Very High', className: 'uv-very-high' };
  } else {
    return { name: 'Extreme', className: 'uv-extreme' };
  }
}

// Update the page background based on AQI
function updatePageBackground(aqi) {
  // Remove all background classes
  document.body.classList.remove(
    'bg-good', 'bg-unhealthy', 'bg-very-unhealthy', 'bg-hazardous'
  );
  
  // Add appropriate background class based on AQI
  if (aqi <= 100) {
    document.body.classList.add('bg-good');
  } else if (aqi <= 200) {
    document.body.classList.add('bg-unhealthy');
  } else if (aqi <= 300) {
    document.body.classList.add('bg-very-unhealthy');
  } else {
    document.body.classList.add('bg-hazardous');
  }
}

// Create or update the UV forecast graph
function createUvForecastGraph(forecastData) {
  if (!forecastData || !forecastData.length) {
    console.error('No forecast data available');
    return;
  }
  
  // Only display forecast for the rest of the current day (next 12 hours)
  const currentTime = new Date();
  const next12Hours = forecastData.filter(entry => {
    const entryTime = new Date(entry.time);
    return entryTime > currentTime && entryTime <= new Date(currentTime.getTime() + 12 * 60 * 60 * 1000);
  });
  
  if (next12Hours.length === 0) {
    debugPrint('No UV forecast data available for the next 12 hours');
    document.getElementById('uvForecastGraph').style.display = 'none';
    return;
  }
  
  const times = next12Hours.map(entry => {
    const date = new Date(entry.time);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
  
  const uviValues = next12Hours.map(entry => entry.uvi);
  
  // Background colors based on whether UV index is <= 4 (safe) or > 4 (caution)
  const backgroundColors = uviValues.map(value => 
    value <= 4 ? 'rgba(46, 204, 113, 0.7)' : 'rgba(231, 76, 60, 0.7)'
  );
  
  const borderColors = uviValues.map(value => 
    value <= 4 ? 'rgb(46, 204, 113)' : 'rgb(231, 76, 60)'
  );
  
  const ctx = document.getElementById('uvForecastGraph').getContext('2d');
  
  // Destroy previous chart if it exists
  if (uvChart) {
    uvChart.destroy();
  }
  
  uvChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: times,
      datasets: [{
        label: 'UV Index',
        data: uviValues,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: Math.max(Math.max(...uviValues) + 1, 5),
          title: {
            display: true,
            text: 'UV Index'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Time'
          },
          grid: {
            display: false
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw;
              const category = getUVCategory(value).name;
              return `UV Index: ${value} (${category})`;
            }
          }
        }
      }
    }
  });
}

// Helper function for safe logging
function debugPrint(message) {
  console.log(message);
}

// Start the dashboard
document.addEventListener('DOMContentLoaded', loadConfig); 