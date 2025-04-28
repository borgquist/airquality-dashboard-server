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
    
    // Create error object to display to the user
    const errorData = {
      error: error.message || 'Network error',
      now: { uvi: null },
      forecast: []
    };
    
    updateUvIndexDisplay(errorData);
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
  
  // Only update mainPollutant if the element exists
  const mainPollutantElement = document.getElementById('mainPollutant');
  if (mainPollutantElement) {
    mainPollutantElement.textContent = formatPollutantName(mainPollutant);
  }
  
  // Set AQI category and color
  const aqiCategory = getAQICategory(aqiValue);
  const categoryElement = document.getElementById('aqiCategory');
  categoryElement.textContent = aqiCategory.name;
  
  // Get the main AQI card
  const mainAqiElement = document.querySelector('.main-aqi');
  
  // Remove all category classes from both elements
  const categoryClasses = ['good', 'moderate', 'unhealthy-sensitive', 'unhealthy', 'very-unhealthy', 'hazardous'];
  
  categoryElement.classList.remove(...categoryClasses);
  mainAqiElement.classList.remove(...categoryClasses);
  
  // Add the current category class to both elements
  categoryElement.classList.add(aqiCategory.className);
  mainAqiElement.classList.add(aqiCategory.className);
  
  // Apply custom color settings from config if available
  const configKey = aqiCategory.className.replace('-', '').replace('-', '');
  if (config.aqiColors && config.aqiColors[configKey]) {
    const colorConfig = config.aqiColors[configKey];
    mainAqiElement.style.backgroundColor = colorConfig.backgroundColor;
    mainAqiElement.style.color = colorConfig.textColor;
  }
  
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
  if (!data) {
    console.error('Invalid UV index data format');
    document.getElementById('uvIndexValue').textContent = 'Error';
    return;
  }
  
  // Handle API configuration error
  if (data.error) {
    console.warn('UV API error:', data.error);
    
    // Update UI with error message
    document.getElementById('uvIndexValue').textContent = 'Error';
    document.getElementById('uvIndexCategory').textContent = '-';
    
    // Show specific message based on the error
    const safetyElement = document.createElement('div');
    safetyElement.className = 'uv-safety-info';
    
    if (data.error === 'UV API not configured') {
      safetyElement.textContent = 'UV Index unavailable - API key not configured';
      safetyElement.classList.add('uv-error');
    } else {
      safetyElement.textContent = 'UV Index data unavailable';
      safetyElement.classList.add('uv-error');
    }
    
    // Clear and update the forecast container
    const forecastContainer = document.querySelector('.uv-forecast-container');
    forecastContainer.innerHTML = '<h3>Forecast</h3>';
    forecastContainer.insertBefore(safetyElement, forecastContainer.firstChild);
    
    // Hide the graph
    const graphContainer = document.getElementById('uvForecastGraph');
    if (graphContainer) {
      graphContainer.style.display = 'none';
    }
    
    return;
  }
  
  // Update current UV index value
  const currentUvIndex = data.now?.uvi;
  
  if (currentUvIndex === null || currentUvIndex === undefined) {
    document.getElementById('uvIndexValue').textContent = '-';
    document.getElementById('uvIndexCategory').textContent = '-';
    return;
  }
  
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
  if (data.forecast && data.forecast.length > 0) {
    createUvForecastGraph(data.forecast);
    
    // Add safety time information
    addUvSafetyTimes(data.forecast);
  } else {
    // No forecast data available
    const forecastContainer = document.querySelector('.uv-forecast-container');
    forecastContainer.innerHTML = '<h3>Forecast</h3>';
    
    const safetyElement = document.createElement('div');
    safetyElement.className = 'uv-safety-info';
    safetyElement.textContent = 'Forecast data unavailable';
    forecastContainer.appendChild(safetyElement);
    
    // Hide the graph
    const graphContainer = document.getElementById('uvForecastGraph');
    if (graphContainer) {
      graphContainer.style.display = 'none';
    }
  }
}

