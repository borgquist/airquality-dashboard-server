// Load configuration
let config;
let eventSource;
let lastAqiData = null; // Store the last AQI data received
let lastUvData = null; // Store the last UV data received
let uvChart = null; // Reference for UV chart

// Fetch configuration and initialize
async function loadConfig() {
  try {
    const response = await fetch('/config.json');
    config = await response.json();
    
    // Load Chart.js before initializing dashboard
    await loadChartJsIfNeeded();
    
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
  
  console.log('Setting up SSE connection to server...');
  
  // Update status indicator to show connecting state
  const indicator = document.querySelector('.live-indicator');
  if (indicator) {
    indicator.classList.add('disconnected');
    indicator.innerHTML = '<span class="pulse"></span>Connecting...';
  }
  
  // Create a new event source
  eventSource = new EventSource('/api/events');
  
  // Connection opened
  eventSource.addEventListener('open', () => {
    console.log('✅ SSE connection established successfully');
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
    if (indicator) {
      indicator.classList.remove('disconnected');
      indicator.innerHTML = '<span class="pulse"></span>Live Updates';
    }
    
    // Set up a heartbeat to detect stale connections
    if (window.heartbeatTimer) {
      clearInterval(window.heartbeatTimer);
    }
    
    window.lastHeartbeat = Date.now();
    window.heartbeatTimer = setInterval(() => {
      // If we haven't received a ping in over 30 seconds, consider the connection dead
      const timeSinceLastHeartbeat = Date.now() - window.lastHeartbeat;
      if (timeSinceLastHeartbeat > 30000) {
        console.error('❌ SSE connection appears to be stale (no heartbeat for 30s)');
        
        // Force close and reconnect
        if (eventSource) {
          eventSource.close();
          
          // Update status indicator
          if (indicator) {
            indicator.classList.add('disconnected');
            indicator.innerHTML = '<span class="pulse"></span>Connection lost, reconnecting...';
          }
          
          // Try to reconnect
          setTimeout(setupEventSource, 1000);
        }
      }
    }, 5000); // Check every 5 seconds
  });
  
  // Listen for AQI updates
  eventSource.addEventListener('aqi-update', (event) => {
    const data = JSON.parse(event.data);
    console.log(`🔄 Received AQI update via SSE: ${data.timestamp}`);
    debugPrint(`Received AQI update from server: ${data.timestamp}`);
    // Force a fresh fetch of AQI data when we receive an update event
    // Add cache-busting parameter and force refresh
    console.log('SSE event received - forcing fresh AQI data fetch');
    fetchAirQualityData(true);
  });
  
  // Listen for server restart notifications
  eventSource.addEventListener('server-started', (event) => {
    const data = JSON.parse(event.data);
    console.log(`🔄 Server has started/restarted: ${data.timestamp}`);
    debugPrint(`Server has started/restarted at: ${data.timestamp}`);
    
    // Reload the page to get fresh code
    debugPrint('Reloading page to get fresh code after server restart');
    
    // Brief delay to allow server to fully initialize
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  });
  
  // Listen for UV updates
  eventSource.addEventListener('uv-update', (event) => {
    const data = JSON.parse(event.data);
    console.log(`🔄 Received UV update via SSE: ${data.timestamp}`);
    debugPrint(`Received UV update from server: ${data.timestamp}`);
    // Force a fresh fetch of UV data when we receive an update event
    // Add _sse=1 to mark this request as initiated by an SSE event
    fetchUvIndexData(true, true);
  });
  
  // Connection error handling
  eventSource.addEventListener('error', (error) => {
    console.error('❌ SSE connection error:', error);
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
        console.log('🔄 Attempting to reconnect to SSE...');
        debugPrint('Attempting to reconnect to server...');
        
        // Send a ping to check if server is back
        fetch('/api/version?_=' + new Date().getTime())
          .then(response => {
            if (response.ok) {
              console.log('✅ Server is back online, reestablishing SSE connection');
              debugPrint('Server is back online, reestablishing SSE connection');
              clearInterval(window.serverReconnectAttempt);
              window.serverReconnectAttempt = null;
              setupEventSource();
            }
          })
          .catch(err => {
            console.error('❌ Server still offline:', err.message);
            debugPrint('Server still offline: ' + err.message);
          });
      }, 2000);
    }
  });
  
  // Ping to keep connection alive
  eventSource.addEventListener('ping', () => {
    console.log('🔄 SSE ping received');
    debugPrint('SSE ping received');
    window.lastHeartbeat = Date.now();
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
      `${currentTime.toLocaleTimeString()}`;
      
    debugPrint(`AQI data updated: ${JSON.stringify(data.current)}`);
  } catch (error) {
    console.error('Error fetching air quality data:', error);
    document.getElementById('lastUpdatedTime').textContent = 
      `Error: ${error.message}`;
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
  const particlesContainer = document.getElementById('particlesContainer');
  if (particlesContainer && (data.current?.particles === undefined || data.current?.particles === null)) {
    particlesContainer.style.display = 'none';
  } else if (particlesContainer) {
    particlesContainer.style.display = '';
    document.getElementById('particleCountValue').textContent = `${data.current.particles} /L`;
  }
  
  // Hide or show CO2 display
  const co2Container = document.getElementById('co2Container');
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
    
    debugPrint(`Changing AQI category to: ${aqiCategory.name} (class: ${aqiCategory.className})`);
    
    // Remove all category classes from both elements
    const categoryClasses = ['good', 'moderate', 'unhealthy-sensitive', 'unhealthy', 'very-unhealthy', 'hazardous'];
    
    categoryElement.classList.remove(...categoryClasses);
    mainAqiElement.classList.remove(...categoryClasses);
    
    // IMPORTANT: Clear any inline styles that might be overriding the CSS classes
    // This is critical to ensure color changes apply immediately without requiring a refresh
    mainAqiElement.style.removeProperty('background-color');
    mainAqiElement.style.removeProperty('color');
    mainAqiElement.style.removeProperty('--measurement-text-color');
    
    debugPrint('Removed inline styles to ensure CSS classes take effect');
    
    // Add the current category class to both elements
    categoryElement.classList.add(aqiCategory.className);
    mainAqiElement.classList.add(aqiCategory.className);
    
    debugPrint(`Added class '${aqiCategory.className}' to elements`);
    
    // Wait a tiny bit for the class styles to apply before potentially overriding with custom colors
    // This ensures that if custom colors fail, the class-based colors will still be visible
    setTimeout(() => {
      // Apply custom color settings from config if available
      const configKey = aqiCategory.className.replace('-', '').replace('-', '');
      if (config.aqiColors && config.aqiColors[configKey]) {
        const colorConfig = config.aqiColors[configKey];
        debugPrint(`Applying custom colors from config: bg=${colorConfig.backgroundColor}, text=${colorConfig.textColor}`);
        
        mainAqiElement.style.backgroundColor = colorConfig.backgroundColor;
        mainAqiElement.style.color = colorConfig.textColor;
        
        // Set the CSS variable for measurement text color based on textColor
        const textColor = colorConfig.textColor.toLowerCase();
        // If the main text color is white or light, use white for measurements, otherwise black
        if (textColor === '#fff' || textColor === '#ffffff' || textColor === 'white') {
          mainAqiElement.style.setProperty('--measurement-text-color', '#fff');
          debugPrint('Set measurement text color to white');
        } else {
          mainAqiElement.style.setProperty('--measurement-text-color', '#000');
          debugPrint('Set measurement text color to black');
        }
      } else {
        debugPrint('No custom colors in config, using CSS class-based colors');
      }
      
      // Update page background based on AQI
      updatePageBackground(aqiValue);
    }, 10);
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

// Helper function for safe logging
function debugPrint(message) {
  console.log(message);
}

// Start the dashboard
document.addEventListener('DOMContentLoaded', loadConfig);

// Update the UV index display
function updateUvIndexDisplay(data) {
  if (!data || data.error || !data.result || !data.result.length) {
    console.warn('Invalid UV data format or error:', data?.error || 'No result array');
    
    // Still update the display with empty values
    document.getElementById('uvCurrentValue').textContent = '-';
    document.getElementById('uvCurrentClass').textContent = '-';
    document.getElementById('uvRiseTime').textContent = 'Rise above 3: --:--';
    document.getElementById('uvFallTime').textContent = 'Fall below 3: --:--';
    return;
  }
  
  // Process UV data
  const uvReadings = data.result.map(item => ({
    utc: new Date(item.uv_time).toISOString().substring(11, 16), // Extract HH:MM
    uv: item.uv
  }));
  
  // Find crossings for UV index of 3 (moderate threshold)
  const uvRiseTime = findCrossing(uvReadings, 3, "rising");
  const uvFallTime = findCrossing(uvReadings, 3, "falling");
  
  // Get current UV level
  const currentTime = new Date();
  const currentUv = getCurrentUvLevel(uvReadings, currentTime);
  
  // Update UV value display
  const uvCurrentValue = document.getElementById('uvCurrentValue');
  if (uvCurrentValue) {
    uvCurrentValue.textContent = currentUv !== null ? currentUv.toFixed(1) : '-';
  }
  
  // Update UV class display
  const uvCurrentClass = document.getElementById('uvCurrentClass');
  if (uvCurrentClass) {
    uvCurrentClass.textContent = getUvCategoryName(currentUv);
    
    // Remove all category classes
    uvCurrentClass.classList.remove('uv-low', 'uv-moderate', 'uv-high', 'uv-very-high', 'uv-extreme');
    
    // Add appropriate class
    const uvClass = getUvClass(currentUv);
    if (uvClass) {
      uvCurrentClass.classList.add(uvClass);
    }
    
    // Also add class to parent .uv-box
    const uvBox = document.querySelector('.uv-box');
    if (uvBox) {
      uvBox.classList.remove('uv-low', 'uv-moderate', 'uv-high', 'uv-very-high', 'uv-extreme');
      if (uvClass) {
        uvBox.classList.add(uvClass);
      }
    }
  }
  
  // Update crossing times
  const uvRiseElement = document.getElementById('uvRiseTime');
  const uvFallElement = document.getElementById('uvFallTime');
  
  if (uvRiseElement) {
    uvRiseElement.textContent = uvRiseTime ? `Rise above 3: ${uvRiseTime}` : 'Rise above 3: --:--';
  }
  
  if (uvFallElement) {
    uvFallElement.textContent = uvFallTime ? `Fall below 3: ${uvFallTime}` : 'Fall below 3: --:--';
  }
  
  // Update UV info with recommendations
  const uvInfo = document.getElementById('uvInfo');
  if (uvInfo) {
    uvInfo.innerHTML = getUvInfoAndRecommendations(currentUv);
  }
  
  // Update chart
  updateUvChart(uvReadings, uvRiseTime, uvFallTime);
}

// Get UV category name
function getUvCategoryName(uvValue) {
  if (uvValue === null) return '-';
  if (uvValue < 3) return 'Low';
  if (uvValue < 6) return 'Moderate';
  if (uvValue < 8) return 'High';
  if (uvValue < 11) return 'Very High';
  return 'Extreme';
}

// Get UV recommendations
function getUvInfoAndRecommendations(uvValue) {
  if (uvValue === null) return '';
  
  let recommendations = '';
  
  if (uvValue < 3) {
    recommendations = 'Low risk. No protection needed for most people.';
  } else if (uvValue < 6) {
    recommendations = 'Moderate risk. Wear sunscreen SPF 30+, hat, and sunglasses.';
  } else if (uvValue < 8) {
    recommendations = 'High risk. Stay in shade during midday hours. Use SPF 30+ sunscreen, hat, and sunglasses.';
  } else if (uvValue < 11) {
    recommendations = 'Very high risk. Minimize sun exposure between 10am and 4pm. Apply SPF 30+ every 2 hours.';
  } else {
    recommendations = 'Extreme risk. Avoid outdoors during midday hours. Shirt, sunscreen, hat, and sunglasses are essential.';
  }
  
  return `<p>${recommendations}</p>`;
}

// Update UV chart
function updateUvChart(uvReadings, uvRiseTime, uvFallTime) {
  const canvas = document.getElementById('uvChart');
  if (!canvas) return;
  
  // Clean up previous chart if it exists
  if (uvChart) {
    uvChart.destroy();
  }
  
  // Prepare data for chart
  const times = uvReadings.map(reading => reading.utc);
  const values = uvReadings.map(reading => reading.uv);
  
  // Generate additional points for a smoother curve
  const smoothData = generateSmoothCurve(times, values);
  
  // Create annotations for rise and fall times
  const annotations = {};
  
  if (uvRiseTime) {
    annotations.riseTime = {
      type: 'line',
      xMin: uvRiseTime,
      xMax: uvRiseTime,
      borderColor: 'rgba(255, 152, 0, 0.8)',
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        content: `UV > 4 at ${uvRiseTime}`,
        enabled: true,
        position: 'top',
        backgroundColor: 'rgba(255, 152, 0, 0.8)',
        color: 'white',
        padding: 4
      }
    };
  }
  
  if (uvFallTime) {
    annotations.fallTime = {
      type: 'line',
      xMin: uvFallTime,
      xMax: uvFallTime,
      borderColor: 'rgba(76, 175, 80, 0.8)',
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        content: `UV < 4 at ${uvFallTime}`,
        enabled: true,
        position: 'top',
        backgroundColor: 'rgba(76, 175, 80, 0.8)',
        color: 'white',
        padding: 4
      }
    };
  }
  
  // Add horizontal threshold line at UV=4
  annotations.threshold = {
    type: 'line',
    yMin: 4,
    yMax: 4,
    borderColor: 'rgba(255, 152, 0, 0.8)',
    borderWidth: 2,
    borderDash: [5, 5],
    label: {
      content: 'Protection Level',
      enabled: true,
      position: 'end',
      backgroundColor: 'rgba(255, 152, 0, 0.8)',
      color: 'white',
      padding: 4
    }
  };
  
  // Create chart
  const ctx = canvas.getContext('2d');
  uvChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: smoothData.times,
      datasets: [
        {
          label: 'UV Index',
          data: smoothData.values,
          borderColor: 'rgba(233, 30, 99, 0.8)',
          backgroundColor: 'rgba(233, 30, 99, 0.2)',
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
            color: '#333'
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(...values) * 1.1,
          ticks: {
            stepSize: 2,
            color: '#333'
          },
          grid: {
            color: 'rgba(200, 200, 200, 0.3)'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          titleColor: 'white',
          bodyColor: 'white',
          callbacks: {
            title: function(tooltipItems) {
              return tooltipItems[0].label;
            },
            label: function(context) {
              return `UV Index: ${context.raw.toFixed(1)}`;
            }
          }
        },
        annotation: {
          annotations: annotations
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  });
}

// Generate additional points for a smoother curve
function generateSmoothCurve(times, values) {
  if (times.length !== values.length || times.length < 2) {
    return { times, values };
  }
  
  const smoothTimes = [];
  const smoothValues = [];
  
  // Convert times to minutes for interpolation
  const minutesTimes = times.map(time => timeToMinutes(time));
  
  // Add extra points between each original point
  for (let i = 0; i < times.length - 1; i++) {
    const startTime = minutesTimes[i];
    const endTime = minutesTimes[i + 1];
    const startValue = values[i];
    const endValue = values[i + 1];
    
    // How many points to add between (more points for wider time gaps)
    const pointsToAdd = Math.max(5, Math.ceil((endTime - startTime) / 5));
    
    for (let j = 0; j <= pointsToAdd; j++) {
      const fraction = j / pointsToAdd;
      const currentMinutes = startTime + fraction * (endTime - startTime);
      const currentValue = startValue + fraction * (endValue - startValue);
      
      smoothTimes.push(minutesToTime(currentMinutes));
      smoothValues.push(currentValue);
    }
  }
  
  // Add last point if needed
  if (smoothTimes[smoothTimes.length - 1] !== times[times.length - 1]) {
    smoothTimes.push(times[times.length - 1]);
    smoothValues.push(values[values.length - 1]);
  }
  
  return { times: smoothTimes, values: smoothValues };
}

// Fetch the UV index data from the server
async function fetchUvIndexData(forceRefresh = false, isSseEvent = false) {
  try {
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    const url = `/api/uvindex?_=${timestamp}${forceRefresh ? '&force=1' : ''}${isSseEvent ? '&_sse=1' : ''}`;
    console.log(`Fetching UV index data with${forceRefresh ? ' forced refresh' : ' normal request'}${isSseEvent ? ' (SSE initiated)' : ''}: ${url}`);
    
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
    console.log("UV Data received:", data);
    
    // Store the data for future reference
    lastUvData = data;
    
    // Update the display - this creates the UV box if it doesn't exist
    updateUvIndexDisplay(data);
    
    debugPrint(`UV data updated: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error('Error fetching UV index data:', error);
  }
}

// Load Chart.js from CDN if not already loaded
function loadChartJsIfNeeded() {
  if (window.Chart) {
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Convert "HH:MM" string to minutes since midnight
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

// Convert minutes since midnight to "HH:MM" string
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Find the interpolated crossing time
function findCrossing(uvReadings, targetUV, direction = "rising") {
  for (let i = 0; i < uvReadings.length - 1; i++) {
    const current = uvReadings[i];
    const next = uvReadings[i + 1];

    if ((direction === "rising" && current.uv < targetUV && next.uv >= targetUV) ||
        (direction === "falling" && current.uv > targetUV && next.uv <= targetUV)) {

      const uvDelta = next.uv - current.uv;
      const timeDelta = timeToMinutes(next.utc) - timeToMinutes(current.utc);
      const fraction = (targetUV - current.uv) / uvDelta;
      const interpolatedMinutes = timeToMinutes(current.utc) + (fraction * timeDelta);

      return minutesToTime(interpolatedMinutes); // Already in local time
    }
  }
  return null; // No crossing found
}

// Get current UV level based on time interpolation
function getCurrentUvLevel(uvReadings, currentTime) {
  if (!uvReadings || uvReadings.length === 0) return null;
  
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  
  // Find surrounding data points
  for (let i = 0; i < uvReadings.length - 1; i++) {
    const current = uvReadings[i];
    const next = uvReadings[i + 1];
    
    const currentMinutesUtc = timeToMinutes(current.utc);
    const nextMinutesUtc = timeToMinutes(next.utc);
    
    if (currentMinutes >= currentMinutesUtc && currentMinutes <= nextMinutesUtc) {
      // Interpolate
      const fraction = (currentMinutes - currentMinutesUtc) / (nextMinutesUtc - currentMinutesUtc);
      return current.uv + fraction * (next.uv - current.uv);
    }
  }
  
  // Outside the range, get closest value
  const firstTime = timeToMinutes(uvReadings[0].utc);
  const lastTime = timeToMinutes(uvReadings[uvReadings.length - 1].utc);
  
  if (currentMinutes < firstTime) return uvReadings[0].uv;
  if (currentMinutes > lastTime) return uvReadings[uvReadings.length - 1].uv;
  
  return null;
}

// Get UV index class for styling
function getUvClass(uvValue) {
  if (uvValue === null) return '';
  if (uvValue < 3) return 'uv-low';
  if (uvValue < 6) return 'uv-moderate';
  if (uvValue < 8) return 'uv-high';
  if (uvValue < 11) return 'uv-very-high';
  return 'uv-extreme';
}

// ... existing code ... 