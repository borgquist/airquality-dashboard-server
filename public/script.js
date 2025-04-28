// Load configuration
let config;
let uvChart;

// Register Chart.js annotation plugin if available
if (window.ChartAnnotation) {
  Chart.register(window.ChartAnnotation);
} else {
  console.warn('Chart.js annotation plugin not found');
}

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
  if (!data) {
    console.error('Invalid data format');
    return;
  }
  
  // Handle API error
  if (data.error) {
    console.warn('Air quality API error:', data.error);
    
    // Update last updated time with error
    document.getElementById('lastUpdatedTime').textContent = 
      `Error: ${data.error}`;
      
    // Display dash for missing values
    document.getElementById('aqiDisplay').textContent = '-';
    document.getElementById('temperature').textContent = '-';
    document.getElementById('humidity').textContent = '-';
    document.getElementById('pressure').textContent = '-';
    
    return;
  }
  
  // Update last updated time
  const currentTime = new Date();
  document.getElementById('lastUpdatedTime').textContent = 
    currentTime.toLocaleString();
  
  // Update AQI display
  const mainPollutant = data.current?.mainus;
  const aqiValue = data.current?.aqius;
  
  if (aqiValue === null || aqiValue === undefined) {
    document.getElementById('aqiDisplay').textContent = '-';
  } else {
    document.getElementById('aqiDisplay').textContent = aqiValue;
  }
  
  // Only update mainPollutant if the element exists
  const mainPollutantElement = document.getElementById('mainPollutant');
  if (mainPollutantElement && mainPollutant) {
    mainPollutantElement.textContent = formatPollutantName(mainPollutant);
  }
  
  // Set AQI category and color
  if (aqiValue !== null && aqiValue !== undefined) {
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
  } else {
    document.getElementById('aqiCategory').textContent = '-';
  }
  
  // Update weather data
  document.getElementById('temperature').textContent = 
    data.current?.tp ? `${data.current.tp}°C` : '-';
  document.getElementById('humidity').textContent = 
    data.current?.hm ? `${data.current.hm}%` : '-';
  document.getElementById('pressure').textContent = 
    data.current?.pr ? `${(data.current.pr / 100).toFixed(1)} hPa` : '-';
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
  
  document.getElementById('uvIndexValue').textContent = currentUvIndex.toFixed(1);
  
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
    createUvForecastGraph(data);
    
    // Add safety time information
    addUvSafetyTimes(data);
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
function addUvSafetyTimes(data) {
  const forecastData = data.forecast;
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
  
  // Get the current UV value from the API response
  const apiCurrentUvi = data.now?.uvi || -1;
  const isCurrentUvSafe = apiCurrentUvi <= uvSafetyThreshold;
  
  // Current time is early morning, before UV gets high
  if (isCurrentUvSafe && morningUnsafeTime && morningUnsafeTime > now) {
    const morningTimeStr = formatTimeForDisplay(morningUnsafeTime);
    safetyMessage = `UV is fine until ${morningTimeStr}`;
  }
  // Current time is during high UV hours
  else if (!isCurrentUvSafe && eveningSafeTime && eveningSafeTime > now) {
    const eveningTimeStr = formatTimeForDisplay(eveningSafeTime);
    safetyMessage = `UV will be fine after ${eveningTimeStr}`;
  }
  // Current time is evening after UV drops, show tomorrow's info
  else if (isCurrentUvSafe && eveningSafeTime && eveningSafeTime < now) {
    if (tomorrowMorningUnsafeTime) {
      const tomorrowMorningTimeStr = formatTimeForDisplay(tomorrowMorningUnsafeTime);
      safetyMessage = `UV is fine until ${tomorrowMorningTimeStr} tomorrow`;
    } else {
      safetyMessage = `UV is currently fine`;
    }
  }
  // If it's currently fine but no future unsafe time found (very late evening)
  else if (isCurrentUvSafe) {
    safetyMessage = `UV is currently fine`;
    
    // Try to find next day's unsafe time
    if (tomorrowMorningUnsafeTime) {
      const tomorrowMorningTimeStr = formatTimeForDisplay(tomorrowMorningUnsafeTime);
      safetyMessage = `UV is fine until ${tomorrowMorningTimeStr} tomorrow`;
    }
  }
  // Fallback if we can't determine specific times but UV is high
  else {
    safetyMessage = 'UV protection recommended';
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
function createUvForecastGraph(data) {
  const forecastData = data.forecast;
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
           entryTime < new Date(currentTime.getTime() + 24 * 60 * 60 * 1000); // Show only next 24 hours
  });
  
  if (multipleDaysForecast.length === 0) {
    debugPrint('No UV forecast data available for the next 24 hours');
    document.getElementById('uvForecastGraph').style.display = 'none';
    return;
  }
  
  // Sort forecast data by time
  multipleDaysForecast.sort((a, b) => {
    return new Date(a.time) - new Date(b.time);
  });
  
  // Create arrays for labels (times) and data
  const times = [];
  const uviValues = [];
  const dataPoints = [];
  
  // Use the same threshold as in the safety message
  const uvSafetyThreshold = 4;
  
  // Process each entry for the chart
  let previousDay = null;
  multipleDaysForecast.forEach(entry => {
    const entryTime = new Date(entry.time);
    
    // Format the time to show the full hour
    let timeLabel = entryTime.toLocaleTimeString([], {hour: '2-digit'});
    
    // Check if entry is today or tomorrow
    const isToday = entryTime.getDate() === currentTime.getDate();
    const dayLabel = isToday ? '' : 'Tomorrow ';
    
    // Only add the day label when the day changes
    if (dayLabel !== previousDay) {
      previousDay = dayLabel;
    }
    
    times.push(dayLabel + timeLabel);
    uviValues.push(entry.uvi);
    
    // Create data point with color based on threshold
    dataPoints.push({
      x: entryTime,
      y: entry.uvi,
      safe: entry.uvi <= uvSafetyThreshold
    });
  });
  
  const ctx = document.getElementById('uvForecastGraph').getContext('2d');
  
  // Destroy previous chart if it exists
  if (uvChart) {
    uvChart.destroy();
  }
  
  // Create line graph with basic configuration
  uvChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: times,
      datasets: [{
        label: 'UV Index',
        data: uviValues,
        borderColor: function(context) {
          // Use green for safe values, red for unsafe
          const index = context.dataIndex;
          return uviValues[index] <= uvSafetyThreshold ? 'rgb(46, 204, 113)' : 'rgb(231, 76, 60)';
        },
        pointBackgroundColor: function(context) {
          const index = context.dataIndex;
          return uviValues[index] <= uvSafetyThreshold ? 'rgb(46, 204, 113)' : 'rgb(231, 76, 60)';
        },
        borderWidth: 3,
        tension: 0.2,
        fill: {
          target: 'origin',
          above: 'rgba(231, 76, 60, 0.1)',  // Red above threshold
          below: 'rgba(46, 204, 113, 0.1)'  // Green below threshold
        }
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          min: 0,
          max: Math.max(Math.max(...uviValues) + 1, 6),
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
            text: `Next 24 Hours (Local Time)`
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
              return `UV Index: ${value.toFixed(1)} (${category})`;
            }
          }
        }
      }
    }
  });
  
  // Add a horizontal line for the safety threshold if annotation plugin is available
  try {
    if (Chart.Annotation) {
      uvChart.options.plugins.annotation = {
        annotations: {
          line1: {
            type: 'line',
            yMin: uvSafetyThreshold,
            yMax: uvSafetyThreshold,
            borderColor: 'rgba(0, 150, 0, 0.7)',
            borderWidth: 2,
            borderDash: [5, 5],
            label: {
              content: 'Safe level',
              enabled: true,
              position: 'start'
            }
          }
        }
      };
      uvChart.update();
    }
  } catch (e) {
    console.warn('Could not add safety threshold line:', e);
  }
}

// Helper function for safe logging
function debugPrint(message) {
  console.log(message);
}

// Start the dashboard
document.addEventListener('DOMContentLoaded', loadConfig); 