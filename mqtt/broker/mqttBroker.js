// ============================================================================
// NovaPulse MQTT - Aedes Broker (MQTT 5.0)
// In-process MQTT broker with TCP (1883) + WebSocket (9001) transport
// ============================================================================

const aedes = require('aedes')();
const net = require('net');
const http = require('http');
const WebSocket = require('ws');
const chalk = require('chalk');

const MQTT_PORT = 1883;
const WS_PORT = 9001;

// ── Statistics ──────────────────────────────────────────────────────────────
const stats = {
  totalClients: 0,
  activeClients: 0,
  totalPublished: 0,
  totalSubscriptions: 0,
};

// ── Broker Events ───────────────────────────────────────────────────────────
aedes.on('client', (client) => {
  stats.totalClients++;
  stats.activeClients++;
  console.log(chalk.green(`  ● CLIENT CONNECTED: ${chalk.white.bold(client.id)}`));
  console.log(chalk.gray(`    Active: ${stats.activeClients} | Total: ${stats.totalClients}`));
});

aedes.on('clientDisconnect', (client) => {
  stats.activeClients = Math.max(0, stats.activeClients - 1);
  console.log(chalk.red(`  ○ CLIENT DISCONNECTED: ${chalk.white(client.id)}`));
});

aedes.on('subscribe', (subscriptions, client) => {
  stats.totalSubscriptions += subscriptions.length;
  subscriptions.forEach((sub) => {
    const isShared = sub.topic.startsWith('$share/');
    const isWildcard = sub.topic.includes('+') || sub.topic.includes('#');
    let badge = '';
    if (isShared) badge = chalk.magenta(' [SHARED]');
    else if (isWildcard) badge = chalk.yellow(' [WILDCARD]');

    console.log(chalk.cyan(`  ⬇ SUBSCRIBE: ${chalk.white(client?.id || '?')} → ${chalk.bold(sub.topic)} QoS${sub.qos}${badge}`));
  });
});

aedes.on('publish', (packet, client) => {
  if (!client) return; // System messages
  stats.totalPublished++;

  const isRetain = packet.retain;
  const qos = packet.qos;
  const hasUserProps = packet.properties?.userProperties;
  const hasAlias = packet.properties?.topicAlias;
  const hasExpiry = packet.properties?.messageExpiryInterval;

  let badges = `QoS${qos}`;
  if (isRetain) badges += chalk.yellow(' [RETAIN]');
  if (hasAlias) badges += chalk.blue(` [ALIAS:${hasAlias}]`);
  if (hasExpiry) badges += chalk.gray(` [TTL:${hasExpiry}s]`);
  if (hasUserProps) badges += chalk.magenta(' [PROPS]');

  // Only log non-heartbeat to reduce noise
  if (!packet.topic.includes('heartbeat')) {
    console.log(chalk.blue(`  ⬆ PUBLISH: ${chalk.white(client.id)} → ${chalk.bold(packet.topic)} ${badges}`));
  }
});

// ── LWT handling ────────────────────────────────────────────────────────────
aedes.on('clientError', (client, err) => {
  console.log(chalk.red(`  ✖ CLIENT ERROR: ${client.id} - ${err.message}`));
});

aedes.on('connackSent', (packet, client) => {
  // Check if client registered a will (LWT)
  if (client.will) {
    console.log(chalk.yellow(`  ⚡ LWT REGISTERED: ${client.id} → ${client.will.topic}`));
  }
});

// ── Start TCP Server ────────────────────────────────────────────────────────
const tcpServer = net.createServer(aedes.handle);
tcpServer.listen(MQTT_PORT, () => {
  console.log('');
  console.log(chalk.cyan.bold('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   ⚡ NovaPulse MQTT Broker (Aedes) - MQTT 5.0      ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╠══════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan.bold('  ║') + chalk.green(`   ▶ TCP Transport:       localhost:${MQTT_PORT}            `) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.green(`   ▶ WebSocket Transport: localhost:${WS_PORT}            `) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.yellow(`   ▶ Protocol:            MQTT 5.0                  `) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.magenta(`   ▶ Features:            All 10 MQTT features      `) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.gray('  Waiting for clients...'));
  console.log(chalk.gray('  ' + '─'.repeat(55)));
});

// ── Start WebSocket Server (for browser dashboard) ──────────────────────────
const httpServer = http.createServer();
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws, req) => {
  const stream = WebSocket.createWebSocketStream(ws);
  aedes.handle(stream);
});

httpServer.listen(WS_PORT, () => {
  console.log(chalk.blue(`  🌐 WebSocket server ready on port ${WS_PORT}`));
});

// ── Periodic stats log ──────────────────────────────────────────────────────
setInterval(() => {
  if (stats.activeClients > 0) {
    console.log(chalk.gray(`  📊 [STATS] Clients: ${stats.activeClients} | Published: ${stats.totalPublished} | Subscriptions: ${stats.totalSubscriptions}`));
  }
}, 30000);

// ── Graceful shutdown ───────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n  Shutting down broker...'));
  aedes.close(() => {
    tcpServer.close();
    httpServer.close();
    console.log(chalk.green('  Broker stopped.'));
    process.exit(0);
  });
});
