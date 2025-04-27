# AirVisual Dashboard - Server Setup Guide

This document explains how to set up the AirVisual Dashboard with the client-server architecture, where the server component runs on a dedicated machine (like a Mac Mini or any Unix/Linux system), and the dashboard is displayed on a client device (like a Raspberry Pi running a web browser).

## Architecture Overview

The new setup consists of two main components:

1. **Server Component**: Runs on a Mac Mini or any Unix/Linux system
   - Hosts the log server (Node.js application)
   - Retrieves and caches air quality data from the AirVisual API
   - Provides a web interface for viewing data and managing configuration

2. **Client Component**: Runs on a Raspberry Pi or any device with a browser
   - Connects to the server component via HTTP
   - Displays the dashboard in a web browser
   - No local data processing required

## Server Setup

### Prerequisites

- Unix/Linux or macOS system
- Node.js 20 LTS
- Network connectivity

### Installation Steps

1. Clone this repository on your server machine:
   ```bash
   git clone https://github.com/yourusername/airvisual-dashboard-server.git
   cd airvisual-dashboard-server
   ```

2. Run the setup script:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

3. Edit the configuration file:
   ```bash
   nano config.json
   ```
   
   Update the following values:
   - `apiUrl`: Your AirVisual device URL (https://device.iqair.com/v2/YOUR_DEVICE_ID)
   - `location`: Your location name
   - `refreshIntervalSec`: How often to refresh data (in seconds)

4. The server will be accessible at:
   ```
   http://SERVER_IP:8088
   ```

### Server Management

#### macOS:
- Start: `launchctl load -w ~/Library/LaunchAgents/com.airvisual.logserver.plist`
- Stop: `launchctl unload ~/Library/LaunchAgents/com.airvisual.logserver.plist`
- Restart: `launchctl unload ~/Library/LaunchAgents/com.airvisual.logserver.plist && launchctl load -w ~/Library/LaunchAgents/com.airvisual.logserver.plist`

#### Linux (systemd):
- Start: `sudo systemctl start airvisual-log-server.service`
- Stop: `sudo systemctl stop airvisual-log-server.service`
- Restart: `sudo systemctl restart airvisual-log-server.service`
- Status: `sudo systemctl status airvisual-log-server.service`

#### Other Unix Systems:
- Start: `./start-server.sh`
- Stop: `./stop-server.sh`

## Client Setup (Raspberry Pi)

For a Raspberry Pi client, follow these steps:

1. Install the latest Raspberry Pi OS with Desktop

2. Create an autostart script for Chromium in kiosk mode:
   ```bash
   mkdir -p ~/.config/autostart
   nano ~/.config/autostart/airvisual-dashboard.desktop
   ```

3. Add the following content:
   ```
   [Desktop Entry]
   Type=Application
   Name=AirVisual Dashboard
   Exec=chromium-browser --kiosk --disable-infobars --noerrdialogs --incognito http://SERVER_IP:8088
   ```
   Replace `SERVER_IP` with the actual IP address of your server.

4. Save the file and reboot your Raspberry Pi:
   ```bash
   sudo reboot
   ```

5. The Raspberry Pi will now boot directly into a full-screen browser displaying the dashboard.

## Troubleshooting

### Server Issues

- **Server not starting**: Check Node.js installation and logs
  ```bash
  node -v
  cat logs/server-error.log
  ```

- **Cannot access server**: Check firewall settings
  ```bash
  # On macOS
  sudo lsof -i :8088
  
  # On Linux
  sudo ufw status
  ```

### Client Issues

- **Browser not starting in kiosk mode**: Check the autostart file
  ```bash
  cat ~/.config/autostart/airvisual-dashboard.desktop
  ```

- **Cannot connect to server**: Test network connectivity
  ```bash
  ping SERVER_IP
  curl -I http://SERVER_IP:8088
  ```

## Securing Your Server

For improved security:

1. Set up a basic authentication:
   ```bash
   nano config.json
   ```
   
   Add the following entries:
   ```json
   {
     "auth": {
       "enabled": true,
       "username": "your_username",
       "password": "your_secure_password"
     }
   }
   ```

2. Consider setting up a reverse proxy with NGINX or Apache for SSL support.

3. Do not expose the server to the public internet without proper security measures. 