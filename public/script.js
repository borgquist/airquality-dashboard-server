// Load configuration
let config;
let eventSource;
let lastAqiData = null; // Store the last AQI data received
let lastUvData = null; // Store the last UV data received
let uvChart = null; // Reference for UV chart
let cubicSpline = null; // Reference for cubic spline module

// Fetch configuration and initialize
async function loadConfig() {
  try {
    const response = await fetch('/config.json');
    config = await response.json();
    
    // Load Chart.js before initializing dashboard
    await loadChartJsIfNeeded();
    
    // Load the cubic-spline library
    await loadCubicSpline();
    
    // Load Chart.js annotation plugin
    await loadChartJsAnnotationPlugin();
    
    initDashboard();
    setupEventSource();
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
}

// Load the cubic-spline library
async function loadCubicSpline() {
  if (window.CubicSpline) {
    cubicSpline = window.CubicSpline;
    console.log('🔍 DEBUG: CubicSpline already available in window object');
    return Promise.resolve();
  }
  
  try {
    // First try to load from node_modules (if serving locally)
    console.log('🔍 DEBUG: Attempting to load cubic-spline from node_modules');
    const { default: Spline } = await import('/node_modules/cubic-spline/index.js');
    window.CubicSpline = Spline;
    cubicSpline = Spline;
    console.log('✅ DEBUG: Successfully loaded cubic-spline from local node_modules');
    return Promise.resolve();
  } catch (error) {
    console.warn('⚠️ DEBUG: Could not load cubic-spline from node_modules, trying CDN:', error);
    
    // Fall back to CDN if local fails
    return new Promise((resolve, reject) => {
      // Try direct script load instead of ES module
      const script = document.createElement('script');
      // This is a better compatible version for browser direct loading
      script.src = 'https://unpkg.com/cubic-spline@3.0.3/dist/index.js';
      console.log('🔍 DEBUG: Attempting to load cubic-spline from CDN:', script.src);
      script.onload = () => {
        // Create a global reference
        console.log('🔍 DEBUG: CDN script loaded, checking if CubicSpline is defined');
        
        // Check what globals are available
        console.log('🔍 DEBUG: Available global after script load:', 
          typeof CubicSpline !== 'undefined' ? 'CubicSpline' : 
          typeof cubicSpline !== 'undefined' ? 'cubicSpline' : 
          'none');
        
        // Different CDNs might expose the library differently
        if (typeof CubicSpline !== 'undefined') {
          window.CubicSpline = CubicSpline;
          cubicSpline = CubicSpline;
          console.log('✅ DEBUG: Successfully loaded CubicSpline from CDN');
          resolve();
        } else if (typeof cubicSpline !== 'undefined') {
          window.CubicSpline = cubicSpline;
          console.log('✅ DEBUG: Successfully loaded cubicSpline (lowercase) from CDN');
          resolve();
        } else {
          // As a last resort, create a simple cubic spline implementation
          console.error('❌ DEBUG: cubic-spline loaded but library not defined. Creating fallback implementation.');
          
          // Create a simple cubic spline implementation as fallback
          window.CubicSpline = class SimpleCubicSpline {
            constructor(xs, ys) {
              this.xs = xs;
              this.ys = ys;
            }
            
            at(x) {
              // Find the appropriate segment
              const n = this.xs.length;
              let i = 0;
              
              // If x is outside the range, return the closest endpoint
              if (x <= this.xs[0]) return this.ys[0];
              if (x >= this.xs[n-1]) return this.ys[n-1];
              
              // Binary search to find the right segment
              let low = 0, high = n - 1;
              while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                if (this.xs[mid] < x) low = mid + 1;
                else high = mid - 1;
              }
              i = high;
              
              // Simple linear interpolation within the segment
              const t = (x - this.xs[i]) / (this.xs[i+1] - this.xs[i]);
              return this.ys[i] * (1 - t) + this.ys[i+1] * t;
            }
          };
          
          cubicSpline = window.CubicSpline;
          console.log('✅ DEBUG: Created fallback cubic spline implementation');
          resolve();
        }
      };
      script.onerror = (e) => {
        console.error('❌ DEBUG: Failed to load cubic-spline from CDN:', e);
        
        // Create fallback implementation
        console.log('🔍 DEBUG: Creating fallback cubic spline implementation after CDN error');
        window.CubicSpline = class SimpleCubicSpline {
          constructor(xs, ys) {
            this.xs = xs;
            this.ys = ys;
          }
          
          at(x) {
            // Find the appropriate segment
            const n = this.xs.length;
            let i = 0;
            
            // If x is outside the range, return the closest endpoint
            if (x <= this.xs[0]) return this.ys[0];
            if (x >= this.xs[n-1]) return this.ys[n-1];
            
            // Binary search to find the right segment
            let low = 0, high = n - 1;
            while (low <= high) {
              const mid = Math.floor((low + high) / 2);
              if (this.xs[mid] < x) low = mid + 1;
              else high = mid - 1;
            }
            i = high;
            
            // Simple linear interpolation within the segment
            const t = (x - this.xs[i]) / (this.xs[i+1] - this.xs[i]);
            return this.ys[i] * (1 - t) + this.ys[i+1] * t;
          }
        };
        
        cubicSpline = window.CubicSpline;
        console.log('✅ DEBUG: Created fallback cubic spline implementation after CDN error');
        resolve();
      };
      document.head.appendChild(script);
    });
  }
}

