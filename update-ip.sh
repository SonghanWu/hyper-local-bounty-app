#!/bin/bash

# This script automatically updates the API configuration with your current IP address

echo "🔍 Detecting current IP address..."

# Get WiFi IP address (en0 is typically WiFi on Mac)
CURRENT_IP=$(ipconfig getifaddr en0 2>/dev/null)

if [ -z "$CURRENT_IP" ]; then
    echo "❌ Could not detect WiFi IP address (en0)"
    echo "   Your computer might not be connected to WiFi"
    exit 1
fi

echo "✓ Found IP: $CURRENT_IP"

# Path to config file
CONFIG_FILE="mobile/config/api.config.ts"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Config file not found: $CONFIG_FILE"
    exit 1
fi

# Get old IP from config file
OLD_IP=$(grep "const MACHINE_IP = " "$CONFIG_FILE" | sed "s/.*'\(.*\)'.*/\1/")

if [ "$OLD_IP" = "$CURRENT_IP" ]; then
    echo "✓ IP address is already up to date ($CURRENT_IP)"
    exit 0
fi

echo "📝 Updating configuration..."
echo "   Old IP: $OLD_IP"
echo "   New IP: $CURRENT_IP"

# Update the IP in config file
sed -i '' "s/const MACHINE_IP = '.*'/const MACHINE_IP = '$CURRENT_IP'/" "$CONFIG_FILE"

echo "✅ Configuration updated successfully!"
echo ""
echo "⚠️  Important: Reload your Expo app for changes to take effect"
echo "   - Press 'r' in the Expo terminal"
echo "   - Or shake your phone and select 'Reload'"
