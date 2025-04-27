/**
 * Config Loader Module
 * Handles loading, validating, and accessing configuration settings
 */
const ConfigLoader = (function() {
    'use strict';
    
    // Default configuration
    const defaultConfig = {
        refreshInterval: 300000, // 5 minutes
        debugMode: false,
        apiEndpoint: '/api/airquality',
        defaultDeviceName: 'Air Quality Monitor',
        location: null,
        staleness: {
            warningThreshold: 3600000, // 1 hour
            criticalThreshold: 86400000 // 24 hours
        },
        cacheOptions: {
            enabled: true,
            expiry: 86400000, // 24 hours
            storageKey: 'air_quality_data'
        },
        displayOptions: {
            showWeather: true,
            showTime: true,
            showChart: true,
            metricUnits: true
        },
        chartOptions: {
            timeRange: 86400000, // 24 hours
            refreshInterval: 300000 // 5 minutes
        },
        // AQI categories for display
        aqiCategories: [
            { min: 0, max: 50, label: 'Good', class: 'aqi-good', color: '#00e400' },
            { min: 51, max: 100, label: 'Moderate', class: 'aqi-moderate', color: '#ffff00' },
            { min: 101, max: 150, label: 'Unhealthy for Sensitive Groups', class: 'aqi-unhealthy-sensitive', color: '#ff7e00' },
            { min: 151, max: 200, label: 'Unhealthy', class: 'aqi-unhealthy', color: '#ff0000' },
            { min: 201, max: 300, label: 'Very Unhealthy', class: 'aqi-very-unhealthy', color: '#99004c' },
            { min: 301, max: Infinity, label: 'Hazardous', class: 'aqi-hazardous', color: '#7e0023' }
        ]
    };
    
    // Current configuration (merged default + custom)
    let config = { ...defaultConfig };
    
    /**
     * Initialize the config loader
     * @param {Object} customConfig - Optional custom configuration to merge
     * @returns {Object} The merged configuration
     */
    function initialize(customConfig = {}) {
        Logger.log('Initializing configuration');
        
        try {
            // First load from localStorage if available
            loadFromStorage();
            
            // Then merge with any provided custom config (takes precedence)
            mergeConfig(customConfig);
            
            // Validate the resulting configuration
            validateConfig();
            
            // Save the configuration to localStorage
            saveToStorage();
            
            return config;
        } catch (error) {
            Logger.error('Error initializing configuration:', error);
            // Fall back to defaults on error
            config = { ...defaultConfig };
            return config;
        }
    }
    
    /**
     * Load configuration from localStorage
     */
    function loadFromStorage() {
        try {
            const storedConfig = localStorage.getItem('app_config');
            if (storedConfig) {
                const parsedConfig = JSON.parse(storedConfig);
                mergeConfig(parsedConfig);
                Logger.log('Loaded configuration from localStorage');
            }
        } catch (error) {
            Logger.error('Error loading configuration from localStorage:', error);
        }
    }
    
    /**
     * Save configuration to localStorage
     */
    function saveToStorage() {
        try {
            localStorage.setItem('app_config', JSON.stringify(config));
            Logger.log('Saved configuration to localStorage');
        } catch (error) {
            Logger.error('Error saving configuration to localStorage:', error);
        }
    }
    
    /**
     * Merge custom configuration with current configuration
     * @param {Object} customConfig - Custom configuration to merge
     */
    function mergeConfig(customConfig) {
        if (!customConfig || typeof customConfig !== 'object') return;
        
        // Deep merge configuration objects
        config = deepMerge(config, customConfig);
        Logger.log('Merged custom configuration');
    }
    
    /**
     * Deep merge two objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     */
    function deepMerge(target, source) {
        const output = { ...target };
        
        if (isObject(target) && isObject(source)) {
            Object.keys(source).forEach(key => {
                if (isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        
        return output;
    }
    
    /**
     * Check if value is an object
     * @param {*} item - Value to check
     * @returns {boolean} True if value is an object
     */
    function isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }
    
    /**
     * Validate the configuration
     * @throws {Error} If configuration is invalid
     */
    function validateConfig() {
        // Ensure required properties have valid values
        if (!config.refreshInterval || typeof config.refreshInterval !== 'number' || config.refreshInterval < 10000) {
            Logger.warn('Invalid refreshInterval, setting to default');
            config.refreshInterval = defaultConfig.refreshInterval;
        }
        
        if (!config.apiEndpoint || typeof config.apiEndpoint !== 'string') {
            Logger.warn('Invalid apiEndpoint, setting to default');
            config.apiEndpoint = defaultConfig.apiEndpoint;
        }
        
        // Ensure staleness thresholds make sense
        if (!config.staleness || 
            typeof config.staleness.warningThreshold !== 'number' ||
            typeof config.staleness.criticalThreshold !== 'number' ||
            config.staleness.warningThreshold >= config.staleness.criticalThreshold) {
            
            Logger.warn('Invalid staleness thresholds, setting to defaults');
            config.staleness = { ...defaultConfig.staleness };
        }
        
        // Ensure AQI categories are valid
        if (!Array.isArray(config.aqiCategories) || config.aqiCategories.length === 0) {
            Logger.warn('Invalid aqiCategories, setting to defaults');
            config.aqiCategories = [...defaultConfig.aqiCategories];
        }
        
        Logger.log('Configuration validated');
    }
    
    /**
     * Get the current configuration
     * @returns {Object} The current configuration
     */
    function getConfig() {
        return config;
    }
    
    /**
     * Update specific configuration options
     * @param {Object} updates - Configuration updates
     */
    function updateConfig(updates) {
        if (!updates || typeof updates !== 'object') return;
        
        mergeConfig(updates);
        validateConfig();
        saveToStorage();
        
        // Dispatch event to notify of config change
        window.dispatchEvent(new CustomEvent('config-updated', { detail: config }));
        
        return config;
    }
    
    /**
     * Reset configuration to defaults
     */
    function resetConfig() {
        config = { ...defaultConfig };
        saveToStorage();
        
        // Dispatch event to notify of config change
        window.dispatchEvent(new CustomEvent('config-updated', { detail: config }));
        
        return config;
    }
    
    /**
     * Get the AQI status for a given AQI value
     * @param {number} aqi - AQI value
     * @returns {Object} AQI status object with label, class, and color
     */
    function getAQIStatus(aqi) {
        // Find the matching category
        const category = config.aqiCategories.find(cat => 
            aqi >= cat.min && aqi <= cat.max
        ) || config.aqiCategories[config.aqiCategories.length - 1]; // Default to highest category
        
        return {
            label: category.label,
            class: category.class,
            color: category.color
        };
    }
    
    /**
     * Toggle debug mode
     * @returns {boolean} New debug mode state
     */
    function toggleDebugMode() {
        config.debugMode = !config.debugMode;
        saveToStorage();
        
        Logger.log(`Debug mode ${config.debugMode ? 'enabled' : 'disabled'}`);
        return config.debugMode;
    }
    
    // Return public API
    return {
        initialize,
        getConfig,
        updateConfig,
        resetConfig,
        getAQIStatus,
        toggleDebugMode
    };
})();

/**
 * Simple Logger Module
 * Used for debug logging throughout the application
 */
const Logger = (function() {
    'use strict';
    
    const MAX_LOG_ENTRIES = 100;
    let logEntries = [];
    
    /**
     * Log a message with optional data
     * @param {string} message - The message to log
     * @param {*} [data] - Optional data to log
     */
    function log(message, data) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            type: 'info',
            timestamp,
            message,
            data
        };
        
        addLogEntry(logEntry);
        console.log(`[INFO] ${message}`, data !== undefined ? data : '');
    }
    
    /**
     * Log an error message
     * @param {string} message - The error message
     * @param {*} [data] - Optional error data
     */
    function error(message, data) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            type: 'error',
            timestamp,
            message,
            data
        };
        
        addLogEntry(logEntry);
        console.error(`[ERROR] ${message}`, data !== undefined ? data : '');
    }
    
    /**
     * Log a warning message
     * @param {string} message - The warning message
     * @param {*} [data] - Optional warning data
     */
    function warn(message, data) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            type: 'warn',
            timestamp,
            message,
            data
        };
        
        addLogEntry(logEntry);
        console.warn(`[WARN] ${message}`, data !== undefined ? data : '');
    }
    
    /**
     * Add a log entry to the internal array and update the UI
     * @param {Object} logEntry - The log entry to add
     */
    function addLogEntry(logEntry) {
        logEntries.push(logEntry);
        
        // Trim log if it exceeds max entries
        if (logEntries.length > MAX_LOG_ENTRIES) {
            logEntries = logEntries.slice(-MAX_LOG_ENTRIES);
        }
        
        // Update debug log in the UI if it exists
        const debugLog = document.getElementById('debug-log-content');
        if (debugLog) {
            const entryElement = document.createElement('div');
            entryElement.className = `log-entry log-${logEntry.type}`;
            
            const time = new Date(logEntry.timestamp).toLocaleTimeString();
            let logText = `[${time}] [${logEntry.type.toUpperCase()}] ${logEntry.message}`;
            
            if (logEntry.data !== undefined) {
                if (typeof logEntry.data === 'object') {
                    try {
                        logText += ` ${JSON.stringify(logEntry.data)}`;
                    } catch (e) {
                        logText += ' [Object]';
                    }
                } else {
                    logText += ` ${logEntry.data}`;
                }
            }
            
            entryElement.textContent = logText;
            debugLog.appendChild(entryElement);
            debugLog.scrollTop = debugLog.scrollHeight;
        }
    }
    
    /**
     * Clear all log entries
     */
    function clearLog() {
        logEntries = [];
        const debugLog = document.getElementById('debug-log-content');
        if (debugLog) {
            debugLog.innerHTML = '';
        }
    }
    
    /**
     * Get all log entries
     * @returns {Array} Array of log entries
     */
    function getLogEntries() {
        return [...logEntries];
    }
    
    // Public API
    return {
        log,
        error,
        warn,
        clearLog,
        getLogEntries
    };
})(); 