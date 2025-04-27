#!/bin/bash
# Log server service script for AirVisual Kiosk Display

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Default installation directory is the current directory
INSTALL_DIR="$SCRIPT_DIR"
USER=$(whoami)

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dir=*)
      INSTALL_DIR="${1#*=}"
      shift
      ;;
    --user=*)
      USER="${1#*=}"
      shift
      ;;
    --port=*)
      PORT="${1#*=}"
      shift
      ;;
    --help)
      echo "Usage: $0 [--dir=/path/to/install] [--user=username] [--port=8088]"
      echo ""
      echo "Options:"
      echo "  --dir=/path/to/install  Specify installation directory (default: current directory)"
      echo "  --user=username         Specify user for services (default: current user)"
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

echo "Starting AirVisual Log Server..."
echo "Installation directory: $INSTALL_DIR"
echo "User: $USER"

# Create logs directory
mkdir -p "$INSTALL_DIR/logs"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo "Node.js is not installed. Installing Node.js 20 LTS..."
  curl -sL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  echo "Node.js installed successfully."
fi

# Create systemd service for log server
cat > /tmp/airvisual-log-server.service << EOL
[Unit]
Description=AirVisual Log Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node $INSTALL_DIR/log-server.js
User=$USER
WorkingDirectory=$INSTALL_DIR
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOL

# Install the service
echo "Setting up systemd service..."
sudo mv /tmp/airvisual-log-server.service /etc/systemd/system/
sudo systemctl daemon-reexec
sudo systemctl enable airvisual-log-server.service

# Start or restart the service
echo "Starting service..."
if systemctl is-active --quiet airvisual-log-server.service; then
  echo "Service is already running. Restarting..."
  sudo systemctl restart airvisual-log-server.service
else
  echo "Starting service for the first time..."
  sudo systemctl start airvisual-log-server.service
fi

# Check service status
SERVICE_STATUS=$(systemctl is-active airvisual-log-server.service)
if [ "$SERVICE_STATUS" = "active" ]; then
  echo "Service started successfully!"
else
  echo "Warning: Service failed to start. Status: $SERVICE_STATUS"
  echo "Check logs for more information."
fi

echo "Log server setup complete!"
echo "Service management commands:"
echo "  Start:    sudo systemctl start airvisual-log-server.service"
echo "  Stop:     sudo systemctl stop airvisual-log-server.service"
echo "  Restart:  sudo systemctl restart airvisual-log-server.service"
echo "  Status:   sudo systemctl status airvisual-log-server.service"
echo ""
echo "Log files will be available at:"
echo "$INSTALL_DIR/logs/"
echo ""
echo "To check logs via journalctl:"
echo "journalctl -u airvisual-log-server.service -f"
echo ""
echo "The log server is accessible at:"
echo "http://localhost:8088" 