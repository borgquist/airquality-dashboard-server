#!/bin/bash

# AirVisual Dashboard - Server Setup Script
# This script sets up the log server on Unix/Linux systems

set -e # Exit on any error

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Default settings
INSTALL_DIR="$SCRIPT_DIR"
USER=$(whoami)
LOG_SERVER_PORT=8088
SYSTEM_TYPE=""

# Detect the operating system
if [[ "$OSTYPE" == "darwin"* ]]; then
  SYSTEM_TYPE="macos"
elif [[ -f "/etc/os-release" ]]; then
  source /etc/os-release
  SYSTEM_TYPE="linux"
else
  SYSTEM_TYPE="unknown"
  echo "Warning: Unknown operating system. Installation may not work properly."
fi

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dir=*)
      INSTALL_DIR="${1#*=}"
      shift
      ;;
    --port=*)
      LOG_SERVER_PORT="${1#*=}"
      shift
      ;;
    --help)
      echo "Usage: $0 [--dir=/path/to/install] [--port=8088]"
      echo ""
      echo "Options:"
      echo "  --dir=/path/to/install  Specify installation directory (default: current directory)"
      echo "  --port=8088             Specify port for log server (default: 8088)"
      echo "  --help                  Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

echo "AirVisual Dashboard Server Installation"
echo "======================================"
echo "System type: $SYSTEM_TYPE"
echo "Directory: $INSTALL_DIR"
echo "User: $USER"
echo "Log server port: $LOG_SERVER_PORT"
echo ""

# Step 1: Create logs directory
mkdir -p "$INSTALL_DIR/logs"
echo "Created logs directory: $INSTALL_DIR/logs"

# Step 2: Check for Node.js installation
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  echo "Node.js version: $NODE_VERSION"
  
  # Check if we need to update (if it's not v20.x)
  if [[ ! $NODE_VERSION =~ ^v20\. ]]; then
    echo "Current Node.js version is $NODE_VERSION."
    echo "This application works best with Node.js 20 LTS."
    
    if [[ "$SYSTEM_TYPE" == "macos" ]]; then
      echo "Please consider updating Node.js using Homebrew:"
      echo "brew install node@20"
    elif [[ "$SYSTEM_TYPE" == "linux" ]]; then
      echo "Please consider updating Node.js using your package manager"
      echo "or using the NodeSource instructions:"
      echo "https://github.com/nodesource/distributions"
    fi
    
    read -p "Continue with current Node.js version? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Installation canceled. Please install Node.js 20 LTS and try again."
      exit 1
    fi
  fi
else
  echo "Node.js is not installed."
  if [[ "$SYSTEM_TYPE" == "macos" ]]; then
    echo "Please install Node.js 20 LTS with Homebrew:"
    echo "brew install node@20"
  elif [[ "$SYSTEM_TYPE" == "linux" ]]; then
    echo "Please install Node.js 20 LTS using your package manager"
    echo "or using the NodeSource instructions:"
    echo "https://github.com/nodesource/distributions"
  fi
  exit 1
fi

# Step 3: Set up the service based on the system type
if [[ "$SYSTEM_TYPE" == "macos" ]]; then
  # macOS: Create launchd plist
  PLIST_PATH="$HOME/Library/LaunchAgents/com.airvisual.logserver.plist"
  echo "Creating launchd service for log server..."
  
  cat > /tmp/com.airvisual.logserver.plist << EOL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.airvisual.logserver</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${INSTALL_DIR}/log-server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>
    <key>StandardErrorPath</key>
    <string>${INSTALL_DIR}/logs/server-error.log</string>
    <key>StandardOutPath</key>
    <string>${INSTALL_DIR}/logs/server-output.log</string>
</dict>
</plist>
EOL

  # Create LaunchAgents directory if it doesn't exist
  mkdir -p "$HOME/Library/LaunchAgents"

  # Install the plist file
  mv /tmp/com.airvisual.logserver.plist "$PLIST_PATH"
  echo "Created launchd service at: $PLIST_PATH"
  
  # Start the service
  echo "Loading and starting log server service..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl load -w "$PLIST_PATH"
  
  # Check if the service is running
  SERVICE_CHECK_CMD="pgrep -f \"node.*log-server.js\""
  START_CMD="launchctl load -w $PLIST_PATH"
  STOP_CMD="launchctl unload $PLIST_PATH"
  RESTART_CMD="launchctl unload $PLIST_PATH && launchctl load -w $PLIST_PATH"
  
elif [[ "$SYSTEM_TYPE" == "linux" ]]; then
  # Linux: Create systemd service if systemd is available
  if command -v systemctl &> /dev/null; then
    echo "Creating systemd service for log server..."
    
    SERVICE_FILE="/tmp/airvisual-log-server.service"
    cat > "$SERVICE_FILE" << EOL
[Unit]
Description=AirVisual Log Server
After=network.target

[Service]
Type=simple
ExecStart=$(which node) ${INSTALL_DIR}/log-server.js
User=$USER
WorkingDirectory=${INSTALL_DIR}
Restart=always
RestartSec=10
StandardOutput=append:${INSTALL_DIR}/logs/server-output.log
StandardError=append:${INSTALL_DIR}/logs/server-error.log

