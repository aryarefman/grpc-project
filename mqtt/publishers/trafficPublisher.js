// ============================================================================
// NovaPulse MQTT - Traffic Sensor Publisher (Publisher 1)
// Publishes: congestion data, traffic light changes, incidents
// Features: QoS 0/1/2, Topic Alias, User Properties, Retain, Expiry, LWT,
//           Request-Response, Flow Control
// ============================================================================

const mqtt = require('mqtt');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
const { TOPICS, ZONES } = require('../shared/topicRegistry');
const { QOS, EXPIRY, FlowControlledPublisher } = require('../shared/mqttFeatures');
const RequestResponseHandler = require('../shared/requestResponse');

const CLIENT_ID = 'novapulse-traffic-publisher';

// ── Simulated intersection data ─────────────────────────────────────────────
const intersections = [
  { id: 'INT-001', name: 'Jl. Sudirman × Jl. Thamrin', zone: 'CENTRAL', light: 'GREEN', vehicles: 45, congestion: 0.3 },
  { id: 'INT-002', name: 'Jl. Gatot Subroto × Jl. Rasuna Said', zone: 'SOUTH', light: 'RED', vehicles: 120, congestion: 0.8 },
  { id: 'INT-003', name: 'Jl. MH Thamrin × Jl. Kebon Sirih', zone: 'CENTRAL', light: 'GREEN', vehicles: 30, congestion: 0.2 },
  { id: 'INT-004', name: 'Jl. Ahmad Yani × Jl. Pemuda', zone: 'NORTH', light: 'YELLOW', vehicles: 85, congestion: 0.6 },
  { id: 'INT-005', name: 'Jl. Diponegoro × Jl. Imam Bonjol', zone: 'WEST', light: 'RED', vehicles: 95, congestion: 0.7 },
  { id: 'INT-006', name: 'Jl. Casablanca × Jl. Prof. Dr. Satrio', zone: 'EAST', light: 'GREEN', vehicles: 60, congestion: 0.4 },
];

// ── Connect with LWT (Last Will & Testament) ───────────────────────────────
const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: CLIENT_ID,
  protocolVersion: 4,
  clean: true,
  will: {
    topic: TOPICS.SYSTEM.STATUS('traffic-publisher'),
    payload: JSON.stringify({
      publisher: CLIENT_ID,
      status: 'OFFLINE',
      lastSeen: Date.now(),
      message: '⚠️ Traffic Sensor System disconnected unexpectedly!',
      _props: { userProperties: { 'alert-level': 'CRITICAL', 'source': CLIENT_ID } }
    }),
    qos: 1,
    retain: true,
  },
});

let flowCtrl;
let reqResHandler;
let publishCount = 0;

