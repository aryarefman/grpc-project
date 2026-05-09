// ============================================================================
// NovaPulse MQTT - City Command Center Subscriber (Subscriber 1)
// Subscribes to ALL topics using wildcard #
// Features: Wildcard (#), User Properties parsing, Request-Response sender,
//           LWT monitoring, Shared Subscription awareness
// ============================================================================

const mqtt = require('mqtt');
const chalk = require('chalk');
const { WILDCARDS, TOPICS } = require('../shared/topicRegistry');
const RequestResponseHandler = require('../shared/requestResponse');

const CLIENT_ID = 'novapulse-command-center';

const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: CLIENT_ID,
  protocolVersion: 4,
  clean: true,
});

let reqRes;
const stats = {
  totalMessages: 0,
  byQoS: { 0: 0, 1: 0, 2: 0 },
  byType: {},
  retainedReceived: 0,
  alertsReceived: 0,
  lwtEvents: 0,
};

client.on('connect', () => {
  console.log('');
  console.log(chalk.magenta.bold('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.magenta.bold('  ║') + chalk.white.bold('   🏛️  City Command Center - ONLINE                 ') + chalk.magenta.bold('║'));
  console.log(chalk.magenta.bold('  ╠══════════════════════════════════════════════════════╣'));
  console.log(chalk.magenta.bold('  ║') + chalk.cyan('   Role: Central monitoring & orchestration'.padEnd(51)) + chalk.magenta.bold('║'));
  console.log(chalk.magenta.bold('  ║') + chalk.yellow('   Wildcard: novapulse/# (ALL messages)'.padEnd(51)) + chalk.magenta.bold('║'));
  console.log(chalk.magenta.bold('  ║') + chalk.green('   Features: Wildcard, Req/Res, LWT Monitor'.padEnd(51)) + chalk.magenta.bold('║'));
  console.log(chalk.magenta.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');

  reqRes = new RequestResponseHandler(client);

  // Feature 2: Multi-level wildcard (#) - subscribe to ALL topics
  client.subscribe(WILDCARDS.ALL, { qos: 1 }, (err) => {
    if (err) return console.error(chalk.red('  ✖ Subscribe failed:', err.message));
    console.log(chalk.green(`  ✅ Subscribed: ${chalk.bold(WILDCARDS.ALL)} (all NovaPulse messages)`));
  });

  // Also subscribe to system status for LWT monitoring
  client.subscribe(WILDCARDS.ALL_SYSTEM_STATUS, { qos: 1 }, () => {
    console.log(chalk.green(`  ✅ Subscribed: ${chalk.bold(WILDCARDS.ALL_SYSTEM_STATUS)} (LWT monitor)`));
  });

  console.log(chalk.gray('\n  ─── Live Message Feed ─────────────────────────────────'));
  console.log('');

  // Periodically send request-response commands
  startCommandLoop();
});

client.on('message', (topic, payload, packet) => {
  stats.totalMessages++;
  stats.byQoS[packet.qos]++;

  // Handle request-response replies
  if (reqRes && reqRes.handleResponse(topic, payload, packet)) return;

  let data;
  try { data = JSON.parse(payload.toString()); } catch { data = payload.toString(); }

  const qos = packet.qos;
  const isRetained = packet.retain;
  const userProps = data._props?.userProperties || {};
  const expiry = data._props?.messageExpiryInterval;

  if (isRetained) stats.retainedReceived++;

  // Categorize message
  const category = categorize(topic);
  stats.byType[category] = (stats.byType[category] || 0) + 1;

  // ── Format output ───────────────────────────────────────────────────────
  const qosBadge = qos === 2 ? chalk.bgYellow.black(` QoS${qos} `) : qos === 1 ? chalk.bgBlue.white(` QoS${qos} `) : chalk.bgGray.white(` QoS${qos} `);
  const retainBadge = isRetained ? chalk.bgYellow.black(' RETAIN ') : '';
  const expiryBadge = expiry ? chalk.gray(` TTL:${expiry}s`) : '';

  // Color by category
  const colors = {
    traffic: chalk.cyan, environment: chalk.green, emergency: chalk.red,
    system: chalk.gray, heartbeat: chalk.gray, lwt: chalk.bgRed.white,
  };
  const color = colors[category] || chalk.white;

  // Skip heartbeats for cleaner output
  if (category === 'heartbeat') return;

  // LWT detection
  if (topic.startsWith('novapulse/system/status/') && data.status === 'OFFLINE') {
    stats.lwtEvents++;
    console.log(chalk.bgRed.white.bold(`  ⚠️  LWT: ${data.publisher || topic} went OFFLINE!  `));
    console.log(chalk.red(`     Message: ${data.message || 'Unexpected disconnect'}`));
    console.log('');
    return;
  }

  if (topic.startsWith('novapulse/system/status/') && data.status === 'ONLINE') {
    console.log(chalk.bgGreen.black(`  ✅ PUBLISHER ONLINE: ${data.publisher || topic}  `));
    console.log('');
    return;
  }

  // Print message
  const icon = category === 'traffic' ? '🚦' : category === 'environment' ? '🌿' : category === 'emergency' ? '🚨' : '📡';
  console.log(color(`  ${icon} ${qosBadge}${retainBadge}${expiryBadge} ${chalk.bold(topic)}`));

  // Print key info based on category
  if (category === 'emergency' && data.alert_id) {
    stats.alertsReceived++;
    console.log(chalk.red(`     Alert: ${data.alert_id} | ${data.severity} ${data.type} at ${data.location}`));
  } else if (category === 'traffic' && data.intersection_id) {
    const detail = data.incident_id ? `INCIDENT: ${data.type} [${data.severity}]` : `Congestion: ${data.congestion_level} | Vehicles: ${data.vehicle_count}`;
    console.log(chalk.cyan(`     ${detail} | ${data.name || ''}`));
  } else if (category === 'environment' && data.sensor_id) {
    console.log(chalk.green(`     ${data.name}: ${data.value}${data.unit} [${data.quality}]`));
  }

  // Print user properties if present
  if (Object.keys(userProps).length > 0) {
    const propsStr = Object.entries(userProps).map(([k, v]) => `${k}=${v}`).join(' | ');
    console.log(chalk.gray(`     Props: ${propsStr}`));
  }

  console.log('');

  // Periodic stats
  if (stats.totalMessages % 50 === 0) {
    printStats();
  }
});

function categorize(topic) {
  if (topic.includes('heartbeat')) return 'heartbeat';
  if (topic.includes('system/status')) return 'lwt';
  if (topic.includes('traffic')) return 'traffic';
  if (topic.includes('environment')) return 'environment';
  if (topic.includes('emergency')) return 'emergency';
  return 'system';
}

function printStats() {
  console.log(chalk.cyan.bold('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   📊 Command Center Statistics'.padEnd(51)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╠══════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan.bold('  ║') + chalk.white(`   Total Messages:  ${stats.totalMessages}`.padEnd(51)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.gray(`   QoS 0: ${stats.byQoS[0]} | QoS 1: ${stats.byQoS[1]} | QoS 2: ${stats.byQoS[2]}`.padEnd(51)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.yellow(`   Retained: ${stats.retainedReceived} | LWT Events: ${stats.lwtEvents}`.padEnd(51)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.red(`   Alerts: ${stats.alertsReceived}`.padEnd(51)) + chalk.cyan.bold('║'));
  const typeStr = Object.entries(stats.byType).map(([k, v]) => `${k}:${v}`).join(' | ');
  console.log(chalk.cyan.bold('  ║') + chalk.green(`   ${typeStr}`.padEnd(51)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');
}

// ── Request-Response: periodically query publishers (Feature 8) ─────────────
function startCommandLoop() {
  setTimeout(async () => {
    console.log(chalk.yellow.bold('  ⟶  Sending Request-Response command: GET_STATUS'));
    try {
      const response = await reqRes.sendRequest('GET_STATUS', {}, 5000);
      console.log(chalk.green('  ⟵  Response received:'));
      console.log(chalk.white(`     ${JSON.stringify(response, null, 0).substring(0, 120)}...`));
      console.log('');
    } catch (err) {
      console.log(chalk.gray(`  ⟵  ${err.message}`));
    }

    // Repeat every 30 seconds
    setInterval(async () => {
      try {
        console.log(chalk.yellow('  ⟶  Request: GET_STATUS'));
        const res = await reqRes.sendRequest('GET_STATUS', {}, 5000);
        console.log(chalk.green(`  ⟵  Response: status=${res.status}, uptime=${Math.round(res.uptime)}s`));
      } catch (err) {
        console.log(chalk.gray(`  ⟵  ${err.message}`));
      }
    }, 30000);
  }, 10000);
}

client.on('error', (err) => console.error(chalk.red(`  ✖ Error: ${err.message}`)));
process.on('SIGINT', () => {
  printStats();
  client.end(true);
  process.exit(0);
});
