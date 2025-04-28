# Air Quality Dashboard Server

A simple web server that displays real-time air quality data from an external API.

## Features

- Real-time air quality monitoring
- Auto-refreshing dashboard
- AQI categorization with color coding
- Detailed pollutant information (PM1, PM2.5, PM10)
- Weather data display (temperature, humidity, pressure)
- UV Index forecasting with safety guidelines
- Support for both direct OpenUV API and cached UV API server
- Logging to file for monitoring and debugging

## Requirements

- Node.js (v12 or higher)
- npm (v6 or higher)

## Installation

1. Clone this repository
2. The server will automatically create a `config.json` file from the template on first run
3. Update the `config.json` file with your specific settings (API endpoint, location, etc.)

## Configuration

The server uses a `config.json` file for settings. If it doesn't exist, it will be created automatically from `config.json.example`.

The configuration includes:

- `port`: The port number the server runs on (default: 3000)
- `logLevel`: Logging level (info, debug, error, etc.)
- `pollingIntervalSec`: How often to fetch data from external API (in seconds)
- `uvRefreshIntervalSec`: How often to fetch UV index data (in seconds)
- `externalApiUrl`: The URL to fetch air quality data from **(REQUIRED - you must set this)**
- `uvApi`: Configuration for the UV index data source
  - `url`: The OpenUV API URL (default: https://api.openuv.io/api/v1/forecast)
  - `apiKey`: Your OpenUV API key (required if using direct OpenUV API)
  - `useCachedServer`: Set to `true` to use a cached UV API server instead of direct OpenUV API (default: false)
  - `cachedServerUrl`: URL of the cached UV API server (required if `useCachedServer` is true)
- `location`: Geographic coordinates for your location **(REQUIRED for UV index)**
  - `latitude`: Your location's latitude
  - `longitude`: Your location's longitude
  - `cityName`: Your city name (for display purposes)
  - `timeZone`: Time zone information

### UV API Configuration Options

You can configure the UV data source in two ways:

1. **Direct OpenUV API**: Uses the OpenUV.io API directly with your API key
   ```json
   "uvApi": {
     "url": "https://api.openuv.io/api/v1/forecast",
     "apiKey": "YOUR_OPENUV_API_KEY_HERE",
     "useCachedServer": false
   }
   ```
   Note: You must provide a valid OpenUV API key for this option to work.

2. **Cached UV API Server**: Uses a JSON caching server to avoid API rate limits
   ```json
   "uvApi": {
     "url": "",
     "apiKey": "",
     "useCachedServer": true,
     "cachedServerUrl": "http://hostname:8001/data"
   }
   ```
   This option is recommended if you have multiple clients accessing the OpenUV API to avoid hitting rate limits. See [json-cacher](https://github.com/borgquist/json-cacher) for a simple implementation of a caching server.

### Important Note About Configuration

The `config.json` file is not tracked by Git to prevent overwriting your personal settings during updates. After pulling updates from the repository, your configuration will remain unchanged.

## Running the application

Simply execute the start script:

```bash
./start.sh
```

This will:
1. Install any missing dependencies
2. Start the server on port 3000 (or your configured port)
3. Log server activity to `airquality.log`
4. Log startup information to `startup.log`

Once started, open your browser and navigate to:
```
http://localhost:3000
```

## Logs

- `airquality.log`: Contains API request logs and air quality data
- `startup.log`: Contains server startup information

## Customization

You can modify the `config.json` file to:
- Change the refresh interval
- Adjust AQI thresholds
- Configure the color scheme for AQI levels
- Toggle display options 