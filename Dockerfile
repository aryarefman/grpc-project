# Use Node.js LTS (Alpine for smaller footprint)
FROM node:18-alpine

# Install basic tools
RUN apk add --no-cache bash

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Expose ports
# 3000: Main Web Dashboard
# 3001: MQTT Dashboard
# 50051: gRPC Server
# 1883: MQTT Broker (TCP)
# 9001: MQTT Broker (WebSocket)
EXPOSE 3000 3001 50051 1883 9001

# We will use docker-compose to run specific services
CMD ["npm", "run", "web"]
