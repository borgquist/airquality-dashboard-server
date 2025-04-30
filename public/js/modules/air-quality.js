import { debugPrint } from './utils.js';
import { config, lastAqiData, setLastAqiData } from './shared-state.js';

// Air quality module for handling AQI data

// Fetch the air quality data from the server
export async function fetchAirQualityData(forceRefresh = false) {
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
    
    // Store the data for comparison in the shared state
    setLastAqiData(data);
    
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
      
    // Use imported debugPrint
    debugPrint(`AQI data updated: ${JSON.stringify(data.current)}`);
  } catch (error) {
    console.error('Error fetching air quality data:', error);
    document.getElementById('lastUpdatedTime').textContent = 
      `Error: ${error.message}`;
  }
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
  // Access imported config
  if (!config?.aqiThresholds) {
      console.error('AQI thresholds not found in config!');
      return { name: 'Unknown', className: '' }; // Default/error category
  }

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