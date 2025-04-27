/**
 * Chart Controller
 * Handles chart initialization and updates
 */

// Global chart variables
let aqiChart = null;
let chartMode = 'hourly'; // hourly, daily, weekly
const chartHistory = {
  hourly: [],
  daily: [],
  weekly: []
};

/**
 * Toggle between different chart modes
 */
function toggleChart() {
  if (!config.displayOptions || !config.displayOptions.showChart) {
    return;
  }
  
  const modes = ['hourly', 'daily', 'weekly'];
  const currentIndex = modes.indexOf(chartMode);
  chartMode = modes[(currentIndex + 1) % modes.length];
  
  // Update button text
  const chartToggleButton = document.getElementById('chart-toggle');
  if (chartToggleButton) {
    chartToggleButton.textContent = `Show ${chartMode.charAt(0).toUpperCase() + chartMode.slice(1)} AQI`;
  }
  
  // Update chart
  updateChart(lastData);
}

/**
 * Initialize the AQI chart with first data
 * @param {Object} data - The air quality data
 */
function initializeChart(data) {
  if (!config.displayOptions || !config.displayOptions.showChart) {
    const chartSection = document.querySelector('.chart-section');
    if (chartSection) {
      chartSection.style.display = 'none';
    }
    return;
  }
  
  debugLog('Initializing chart');
  
  try {
    // Load historical data for the chart if available
    loadChartHistoryFromStorage();
    
    // Add current data point to history
    addDataPointToHistory(data);
    
    // Create chart
    const ctx = document.getElementById('aqi-chart').getContext('2d');
    
    const chartData = prepareChartData(data);
    
    // Determine chart color based on current AQI
    const currentAQI = data.status && data.current ? data.current.aqius || 0 : 0;
    const borderColor = getColorForAQI(currentAQI, 0.8);
    const backgroundColor = getColorForAQI(currentAQI, 0.2);
    
    aqiChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: [{
          label: 'AQI',
          data: chartData.values,
          borderColor: borderColor,
          backgroundColor: backgroundColor,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: borderColor,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                return `AQI: ${context.parsed.y}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)',
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: {
            beginAtZero: true,
            suggestedMax: Math.max(100, currentAQI * 1.2), // Start with a reasonable scale
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)'
            }
          }
        }
      }
    });
    
    // Add click handler to toggle chart
    document.getElementById('chart-toggle').addEventListener('click', toggleChart);
    
  } catch (err) {
    console.error('Error initializing chart:', err);
    debugLog('Chart initialization failed: ' + err.message);
    
    // Hide chart on error
    const chartSection = document.querySelector('.chart-section');
    if (chartSection) {
      chartSection.style.display = 'none';
    }
  }
}

/**
 * Prepare data for the chart based on the current mode
 * @param {Object} data - The air quality data
 * @returns {Object} Chart data with labels and values
 */
function prepareChartData() {
  let labels = [];
  let values = [];
  
  switch (chartMode) {
    case 'hourly':
      // Last 24 hours, every hour
      const hourlyData = chartHistory.hourly.slice(-24);
      hourlyData.forEach(point => {
        labels.push(new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        values.push(point.aqi);
      });
      break;
      
    case 'daily':
      // Last 7 days, daily average
      const dailyData = chartHistory.daily.slice(-7);
      dailyData.forEach(point => {
        labels.push(new Date(point.timestamp).toLocaleDateString([], { weekday: 'short' }));
        values.push(point.aqi);
      });
      break;
      
    case 'weekly':
      // Last 4 weeks, weekly average
      const weeklyData = chartHistory.weekly.slice(-4);
      weeklyData.forEach(point => {
        const date = new Date(point.timestamp);
        labels.push(`Week ${getWeekNumber(date)}`);
        values.push(point.aqi);
      });
      break;
  }
  
  // If we don't have enough data, add placeholders
  if (labels.length === 0) {
    labels.push('Now');
    values.push(lastData?.current?.aqius || 0);
  }
  
  return { labels, values };
}

/**
 * Get the week number for a date
 * @param {Date} date - The date
 * @returns {number} Week number
 */
function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Add a data point to the chart history
 * @param {Object} data - The air quality data
 */
function addDataPointToHistory(data) {
  if (!data || !data.current || !data.current.aqius) return;
  
  const timestamp = new Date().toISOString();
  const aqi = data.current.aqius;
  
  // Add to hourly data
  chartHistory.hourly.push({ timestamp, aqi });
  if (chartHistory.hourly.length > 168) { // Store up to a week of hourly data
    chartHistory.hourly.shift();
  }
  
  // Add to daily data if it's a new day or first entry
  const lastDailyEntry = chartHistory.daily[chartHistory.daily.length - 1];
  if (!lastDailyEntry || !isSameDay(new Date(lastDailyEntry.timestamp), new Date(timestamp))) {
    chartHistory.daily.push({ timestamp, aqi });
    if (chartHistory.daily.length > 30) { // Store up to 30 days
      chartHistory.daily.shift();
    }
  } else {
    // Update last daily entry with an average
    const dailyValues = chartHistory.hourly
      .filter(h => isSameDay(new Date(h.timestamp), new Date(timestamp)))
      .map(h => h.aqi);
    
    const dailyAvg = Math.round(dailyValues.reduce((sum, val) => sum + val, 0) / dailyValues.length);
    lastDailyEntry.aqi = dailyAvg;
  }
  
  // Add to weekly data if it's a new week or first entry
  const lastWeeklyEntry = chartHistory.weekly[chartHistory.weekly.length - 1];
  if (!lastWeeklyEntry || !isSameWeek(new Date(lastWeeklyEntry.timestamp), new Date(timestamp))) {
    chartHistory.weekly.push({ timestamp, aqi });
    if (chartHistory.weekly.length > 52) { // Store up to a year of weekly data
      chartHistory.weekly.shift();
    }
  } else {
    // Update last weekly entry with an average
    const weeklyValues = chartHistory.daily
      .filter(d => isSameWeek(new Date(d.timestamp), new Date(timestamp)))
      .map(d => d.aqi);
    
    const weeklyAvg = Math.round(weeklyValues.reduce((sum, val) => sum + val, 0) / weeklyValues.length);
    lastWeeklyEntry.aqi = weeklyAvg;
  }
  
  // Save to localStorage
  saveChartHistoryToStorage();
}

/**
 * Check if two dates are in the same day
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {boolean} True if same day
 */
function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();
}

/**
 * Check if two dates are in the same week
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {boolean} True if same week
 */
function isSameWeek(date1, date2) {
  const weekNum1 = getWeekNumber(date1);
  const weekNum2 = getWeekNumber(date2);
  return date1.getFullYear() === date2.getFullYear() && weekNum1 === weekNum2;
}

/**
 * Save chart history to localStorage
 */
function saveChartHistoryToStorage() {
  try {
    localStorage.setItem('airvisual_chart_history', JSON.stringify(chartHistory));
  } catch (err) {
    debugLog('Error saving chart history: ' + err.message);
  }
}

/**
 * Load chart history from localStorage
 */
function loadChartHistoryFromStorage() {
  try {
    const savedHistory = localStorage.getItem('airvisual_chart_history');
    if (savedHistory) {
      const parsedHistory = JSON.parse(savedHistory);
      // Only use valid data
      if (parsedHistory.hourly && Array.isArray(parsedHistory.hourly)) {
        chartHistory.hourly = parsedHistory.hourly;
      }
      if (parsedHistory.daily && Array.isArray(parsedHistory.daily)) {
        chartHistory.daily = parsedHistory.daily;
      }
      if (parsedHistory.weekly && Array.isArray(parsedHistory.weekly)) {
        chartHistory.weekly = parsedHistory.weekly;
      }
      debugLog('Loaded chart history from storage');
    }
  } catch (err) {
    debugLog('Error loading chart history: ' + err.message);
  }
}

/**
 * Update the chart with new data
 * @param {Object} data - The new air quality data
 */
function updateChart(data) {
  if (!config.displayOptions || !config.displayOptions.showChart || !aqiChart) return;
  
  try {
    // Add new data point
    addDataPointToHistory(data);
    
    // Prepare chart data
    const chartData = prepareChartData();
    
    // Update chart data
    aqiChart.data.labels = chartData.labels;
    aqiChart.data.datasets[0].data = chartData.values;
    
    // Update chart styling
    const currentAQI = data.status && data.current ? data.current.aqius || 0 : 0;
    aqiChart.data.datasets[0].borderColor = getColorForAQI(currentAQI, 0.8);
    aqiChart.data.datasets[0].backgroundColor = getColorForAQI(currentAQI, 0.2);
    aqiChart.data.datasets[0].pointBackgroundColor = getColorForAQI(currentAQI, 0.8);
    
    // Update scale
    aqiChart.options.scales.y.suggestedMax = Math.max(100, currentAQI * 1.2);
    
    // Update the chart
    aqiChart.update();
    
  } catch (err) {
    console.error('Error updating chart:', err);
    debugLog('Chart update failed: ' + err.message);
  }
}

/**
 * Get a color for a given AQI value
 * @param {number} aqi - AQI value
 * @param {number} alpha - Opacity (0-1)
 * @returns {string} Color string (rgba or hex)
 */
function getColorForAQI(aqi, alpha = 1) {
  // Use the config thresholds and colors if available
  if (config.aqiThresholds && config.colors) {
    let colorKey = 'hazardous';
    
    if (aqi <= config.aqiThresholds.good) {
      colorKey = 'good';
    } else if (aqi <= config.aqiThresholds.moderate) {
      colorKey = 'moderate';
    } else if (aqi <= config.aqiThresholds.unhealthySensitive) {
      colorKey = 'unhealthySensitive';
    } else if (aqi <= config.aqiThresholds.unhealthy) {
      colorKey = 'unhealthy';
    } else if (aqi <= config.aqiThresholds.veryUnhealthy) {
      colorKey = 'veryUnhealthy';
    }
    
    // Get the color from config
    const colorValue = config.colors[colorKey]?.bg || '#ff0000';
    
    // Convert hex to rgba if alpha is not 1
    if (alpha !== 1 && colorValue.startsWith('#')) {
      return hexToRgba(colorValue, alpha);
    }
    
    return colorValue;
  }
  
  // Default colors if config is not available
  if (aqi <= 50) return alpha !== 1 ? `rgba(0, 128, 0, ${alpha})` : 'green';
  if (aqi <= 100) return alpha !== 1 ? `rgba(140, 210, 17, ${alpha})` : '#8cd211';
  if (aqi <= 150) return alpha !== 1 ? `rgba(255, 255, 0, ${alpha})` : 'yellow';
  if (aqi <= 200) return alpha !== 1 ? `rgba(255, 165, 0, ${alpha})` : 'orange';
  if (aqi <= 300) return alpha !== 1 ? `rgba(255, 0, 0, ${alpha})` : 'red';
  return alpha !== 1 ? `rgba(139, 0, 0, ${alpha})` : 'darkred';
}

/**
 * Convert hex color to rgba
 * @param {string} hex - Hex color
 * @param {number} alpha - Opacity (0-1)
 * @returns {string} RGBA color string
 */
function hexToRgba(hex, alpha) {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(255, 0, 0, ${alpha})`;
  
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
} 