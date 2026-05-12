// ============================================================================
// Web Server - Serves the NovaPulse Web UI + WebSocket endpoint
// Port: 3020 (Migrated from 3000/3010 to avoid conflicts)
// ============================================================================

const express = require('express');
const http    = require('http');
const path    = require('path');
const chalk   = require('chalk');
const { attachWebSocket } = require('./websocketBridge');

const WEB_PORT = process.env.WEB_PORT || 3020;

function startWebServer() {
  const app = express();

  // Serve static web UI from /web directory
  app.use(express.static(path.join(__dirname, '..', 'web')));

  // Fallback: always serve index.html for SPA (Universal fallback for Express 5)
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'web', 'index.html'));
  });

  const httpServer = http.createServer(app);

  // Attach WebSocket bridge
  attachWebSocket(httpServer);

  const server = httpServer.listen(WEB_PORT, '0.0.0.0', () => {
    console.log(chalk.cyan(`  [✔] [WebServer] NovaPulse Web UI: http://localhost:${WEB_PORT}`));
    console.log(chalk.gray(`  [i] [WebServer] Serving static files from: ${path.join(__dirname, '..', 'web')}`));
  });

  server.on('error', (err) => {
    console.error(chalk.red(`  [✖] [WebServer] Failed to start: ${err.message}`));
    if (err.code === 'EADDRINUSE') {
      console.error(chalk.yellow(`  [!] Port ${WEB_PORT} is already in use. Try killing the process or using another port.`));
    }
  });

  return server;
}

module.exports = { startWebServer };