// Load Chart.js from CDN if not already loaded
function loadChartJsIfNeeded() {
  if (window.Chart) {
    console.log('🔍 DEBUG: Chart.js already available');
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js';
    console.log('🔍 DEBUG: Loading Chart.js from CDN:', script.src);
    script.onload = () => {
      console.log('✅ DEBUG: Chart.js loaded successfully');
      resolve();
    };
    script.onerror = (e) => {
      console.error('❌ DEBUG: Failed to load Chart.js:', e);
      reject(e);
    };
    document.head.appendChild(script);
  });
}

// Load Chart.js annotation plugin
async function loadChartJsAnnotationPlugin() {
  if (window.Chart && window.Chart.Annotation) {
    console.log('🔍 DEBUG: Chart.js annotation plugin already registered');
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@2.1.0/dist/chartjs-plugin-annotation.min.js';
    console.log('🔍 DEBUG: Loading Chart.js annotation plugin from CDN:', script.src);
    script.onload = () => {
      console.log('✅ DEBUG: Chart.js annotation plugin loaded');
      
      // Check if plugin is properly registered
      if (window.Chart && window.Chart.register) {
        try {
          // Make sure the annotation plugin is properly registered
          if (window.ChartAnnotation) {
            window.Chart.register(window.ChartAnnotation);
            console.log('✅ DEBUG: Chart.js annotation plugin registered successfully');
          } else {
            console.error('❌ DEBUG: ChartAnnotation not found after loading script');
          }
        } catch (err) {
          console.error('❌ DEBUG: Failed to register annotation plugin:', err);
        }
      } else {
        console.error('❌ DEBUG: Chart.register method not available');
      }
      
      resolve();
    };
    script.onerror = (e) => {
      console.error('❌ DEBUG: Failed to load Chart.js annotation plugin:', e);
      reject(e);
    };
    document.head.appendChild(script);
  });
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
    document.getElementById('uvRiseTime').textContent = 'Rise above 4: --:--';
    document.getElementById('uvFallTime').textContent = 'Fall below 4: --:--';
    return;
  }
  
  console.log("🔍 DEBUG: Processing UV data with", data.result.length, "readings");
  
  // Process UV data and ensure it's in the expected format
  const uvReadings = data.result.map(item => {
    // Check if the item has the expected properties
    if (typeof item.uv === 'undefined' || !item.uv_time) {
      console.error('❌ DEBUG: Invalid UV data format for item:', item);
      return {
        uv: 0,
        utc: new Date().toISOString() // Fallback to current time
      };
    }
    
    return {
      uv: item.uv,
      utc: item.uv_time
    };
  });
  
  console.log("🔍 DEBUG: Processed", uvReadings.length, "UV readings");
  
  // Log a sample of the processed data
  if (uvReadings.length > 0) {
    console.log("🔍 DEBUG: Sample processed UV data:", {
      first: uvReadings[0],
      last: uvReadings[uvReadings.length - 1]
    });
  }
  
  // Find crossings for UV index of 4 (moderate threshold)
  console.log("🔍 DEBUG: Finding UV crossings for threshold 4");
  const uvRiseTime = findUvCrossing(uvReadings, 4, "rising");
  const uvFallTime = findUvCrossing(uvReadings, 4, "falling");
  
  console.log("🔍 DEBUG: UV rise time:", uvRiseTime);
  console.log("🔍 DEBUG: UV fall time:", uvFallTime);
  
  // Get current UV level
  const currentTime = new Date();
  const currentUv = getCurrentUvLevel(uvReadings, currentTime);
  console.log("🔍 DEBUG: Current UV level:", currentUv);
  
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
    uvRiseElement.textContent = uvRiseTime ? `Rise above 4: ${uvRiseTime}` : 'Rise above 4: --:--';
  }
  
  if (uvFallElement) {
    uvFallElement.textContent = uvFallTime ? `Fall below 4: ${uvFallTime}` : 'Fall below 4: --:--';
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
  if (!canvas) {
    console.error('❌ DEBUG: UV chart canvas not found');
    return;
  }
  
  // Clean up previous chart if it exists
  if (uvChart) {
    console.log('🔍 DEBUG: Destroying previous UV chart');
    uvChart.destroy();
  }
  
  // Generate smooth curve using cubic spline interpolation
  console.log('🔍 DEBUG: Generating smooth curve data for chart');
  const smoothData = generateSmoothCurveWithSpline(uvReadings);
  console.log('🔍 DEBUG: Smooth data points generated:', smoothData.times.length);
  
  // Create annotations for rise and fall times
  const annotations = {};
  
  if (uvRiseTime) {
    console.log('🔍 DEBUG: Adding rise time annotation at', uvRiseTime);
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
    console.log('🔍 DEBUG: Adding fall time annotation at', uvFallTime);
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
  
  // Check if annotation plugin is available
  const hasAnnotationPlugin = window.Chart && window.Chart.Annotation;
  console.log('🔍 DEBUG: Chart.js annotation plugin available?', !!hasAnnotationPlugin);
  
  // Create chart configuration
  const chartConfig = {
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
          suggestedMax: Math.max(...smoothData.values) * 1.1,
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
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  };
  
  // Add annotations if plugin is available
  if (hasAnnotationPlugin) {
    chartConfig.options.plugins.annotation = {
      annotations: annotations
    };
  } else {
    console.warn('⚠️ DEBUG: Annotation plugin not available, skipping annotations');
  }
  
  // Create chart
  console.log('🔍 DEBUG: Creating UV chart with', smoothData.times.length, 'data points');
  const ctx = canvas.getContext('2d');
  try {
    uvChart = new Chart(ctx, chartConfig);
    console.log('✅ DEBUG: UV chart created successfully');
  } catch (error) {
    console.error('❌ DEBUG: Error creating UV chart:', error);
  }
}

// Add a direct cubic spline implementation that doesn't depend on external libraries
// This is a complete, standalone natural cubic spline implementation
class CubicSpline {
  constructor(xs, ys) {
    if (xs.length !== ys.length || xs.length < 2) {
      throw new Error("Cubic spline needs at least 2 points and equal-length arrays");
    }
    
    // Sort points by x if needed
    const points = xs.map((x, i) => ({ x, y: ys[i] })).sort((a, b) => a.x - b.x);
    this.xs = points.map(p => p.x);
    this.ys = points.map(p => p.y);
    
    const n = this.xs.length;
    
    // Build the tridiagonal system
    // h[i] = x[i+1] - x[i]
    const h = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      h[i] = this.xs[i + 1] - this.xs[i];
      if (h[i] <= 0) {
        throw new Error("Cubic spline needs strictly increasing x values");
      }
    }
    
    // alpha[i] = 3/h[i] * (y[i+1] - y[i]) - 3/h[i-1] * (y[i] - y[i-1])
    const alpha = new Array(n - 1).fill(0);
    for (let i = 1; i < n - 1; i++) {
      alpha[i] = 3 / h[i] * (this.ys[i + 1] - this.ys[i]) - 
                 3 / h[i - 1] * (this.ys[i] - this.ys[i - 1]);
    }
    
    // Solve the tridiagonal system
    // Initialize arrays
    this.c = new Array(n).fill(0);  // Natural boundary conditions: c[0] = c[n-1] = 0
    const l = new Array(n).fill(0);
    const mu = new Array(n).fill(0);
    const z = new Array(n).fill(0);
    
    // Forward sweep
    l[0] = 1;
    for (let i = 1; i < n - 1; i++) {
      l[i] = 2 * (this.xs[i + 1] - this.xs[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }
    l[n - 1] = 1;
    
    // Back substitution
    for (let j = n - 2; j >= 0; j--) {
      this.c[j] = z[j] - mu[j] * this.c[j + 1];
    }
    
    // Calculate the remaining coefficients
    this.b = new Array(n - 1);
    this.d = new Array(n - 1);
    
    for (let i = 0; i < n - 1; i++) {
      this.b[i] = (this.ys[i + 1] - this.ys[i]) / h[i] - 
                 h[i] * (this.c[i + 1] + 2 * this.c[i]) / 3;
      this.d[i] = (this.c[i + 1] - this.c[i]) / (3 * h[i]);
    }
    
    console.log("✅ DEBUG: Natural cubic spline coefficients calculated");
  }
  
  // Evaluate spline at point x
  at(x) {
    // Handle out-of-range x values
    if (x <= this.xs[0]) return this.ys[0];
    if (x >= this.xs[this.xs.length - 1]) return this.ys[this.ys.length - 1];
    
    // Binary search to find the correct interval
    let i = 0;
    let j = this.xs.length - 1;
    
    while (j - i > 1) {
      const m = Math.floor((i + j) / 2);
      if (this.xs[m] > x) {
        j = m;
      } else {
        i = m;
      }
    }
    
    // Now xs[i] <= x < xs[i+1]
    const dx = x - this.xs[i];
    
    // Evaluate cubic polynomial
    return this.ys[i] + 
           this.b[i] * dx + 
           this.c[i] * dx * dx + 
           this.d[i] * dx * dx * dx;
  }
}

// Function to use for UV data processing
function generateSmoothCurveWithSpline(uvReadings) {
  console.log('🔍 DEBUG: generateSmoothCurveWithSpline called with', uvReadings.length, 'readings');
  
  if (!uvReadings || uvReadings.length < 2) {
    console.error('❌ DEBUG: Cannot generate smooth curve: insufficient data');
    
    // Fall back to original data as points
    return {
      times: uvReadings.map(reading => {
        const date = new Date(reading.utc);
        return date.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          timeZone: 'Asia/Dubai' // Display in local time
        });
      }),
      values: uvReadings.map(reading => reading.uv)
    };
  }
  
  try {
    // Prepare data for interpolation
    const x = uvReadings.map(r => new Date(r.utc).getTime()); // ms since epoch
    const y = uvReadings.map(r => r.uv);
    
    console.log('🔍 DEBUG: Prepared data for spline:', {
      timeRange: [new Date(x[0]).toISOString(), new Date(x[x.length-1]).toISOString()],
      uvRange: [Math.min(...y), Math.max(...y)],
      points: x.length
    });
    
    // Create spline using our direct implementation
    console.log('🔍 DEBUG: Creating CubicSpline instance using direct implementation');
    const spline = new CubicSpline(x, y);
    console.log('✅ DEBUG: CubicSpline instance created successfully');
    
    // Generate smoothed points (every 10 minutes)
    const start = x[0];
    const end = x[x.length - 1];
    const step = 10 * 60 * 1000; // 10 minutes in ms
    
    const smoothTimes = [];
    const smoothValues = [];
    
    for (let t = start; t <= end; t += step) {
      // Interpolate UV value at this time
      const uv = spline.at(t);
      
      // Format time for display
      const timeStr = new Date(t).toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Asia/Dubai' // Display in local time
      });
      
      smoothTimes.push(timeStr);
      smoothValues.push(uv);
    }
    
    console.log(`✅ DEBUG: Generated ${smoothTimes.length} smooth points using cubic spline`);
    console.log('🔍 DEBUG: Sample points:', smoothValues.slice(0, 3), '...', smoothValues.slice(-3));
    return { times: smoothTimes, values: smoothValues };
  } catch (error) {
    console.error('❌ DEBUG: Error generating smooth curve with spline:', error);
    console.log('🔍 DEBUG: Falling back to linear interpolation after error');
    
    // Fall back to linear interpolation if spline fails
    return generateSmoothCurve(uvReadings.map(reading => {
      const date = new Date(reading.utc);
      return {
        utc: date.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          timeZone: 'Asia/Dubai'
        }),
        uv: reading.uv
      };
    }));
  }
}

