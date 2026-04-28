// ============================================================================
// Web Server - Serves the NovaPulse Web UI + WebSocket endpoint
// Port: 3000  (gRPC remains on 50051)
// ============================================================================

const express = require('express');
const http    = require('http');
const path    = require('path');
const { attachWebSocket } = require('./websocketBridge');

const WEB_PORT = process.env.WEB_PORT || 3000;

function startWebServer() {
  const app = express();

  // Serve static web UI from /web directory
  app.use(express.static(path.join(__dirname, '..', 'web')));

  // Fallback: always serve index.html for SPA (Express 5 compatible)
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'web', 'index.html'));
  });

  const httpServer = http.createServer(app);

  // Attach WebSocket bridge
  attachWebSocket(httpServer);

  httpServer.listen(WEB_PORT, () => {
    console.log(`[WebServer] NovaPulse Web UI: http://localhost:${WEB_PORT}`);
    console.log(`[WebServer] WebSocket endpoint: ws://localhost:${WEB_PORT}`);
  });

  return httpServer;
}

module.exports = { startWebServer };
