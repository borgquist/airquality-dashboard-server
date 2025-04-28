// Load configuration
let config;
let uvChart;
let eventSource;
let uvForecastData = null; // Store UV forecast data for interpolation
let uvInterpolationTimer = null; // Timer for interpolating UV values
let lastAqiData = null; // Store the last AQI data received
let lastInterpolatedUvi = null; // Store the last interpolated UV value
let uvDataTimestamp = null; // Store when we received the UV data

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
    setupEventSource();
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
}

// Set up server-sent events for real-time updates
function setupEventSource() {
  // Close existing connection if there is one
  if (eventSource) {
    eventSource.close();
  }
  
  // Create a new event source
  eventSource = new EventSource('/api/events');
  
  // Connection opened
  eventSource.addEventListener('open', () => {
    debugPrint('SSE connection established');
    
    // Clear any reconnection attempts if we're reconnecting after a server restart
    if (window.serverReconnectAttempt) {
      clearInterval(window.serverReconnectAttempt);
      window.serverReconnectAttempt = null;
      
      // If this is a reconnection after a server restart, reload the page to get fresh code
      if (window.serverWasDown) {
        debugPrint('Reconnected after server restart, reloading page to get fresh code');
        window.location.reload();
      }
    }
    
    // Update status indicator
    const indicator = document.querySelector('.live-indicator');
    if (indicator) {
      indicator.classList.remove('disconnected');
      indicator.innerHTML = '<span class="pulse"></span>Live Updates';
    }
  });
  
  // Listen for AQI updates
  eventSource.addEventListener('aqi-update', (event) => {
    const data = JSON.parse(event.data);
    debugPrint(`Received AQI update from server: ${data.timestamp}`);
    // Force a fresh fetch of AQI data when we receive an update event
    // Add cache-busting parameter and force refresh
    console.log('SSE event received - forcing fresh AQI data fetch');
    fetchAirQualityData(true);
  });
  
  // Listen for UV updates
  eventSource.addEventListener('uv-update', (event) => {
    const data = JSON.parse(event.data);
    debugPrint(`Received UV update from server: ${data.timestamp}`);
    fetchUvIndexData();
  });
  
  // Listen for server restart notifications
  eventSource.addEventListener('server-started', (event) => {
    const data = JSON.parse(event.data);
    debugPrint(`Server has started/restarted at: ${data.timestamp}`);
    
    // Reload the page to get fresh code
    debugPrint('Reloading page to get fresh code after server restart');
    
    // Brief delay to allow server to fully initialize
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  });
  
  // Connection error handling
  eventSource.addEventListener('error', (error) => {
    debugPrint('SSE connection error, attempting to reconnect...');
    
    // Close the connection
    eventSource.close();
    
    // Update status indicator
    const indicator = document.querySelector('.live-indicator');
    if (indicator) {
      indicator.classList.add('disconnected');
      indicator.innerHTML = '<span class="pulse"></span>Connection lost, reconnecting...';
    }
    
    // If we're not already attempting to reconnect
    if (!window.serverReconnectAttempt) {
      window.serverWasDown = true;
      
      // Try to reconnect every 2 seconds
      window.serverReconnectAttempt = setInterval(() => {
        debugPrint('Attempting to reconnect to server...');
        
        // Send a ping to check if server is back
        fetch('/api/version?_=' + new Date().getTime())
          .then(response => {
            if (response.ok) {
              debugPrint('Server is back online, reestablishing SSE connection');
              clearInterval(window.serverReconnectAttempt);
              window.serverReconnectAttempt = null;
              setupEventSource();
            }
          })
          .catch(err => {
            debugPrint('Server still offline: ' + err.message);
          });
      }, 2000);
    }
  });
  
  // Ping to keep connection alive
  eventSource.addEventListener('ping', () => {
    debugPrint('SSE ping received');
  });
}

// Cleanup event source on page unload
window.addEventListener('beforeunload', () => {
  if (eventSource) {
    eventSource.close();
  }
});

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
  
  // Set up UV interpolation timer (update every minute)
  if (uvInterpolationTimer) {
    clearInterval(uvInterpolationTimer);
  }
  uvInterpolationTimer = setInterval(updateInterpolatedUvIndex, 60000); // Update every minute
  
  // Also update immediately after a short delay to ensure interpolation starts
  setTimeout(updateInterpolatedUvIndex, 2000);
}