// Find the UV crossing time using cubic spline interpolation
function findUvCrossing(uvReadings, targetUV, direction = "rising") {
  if (!uvReadings || uvReadings.length < 2) {
    return null;
  }
  
  try {
    // Prepare data for interpolation
    const x = uvReadings.map(r => new Date(r.utc).getTime()); // ms since epoch
    const y = uvReadings.map(r => r.uv);
    
    console.log('🔍 DEBUG: Finding UV crossing for', direction, 'at threshold', targetUV);
    
    // Create spline
    const spline = new CubicSpline(x, y);
    
    // Using cubic spline to find the crossing
    for (let i = 0; i < uvReadings.length - 1; i++) {
      const t1 = new Date(uvReadings[i].utc).getTime();
      const t2 = new Date(uvReadings[i+1].utc).getTime();
      const uv1 = uvReadings[i].uv;
      const uv2 = uvReadings[i+1].uv;
      
      // Check if there's a potential crossing
      const isCrossingRange = (direction === "rising" && uv1 < targetUV && uv2 > targetUV) ||
                             (direction === "falling" && uv1 > targetUV && uv2 < targetUV);
      
      if (isCrossingRange) {
        console.log('🔍 DEBUG: Found potential crossing between', 
          new Date(t1).toLocaleTimeString(), 'and', 
          new Date(t2).toLocaleTimeString());
          
        // Search for precise crossing using binary search within this interval
        let tLow = t1;
        let tHigh = t2;
        let tMid, uvMid;
        
        // Binary search for crossing within 1-minute precision
        while (tHigh - tLow > 60000) { // 1 minute = 60000 ms
          tMid = Math.floor((tLow + tHigh) / 2);
          uvMid = spline.at(tMid);
          
          if ((direction === "rising" && uvMid < targetUV) ||
              (direction === "falling" && uvMid > targetUV)) {
            tLow = tMid;
          } else {
            tHigh = tMid;
          }
        }
        
        // Convert to formatted time
        const crossingTime = new Date((tLow + tHigh) / 2);
        const timeStr = crossingTime.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Dubai'
        });
        
        console.log('✅ DEBUG: Found', direction, 'crossing at', timeStr);
        return timeStr;
      }
    }
    
    console.log('🔍 DEBUG: No crossing found for', direction, 'at threshold', targetUV);
    return null; // No crossing found
  } catch (error) {
    console.error('❌ DEBUG: Error in findUvCrossing:', error);
    
    // Fall back to the original linear method
    return findCrossing(uvReadings.map(reading => {
      const date = new Date(reading.utc);
      return {
        utc: date.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          timeZone: 'Asia/Dubai'
        }),
        uv: reading.uv
      };
    }), targetUV, direction);
  }
}

