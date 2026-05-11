#!/bin/bash

# Start Publishers
echo "🚀 Starting MQTT Publishers..."
node mqtt/publishers/trafficPublisher.js &
node mqtt/publishers/environmentPublisher.js &
node mqtt/publishers/emergencyPublisher.js &

# Start Subscribers
echo "🚀 Starting MQTT Subscribers..."
node mqtt/subscribers/commandCenterSub.js &
node mqtt/subscribers/publicAlertSub.js &

# Wait for all background processes
wait
