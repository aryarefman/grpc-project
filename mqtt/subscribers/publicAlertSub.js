// ============================================================================
// NovaPulse MQTT - Public Alert Subscriber (Subscriber 2)
// Subscribes to alert topics only using single-level wildcard (+)
// Features: Wildcard (+), Shared Subscription ($share), User Properties
// ============================================================================

const mqtt = require('mqtt');
const chalk = require('chalk');
const { WILDCARDS, SHARED_TOPICS } = require('../shared/topicRegistry');

// Support multiple instances for shared subscription demo
const instanceId = process.argv[2] || '1';
const CLIENT_ID = `novapulse-public-alert-${instanceId}`;

const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: CLIENT_ID,
  protocolVersion: 4,
  clean: true,
});

const stats = { total: 0, critical: 0, high: 0, medium: 0, low: 0, shared: 0 };

client.on('connect', () => {
  console.log('');
  console.log(chalk.yellow.bold('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.yellow.bold('  ║') + chalk.white.bold(`   📢 Public Alert System (Instance ${instanceId}) - ONLINE     `) + chalk.yellow.bold('║'));
  console.log(chalk.yellow.bold('  ╠══════════════════════════════════════════════════════╣'));
  console.log(chalk.yellow.bold('  ║') + chalk.cyan('   Role: Public notification for critical alerts'.padEnd(51)) + chalk.yellow.bold('║'));
  console.log(chalk.yellow.bold('  ║') + chalk.green('   Wildcard: novapulse/environment/+/alert'.padEnd(51)) + chalk.yellow.bold('║'));
  console.log(chalk.yellow.bold('  ║') + chalk.magenta('   Shared: $share/alert-workers/...alert/new'.padEnd(51)) + chalk.yellow.bold('║'));
  console.log(chalk.yellow.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');

  // Feature 2: Single-level wildcard (+) for environment alerts per zone
  client.subscribe(WILDCARDS.ALL_ENV_ALERTS, { qos: 2 }, (err) => {
    if (err) return console.error(chalk.red('  ✖ Subscribe failed'));
    console.log(chalk.green(`  ✅ Subscribed: ${chalk.bold(WILDCARDS.ALL_ENV_ALERTS)} [wildcard +]`));
  });

  // Feature 2: Single-level wildcard for traffic incidents
  client.subscribe(WILDCARDS.ALL_TRAFFIC_INCIDENTS, { qos: 2 }, () => {
    console.log(chalk.green(`  ✅ Subscribed: ${chalk.bold(WILDCARDS.ALL_TRAFFIC_INCIDENTS)} [wildcard +]`));
  });

  // Feature 9: Shared Subscription - load balanced emergency alerts
  // Multiple instances of this subscriber share the work
  client.subscribe(SHARED_TOPICS.EMERGENCY_ALERT_WORKERS, { qos: 2 }, () => {
    console.log(chalk.green(`  ✅ Subscribed: ${chalk.bold(SHARED_TOPICS.EMERGENCY_ALERT_WORKERS)} [SHARED]`));
  });

  // Also subscribe to emergency updates/resolved
  client.subscribe('novapulse/emergency/alert/update', { qos: 1 });
  client.subscribe('novapulse/emergency/alert/resolved', { qos: 1 });

  // Subscribe to LWT for publisher health
  client.subscribe('novapulse/system/status/+', { qos: 1 });

  // Announce shared subscription status (so dashboard can detect Feature 9)
  client.publish('novapulse/system/shared-subscription/status', JSON.stringify({
    subscriber: CLIENT_ID,
    instance: instanceId,
    sharedGroup: 'alert-workers',
    sharedTopic: SHARED_TOPICS.EMERGENCY_ALERT_WORKERS,
    status: 'ACTIVE',
    timestamp: Date.now(),
    _props: {
      userProperties: {
        'source': CLIENT_ID,
        'feature': 'shared-subscription',
        'group': 'alert-workers',
      },
    },
  }), { qos: 1, retain: true });

  console.log(chalk.gray('\n  ─── Alert Feed ────────────────────────────────────────'));
  console.log('');
});

client.on('message', (topic, payload, packet) => {
  stats.total++;

  let data;
  try { data = JSON.parse(payload.toString()); } catch { data = payload.toString(); }

  const userProps = data._props?.userProperties || {};
  const isRetained = packet.retain;
  const isShared = topic.includes('emergency/alert/new');
  if (isShared) stats.shared++;

  // ── LWT / Status messages ────────────────────────────────────────────
  if (topic.startsWith('novapulse/system/status/')) {
    if (data.status === 'OFFLINE') {
      console.log(chalk.bgRed.white.bold(`  ⚠️  SYSTEM ALERT: ${data.publisher || 'Unknown'} is OFFLINE  `));
      console.log(chalk.red(`     ${data.message || 'Connection lost'}`));
    } else if (data.status === 'ONLINE') {
      console.log(chalk.bgGreen.black(`  ✅ System: ${data.publisher || 'Unknown'} is ONLINE  `));
    }
    console.log('');
    return;
  }

  // ── Emergency alert resolved ──────────────────────────────────────────
  if (topic.includes('alert/resolved')) {
    console.log(chalk.green.bold(`  ✅ ALERT RESOLVED: ${data.alert_id}`));
    console.log(chalk.green(`     Resolved by: ${data.resolved_by} | ${data.resolution}`));
    console.log('');
    return;
  }

  // ── Emergency alert update ────────────────────────────────────────────
  if (topic.includes('alert/update')) {
    console.log(chalk.yellow(`  🔄 ALERT UPDATE: ${data.alert_id} → ${data.status}`));
    console.log('');
    return;
  }

  // ── Alert Processing ─────────────────────────────────────────────────
  const severity = data.severity || userProps.severity || 'UNKNOWN';

  // Count by severity
  if (severity === 'CRITICAL') stats.critical++;
  else if (severity === 'HIGH') stats.high++;
  else if (severity === 'MEDIUM') stats.medium++;
  else stats.low++;

  // Build alert notification
  const severityColors = {
    CRITICAL: chalk.bgRed.white.bold, HIGH: chalk.red.bold,
    MEDIUM: chalk.yellow, LOW: chalk.gray,
  };
  const colorFn = severityColors[severity] || chalk.white;
  const sharedBadge = isShared ? chalk.magenta(' [SHARED]') : '';
  const retainBadge = isRetained ? chalk.yellow(' [RETAIN]') : '';
  const qosBadge = chalk.blue(` QoS${packet.qos}`);

  console.log(chalk.white('  ┌─────────────────────────────────────────────────────'));
  console.log(colorFn(`  │ 🔔 ALERT: ${severity}${sharedBadge}${retainBadge}${qosBadge}`));
  console.log(chalk.white(`  │ Topic: ${topic}`));

  if (data.alert_id) {
    console.log(chalk.white(`  │ ID: ${data.alert_id} | Type: ${data.type}`));
    console.log(chalk.white(`  │ Location: ${data.location || data.zone}`));
    console.log(chalk.white(`  │ ${data.description || data.message}`));
  } else if (data.sensor_id) {
    console.log(chalk.white(`  │ Sensor: ${data.sensor_name} (${data.type})`));
    console.log(chalk.white(`  │ Value: ${data.value}${data.unit} | Threshold: ${data.threshold}`));
    console.log(chalk.white(`  │ ${data.message}`));
  }

  // Show user properties (Feature 4)
  if (Object.keys(userProps).length > 0) {
    console.log(chalk.gray(`  │ Props: ${Object.entries(userProps).map(([k, v]) => `${k}=${v}`).join(', ')}`));
  }

  console.log(chalk.white('  └─────────────────────────────────────────────────────'));
  console.log('');

  // Periodic stats
  if (stats.total % 20 === 0) {
    console.log(chalk.yellow.bold(`  📊 Stats: Total=${stats.total} | Critical=${stats.critical} | High=${stats.high} | Medium=${stats.medium} | Low=${stats.low} | Shared=${stats.shared}`));
    console.log('');
  }
});

client.on('error', (err) => console.error(chalk.red(`  ✖ Error: ${err.message}`)));
process.on('SIGINT', () => {
  console.log(chalk.yellow(`\n  📊 Final Stats (Instance ${instanceId}): Total=${stats.total} | Shared=${stats.shared}`));
  client.end(true);
  process.exit(0);
});