// Fetch the air quality data from the server
async function fetchAirQualityData(forceRefresh = false) {
  try {
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    const url = `/api/airquality?_=${timestamp}${forceRefresh ? '&force=1' : ''}`;
    console.log(`Fetching air quality data with${forceRefresh ? ' forced refresh' : ' normal request'}: ${url}`);
    
    const response = await fetch(url, {
      cache: forceRefresh ? 'no-store' : 'default',
      headers: {
        'Cache-Control': forceRefresh ? 'no-cache' : 'default',
        'Pragma': forceRefresh ? 'no-cache' : 'default'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Log exactly what we received for PM2.5
    if (data && data.current && data.current.pm25) {
      console.log(`CLIENT RECEIVED PM2.5 AQI US: ${data.current.pm25.aqius} (conc: ${data.current.pm25.conc}) at ${new Date().toLocaleTimeString()}`);
    }
    
    // Store the data for comparison
    lastAqiData = data;
    
    // Update the display
    updateAirQualityDisplay(data);
    
    // Log PM2.5 AQI US value
    if (data.current && data.current.pm25 && data.current.pm25.aqius !== undefined) {
      console.log(`PM2.5 AQI US: ${data.current.pm25.aqius}`, data.current.pm25);
    }
    
    // Update the last updated time
    const currentTime = new Date();
    document.getElementById('lastUpdatedTime').textContent = 
      `Last updated: ${currentTime.toLocaleTimeString()}`;
      
    debugPrint(`AQI data updated: ${JSON.stringify(data.current)}`);
  } catch (error) {
    console.error('Error fetching air quality data:', error);
    document.getElementById('lastUpdatedTime').textContent = 
      `Error: ${error.message}`;
  }
}

// Fetch UV index data
async function fetchUvIndexData() {
  try {
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    const response = await fetch(`/api/uvindex?_=${timestamp}`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Store the forecast data for interpolation
    if (data && data.forecast && data.forecast.length > 0) {
      // Store the timestamp when we received this data
      uvDataTimestamp = new Date().getTime();
      
      // Store the data
      uvForecastData = data;
      
      // Immediately calculate and display the interpolated value
      const dataCopy = JSON.parse(JSON.stringify(data));
      const adjustedForecast = interpolateAndAdjustTimes(dataCopy.forecast);
      const interpolatedUvi = getCurrentInterpolatedUvi(adjustedForecast);
      
      if (interpolatedUvi >= 0) {
        lastInterpolatedUvi = interpolatedUvi;
        dataCopy.now = { uvi: interpolatedUvi };
        updateUvIndexDisplay(dataCopy);
        debugPrint(`Initial UV index interpolated value: ${interpolatedUvi.toFixed(2)}`);
      } else {
        updateUvIndexDisplay(data);
      }
    } else {
      updateUvIndexDisplay(data);
    }
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
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    const response = await fetch(`/api/version?_=${timestamp}`);
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
  // Empty function - removed duplicate live indicator code
}

// Update the air quality dashboard with the latest data
function updateAirQualityDisplay(data) {
  if (!data) {
    console.error('Invalid data format');
    return;
  }
  
  // Log what data we're displaying
  if (data.current && data.current.pm25) {
    console.log(`DISPLAYING PM2.5 AQI US: ${data.current.pm25.aqius}`);
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
    // Pressure element may not exist
    const pressureElement = document.getElementById('pressure');
    if (pressureElement) {
      pressureElement.textContent = '-';
    }
    
    // Update new measurement values next to AQI
    document.getElementById('particleCountValue').textContent = '-';
    document.getElementById('pm1Value').textContent = '-';
    document.getElementById('pm10Value').textContent = '-';
    document.getElementById('pm25Value').textContent = '-';
    document.getElementById('co2Value').textContent = '-';
    
    return;
  }
  
  // Update station name in header if available
  if (data.name) {
    document.querySelector('h1').textContent = data.name;
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
    document.getElementById('aqiDisplay').textContent = Math.round(aqiValue);
  }
  
  // Hide or show particles display
  const particlesContainer = document.querySelector('.aqi-measurement-container:has(#particleCountValue)');
  if (particlesContainer && (data.current?.particles === undefined || data.current?.particles === null)) {
    particlesContainer.style.display = 'none';
  } else if (particlesContainer) {
    particlesContainer.style.display = '';
    document.getElementById('particleCountValue').textContent = `${data.current.particles} /L`;
  }
  
  // Hide or show CO2 display
  const co2Container = document.querySelector('.aqi-measurement-container:has(#co2Value)');
  if (co2Container && (data.current?.co2 === undefined || data.current?.co2 === null)) {
    co2Container.style.display = 'none';
  } else if (co2Container) {
    co2Container.style.display = '';
    document.getElementById('co2Value').textContent = `${data.current.co2} ppm`;
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
  // Update pressure only if element exists
  const pressureElement = document.getElementById('pressure');
  if (pressureElement && data.current?.pr) {
    pressureElement.textContent = `${(data.current.pr / 100).toFixed(1)} hPa`;
  }
  
  // Update new measurement values next to AQI
  console.log('PM data structure:', {
    pm1: data.current?.pm1,
    pm10: data.current?.pm10,
    pm25: data.current?.pm25
  });
  
  document.getElementById('pm1Value').textContent =
    data.current?.pm1 !== undefined && data.current?.pm1 !== null ?
      (typeof data.current.pm1 === 'object' ? 
        (data.current.pm1.conc !== undefined ? `${data.current.pm1.conc} μg/m³` : `- μg/m³`) 
        : `${data.current.pm1} μg/m³`) : '-';
  
  document.getElementById('pm10Value').textContent =
    data.current?.pm10 !== undefined && data.current?.pm10 !== null ?
      (typeof data.current.pm10 === 'object' ? 
        (data.current.pm10.conc !== undefined ? `${data.current.pm10.conc} μg/m³` : `- μg/m³`) 
        : `${data.current.pm10} μg/m³`) : '-';
  
  document.getElementById('pm25Value').textContent =
    data.current?.pm25 !== undefined && data.current?.pm25 !== null ?
      (typeof data.current.pm25 === 'object' ? 
        (data.current.pm25.conc !== undefined ? `${data.current.pm25.conc} μg/m³` : `- μg/m³`) 
        : `${data.current.pm25} μg/m³`) : '-';
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
    forecastContainer.innerHTML = '<h3></h3>';
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
  
  // Show two decimal places for better visibility of changes
  document.getElementById('uvIndexValue').textContent = currentUvIndex.toFixed(2);
  
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
    forecastContainer.innerHTML = '<h3></h3>';
    
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
  
  // Add unsafe class for red background with white text when UV is unsafe
  if (!isCurrentUvSafe) {
    safetyElement.classList.add('unsafe');
  }
  
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
    'bg-good', 'bg-moderate', 'bg-unhealthy-sensitive', 'bg-unhealthy', 'bg-very-unhealthy', 'bg-hazardous'
  );
  
  // Get the AQI category and apply the matching background class
  const aqiCategory = getAQICategory(aqi);
  document.body.classList.add(`bg-${aqiCategory.className}`);
}

// Function to generate a complete 24-hour timeline by interpolating between sparse data points
function generateCompleteTimelineData(forecastData, currentTime) {
  // If we have no data, return empty array
  if (!forecastData || forecastData.length === 0) {
    return [];
  }
  
  const result = [];
  
  // Sort all forecast data by time first
  const sortedForecast = [...forecastData].sort((a, b) => 
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );
  
  // Find earliest and latest times in the data
  const earliestTime = new Date(sortedForecast[0].time);
  const latestTime = new Date(sortedForecast[sortedForecast.length - 1].time);
  
  // Use the original data points
  for (const point of sortedForecast) {
    result.push({
      time: new Date(point.time),
      uvi: point.uvi
    });
  }
  
  // Add the current time data point if we have a valid UV reading
  if (lastInterpolatedUvi !== null) {
    // Check if we need to add current time (if it's not already close to an existing point)
    let needToAddCurrentTime = true;
    for (const point of result) {
      const timeDiff = Math.abs(point.time.getTime() - currentTime.getTime());
      if (timeDiff < 30 * 60 * 1000) { // Within 30 minutes
        needToAddCurrentTime = false;
        break;
      }
    }
    
    if (needToAddCurrentTime) {
      result.push({
        time: new Date(currentTime),
        uvi: lastInterpolatedUvi,
        isCurrent: true
      });
    }
  }
  
  // Sort all points by time
  result.sort((a, b) => a.time.getTime() - b.time.getTime());
  
  // Ensure we have nice coverage by adding more interpolated points
  const morePoints = [];
  for (let i = 0; i < result.length - 1; i++) {
    const curr = result[i];
    const next = result[i+1];
    
    // Calculate time difference in hours
    const timeDiffHours = (next.time.getTime() - curr.time.getTime()) / (1000 * 60 * 60);
    
    // If points are more than 1 hour apart, add interpolated points
    if (timeDiffHours > 1) {
      const numPointsToAdd = Math.floor(timeDiffHours);
      
      for (let j = 1; j <= numPointsToAdd; j++) {
        const ratio = j / (numPointsToAdd + 1);
        const interpTime = new Date(curr.time.getTime() + ratio * (next.time.getTime() - curr.time.getTime()));
        const interpUvi = curr.uvi + ratio * (next.uvi - curr.uvi);
        
        morePoints.push({
          time: interpTime,
          uvi: interpUvi
        });
      }
    }
  }
  
  // Add interpolated points and sort again
  result.push(...morePoints);
  result.sort((a, b) => a.time.getTime() - b.time.getTime());
  
  return result;
}

// Create or update the UV forecast graph
function createUvForecastGraph(data) {
  const forecastData = data.forecast;
  if (!forecastData || !forecastData.length) {
    console.error('No forecast data available');
    return;
  }
  
  // Get the current time
  const currentTime = new Date();
  
  // Filter for data that has valid UV readings (daytime)
  const dayTimeForecast = forecastData.filter(entry => entry.uvi > 0);
  
  if (dayTimeForecast.length === 0) {
    debugPrint('No daytime UV forecast data available');
    document.getElementById('uvForecastGraph').style.display = 'none';
    return;
  }
  
  // Check if we need to add more data points
  const enhancedForecast = generateCompleteTimelineData(dayTimeForecast, currentTime);
  
  // Create arrays for labels (times) and data
  const times = [];
  const uviValues = [];
  const dataPoints = [];
  
  // Use the same threshold as in the safety message
  const uvSafetyThreshold = 4;
  
  // Find the current time index
  let currentTimeIndex = -1;
  
  // Process each entry for the chart
  enhancedForecast.forEach((entry, index) => {
    const entryTime = new Date(entry.time);
    
    // Format the time to show the hour only
    let timeLabel = entryTime.toLocaleTimeString([], {hour: '2-digit'});
    
    times.push(timeLabel);
    uviValues.push(entry.uvi);
    
    // Check if this is current time
    if (entry.isCurrent || 
        (Math.abs(entryTime.getTime() - currentTime.getTime()) < 30 * 60 * 1000)) {
      currentTimeIndex = index;
    }
    
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
          
          // If this is the current time point, make it larger and darker
          if (index === currentTimeIndex) {
            return 'rgb(41, 128, 185)';  // Blue for current time
          }
          
          return uviValues[index] <= uvSafetyThreshold ? 'rgb(46, 204, 113)' : 'rgb(231, 76, 60)';
        },
        pointRadius: function(context) {
          // Make current time point larger
          return context.dataIndex === currentTimeIndex ? 6 : 3;
        },
        borderWidth: 3,
        tension: 0.2,
        fill: true,
        backgroundColor: function(context) {
          // Use green for safe values, red for unsafe
          const index = context.dataIndex;
          return uviValues[index] <= uvSafetyThreshold ? 
                 'rgba(46, 204, 113, 0.2)' : // Green area when safe
                 'rgba(231, 76, 60, 0.1)';   // Red area when unsafe
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
            text: 'Daylight Hours (Local Time)'
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
              let label = `UV Index: ${value.toFixed(1)} (${category})`;
              
              // Indicate current time in tooltip
              if (context.dataIndex === currentTimeIndex) {
                label += ' - Current Time';
              }
              
              return label;
            }
          }
        }
      }
    }
  });
  
  // Add annotations for the safe threshold and current time
  try {
    if (Chart.Annotation) {
      const annotations = {
        thresholdLine: {
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
      };
      
      // Add current time vertical line if we found it
      if (currentTimeIndex >= 0) {
        annotations.currentTimeLine = {
          type: 'line',
          xMin: currentTimeIndex,
          xMax: currentTimeIndex,
          borderColor: 'rgba(41, 128, 185, 0.7)',
          borderWidth: 2,
          label: {
            content: 'Now',
            enabled: true,
            position: 'top'
          }
        };
      }
      
      uvChart.options.plugins.annotation = {
        annotations: annotations
      };
      
      uvChart.update();
    }
  } catch (e) {
    console.warn('Could not add annotation lines:', e);
  }
}

// Helper function for safe logging
function debugPrint(message) {
  console.log(message);
}

// Update UV index display with interpolated value
function updateInterpolatedUvIndex() {
  if (!uvForecastData || !uvForecastData.forecast || uvForecastData.forecast.length === 0) {
    return; // No forecast data available
  }
  
  // Create a copy of the data to avoid modifying the original
  const dataCopy = JSON.parse(JSON.stringify(uvForecastData));
  
  // Interpolate the current UV index value
  const adjustedForecast = interpolateAndAdjustTimes(dataCopy.forecast);
  const interpolatedUvi = getCurrentInterpolatedUvi(adjustedForecast);
  
  if (interpolatedUvi >= 0) {
    // Store the interpolated value
    lastInterpolatedUvi = interpolatedUvi;
    
    // Update the current UV index value
    dataCopy.now = { uvi: interpolatedUvi };
    
    // Update the display with the interpolated value
    updateUvIndexDisplay(dataCopy);
    
    debugPrint(`Updated UV index with interpolated value: ${interpolatedUvi.toFixed(2)}`);
  }
}

// Start the dashboard
document.addEventListener('DOMContentLoaded', loadConfig); 