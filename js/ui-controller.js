/**
 * UI Controller Module
 * Handles DOM manipulation, display updates and user interactions
 */
const UIController = (function() {
    'use strict';
    
    // Cached DOM references for better performance
    const elements = {
        aqi: null,
        status: null,
        temperature: null,
        humidity: null,
        pressure: null,
        pm25: null,
        pm10: null,
        location: null,
        deviceName: null,
        lastUpdated: null,
        timeDisplay: null,
        staleWarning: null,
        refreshButton: null,
        loader: null,
        chart: null,
        chartContainer: null,
        debugPanel: null,
        debugToggle: null,
        themeToggle: null
    };
    
    // Chart instances
    let mainChart = null;
    let miniChart = null;
    
    /**
     * Initialize the UI controller
     */
    function initialize() {
        Logger.log('Initializing UI controller');
        
        // Cache all DOM elements for performance
        cacheElements();
        
        // Set up event listeners
        setupEventListeners();
        
        // Initialize the chart (but without data yet)
        initializeCharts();
        
        // Setup theme based on preferences
        setupTheme();
        
        // Setup clock
        startClock();
        
        // Display loading indicator
        showLoading(true);
        
        return true;
    }
    
    /**
     * Cache DOM element references
     */
    function cacheElements() {
        elements.aqi = document.getElementById('aqi-value');
        elements.status = document.getElementById('aqi-status');
        elements.temperature = document.getElementById('temperature');
        elements.humidity = document.getElementById('humidity');
        elements.pressure = document.getElementById('pressure');
        elements.pm25 = document.getElementById('pm25');
        elements.pm10 = document.getElementById('pm10');
        elements.location = document.getElementById('location');
        elements.deviceName = document.getElementById('device-name');
        elements.lastUpdated = document.getElementById('updated');
        elements.timeDisplay = document.getElementById('time-display');
        elements.staleWarning = document.getElementById('stale-data-warning');
        elements.refreshButton = document.getElementById('refresh-button');
        elements.loader = document.getElementById('loader');
        elements.chartContainer = document.getElementById('chart-container');
        elements.chart = document.getElementById('aqi-chart');
        elements.debugPanel = document.getElementById('debug-panel');
        elements.debugToggle = document.getElementById('debug-toggle');
        elements.themeToggle = document.getElementById('theme-toggle');
    }
    
    /**
     * Set up event listeners for user interactions
     */
    function setupEventListeners() {
        Logger.log('Setting up UI event listeners');
        
        // Set up refresh button
        if (elements.refreshButton) {
            elements.refreshButton.addEventListener('click', function() {
                Logger.log('Manual refresh requested');
                showLoading(true);
                DataService.refreshData()
                    .catch(error => {
                        Logger.error('Manual refresh failed:', error);
                        showErrorMessage('Refresh failed', error.message);
                    });
            });
        }
        
        // Set up debug toggle
        if (elements.debugToggle) {
            elements.debugToggle.addEventListener('click', function() {
                ConfigLoader.toggleDebugMode();
                updateDebugDisplay();
            });
        }
        
        // Set up theme toggle
        if (elements.themeToggle) {
            elements.themeToggle.addEventListener('click', function() {
                toggleTheme();
            });
        }
        
        // Listen for data service events
        DataService.addEventListener('data-updated', function(data) {
            updateDisplay(data);
            showLoading(false);
        });
        
        DataService.addEventListener('data-error', function(error) {
            Logger.error('Data error received by UI:', error);
            showErrorMessage('Data Error', error.message);
            showLoading(false);
        });
        
        DataService.addEventListener('data-stale', function(staleInfo) {
            updateStaleWarning(staleInfo);
        });
        
        // Listen for window resize to adjust chart
        window.addEventListener('resize', function() {
            if (mainChart) {
                mainChart.resize();
            }
            if (miniChart) {
                miniChart.resize();
            }
        });
    }
    
    /**
     * Initialize charts
     */
    function initializeCharts() {
        if (!elements.chart) return;
        
        Logger.log('Initializing charts');
        
        // We'll set up empty charts first, data will be added later
        const config = ConfigLoader.getConfig();
        
        // Configure the main chart
        mainChart = echarts.init(elements.chart);
        
        // Set initial options
        const mainChartOptions = {
            title: {
                text: 'Air Quality Index (24h)',
                left: 'center',
                textStyle: {
                    fontFamily: 'Roboto, sans-serif',
                    fontSize: 16
                }
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross',
                    label: {
                        backgroundColor: '#6a7985'
                    }
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'time',
                boundaryGap: false,
                axisLabel: {
                    formatter: function(value) {
                        const date = new Date(value);
                        return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
                    }
                }
            },
            yAxis: {
                type: 'value',
                name: 'AQI',
                min: 0,
                axisLabel: {
                    formatter: '{value}'
                }
            },
            series: [{
                name: 'AQI',
                type: 'line',
                smooth: true,
                symbol: 'none',
                lineStyle: {
                    width: 2
                },
                markLine: {
                    silent: true,
                    data: getAQIThresholdLines(config)
                },
                areaStyle: {
                    opacity: 0.3,
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(0, 221, 0, 0.8)' },
                        { offset: 1, color: 'rgba(255, 0, 0, 0.8)' }
                    ])
                },
                data: []
            }]
        };
        
        mainChart.setOption(mainChartOptions);
        
        // Create mini chart if container exists
        const miniChartContainer = document.getElementById('mini-chart');
        if (miniChartContainer) {
            miniChart = echarts.init(miniChartContainer);
            
            const miniChartOptions = {
                grid: {
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0
                },
                xAxis: {
                    type: 'time',
                    show: false
                },
                yAxis: {
                    type: 'value',
                    show: false,
                    min: 0
                },
                series: [{
                    type: 'line',
                    showSymbol: false,
                    lineStyle: {
                        width: 1
                    },
                    areaStyle: {
                        opacity: 0.3,
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(0, 221, 0, 0.8)' },
                            { offset: 0.5, color: 'rgba(255, 255, 0, 0.8)' },
                            { offset: 1, color: 'rgba(255, 0, 0, 0.8)' }
                        ])
                    },
                    data: []
                }]
            };
            
            miniChart.setOption(miniChartOptions);
        }
    }
    
    /**
     * Generate mark lines for AQI thresholds
     * @param {Object} config - Configuration object
     * @returns {Array} Array of markLine configurations
     */
    function getAQIThresholdLines(config) {
        const markLines = [];
        
        // Use AQI categories from config to create threshold lines
        config.aqiCategories.forEach(category => {
            if (category.max < Infinity) {
                markLines.push({
                    yAxis: category.max,
                    lineStyle: {
                        color: category.color || '#999',
                        type: 'dashed'
                    },
                    label: {
                        formatter: category.label,
                        position: 'insideEndTop'
                    }
                });
            }
        });
        
        return markLines;
    }
    
    /**
     * Update the charts with new data
     * @param {Array} historicalData - Array of historical data points
     */
    function updateCharts(historicalData) {
        if (!mainChart || !historicalData || historicalData.length === 0) return;
        
        Logger.log('Updating charts with', historicalData.length, 'data points');
        
        // Format data for the chart
        const chartData = historicalData.map(item => ({
            value: [new Date(item.timestamp), item.aqi]
        }));
        
        // Update main chart
        mainChart.setOption({
            series: [{
                data: chartData
            }]
        });
        
        // Update mini chart if it exists
        if (miniChart) {
            miniChart.setOption({
                series: [{
                    data: chartData
                }]
            });
        }
    }
    
    /**
     * Update the UI with new data
     * @param {Object} data - Air quality data object
     */
    function updateDisplay(data) {
        if (!data) return;
        
        Logger.log('Updating display with new data');
        
        // Get configuration
        const config = ConfigLoader.getConfig();
        
        // Update AQI value and status
        if (elements.aqi) {
            elements.aqi.textContent = Math.round(data.aqi);
            
            // Remove all existing status classes
            elements.aqi.className = '';
            
            // Add appropriate class based on AQI status
            if (data.status && data.status.class) {
                elements.aqi.classList.add(data.status.class);
            }
        }
        
        // Update AQI status text
        if (elements.status && data.status) {
            elements.status.textContent = data.status.label;
            elements.status.className = '';
            if (data.status.class) {
                elements.status.classList.add(data.status.class);
            }
        }
        
        // Update other measurements
        updateMeasurement(elements.temperature, data.temperature, '°C');
        updateMeasurement(elements.humidity, data.humidity, '%');
        updateMeasurement(elements.pressure, data.pressure, 'hPa');
        updateMeasurement(elements.pm25, data.pm25, 'μg/m³');
        updateMeasurement(elements.pm10, data.pm10, 'μg/m³');
        
        // Update location and device info
        if (elements.location) {
            elements.location.textContent = data.location || 'Unknown Location';
        }
        
        if (elements.deviceName) {
            elements.deviceName.textContent = data.deviceName || config.defaultDeviceName;
        }
        
        // Update last updated time
        updateLastUpdatedTime(data.timestamp);
        
        // Update the chart with historical data
        updateCharts(DataService.getHistoricalData());
        
        // Check and display any stale data warnings
        checkDataStaleness();
    }
    
    /**
     * Update a measurement display element
     * @param {HTMLElement} element - Element to update
     * @param {number|null} value - Measurement value
     * @param {string} unit - Measurement unit
     */
    function updateMeasurement(element, value, unit) {
        if (!element) return;
        
        if (value !== null && value !== undefined) {
            // Check if it's a number and round it if necessary
            const displayValue = typeof value === 'number' 
                ? Math.round(value * 10) / 10 
                : value;
            
            element.textContent = `${displayValue} ${unit}`;
            element.parentElement.style.display = 'block';
        } else {
            // Hide the element's container if data is not available
            element.parentElement.style.display = 'none';
        }
    }
    
    /**
     * Update the "last updated" time display
     * @param {string} timestamp - ISO timestamp
     */
    function updateLastUpdatedTime(timestamp) {
        if (!elements.lastUpdated || !timestamp) return;
        
        try {
            const lastUpdateTime = new Date(timestamp);
            const now = new Date();
            const diffMs = now - lastUpdateTime;
            const diffMins = Math.floor(diffMs / 60000);
            
            let timeAgoText;
            if (diffMins < 1) {
                timeAgoText = 'just now';
            } else if (diffMins === 1) {
                timeAgoText = '1 minute ago';
            } else if (diffMins < 60) {
                timeAgoText = `${diffMins} minutes ago`;
            } else {
                const hours = Math.floor(diffMins / 60);
                const remainingMins = diffMins % 60;
                if (hours === 1 && remainingMins === 0) {
                    timeAgoText = '1 hour ago';
                } else if (hours === 1) {
                    timeAgoText = `1 hour ${remainingMins} minutes ago`;
                } else if (remainingMins === 0) {
                    timeAgoText = `${hours} hours ago`;
                } else {
                    timeAgoText = `${hours} hours ${remainingMins} minutes ago`;
                }
            }
            
            elements.lastUpdated.textContent = `Data from ${timeAgoText}`;
            
        } catch (error) {
            Logger.error('Error updating last updated time:', error);
        }
    }
    
    /**
     * Check and display appropriate warnings for stale data
     */
    function checkDataStaleness() {
        const isStale = DataService.isDataStale();
        const isCriticallyStale = DataService.isDataCriticallyStale();
        
        // Get last update time for display
        const lastUpdate = DataService.getLastUpdateTime();
        
        if (!elements.staleWarning || !elements.lastUpdated) return;
        
        // Reset styles
        elements.lastUpdated.classList.remove('stale');
        elements.staleWarning.style.display = 'none';
        elements.staleWarning.classList.remove('critical');
        
        if (isCriticallyStale) {
            // Critically stale data
            elements.lastUpdated.classList.add('stale');
            elements.staleWarning.style.display = 'block';
            elements.staleWarning.classList.add('critical');
            elements.staleWarning.innerHTML = '⚠️ CRITICAL WARNING ⚠️<br>Data is very old!<br>Air quality may have changed significantly!';
        } else if (isStale) {
            // Stale but not critical
            elements.lastUpdated.classList.add('stale');
            elements.staleWarning.style.display = 'block';
            elements.staleWarning.innerHTML = 'WARNING: Data is stale!';
        }
    }
    
    /**
     * Update the stale warning display based on event data
     * @param {Object} staleInfo - Information about stale data
     */
    function updateStaleWarning(staleInfo) {
        checkDataStaleness();
    }
    
    /**
     * Start the time display clock
     */
    function startClock() {
        if (!elements.timeDisplay) return;
        
        const updateClock = () => {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            
            elements.timeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
        };
        
        // Update immediately
        updateClock();
        
        // Then update every second
        setInterval(updateClock, 1000);
    }
    
    /**
     * Show or hide loading indicator
     * @param {boolean} show - Whether to show the loader
     */
    function showLoading(show) {
        if (!elements.loader) return;
        
        if (show) {
            elements.loader.classList.add('active');
        } else {
            elements.loader.classList.remove('active');
        }
    }
    
    /**
     * Show an error message to the user
     * @param {string} title - Error title
     * @param {string} message - Error message
     */
    function showErrorMessage(title, message) {
        Logger.error(title, message);
        
        // Try to use a toast/notification system if exists
        if (window.showToast) {
            window.showToast({
                type: 'error',
                title: title,
                message: message
            });
            return;
        }
        
        // Fallback to alert if no toast system
        alert(`${title}: ${message}`);
    }
    
    /**
     * Show an error overlay (for critical errors)
     * @param {string} message - Error message to display
     */
    function showErrorOverlay(message) {
        // Create an error overlay if it doesn't exist
        let errorOverlay = document.getElementById('error-overlay');
        
        if (!errorOverlay) {
            errorOverlay = document.createElement('div');
            errorOverlay.id = 'error-overlay';
            errorOverlay.className = 'error-overlay';
            
            const content = document.createElement('div');
            content.className = 'error-content';
            
            const title = document.createElement('h2');
            title.textContent = 'Error';
            
            const messageElement = document.createElement('p');
            messageElement.id = 'error-message';
            
            const dismissButton = document.createElement('button');
            dismissButton.textContent = 'Dismiss';
            dismissButton.addEventListener('click', function() {
                errorOverlay.style.display = 'none';
            });
            
            content.appendChild(title);
            content.appendChild(messageElement);
            content.appendChild(dismissButton);
            errorOverlay.appendChild(content);
            
            document.body.appendChild(errorOverlay);
        }
        
        // Update the message and show the overlay
        const messageElement = document.getElementById('error-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
        
        errorOverlay.style.display = 'flex';
    }
    
    /**
     * Set up theme based on preferences
     */
    function setupTheme() {
        // Check if there's a saved theme preference
        const savedTheme = localStorage.getItem('theme');
        
        if (savedTheme) {
            // Apply saved theme
            document.documentElement.setAttribute('data-theme', savedTheme);
        } else {
            // Check for system preference
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
            }
        }
        
        // Update theme toggle button if exists
        updateThemeToggle();
    }
    
    /**
     * Toggle between light and dark themes
     */
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        // Apply new theme
        document.documentElement.setAttribute('data-theme', newTheme);
        
        // Save preference
        localStorage.setItem('theme', newTheme);
        
        // Update theme toggle button
        updateThemeToggle();
        
        // If charts exist, we need to update their theme too
        if (mainChart) {
            mainChart.dispose();
            mainChart = null;
            initializeCharts();
            updateCharts(DataService.getHistoricalData());
        }
    }
    
    /**
     * Update the theme toggle button based on current theme
     */
    function updateThemeToggle() {
        if (!elements.themeToggle) return;
        
        const currentTheme = document.documentElement.getAttribute('data-theme');
        
        if (currentTheme === 'dark') {
            elements.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            elements.themeToggle.title = 'Switch to light theme';
        } else {
            elements.themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            elements.themeToggle.title = 'Switch to dark theme';
        }
    }
    
    /**
     * Update debug panel display
     */
    function updateDebugDisplay() {
        if (!elements.debugPanel) return;
        
        const config = ConfigLoader.getConfig();
        
        if (config.debugMode) {
            elements.debugPanel.style.display = 'block';
            
            // Update debug info
            const logContainer = document.getElementById('debug-log');
            if (logContainer) {
                // Get logs and format as HTML
                const logs = Logger.getLogs();
                logContainer.innerHTML = logs.map(log => {
                    const timestamp = new Date(log.timestamp).toLocaleTimeString();
                    let className = '';
                    
                    if (log.type === 'error') className = 'error';
                    if (log.type === 'warn') className = 'warning';
                    
                    return `<div class="log-entry ${className}">
                        <span class="log-time">${timestamp}</span>
                        <span class="log-message">${log.message}</span>
                    </div>`;
                }).join('');
                
                // Scroll to bottom
                logContainer.scrollTop = logContainer.scrollHeight;
            }
            
            // Also show configuration
            const configContainer = document.getElementById('debug-config');
            if (configContainer) {
                configContainer.textContent = JSON.stringify(config, null, 2);
            }
        } else {
            elements.debugPanel.style.display = 'none';
        }
    }
    
    // Return public API
    return {
        initialize,
        updateDisplay,
        showLoading,
        showErrorMessage,
        showErrorOverlay,
        updateDebugDisplay,
        toggleTheme
    };
})(); 