client.on('connect', () => {
  console.log('');
  console.log(chalk.cyan.bold('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   🚦 Traffic Sensor Publisher - ONLINE              ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╠══════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan.bold('  ║') + chalk.green('   ClientID: ' + CLIENT_ID.padEnd(38)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.yellow('   Protocol: MQTT 5.0 | LWT: Registered'.padEnd(51)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.magenta('   Features: QoS, Alias, Props, Retain, Expiry'.padEnd(51)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');

  // Announce online status (retained)
  client.publish(TOPICS.SYSTEM.STATUS('traffic-publisher'),
    JSON.stringify({ 
      publisher: CLIENT_ID, status: 'ONLINE', startedAt: Date.now(),
      _props: { userProperties: { 'source': CLIENT_ID } }
    }),
    { qos: 1, retain: true }
  );

  flowCtrl = new FlowControlledPublisher(client);
  reqResHandler = new RequestResponseHandler(client);

  // Handle request-response (Feature 8)
  reqResHandler.setupRequestHandler((request) => {
    console.log(chalk.yellow(`  ⟵ REQUEST received: ${request.command}`));
    if (request.command === 'GET_STATUS') {
      return { status: 'OK', publisher: CLIENT_ID, uptime: process.uptime(), intersections: intersections.length, publishCount, flowControl: flowCtrl.getStats() };
    }
    if (request.command === 'GET_INTERSECTIONS') {
      return { intersections };
    }
    return { error: 'Unknown command' };
  });

  // Start publishing
  startCongestionPublisher();
  startLightChangePublisher();
  startIncidentPublisher();
  startSummaryPublisher();
  startHeartbeat();
});

// ── Congestion Data (QoS 0 - high frequency, fire-and-forget) ──────────────
function startCongestionPublisher() {
  setInterval(() => {
    const intersection = intersections[Math.floor(Math.random() * intersections.length)];
    const delta = Math.floor(Math.random() * 20) - 10;
    intersection.vehicles = Math.max(0, Math.min(200, intersection.vehicles + delta));
    intersection.congestion = Math.min(1.0, intersection.vehicles / 180);

    const topic = TOPICS.TRAFFIC.CONGESTION(intersection.zone);
    const payload = JSON.stringify({
      intersection_id: intersection.id,
      name: intersection.name,
      zone: intersection.zone,
      vehicle_count: intersection.vehicles,
      congestion_level: Math.round(intersection.congestion * 100) / 100,
      status: intersection.congestion > 0.7 ? 'CONGESTED' : 'NORMAL',
      timestamp: Date.now(),
      _props: {
        messageExpiryInterval: EXPIRY.TRAFFIC_CONGESTION,
        userProperties: {
          'source': CLIENT_ID,
          'zone': intersection.zone,
          'priority': intersection.congestion > 0.7 ? 'HIGH' : 'NORMAL',
          'unit': 'vehicles',
          'data-type': 'congestion',
        },
      }
    });

    // Feature 1: QoS 0
    flowCtrl.publish(topic, payload, { qos: QOS.AT_MOST_ONCE });
    publishCount++;

    if (publishCount % 50 === 0) {
      const s = flowCtrl.getStats();
      console.log(chalk.gray(`  📊 Published: ${publishCount} | Inflight: ${s.inflight}/${s.maxInflight} | Queue: ${s.queueDepth}`));
    }
  }, 2000);
}

// ── Light Changes (QoS 1 - at-least-once) ───────────────────────────────────
function startLightChangePublisher() {
  setInterval(() => {
    const intersection = intersections[Math.floor(Math.random() * intersections.length)];
    const lights = ['RED', 'YELLOW', 'GREEN'];
    const prevLight = intersection.light;
    intersection.light = lights[(lights.indexOf(intersection.light) + 1) % 3];

    const topic = TOPICS.TRAFFIC.LIGHT_CHANGE(intersection.zone);
    const payload = JSON.stringify({
      intersection_id: intersection.id,
      name: intersection.name,
      zone: intersection.zone,
      previous_light: prevLight,
      current_light: intersection.light,
      timestamp: Date.now(),
      _props: {
        messageExpiryInterval: EXPIRY.TRAFFIC_LIGHT,
        userProperties: {
          'source': CLIENT_ID,
          'zone': intersection.zone,
          'event-type': 'light-change',
          'intersection': intersection.id,
        },
      }
    });

    // Feature 1: QoS 1
    flowCtrl.publish(topic, payload, { qos: QOS.AT_LEAST_ONCE });
    publishCount++;
    console.log(chalk.green(`  🚦 Light: ${intersection.name} ${prevLight} → ${chalk.bold(intersection.light)}`));
  }, 8000);
}

// ── Incidents (QoS 2 - exactly once, critical) ─────────────────────────────
function startIncidentPublisher() {
  setInterval(() => {
    if (Math.random() > 0.3) return; // 30% chance

    const intersection = intersections[Math.floor(Math.random() * intersections.length)];
    const types = ['ACCIDENT', 'ROADBLOCK', 'CONSTRUCTION', 'FLOODING'];
    const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const type = types[Math.floor(Math.random() * types.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];

    const topic = TOPICS.TRAFFIC.INCIDENT(intersection.zone);
    const payload = JSON.stringify({
      incident_id: `INC-${uuidv4().substring(0, 8).toUpperCase()}`,
      intersection_id: intersection.id,
      name: intersection.name,
      zone: intersection.zone,
      type,
      severity,
      description: `${type} reported at ${intersection.name}`,
      timestamp: Date.now(),
      _props: {
        messageExpiryInterval: EXPIRY.TRAFFIC_INCIDENT,
        userProperties: {
          'source': CLIENT_ID,
          'zone': intersection.zone,
          'severity': severity,
          'incident-type': type,
          'priority': severity === 'CRITICAL' ? 'URGENT' : 'NORMAL',
        },
      }
    });

    // Feature 1: QoS 2 (exactly-once)
    flowCtrl.publish(topic, payload, { qos: QOS.EXACTLY_ONCE });
    publishCount++;
    console.log(chalk.red(`  🚨 INCIDENT [${severity}]: ${type} at ${intersection.name}`));
  }, 15000);
}

// ── Summary (QoS 1, Retained) ───────────────────────────────────────────────
function startSummaryPublisher() {
  setInterval(() => {
    const summary = {
      total_intersections: intersections.length,
      zones: {},
      avg_congestion: 0,
      total_vehicles: 0,
      generated_at: Date.now(),
    };
    intersections.forEach(i => {
      if (!summary.zones[i.zone]) summary.zones[i.zone] = { count: 0, avg_congestion: 0, vehicles: 0 };
      summary.zones[i.zone].count++;
      summary.zones[i.zone].avg_congestion += i.congestion;
      summary.zones[i.zone].vehicles += i.vehicles;
      summary.total_vehicles += i.vehicles;
      summary.avg_congestion += i.congestion;
    });
    summary.avg_congestion = Math.round((summary.avg_congestion / intersections.length) * 100) / 100;
    Object.keys(summary.zones).forEach(z => {
      summary.zones[z].avg_congestion = Math.round((summary.zones[z].avg_congestion / summary.zones[z].count) * 100) / 100;
    });

    // Feature 5: Retain (new subscribers get latest summary instantly)
    summary._props = {
      messageExpiryInterval: EXPIRY.SUMMARY,
      userProperties: { 'source': CLIENT_ID, 'data-type': 'summary', 'retained': 'true' },
    };
    client.publish(TOPICS.TRAFFIC.SUMMARY, JSON.stringify(summary), {
      qos: QOS.AT_LEAST_ONCE,
      retain: true,
    });
    publishCount++;
    console.log(chalk.blue(`  📋 Summary published (retained) | Vehicles: ${summary.total_vehicles} | Avg congestion: ${summary.avg_congestion}`));
  }, 10000);
}

// ── Heartbeat ───────────────────────────────────────────────────────────────
function startHeartbeat() {
  setInterval(() => {
    client.publish(TOPICS.SYSTEM.HEARTBEAT, JSON.stringify({
      publisher: CLIENT_ID,
      type: 'traffic',
      uptime: process.uptime(),
      publishCount,
      timestamp: Date.now(),
      _props: {
        messageExpiryInterval: EXPIRY.SYSTEM_HEARTBEAT,
        userProperties: { 'source': CLIENT_ID, 'type': 'heartbeat' },
      }
    }), { qos: QOS.AT_MOST_ONCE });
  }, 5000);
}

client.on('error', (err) => console.error(chalk.red(`  ✖ Error: ${err.message}`)));
client.on('offline', () => console.log(chalk.yellow('  ⚠ Publisher offline')));

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n  Shutting down Traffic Publisher...'));
  client.publish(TOPICS.SYSTEM.STATUS('traffic-publisher'),
    JSON.stringify({ publisher: CLIENT_ID, status: 'OFFLINE', stoppedAt: Date.now() }),
    { qos: 1, retain: true }, () => { client.end(true); process.exit(0); }
  );
});
