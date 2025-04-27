/**
 * Main Application Module
 * Initializes and coordinates the data service and UI components
 */
const App = (function() {
    'use strict';
    
    // Private variables
    let config = {
        appTitle: 'Air Quality Dashboard',
        apiEndpoint: 'https://api.example.com/airquality',
        refreshInterval: 300000, // 5 minutes
        chartOptions: {
            timeRange: 21600000 // 6 hours
        }
    };
    
    let dataService;
    let uiComponents;
    let refreshTimer;
    
    /**
     * Initialize the application
     * @param {Object} userConfig - Optional user configuration to override defaults
     */
    function initialize(userConfig = {}) {
        // Merge user config with defaults
        config = { ...config, ...userConfig };
        
        // Initialize logger
        Logger.initialize({ 
            logLevel: 'info',
            enableConsoleOutput: true
        });
        Logger.log('Application initializing');
        
        // Initialize modules
        dataService = DataService.initialize(config);
        uiComponents = UIComponents.initialize(config);
        
        // Setup event listeners
        setupEventListeners();
        
        // Load initial data
        loadData();
        
        // Setup refresh timer
        setupRefreshTimer();
        
        return {
            refresh: loadData,
            updateConfig
        };
    }
    
    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        // Refresh button
        const refreshButton = document.getElementById('refresh-button');
        if (refreshButton) {
            refreshButton.addEventListener('click', function(e) {
                e.preventDefault();
                loadData(true); // Force refresh
            });
        }
        
        // Metric selector for chart
        const metricSelector = document.getElementById('metric-selector');
        if (metricSelector) {
            metricSelector.addEventListener('change', function() {
                updateChart(this.value);
            });
        }
        
        // Time range selector for chart
        const timeRangeSelector = document.getElementById('time-range-selector');
        if (timeRangeSelector) {
            timeRangeSelector.addEventListener('change', function() {
                config.chartOptions.timeRange = parseInt(this.value, 10);
                updateChart(document.getElementById('metric-selector').value);
            });
        }
        
        // Window resize event for responsive chart
        window.addEventListener('resize', function() {
            const metricSelector = document.getElementById('metric-selector');
            if (metricSelector) {
                updateChart(metricSelector.value);
            }
        });
    }
    
    /**
     * Setup refresh timer
     */
    function setupRefreshTimer() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
        
        if (config.refreshInterval > 0) {
            refreshTimer = setInterval(function() {
                loadData();
            }, config.refreshInterval);
            
            Logger.log(`Auto-refresh set for every ${config.refreshInterval / 1000} seconds`);
        }
    }
    
    /**
     * Load data from service and update UI
     * @param {boolean} forceRefresh - Whether to force refresh from API
     */
    function loadData(forceRefresh = false) {
        // Show loading state
        uiComponents.updateLoadingState(true);
        uiComponents.clearError();
        
        // Fetch data
        dataService.fetchData(forceRefresh)
            .then(data => {
                // Update dashboard
                uiComponents.createDashboard('dashboard-container', data);
                
                // Update chart with historical data
                const historicalData = dataService.getHistoricalData();
                const metricSelector = document.getElementById('metric-selector');
                const metric = metricSelector ? metricSelector.value : 'aqi';
                
                uiComponents.createHistoryChart('chart-container', historicalData, metric);
                
                // Reattach event listeners (since we've recreated the DOM)
                setupEventListeners();
                
                // Update last updated text
                updateLastUpdatedText(data.lastUpdated);
                
                Logger.log('Dashboard updated with new data');
            })
            .catch(error => {
                Logger.error('Error loading data:', error);
                uiComponents.displayError(`Failed to load air quality data: ${error.message}`);
            })
            .finally(() => {
                uiComponents.updateLoadingState(false);
            });
    }
    
    /**
     * Update chart with selected metric
     * @param {string} metric - Metric to display
     */
    function updateChart(metric) {
        const historicalData = dataService.getHistoricalData();
        uiComponents.createHistoryChart('chart-container', historicalData, metric);
    }
    
    /**
     * Update the last updated text
     * @param {string} timestamp - ISO timestamp
     */
    function updateLastUpdatedText(timestamp) {
        const lastUpdatedElement = document.getElementById('last-updated');
        if (lastUpdatedElement && timestamp) {
            const date = new Date(timestamp);
            lastUpdatedElement.textContent = `Last updated: ${formatDateTime(date)}`;
        }
    }
    
    /**
     * Format date and time
     * @param {Date} date - Date object
     * @returns {string} Formatted date and time
     */
    function formatDateTime(date) {
        return date.toLocaleDateString() + ' ' + 
               date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    /**
     * Update configuration
     * @param {Object} newConfig - New configuration object
     */
    function updateConfig(newConfig) {
        const oldRefreshInterval = config.refreshInterval;
        
        // Update config
        config = { ...config, ...newConfig };
        
        // If refresh interval changed, reset timer
        if (oldRefreshInterval !== config.refreshInterval) {
            setupRefreshTimer();
        }
        
        return config;
    }
    
    // Return public API
    return {
        initialize
    };
})(); 