// Add UV safety times information
function addUvSafetyTimes(forecastData) {
  if (!forecastData || !forecastData.length) {
    return;
  }
  
  // Get current time and tomorrow's date
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Filter for today and tomorrow's forecasts
  const twoDaysForecast = forecastData.filter(entry => {
    const entryTime = new Date(entry.time);
    return entryTime >= now && 
           entryTime < new Date(now.getTime() + 48 * 60 * 60 * 1000);
  });
  
  if (twoDaysForecast.length === 0) {
    return;
  }
  
  // Interpolate and adjust for timezone
  const adjustedForecast = interpolateAndAdjustTimes(twoDaysForecast);
  
  // Set threshold at 4 - up to 4 is considered "fine" for UV safety
  const uvSafetyThreshold = 4;
  
  // Find times when UV crosses the threshold
  const todayForecasts = adjustedForecast.filter(entry => 
    entry.time.getDate() === now.getDate()
  );
  
  const tomorrowForecasts = adjustedForecast.filter(entry => 
    entry.time.getDate() === tomorrow.getDate()
  );
  
  // Find morning unsafe time (when UV rises above threshold)
  let morningUnsafeTime = null;
  if (todayForecasts.length > 0) {
    morningUnsafeTime = findNextTransitionTime(todayForecasts, uvSafetyThreshold, true);
  }
  
  // Find evening safe time (when UV drops below threshold)
  let eveningSafeTime = null;
  if (todayForecasts.length > 0) {
    eveningSafeTime = findNextTransitionTime(todayForecasts, uvSafetyThreshold, false);
  }
  
  // Find tomorrow's morning unsafe time
  let tomorrowMorningUnsafeTime = null;
  if (tomorrowForecasts.length > 0) {
    tomorrowMorningUnsafeTime = findNextTransitionTime(tomorrowForecasts, uvSafetyThreshold, true);
  }
  
  // Get current interpolated UV value
  const currentUvi = getCurrentInterpolatedUvi(adjustedForecast);
  
  // Build the safety message based on current time and UV level
  let safetyMessage = '';
  
  // Current time is early morning, before UV gets high
  if (currentUvi <= uvSafetyThreshold && morningUnsafeTime && morningUnsafeTime > now) {
    const morningTimeStr = formatTimeForDisplay(morningUnsafeTime);
    safetyMessage = `UV is fine until ${morningTimeStr}`;
    
    // Add evening information if available
    if (eveningSafeTime && eveningSafeTime > morningUnsafeTime) {
      const eveningTimeStr = formatTimeForDisplay(eveningSafeTime);
      safetyMessage += ` and after ${eveningTimeStr}`;
    }
  }
  // Current time is during high UV hours
  else if (currentUvi > uvSafetyThreshold && eveningSafeTime && eveningSafeTime > now) {
    const eveningTimeStr = formatTimeForDisplay(eveningSafeTime);
    safetyMessage = `UV will be fine after ${eveningTimeStr}`;
    
    // Add tomorrow morning information if available
    if (tomorrowMorningUnsafeTime) {
      const tomorrowMorningTimeStr = formatTimeForDisplay(tomorrowMorningUnsafeTime);
      safetyMessage += ` until ${tomorrowMorningTimeStr} tomorrow`;
    }
  }
  // Current time is evening after UV drops, show tomorrow's info
  else if (currentUvi <= uvSafetyThreshold && tomorrowMorningUnsafeTime) {
    const tomorrowMorningTimeStr = formatTimeForDisplay(tomorrowMorningUnsafeTime);
    safetyMessage = `UV is fine now and until ${tomorrowMorningTimeStr} tomorrow`;
  }
  // Fallback if we can't determine specific times
  else {
    if (currentUvi <= uvSafetyThreshold) {
      safetyMessage = 'UV is currently fine';
    } else {
      safetyMessage = 'UV protection recommended';
    }
  }
  
  // Remove any existing safety info
  const existingSafetyInfo = document.querySelector('.uv-safety-info');
  if (existingSafetyInfo) {
    existingSafetyInfo.remove();
  }
  
  // Add the safety message to the page
  const safetyElement = document.createElement('div');
  safetyElement.className = 'uv-safety-info';
  safetyElement.textContent = safetyMessage;
  
  const forecastContainer = document.querySelector('.uv-forecast-container');
  forecastContainer.insertBefore(safetyElement, forecastContainer.firstChild);
}

// Helper function to get the current interpolated UV index
function getCurrentInterpolatedUvi(adjustedForecast) {
  const now = new Date();
  
  // Find the two closest points
  let before = null;
  let after = null;
  
  for (let i = 0; i < adjustedForecast.length; i++) {
    if (adjustedForecast[i].time > now) {
      after = adjustedForecast[i];
      if (i > 0) {
        before = adjustedForecast[i-1];
      }
      break;
    }
  }
  
  // If we couldn't find appropriate points, return -1
  if (!before || !after) return -1;
  
  // Calculate the interpolated value
  const timeDiff = after.time.getTime() - before.time.getTime();
  const timeProgress = now.getTime() - before.time.getTime();
  const progressRatio = timeProgress / timeDiff;
  
  return before.uvi + (after.uvi - before.uvi) * progressRatio;
}

