/**
 * UI Components Module
 * Provides components for displaying air quality data
 */
const UIComponents = (function() {
    'use strict';
    
    // Private variables
    let config = {};
    
    /**
     * Initialize UI components
     * @param {Object} appConfig - Application configuration
     */
    function initialize(appConfig) {
        config = appConfig;
        Logger.log('UI components initialized');
        
        return {
            createDashboard,
            createAQICard,
            createHistoryChart,
            createStatusBadge,
            createMeasurementCard,
            updateLoadingState,
            displayError,
            clearError
        };
    }
    
    /**
     * Create the main dashboard
     * @param {string} elementId - ID of container element
     * @param {Object} data - Current air quality data
     */
    function createDashboard(elementId, data) {
        const container = document.getElementById(elementId);
        if (!container) {
            Logger.error(`Element with ID ${elementId} not found`);
            return;
        }
        
        container.innerHTML = '';
        
        // Create header
        const header = document.createElement('header');
        header.className = 'dashboard-header';
        
        const title = document.createElement('h1');
        title.textContent = config.appTitle || 'Air Quality Dashboard';
        
        const subtitle = document.createElement('p');
        subtitle.className = 'location';
        subtitle.textContent = data?.location || 'Loading location...';
        
        const lastUpdated = document.createElement('p');
        lastUpdated.className = 'last-updated';
        lastUpdated.id = 'last-updated';
        lastUpdated.textContent = data?.lastUpdated ? 
            `Last updated: ${formatDateTime(new Date(data.lastUpdated))}` : 
            'Waiting for data...';
        
        header.appendChild(title);
        header.appendChild(subtitle);
        header.appendChild(lastUpdated);
        container.appendChild(header);
        
        // Create main content area
        const mainContent = document.createElement('main');
        mainContent.className = 'dashboard-content';
        
        // Create card grid
        const cardGrid = document.createElement('div');
        cardGrid.className = 'card-grid';
        
        // Main AQI card
        const aqiCardContainer = document.createElement('div');
        aqiCardContainer.className = 'aqi-card-container';
        aqiCardContainer.appendChild(createAQICard(data));
        cardGrid.appendChild(aqiCardContainer);
        
        // Add measurement cards
        if (data && data.measurements) {
            // PM2.5 card
            if (data.measurements.pm25 !== undefined) {
                cardGrid.appendChild(createMeasurementCard(
                    'PM2.5', 
                    data.measurements.pm25, 
                    'μg/m³', 
                    'Fine particulate matter (2.5 micrometers or smaller)'
                ));
            }
            
            // PM10 card
            if (data.measurements.pm10 !== undefined) {
                cardGrid.appendChild(createMeasurementCard(
                    'PM10', 
                    data.measurements.pm10, 
                    'μg/m³', 
                    'Particulate matter (10 micrometers or smaller)'
                ));
            }
            
            // Temperature card
            if (data.measurements.temperature !== undefined) {
                cardGrid.appendChild(createMeasurementCard(
                    'Temperature', 
                    data.measurements.temperature, 
                    '°C', 
                    'Current temperature'
                ));
            }
            
            // Humidity card
            if (data.measurements.humidity !== undefined) {
                cardGrid.appendChild(createMeasurementCard(
                    'Humidity', 
                    data.measurements.humidity, 
                    '%', 
                    'Relative humidity'
                ));
            }
            
            // Other measurements
            const otherMeasurements = {
                pressure: { label: 'Pressure', unit: 'hPa', desc: 'Atmospheric pressure' },
                co2: { label: 'CO₂', unit: 'ppm', desc: 'Carbon dioxide concentration' },
                voc: { label: 'VOC', unit: 'ppb', desc: 'Volatile organic compounds' },
                o3: { label: 'Ozone', unit: 'ppb', desc: 'Ozone concentration' }
            };
            
            for (const [key, info] of Object.entries(otherMeasurements)) {
                if (data.measurements[key] !== undefined) {
                    cardGrid.appendChild(createMeasurementCard(
                        info.label,
                        data.measurements[key],
                        info.unit,
                        info.desc
                    ));
                }
            }
        }
        
        mainContent.appendChild(cardGrid);
        
        // Create chart container
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        chartContainer.id = 'chart-container';
        mainContent.appendChild(chartContainer);
        
        container.appendChild(mainContent);
        
        // Create footer
        const footer = document.createElement('footer');
        footer.className = 'dashboard-footer';
        
        const deviceInfo = document.createElement('p');
        deviceInfo.className = 'device-info';
        deviceInfo.textContent = `Data source: ${data?.device || 'Unknown device'}`;
        
        const refreshButton = document.createElement('button');
        refreshButton.id = 'refresh-button';
        refreshButton.className = 'refresh-button';
        refreshButton.innerHTML = '<i class="fa fa-refresh"></i> Refresh';
        
        footer.appendChild(deviceInfo);
        footer.appendChild(refreshButton);
        container.appendChild(footer);
        
        // Add loading overlay
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay hidden';
        loadingOverlay.id = 'loading-overlay';
        
        const loader = document.createElement('div');
        loader.className = 'loader';
        loadingOverlay.appendChild(loader);
        
        const loadingText = document.createElement('p');
        loadingText.textContent = 'Loading data...';
        loadingOverlay.appendChild(loadingText);
        
        container.appendChild(loadingOverlay);
        
        // Add error container
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-container hidden';
        errorContainer.id = 'error-container';
        container.appendChild(errorContainer);
        
        return container;
    }
    
    /**
     * Create an AQI card
     * @param {Object} data - Air quality data
     * @returns {HTMLElement} AQI card element
     */
    function createAQICard(data) {
        const card = document.createElement('div');
        card.className = 'card aqi-card';
        
        if (data && data.aqi !== undefined && data.aqiStatus) {
            card.classList.add(data.aqiStatus.class);
            
            const aqiValue = document.createElement('div');
            aqiValue.className = 'aqi-value';
            aqiValue.textContent = Math.round(data.aqi);
            
            const aqiLabel = document.createElement('div');
            aqiLabel.className = 'aqi-label';
            aqiLabel.textContent = 'AQI';
            
            const aqiStatus = document.createElement('div');
            aqiStatus.className = 'aqi-status';
            aqiStatus.textContent = data.aqiStatus.label;
            
            const aqiDescription = document.createElement('p');
            aqiDescription.className = 'aqi-description';
            aqiDescription.textContent = data.aqiStatus.description || '';
            
            card.appendChild(aqiValue);
            card.appendChild(aqiLabel);
            card.appendChild(aqiStatus);
            card.appendChild(aqiDescription);
        } else {
            card.classList.add('loading');
            
            const placeholder = document.createElement('div');
            placeholder.className = 'placeholder-text';
            placeholder.textContent = 'Loading AQI data...';
            
            card.appendChild(placeholder);
        }
        
        return card;
    }
    
    /**
     * Create a status badge
     * @param {Object} status - Status object with label and class
     * @returns {HTMLElement} Status badge element
     */
    function createStatusBadge(status) {
        const badge = document.createElement('span');
        badge.className = `status-badge ${status.class}`;
        badge.textContent = status.label;
        return badge;
    }
    
    /**
     * Create a measurement card
     * @param {string} title - Measurement title
     * @param {number} value - Measurement value
     * @param {string} unit - Measurement unit
     * @param {string} description - Measurement description
     * @returns {HTMLElement} Measurement card element
     */
    function createMeasurementCard(title, value, unit, description) {
        const card = document.createElement('div');
        card.className = 'card measurement-card';
        
        const cardTitle = document.createElement('h3');
        cardTitle.className = 'card-title';
        cardTitle.textContent = title;
        
        const cardValue = document.createElement('div');
        cardValue.className = 'measurement-value';
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'value';
        valueSpan.textContent = typeof value === 'number' ? value.toFixed(1) : value;
        
        const unitSpan = document.createElement('span');
        unitSpan.className = 'unit';
        unitSpan.textContent = unit;
        
        cardValue.appendChild(valueSpan);
        cardValue.appendChild(unitSpan);
        
        const cardDescription = document.createElement('p');
        cardDescription.className = 'card-description';
        cardDescription.textContent = description;
        
        card.appendChild(cardTitle);
        card.appendChild(cardValue);
        card.appendChild(cardDescription);
        
        return card;
    }
    
    /**
     * Create a history chart
     * @param {string} containerId - ID of container element
     * @param {Array} historicalData - Array of historical data points
     * @param {string} metric - Metric to display (pm25, aqi, etc.)
     */
    function createHistoryChart(containerId, historicalData, metric = 'aqi') {
        const container = document.getElementById(containerId);
        if (!container) {
            Logger.error(`Chart container element with ID ${containerId} not found`);
            return;
        }
        
        // Clear container
        container.innerHTML = '';
        
        if (!historicalData || !historicalData.length) {
            const placeholder = document.createElement('div');
            placeholder.className = 'chart-placeholder';
            placeholder.textContent = 'No historical data available';
            container.appendChild(placeholder);
            return;
        }
        
        // Create chart header
        const chartHeader = document.createElement('div');
        chartHeader.className = 'chart-header';
        
        const chartTitle = document.createElement('h2');
        chartTitle.textContent = getChartTitle(metric);
        
        const chartControls = document.createElement('div');
        chartControls.className = 'chart-controls';
        
        // Create metric selector
        const metricSelector = document.createElement('select');
        metricSelector.id = 'metric-selector';
        
        const metrics = [
            { value: 'aqi', label: 'AQI' },
            { value: 'pm25', label: 'PM2.5' },
            { value: 'pm10', label: 'PM10' },
            { value: 'temperature', label: 'Temperature' },
            { value: 'humidity', label: 'Humidity' }
        ];
        
        metrics.forEach(m => {
            const option = document.createElement('option');
            option.value = m.value;
            option.textContent = m.label;
            option.selected = m.value === metric;
            metricSelector.appendChild(option);
        });
        
        // Create time range selector
        const timeRangeSelector = document.createElement('select');
        timeRangeSelector.id = 'time-range-selector';
        
        const timeRanges = [
            { value: 3600000, label: '1 hour' },
            { value: 10800000, label: '3 hours' },
            { value: 21600000, label: '6 hours' },
            { value: 86400000, label: '24 hours' }
        ];
        
        timeRanges.forEach(tr => {
            const option = document.createElement('option');
            option.value = tr.value;
            option.textContent = tr.label;
            option.selected = tr.value === config.chartOptions.timeRange;
            timeRangeSelector.appendChild(option);
        });
        
        chartControls.appendChild(metricSelector);
        chartControls.appendChild(timeRangeSelector);
        
        chartHeader.appendChild(chartTitle);
        chartHeader.appendChild(chartControls);
        container.appendChild(chartHeader);
        
        // Create canvas for chart
        const canvas = document.createElement('canvas');
        canvas.id = 'history-chart';
        container.appendChild(canvas);
        
        // Prepare data for chart
        const chartData = prepareChartData(historicalData, metric);
        
        // Create chart
        renderChart(canvas, chartData, metric);
    }
    
    /**
     * Prepare data for chart
     * @param {Array} historicalData - Array of historical data points
     * @param {string} metric - Metric to display
     * @returns {Object} Chart data
     */
    function prepareChartData(historicalData, metric) {
        // Sort by timestamp (ascending)
        const sortedData = [...historicalData].sort((a, b) => {
            return new Date(a.timestamp) - new Date(b.timestamp);
        });
        
        const labels = [];
        const values = [];
        
        sortedData.forEach(point => {
            // Add timestamp
            labels.push(new Date(point.timestamp));
            
            // Add value based on metric
            if (metric === 'aqi') {
                values.push(point.aqi);
            } else if (metric.startsWith('pm')) {
                values.push(point.measurements?.[metric]);
            } else {
                values.push(point.measurements?.[metric]);
            }
        });
        
        return {
            labels,
            values
        };
    }
    
    /**
     * Render chart
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object} data - Chart data
     * @param {string} metric - Metric being displayed
     */
    function renderChart(canvas, data, metric) {
        // This is a placeholder. In a real implementation,
        // you would use a charting library like Chart.js
        
        const ctx = canvas.getContext('2d');
        const width = canvas.parentElement.clientWidth;
        const height = 300;
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw simple chart
        ctx.clearRect(0, 0, width, height);
        
        if (!data.values.length) {
            ctx.font = '16px Arial';
            ctx.fillStyle = '#666';
            ctx.textAlign = 'center';
            ctx.fillText('No data available', width / 2, height / 2);
            return;
        }
        
        // Find min and max values
        const nonNullValues = data.values.filter(v => v !== null && v !== undefined);
        const min = Math.min(...nonNullValues) * 0.9;
        const max = Math.max(...nonNullValues) * 1.1;
        
        // Draw axes
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        
        // Y axis
        ctx.beginPath();
        ctx.moveTo(50, 20);
        ctx.lineTo(50, height - 30);
        ctx.stroke();
        
        // X axis
        ctx.beginPath();
        ctx.moveTo(50, height - 30);
        ctx.lineTo(width - 20, height - 30);
        ctx.stroke();
        
        // Draw data points
        if (data.values.length > 1) {
            const xStep = (width - 70) / (data.labels.length - 1);
            const yScale = (height - 50) / (max - min);
            
            ctx.strokeStyle = getChartColor(metric);
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            data.values.forEach((value, i) => {
                if (value === null || value === undefined) return;
                
                const x = 50 + (i * xStep);
                const y = height - 30 - ((value - min) * yScale);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();
            
            // Draw points
            ctx.fillStyle = getChartColor(metric);
            data.values.forEach((value, i) => {
                if (value === null || value === undefined) return;
                
                const x = 50 + (i * xStep);
                const y = height - 30 - ((value - min) * yScale);
                
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        
        // Draw y-axis labels
        ctx.font = '12px Arial';
        ctx.fillStyle = '#666';
        ctx.textAlign = 'right';
        
        const numYLabels = 5;
        for (let i = 0; i <= numYLabels; i++) {
            const value = min + ((max - min) * (i / numYLabels));
            const y = height - 30 - ((value - min) * (height - 50) / (max - min));
            
            ctx.fillText(value.toFixed(1), 45, y + 4);
        }
        
        // Draw x-axis labels
        ctx.textAlign = 'center';
        
        const numXLabels = Math.min(data.labels.length, 6);
        for (let i = 0; i < numXLabels; i++) {
            const index = Math.floor(i * (data.labels.length - 1) / (numXLabels - 1));
            const x = 50 + (index * (width - 70) / (data.labels.length - 1));
            
            const date = new Date(data.labels[index]);
            const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            ctx.fillText(timeString, x, height - 10);
        }
        
        // Draw metric unit on y-axis
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(getMetricUnit(metric), 0, 0);
        ctx.restore();
    }
    
    /**
     * Get chart title based on metric
     * @param {string} metric - Metric name
     * @returns {string} Chart title
     */
    function getChartTitle(metric) {
        const titles = {
            aqi: 'Air Quality Index History',
            pm25: 'PM2.5 Concentration History',
            pm10: 'PM10 Concentration History',
            temperature: 'Temperature History',
            humidity: 'Humidity History',
            pressure: 'Pressure History',
            co2: 'CO₂ Concentration History',
            voc: 'VOC Level History',
            o3: 'Ozone Level History'
        };
        
        return titles[metric] || 'Measurement History';
    }
    
    /**
     * Get metric unit based on metric name
     * @param {string} metric - Metric name
     * @returns {string} Metric unit
     */
    function getMetricUnit(metric) {
        const units = {
            aqi: 'AQI',
            pm25: 'μg/m³',
            pm10: 'μg/m³',
            temperature: '°C',
            humidity: '%',
            pressure: 'hPa',
            co2: 'ppm',
            voc: 'ppb',
            o3: 'ppb'
        };
        
        return units[metric] || '';
    }
    
    /**
     * Get chart color based on metric
     * @param {string} metric - Metric name
     * @returns {string} Color code
     */
    function getChartColor(metric) {
        const colors = {
            aqi: '#E74C3C',
            pm25: '#9B59B6',
            pm10: '#8E44AD',
            temperature: '#E67E22',
            humidity: '#3498DB',
            pressure: '#1ABC9C',
            co2: '#2ECC71',
            voc: '#F1C40F',
            o3: '#34495E'
        };
        
        return colors[metric] || '#666666';
    }
    
    /**
     * Update loading state
     * @param {boolean} isLoading - Whether data is loading
     */
    function updateLoadingState(isLoading) {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (!loadingOverlay) return;
        
        if (isLoading) {
            loadingOverlay.classList.remove('hidden');
        } else {
            loadingOverlay.classList.add('hidden');
        }
    }
    
    /**
     * Display error message
     * @param {string} message - Error message
     */
    function displayError(message) {
        const errorContainer = document.getElementById('error-container');
        if (!errorContainer) return;
        
        errorContainer.textContent = message;
        errorContainer.classList.remove('hidden');
    }
    
    /**
     * Clear error message
     */
    function clearError() {
        const errorContainer = document.getElementById('error-container');
        if (!errorContainer) return;
        
        errorContainer.textContent = '';
        errorContainer.classList.add('hidden');
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
    
    // Return public API
    return {
        initialize
    };
})(); 