// Get current UV level based on cubic spline interpolation
function getCurrentUvLevel(uvReadings, currentTime) {
  if (!uvReadings || uvReadings.length === 0) return null;
  
  try {
    // Prepare data for interpolation
    const x = uvReadings.map(r => new Date(r.utc).getTime()); // ms since epoch
    const y = uvReadings.map(r => r.uv);
    
    // Current time in ms
    const now = currentTime.getTime();
    
    // Check if current time is within our data range
    if (now < x[0] || now > x[x.length - 1]) {
      // Outside range - get closest value
      const value = now < x[0] ? y[0] : y[y.length - 1];
      console.log('🔍 DEBUG: Current time outside UV data range, using closest value:', value);
      return value;
    }
    
    // Create spline and get interpolated value
    const spline = new CubicSpline(x, y);
    const uvValue = spline.at(now);
    console.log('🔍 DEBUG: Current UV value from spline:', uvValue);
    return uvValue;
  } catch (error) {
    console.error('❌ DEBUG: Error in getCurrentUvLevel:', error);
    console.log('🔍 DEBUG: Falling back to linear interpolation');
    
    // Fall back to original method
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    
    // Find surrounding data points
    for (let i = 0; i < uvReadings.length - 1; i++) {
      const t1 = new Date(uvReadings[i].utc);
      const t2 = new Date(uvReadings[i+1].utc);
      
      const t1Minutes = t1.getHours() * 60 + t1.getMinutes();
      const t2Minutes = t2.getHours() * 60 + t2.getMinutes();
      
      if (currentMinutes >= t1Minutes && currentMinutes <= t2Minutes) {
        // Linear interpolation
        const fraction = (currentMinutes - t1Minutes) / (t2Minutes - t1Minutes);
        return uvReadings[i].uv + fraction * (uvReadings[i+1].uv - uvReadings[i].uv);
      }
    }
    
    // Outside the range, get closest value
    const firstTime = new Date(uvReadings[0].utc);
    const lastTime = new Date(uvReadings[uvReadings.length - 1].utc);
    
    const firstMinutes = firstTime.getHours() * 60 + firstTime.getMinutes();
    const lastMinutes = lastTime.getHours() * 60 + lastTime.getMinutes();
    
    if (currentMinutes < firstMinutes) return uvReadings[0].uv;
    if (currentMinutes > lastMinutes) return uvReadings[uvReadings.length - 1].uv;
  }
  
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
    console.log("🔍 DEBUG: UV Data raw response:", data);
    
    // Debug log: log the exact format of the UV data
    if (data && data.result && data.result.length > 0) {
      console.log("🔍 DEBUG: Sample UV data format:", {
        firstItem: data.result[0],
        lastItem: data.result[data.result.length - 1],
        total: data.result.length
      });
    }
    
    // Store the data for future reference
    lastUvData = data;
    
    // Update the display - this creates the UV box if it doesn't exist
    updateUvIndexDisplay(data);
    
    debugPrint(`UV data updated: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error('Error fetching UV index data:', error);
  }
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

// Generate additional points for a smoother curve with linear interpolation (fallback)
function generateSmoothCurve(uvReadings) {
  if (!uvReadings || uvReadings.length < 2) {
    return { 
      times: uvReadings ? uvReadings.map(r => r.utc) : [], 
      values: uvReadings ? uvReadings.map(r => r.uv) : [] 
    };
  }
  
  const times = uvReadings.map(r => r.utc);
  const values = uvReadings.map(r => r.uv);
  
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

// ... existing code ... 