/**
 * Data Service Module
 * Handles API communication, data processing, and caching for air quality data
 */
const DataService = (function() {
    'use strict';
    
    // Private variables
    let config = {};
    let lastFetchTime = null;
    let dataCache = {
        current: null,
        historical: [],
        lastUpdated: null
    };
    
    /**
     * Initialize the data service
     * @param {Object} appConfig - Application configuration
     */
    function initialize(appConfig) {
        config = appConfig;
        Logger.log('Data service initialized');
        
        // Load cached data if available
        loadCachedData();
        
        return {
            fetchData,
            getLastData,
            getHistoricalData,
            getLastUpdateTime,
            clearCache,
            isDataStale
        };
    }
    
    /**
     * Fetch air quality data from the API
     * @param {boolean} forceRefresh - Force refresh even if cache is valid
     * @returns {Promise} Promise that resolves with the fetched data
     */
    function fetchData(forceRefresh = false) {
        // Check if we can use cached data
        if (!forceRefresh && dataCache.current && dataCache.lastUpdated) {
            const now = Date.now();
            const cacheAge = now - dataCache.lastUpdated;
            
            if (config.cacheOptions && config.cacheOptions.enabled && cacheAge < config.refreshInterval) {
                Logger.log(`Using cached data (${Math.round(cacheAge / 1000)}s old)`);
                return Promise.resolve(dataCache.current);
            }
        }
        
        // Track fetch time
        lastFetchTime = Date.now();
        
        // Prepare URL with parameters
        let url = config.apiUrl || config.apiEndpoint;
        if (!url) {
            Logger.error('No API URL defined in configuration');
            return Promise.reject(new Error('No API URL defined in configuration'));
        }
        
        if (config.location) {
            url += `?location=${encodeURIComponent(config.location)}`;
        }
        
        Logger.log(`Fetching data from ${url}`);
        
        return fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API error: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                // Add diagnostic logging
                console.log('Raw data from API:', data);
                Logger.log('Raw data received from API', data);
                
                return processData(data);
            })
            .catch(error => {
                Logger.error('Error fetching data:', error);
                // If we have cached data, return it with a warning flag
                if (dataCache.current) {
                    dataCache.current.warning = {
                        message: 'Using cached data - Unable to fetch fresh data',
                        error: error.message
                    };
                    return dataCache.current;
                }
                throw error;
            });
    }
    
    /**
     * Process the raw API data
     * @param {Object} data - Raw data from API
     * @returns {Object} Processed data
     */
    function processData(data) {
        // Handle different API response formats
        let processedData;
        
        try {
            if (Array.isArray(data)) {
                // If array, take the latest reading
                processedData = processArrayData(data);
            } else if (data && data._meta) {
                // Special case for localhost:8000/data format
                processedData = processLocalData(data);
            } else if (data && data.readings) {
                // If it has a readings property, process that
                processedData = processReadingsData(data);
            } else {
                // Assume it's a single reading
                processedData = processSingleReading(data);
            }
            
            // Add metadata
            processedData.meta = {
                fetchTime: Date.now(),
                processedAt: new Date().toISOString(),
                apiEndpoint: config.apiEndpoint || config.apiUrl
            };
            
            // Cache the data
            updateCache(processedData);
            
            return processedData;
        } catch (error) {
            Logger.error('Error processing data:', error);
            throw new Error(`Failed to process data: ${error.message}`);
        }
    }
    
    /**
     * Process data in localhost:8000/data format (with _meta field)
     * @param {Object} data - Data with _meta property
     * @returns {Object} Processed data
     */
    function processLocalData(data) {
        try {
            Logger.log('Processing localhost:8000/data format', data);
            
            // Extract current measurements
            const processed = {
                timestamp: new Date().toISOString(),
                device: 'Local AirQuality Sensor',
                location: config.location || 'Local Environment',
                measurements: {}
            };
            
            // Extract PM2.5 and other measurements from current data
            if (data.current && data.current.pm25) {
                processed.measurements.pm25 = Number(data.current.pm25.aqicn);
            }
            
            if (data.current && data.current.pm10) {
                processed.measurements.pm10 = Number(data.current.pm10.aqicn);
            }
            
            if (data.current && data.current.humidity) {
                processed.measurements.humidity = Number(data.current.humidity);
            }
            
            if (data.current && data.current.temperature) {
                processed.measurements.temperature = Number(data.current.temperature);
            }
            
            // Calculate AQI based on PM2.5 if available
            if (processed.measurements.pm25 !== undefined) {
                processed.aqi = processed.measurements.pm25; // Assume PM2.5 as AQI for this format
                processed.aqiStatus = getAQIStatus(processed.aqi);
            }
            
            // Also collect historical data if available
            if (data.historical && Array.isArray(data.historical.daily)) {
                updateHistoricalData(data.historical.daily.map(item => ({
                    timestamp: item.ts,
                    aqi: item.pm25 ? Number(item.pm25.aqicn) : 0
                })));
            }
            
            return processed;
        } catch (error) {
            Logger.error('Error processing local data format:', error);
            throw error;
        }
    }
    
    /**
     * Process an array of readings
     * @param {Array} data - Array of readings
     * @returns {Object} Processed data
     */
    function processArrayData(data) {
        if (!data.length) {
            throw new Error('Empty data array received');
        }
        
        // Sort by timestamp (descending)
        const sortedData = [...data].sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // Add to historical data
        updateHistoricalData(sortedData);
        
        // Return the most recent reading
        return processSingleReading(sortedData[0]);
    }
    
    /**
     * Process data with readings property
     * @param {Object} data - Data with readings property
     * @returns {Object} Processed data
     */
    function processReadingsData(data) {
        if (!data.readings || !data.readings.length) {
            throw new Error('No readings found in data');
        }
        
        // Sort readings by timestamp (descending)
        const sortedReadings = [...data.readings].sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // Add to historical data
        updateHistoricalData(sortedReadings);
        
        // Combine the latest reading with any metadata
        const { readings, ...metadata } = data;
        return {
            ...processSingleReading(sortedReadings[0]),
            device: metadata.device || config.defaultDeviceName,
            location: metadata.location || 'Unknown'
        };
    }
    
    /**
     * Process a single reading
     * @param {Object} reading - Single reading data
     * @returns {Object} Processed reading
     */
    function processSingleReading(reading) {
        // Create a standardized format
        const processed = {
            timestamp: new Date(reading.timestamp || Date.now()).toISOString(),
            device: reading.device || config.defaultDeviceName,
            location: reading.location || 'Unknown',
            measurements: {}
        };
        
        // Process measurements
        if (reading.pm25 !== undefined) {
            processed.measurements.pm25 = Number(reading.pm25);
        }
        
        if (reading.pm10 !== undefined) {
            processed.measurements.pm10 = Number(reading.pm10);
        }
        
        // Calculate AQI if PM2.5 is available
        if (processed.measurements.pm25 !== undefined) {
            processed.aqi = calculateAQI(processed.measurements.pm25);
            processed.aqiStatus = config.aqiCategories.find(category => 
                processed.aqi <= category.max && processed.aqi >= (category.min || 0)
            ) || config.aqiCategories[config.aqiCategories.length - 1];
        }
        
        // Add other measurements if available
        const possibleMeasurements = [
            'temperature', 'humidity', 'pressure', 'co2', 'voc', 'o3'
        ];
        
        possibleMeasurements.forEach(key => {
            if (reading[key] !== undefined) {
                processed.measurements[key] = Number(reading[key]);
            }
        });
        
        return processed;
    }
    
    /**
     * Calculate AQI value from PM2.5 reading
     * Using US EPA calculation method
     * @param {number} pm25 - PM2.5 value in μg/m³
     * @returns {number} AQI value
     */
    function calculateAQI(pm25) {
        // EPA breakpoints for PM2.5
        const breakpoints = [
            { min: 0, max: 12.0, minAQI: 0, maxAQI: 50 },
            { min: 12.1, max: 35.4, minAQI: 51, maxAQI: 100 },
            { min: 35.5, max: 55.4, minAQI: 101, maxAQI: 150 },
            { min: 55.5, max: 150.4, minAQI: 151, maxAQI: 200 },
            { min: 150.5, max: 250.4, minAQI: 201, maxAQI: 300 },
            { min: 250.5, max: 350.4, minAQI: 301, maxAQI: 400 },
            { min: 350.5, max: 500.4, minAQI: 401, maxAQI: 500 }
        ];
        
        // Handle values beyond scale
        if (pm25 >= 500.5) {
            return 500;
        }
        
        if (pm25 < 0) {
            return 0;
        }
        
        // Find the appropriate breakpoint
        const breakpoint = breakpoints.find(bp => pm25 >= bp.min && pm25 <= bp.max);
        
        if (!breakpoint) {
            return 0;
        }
        
        // Calculate AQI
        const { min, max, minAQI, maxAQI } = breakpoint;
        return Math.round(
            ((maxAQI - minAQI) / (max - min)) * (pm25 - min) + minAQI
        );
    }
    
    /**
     * Update the data cache
     * @param {Object} data - Processed data to cache
     */
    function updateCache(data) {
        dataCache.current = data;
        dataCache.lastUpdated = Date.now();
        
        // Save to localStorage if enabled
        if (config.cacheOptions && config.cacheOptions.enabled) {
            try {
                localStorage.setItem(
                    config.cacheOptions.storageKey,
                    JSON.stringify(dataCache)
                );
                Logger.log('Data saved to cache');
            } catch (error) {
                Logger.error('Error saving data to cache:', error);
            }
        }
    }
    
    /**
     * Load cached data from localStorage
     */
    function loadCachedData() {
        if (!config.cacheOptions || !config.cacheOptions.enabled) {
            return;
        }
        
        try {
            const cachedData = localStorage.getItem(config.cacheOptions.storageKey);
            if (cachedData) {
                const parsed = JSON.parse(cachedData);
                
                // Check if cache has expired
                const now = Date.now();
                const cacheAge = now - parsed.lastUpdated;
                
                if (cacheAge < config.cacheOptions.expiry) {
                    dataCache = parsed;
                    Logger.log(`Loaded data from cache (${Math.round(cacheAge / 1000)}s old)`);
                } else {
                    Logger.log('Cached data expired, will fetch fresh data');
                    clearCache();
                }
            }
        } catch (error) {
            Logger.error('Error loading cached data:', error);
            clearCache();
        }
    }
    
    /**
     * Update historical data array
     * @param {Array} newData - New data to add to historical record
     */
    function updateHistoricalData(newData) {
        if (!Array.isArray(newData) || !newData.length) {
            return;
        }
        
        // Add new data to historical array
        dataCache.historical = dataCache.historical.concat(newData);
        
        // Sort by timestamp (descending)
        dataCache.historical.sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // Remove duplicates (based on timestamp)
        const seen = new Set();
        dataCache.historical = dataCache.historical.filter(item => {
            const timestamp = item.timestamp;
            return seen.has(timestamp) ? false : seen.add(timestamp);
        });
        
        // Limit array size to cover chart time range plus buffer
        const oldestAllowed = Date.now() - (config.chartOptions.timeRange * 1.5);
        dataCache.historical = dataCache.historical.filter(item => {
            return new Date(item.timestamp).getTime() >= oldestAllowed;
        });
    }
    
    /**
     * Get the last fetched data
     * @returns {Object|null} Last fetched data or null if none
     */
    function getLastData() {
        return dataCache.current;
    }
    
    /**
     * Get historical data for charting
     * @param {number} timeRange - Time range in milliseconds
     * @returns {Array} Historical data array
     */
    function getHistoricalData(timeRange = config.chartOptions.timeRange) {
        if (!dataCache.historical.length) {
            return [];
        }
        
        const cutoffTime = Date.now() - timeRange;
        return dataCache.historical.filter(item => {
            return new Date(item.timestamp).getTime() >= cutoffTime;
        });
    }
    
    /**
     * Get the last update time
     * @returns {number|null} Timestamp of last update or null
     */
    function getLastUpdateTime() {
        return dataCache.lastUpdated;
    }
    
    /**
     * Clear the data cache
     */
    function clearCache() {
        dataCache = {
            current: null,
            historical: [],
            lastUpdated: null
        };
        
        if (config.cacheOptions && config.cacheOptions.enabled) {
            try {
                localStorage.removeItem(config.cacheOptions.storageKey);
                Logger.log('Cache cleared');
            } catch (error) {
                Logger.error('Error clearing cache:', error);
            }
        }
    }
    
    /**
     * Check if data is stale
     * @returns {Object} Staleness status
     */
    function isDataStale() {
        if (!dataCache.lastUpdated) {
            return { isStale: true, isCritical: true, age: Infinity };
        }
        
        const now = Date.now();
        const dataAge = now - dataCache.lastUpdated;
        
        return {
            isStale: dataAge > config.staleness.warningThreshold,
            isCritical: dataAge > config.staleness.criticalThreshold,
            age: dataAge
        };
    }
    
    /**
     * Get AQI status based on the AQI value and configured thresholds
     * @param {number} aqi - The AQI value
     * @returns {Object} AQI status object with label, class, and color
     */
    function getAQIStatus(aqi) {
        // Default categories if config not provided
        const defaultCategories = [
            { min: 0, max: 50, label: 'Good', class: 'aqi-good', color: 'green' },
            { min: 51, max: 100, label: 'Moderate', class: 'aqi-moderate', color: 'yellow' },
            { min: 101, max: 150, label: 'Unhealthy for Sensitive Groups', class: 'aqi-unhealthy-sensitive', color: 'orange' },
            { min: 151, max: 200, label: 'Unhealthy', class: 'aqi-unhealthy', color: 'red' },
            { min: 201, max: 300, label: 'Very Unhealthy', class: 'aqi-very-unhealthy', color: 'purple' },
            { min: 301, max: 500, label: 'Hazardous', class: 'aqi-hazardous', color: 'maroon' }
        ];
        
        // Use config categories if available, otherwise use defaults
        const categories = (config.aqiCategories && Array.isArray(config.aqiCategories)) ? 
            config.aqiCategories : defaultCategories;
        
        // Find the matching category
        for (const category of categories) {
            if (aqi >= category.min && aqi <= category.max) {
                return {
                    label: category.label,
                    class: category.class || `aqi-${category.label.toLowerCase().replace(/\s+/g, '-')}`,
                    color: category.color
                };
            }
        }
        
        // Default to highest category if no match
        const highest = categories[categories.length - 1];
        return {
            label: highest.label,
            class: highest.class || `aqi-${highest.label.toLowerCase().replace(/\s+/g, '-')}`,
            color: highest.color
        };
    }
    
    // Return public API
    return {
        initialize
    };
})(); 