// Helper function to interpolate and adjust times for timezone
function interpolateAndAdjustTimes(forecastData) {
  const adjusted = [];
  
  // Get timezone information from config
  const cityName = config.location?.cityName || 'Abu Dhabi';
  
  for (let i = 0; i < forecastData.length; i++) {
    // Use time as is - don't apply any timezone adjustments
    // The API data is likely already in the correct timezone
    const time = new Date(forecastData[i].time);
    
    adjusted.push({
      time: time,
      uvi: forecastData[i].uvi
    });
  }
  
  return adjusted;
}

// Helper function to find the next time when UV transitions above/below the threshold
function findNextTransitionTime(forecast, threshold, findingUnsafe) {
  for (let i = 0; i < forecast.length - 1; i++) {
    const current = forecast[i];
    const next = forecast[i+1];
    
    if (findingUnsafe) {
      // Looking for transition from <= threshold to > threshold
      if (current.uvi <= threshold && next.uvi > threshold) {
        // Interpolate to find more precise time
        return interpolateTransitionTime(current, next, threshold);
      }
    } else {
      // Looking for transition from > threshold to <= threshold
      if (current.uvi > threshold && next.uvi <= threshold) {
        return interpolateTransitionTime(current, next, threshold);
      }
    }
  }
  
  return null;
}

// Helper function to interpolate the exact transition time
function interpolateTransitionTime(before, after, threshold) {
  const uvDiff = after.uvi - before.uvi;
  const timeDiff = after.time.getTime() - before.time.getTime();
  
  // If the UVI doesn't change, we can't interpolate
  if (uvDiff === 0) return after.time;
  
  // Calculate the time at which the UV index equals the threshold
  const thresholdDiff = threshold - before.uvi;
  const timeOffset = (thresholdDiff / uvDiff) * timeDiff;
  
  const result = new Date(before.time.getTime() + timeOffset);
  
  // Round to nearest 15 minutes
  result.setMinutes(Math.round(result.getMinutes() / 15) * 15);
  
  return result;
}

// Helper function to format time for display
function formatTimeForDisplay(date) {
  return date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
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
  
  // Get the current time and create date ranges for today and tomorrow
  const currentTime = new Date();
  const tomorrow = new Date(currentTime);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Get timezone information from config
  const cityName = config.location?.cityName || 'Abu Dhabi';
  const timezoneName = config.location?.timeZone?.name || 'UTC+4';
  
  // Filter for multiple days of data
  const multipleDaysForecast = forecastData.filter(entry => {
    const entryTime = new Date(entry.time);
    return entryTime > currentTime && 
           entryTime < new Date(currentTime.getTime() + 72 * 60 * 60 * 1000); // Show up to 3 days
  });
  
  if (multipleDaysForecast.length === 0) {
    debugPrint('No UV forecast data available for the next 72 hours');
    document.getElementById('uvForecastGraph').style.display = 'none';
    return;
  }
  
  // Create arrays for labels (times) and data
  const times = [];
  const uviValues = [];
  const backgroundColors = [];
  const borderColors = [];
  
  // Use the same threshold as in the safety message
  const uvSafetyThreshold = 4;
  
  // Process each entry for the chart
  let previousDay = null;
  multipleDaysForecast.forEach(entry => {
    const entryTime = new Date(entry.time);
    
    // Format the time only (without date)
    let timeLabel = entryTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    
    // Check which day this entry belongs to relative to today
    const dayDiff = Math.floor((entryTime - currentTime) / (24 * 60 * 60 * 1000));
    let dayLabel;
    
    if (dayDiff === 0) {
      dayLabel = 'Today';
    } else if (dayDiff === 1) {
      dayLabel = 'Tomorrow';
    } else {
      // For days beyond tomorrow, use the weekday name
      dayLabel = entryTime.toLocaleDateString(undefined, { weekday: 'long' });
    }
    
    // Only add the day label when the day changes
    if (dayLabel !== previousDay) {
      timeLabel = dayLabel;
      previousDay = dayLabel;
    }
    
    times.push(timeLabel);
    uviValues.push(entry.uvi);
    
    // Colors based on safety threshold - use same threshold as in safety message
    const isSafe = entry.uvi <= uvSafetyThreshold;
    backgroundColors.push(isSafe ? 'rgba(46, 204, 113, 0.7)' : 'rgba(231, 76, 60, 0.7)');
    borderColors.push(isSafe ? 'rgb(46, 204, 113)' : 'rgb(231, 76, 60)');
  });
  
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
            text: `Time (Local Time)`
          },
          grid: {
            display: false
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
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