[Install]
WantedBy=multi-user.target
EOL

    # Install and enable the service
    sudo mv "$SERVICE_FILE" /etc/systemd/system/airvisual-log-server.service
    sudo systemctl daemon-reload
    sudo systemctl enable airvisual-log-server.service
    
    # Start the service
    echo "Starting log server service..."
    sudo systemctl start airvisual-log-server.service
    
    # Check if the service is running
    SERVICE_CHECK_CMD="systemctl is-active airvisual-log-server.service"
    START_CMD="sudo systemctl start airvisual-log-server.service"
    STOP_CMD="sudo systemctl stop airvisual-log-server.service"
    RESTART_CMD="sudo systemctl restart airvisual-log-server.service"
    
  else
    # If systemd is not available, use a simple background process
    echo "systemd not detected. Setting up a manual startup script..."
    
    STARTUP_SCRIPT="$INSTALL_DIR/start-server.sh"
    cat > "$STARTUP_SCRIPT" << EOL
#!/bin/bash
cd "$INSTALL_DIR"
nohup node log-server.js > logs/server-output.log 2> logs/server-error.log &
echo \$! > logs/server.pid
EOL
    
    chmod +x "$STARTUP_SCRIPT"
    
    # Start the server
    echo "Starting log server..."
    $STARTUP_SCRIPT
    
    # Create stop script
    STOP_SCRIPT="$INSTALL_DIR/stop-server.sh"
    cat > "$STOP_SCRIPT" << EOL
#!/bin/bash
if [ -f "$INSTALL_DIR/logs/server.pid" ]; then
  kill \$(cat "$INSTALL_DIR/logs/server.pid") 2>/dev/null || true
  rm "$INSTALL_DIR/logs/server.pid"
fi
EOL
    
    chmod +x "$STOP_SCRIPT"
    
    # Check if the service is running
    SERVICE_CHECK_CMD="pgrep -f \"node.*log-server.js\""
    START_CMD="$STARTUP_SCRIPT"
    STOP_CMD="$STOP_SCRIPT"
    RESTART_CMD="$STOP_SCRIPT && $STARTUP_SCRIPT"
    
    echo "Created start/stop scripts at:"
    echo "  $STARTUP_SCRIPT"
    echo "  $STOP_SCRIPT"
    echo ""
  fi
else
  # Unknown system: Use manual startup
  echo "Unknown system type. Setting up a manual startup script..."
  
  STARTUP_SCRIPT="$INSTALL_DIR/start-server.sh"
  cat > "$STARTUP_SCRIPT" << EOL
#!/bin/bash
cd "$INSTALL_DIR"
nohup node log-server.js > logs/server-output.log 2> logs/server-error.log &
echo \$! > logs/server.pid
EOL
  
  chmod +x "$STARTUP_SCRIPT"
  
  # Start the server
  echo "Starting log server..."
  $STARTUP_SCRIPT
  
  # Create stop script
  STOP_SCRIPT="$INSTALL_DIR/stop-server.sh"
  cat > "$STOP_SCRIPT" << EOL
#!/bin/bash
if [ -f "$INSTALL_DIR/logs/server.pid" ]; then
  kill \$(cat "$INSTALL_DIR/logs/server.pid") 2>/dev/null || true
  rm "$INSTALL_DIR/logs/server.pid"
fi
EOL
  
  chmod +x "$STOP_SCRIPT"
  
  # Check if the service is running
  SERVICE_CHECK_CMD="pgrep -f \"node.*log-server.js\""
  START_CMD="$STARTUP_SCRIPT"
  STOP_CMD="$STOP_SCRIPT"
  RESTART_CMD="$STOP_SCRIPT && $STARTUP_SCRIPT"
  
  echo "Created start/stop scripts at:"
  echo "  $STARTUP_SCRIPT"
  echo "  $STOP_SCRIPT"
  echo ""
fi

# Step 4: Check if config.json exists, create one if it doesn't
if [ ! -f "$INSTALL_DIR/config.json" ]; then
  echo "Creating default config.json file..."
  cp "$INSTALL_DIR/config.example.json" "$INSTALL_DIR/config.json"
  echo "Please edit $INSTALL_DIR/config.json to set your AirVisual device ID."
fi

# Step 5: Verify service is running
sleep 2
if eval "$SERVICE_CHECK_CMD" > /dev/null; then
  echo "Log server started successfully!"
  
  # Get the IP address
  if [[ "$SYSTEM_TYPE" == "macos" ]]; then
    IP_ADDRESS=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
  else
    # Try various methods to get IP
    if command -v ip &> /dev/null; then
      IP_ADDRESS=$(ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v "127.0.0.1" | head -n 1)
    elif command -v ifconfig &> /dev/null; then
      IP_ADDRESS=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
    else
      IP_ADDRESS="<server-ip-address>"
      echo "Could not determine IP address automatically. Please check your network configuration."
    fi
  fi
  
  echo ""
  echo "=============================================================================="
  echo "Installation completed successfully!"
  echo ""
  echo "The dashboard server is now running on port $LOG_SERVER_PORT"
  echo ""
  echo "To access the dashboard:"
  echo "  http://$IP_ADDRESS:$LOG_SERVER_PORT"
  echo ""
  echo "Service management commands:"
  echo "  Start:    $START_CMD"
  echo "  Stop:     $STOP_CMD"
  echo "  Restart:  $RESTART_CMD"
  echo ""
  echo "Log files are available at:"
  echo "  $INSTALL_DIR/logs/"
  echo "=============================================================================="
else
  echo "Warning: Log server service did not start properly."
  echo "Check logs for more information: $INSTALL_DIR/logs/server-error.log"
fi 