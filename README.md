# Air Quality Dashboard Server

A simple web server that displays real-time air quality data from an external API.

## Features

- Real-time air quality monitoring
- Auto-refreshing dashboard
- AQI categorization with color coding
- Detailed pollutant information (PM1, PM2.5, PM10)
- Weather data display (temperature, humidity, pressure)
- Logging to file for monitoring and debugging

## Requirements

- Node.js (v12 or higher)
- npm (v6 or higher)

## Installation

1. Clone this repository
2. Update the `config.json` file with your API endpoint

## Configuration

The `config.json` file contains the following settings:

- `apiUrl`: The URL to fetch air quality data from
- `refreshIntervalSec`: How often the dashboard should refresh (in seconds)
- `aqiThresholds`: Threshold values for different AQI categories
- `colors`: Color scheme for different AQI categories
- `displayOptions`: Toggle visibility of different dashboard components

## Running the application

Simply execute the start script:

```bash
./start.sh
```

This will:
1. Install any missing dependencies
2. Start the server on port 3000
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
- Change the color scheme
- Toggle display options 