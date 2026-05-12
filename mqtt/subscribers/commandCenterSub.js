// ============================================================================
// NovaPulse MQTT - City Command Center Subscriber (Subscriber 1)
// MQTT 5.0: Wildcard (#), User Properties from packet, Request-Response
//           targeted per-publisher, LWT monitoring
// ============================================================================

const mqtt = require('mqtt');
const chalk = require('chalk');
const { WILDCARDS, TOPICS } = require('../shared/topicRegistry');
const { FLOW_CONTROL } = require('../shared/mqttFeatures');
const RequestSender = require('../shared/requestSender');

const CLIENT_ID = 'novapulse-command-center';

const brokerUrl = process.env.MQTT_URL || 'mqtt://localhost:1884';
const client = mqtt.connect(brokerUrl, {
  clientId: CLIENT_ID,
  protocolVersion: 4,    // FIX: MQTT 5.0
  clean: true,
  // FIX Masalah 4: Flow Control di connection level
  
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
  console.log(chalk.magenta.bold('  ║') + chalk.green('   Protocol: MQTT 5.0 | Flow Control: ON'.padEnd(51)) + chalk.magenta.bold('║'));
  console.log(chalk.magenta.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');

  reqRes = new RequestSender(client);

  // Wildcard (#) - subscribe to ALL topics
  client.subscribe(WILDCARDS.ALL, { qos: 1 }, (err) => {
    if (err) return console.error(chalk.red('  ✖ Subscribe failed:', err.message));
    console.log(chalk.green(`  ✅ Subscribed: ${chalk.bold(WILDCARDS.ALL)} (all NovaPulse messages)`));
  });

  client.subscribe(WILDCARDS.ALL_SYSTEM_STATUS, { qos: 1 }, () => {
    console.log(chalk.green(`  ✅ Subscribed: ${chalk.bold(WILDCARDS.ALL_SYSTEM_STATUS)} (LWT monitor)`));
  });

  console.log(chalk.gray('\n  ─── Live Message Feed ─────────────────────────────────'));
  console.log('');

  startCommandLoop();
});

client.on('message', (topic, payload, packet) => {
  stats.totalMessages++;
  stats.byQoS[packet.qos]++;

  if (topic.startsWith('novapulse/system/command/response/')) return;
  if (topic.startsWith('novapulse/system/command/request/')) return;

  let data;
  try { data = JSON.parse(payload.toString()); } catch { data = payload.toString(); }

  const qos = packet.qos;
  const isRetained = packet.retain;

  // Fallback to simulated MQTT 5.0 properties from JSON body for v4 compatibility
  const userProps = data._props || packet.properties?.userProperties || {};
  const expiry = data._ttl || packet.properties?.messageExpiryInterval;
  const expiryAbsolute = data._expiry;

  // Simulate broker-side expiry
  if (expiryAbsolute && Date.now() > expiryAbsolute) return;

  if (isRetained) stats.retainedReceived++;

  const category = categorize(topic);
  stats.byType[category] = (stats.byType[category] || 0) + 1;

  const qosBadge = qos === 2 ? chalk.bgYellow.black(` QoS${qos} `) : qos === 1 ? chalk.bgBlue.white(` QoS${qos} `) : chalk.bgGray.white(` QoS${qos} `);
  const retainBadge = isRetained ? chalk.bgYellow.black(' RETAIN ') : '';
  const expiryBadge = expiry ? chalk.gray(` TTL:${expiry}s`) : '';

  const colors = {
    traffic: chalk.cyan, environment: chalk.green, emergency: chalk.red,
    system: chalk.gray, heartbeat: chalk.gray, lwt: chalk.bgRed.white,
  };
  const color = colors[category] || chalk.white;

  if (category === 'heartbeat') return;

  // LWT detection - MQTT 5.0: userProperties dari packet.properties
  if (topic.startsWith('novapulse/system/status/') && data.status === 'OFFLINE') {
    stats.lwtEvents++;
    const alertLevel = userProps['alert-level'] || 'UNKNOWN';
    console.log(chalk.bgRed.white.bold(`  ⚠️  LWT: ${data.publisher || topic} went OFFLINE! [${alertLevel}]  `));
    console.log(chalk.red(`     Message: ${data.message || 'Unexpected disconnect'}`));
    console.log('');
    return;
  }

  if (topic.startsWith('novapulse/system/status/') && data.status === 'ONLINE') {
    console.log(chalk.bgGreen.black(`  ✅ PUBLISHER ONLINE: ${data.publisher || topic}  `));
    console.log('');
    return;
  }

  if (topic.includes('system/external')) {
    console.log(chalk.bgMagenta.white.bold(`  ⚠️  EXTERNAL SIGNAL DETECTED!  `));
    console.log(chalk.magenta(`     Source: ${data.publisher} | Message: ${data.message}`));
    console.log('');
  }

  const icon = category === 'traffic' ? '🚦' : category === 'environment' ? '🌿' : category === 'emergency' ? '🚨' : '📡';
  console.log(color(`  ${icon} ${qosBadge}${retainBadge}${expiryBadge} ${chalk.bold(topic)}`));

  if (category === 'emergency' && data.alert_id) {
    stats.alertsReceived++;
    // Bedakan alert baru (punya type+severity+location) vs update/dispatch (hanya status)
    if (data.type && data.severity && data.location) {
      console.log(chalk.red(`     Alert: ${data.alert_id} | ${data.severity} ${data.type} at ${data.location}`));
    } else if (data.status) {
      console.log(chalk.red(`     Alert: ${data.alert_id} | Status: ${data.status}${data.unit_assigned ? ` | Unit: ${data.unit_assigned}` : ''}${data.resolved_by ? ` | By: ${data.resolved_by}` : ''}`));
    } else {
      console.log(chalk.red(`     Alert: ${data.alert_id}`));
    }
  } else if (category === 'traffic' && data.intersection_id) {
    const detail = data.incident_id ? `INCIDENT: ${data.type} [${data.severity}]` : `Congestion: ${data.congestion_level} | Vehicles: ${data.vehicle_count}`;
    console.log(chalk.cyan(`     ${detail} | ${data.name || ''}`));
  } else if (category === 'environment' && data.sensor_id) {
    console.log(chalk.green(`     ${data.name}: ${data.value}${data.unit} [${data.quality}]`));
  }

  // MQTT 5.0: User properties dari packet level
  if (Object.keys(userProps).length > 0) {
    const propsStr = Object.entries(userProps).map(([k, v]) => `${k}=${v}`).join(' | ');
    console.log(chalk.gray(`     Props: ${propsStr}`));
  }

  console.log('');

  if (stats.totalMessages % 50 === 0) printStats();
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

// ── FIX Masalah 3: Request-Response targeted ke publisher spesifik ──────────
function startCommandLoop() {
  const publishers = ['traffic-publisher', 'environment-publisher', 'emergency-publisher'];
  let currentIdx = 0;

  setTimeout(async () => {
    // First request: query traffic publisher specifically
    const target = publishers[currentIdx];
    console.log(chalk.yellow.bold(`  ⟶  Sending GET_STATUS → ${target}`));
    try {
      const response = await reqRes.sendRequest(target, 'GET_STATUS', {}, 5000);
      console.log(chalk.green(`  ⟵  Response from ${target}:`));
      console.log(chalk.white(`     ${JSON.stringify(response, null, 0).substring(0, 120)}...`));
      console.log('');
    } catch (err) {
      console.log(chalk.gray(`  ⟵  ${err.message}`));
    }

    // Rotate through publishers every 30 seconds
    setInterval(async () => {
      currentIdx = (currentIdx + 1) % publishers.length;
      const pub = publishers[currentIdx];
      try {
        console.log(chalk.yellow(`  ⟶  Request: GET_STATUS → ${pub}`));
        const res = await reqRes.sendRequest(pub, 'GET_STATUS', {}, 5000);
        console.log(chalk.green(`  ⟵  Response from ${pub}: status=${res.status}, uptime=${Math.round(res.uptime)}s`));
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