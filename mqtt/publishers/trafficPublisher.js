// ============================================================================
// NovaPulse MQTT - Traffic Sensor Publisher (Publisher 1)
// Publishes: congestion data, traffic light changes, incidents
// MQTT Features: QoS 0/1/2, Message Expiry, User Properties, Retain,
//                LWT, Request-Response, Flow Control (Fitur 10)
// ============================================================================

const mqtt = require('mqtt');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
const { TOPICS, ZONES, TOPIC_ALIASES } = require('../shared/topicRegistry');
const { QOS, EXPIRY, FLOW_CONTROL, LWT_PROPERTIES } = require('../shared/mqttFeatures');
const ResponseHandler = require('../shared/responseHandler');
const FlowController = require('../shared/flowController');

const CLIENT_ID = 'novapulse-traffic-publisher';
const PUBLISHER_ID = 'traffic-publisher';

// ── Simulated intersection data ─────────────────────────────────────────────
const intersections = [
  { id: 'INT-001', name: 'Broadway × 5th Ave', zone: 'MANHATTAN', light: 'GREEN', vehicles: 45, congestion: 0.3 },
  { id: 'INT-002', name: 'Times Square', zone: 'MANHATTAN', light: 'RED', vehicles: 120, congestion: 0.8 },
  { id: 'INT-003', name: 'Flatbush Ave × Atlantic Ave', zone: 'BROOKLYN', light: 'GREEN', vehicles: 30, congestion: 0.2 },
  { id: 'INT-004', name: 'Queens Blvd × Woodhaven Blvd', zone: 'QUEENS', light: 'YELLOW', vehicles: 85, congestion: 0.6 },
  { id: 'INT-005', name: 'Grand Concourse × Fordham Rd', zone: 'BRONX', light: 'RED', vehicles: 95, congestion: 0.7 },
  { id: 'INT-006', name: 'Canal St × Bowery', zone: 'MANHATTAN', light: 'GREEN', vehicles: 60, congestion: 0.4 },
];

// ── Connect dengan MQTT 3.1.1 + LWT ────────────────────────────────────────
// Fitur 10: Flow Control diimplementasikan di level aplikasi (FlowController)
// karena Aedes broker belum support MQTT 5.0 connect properties secara penuh.
const brokerUrl = process.env.MQTT_URL || 'mqtt://localhost:1884';
const client = mqtt.connect(brokerUrl, {
  clientId: CLIENT_ID,
  protocolVersion: 4,    // MQTT 3.1.1 (Aedes compatible)
  clean: true,

  // ── Fitur 7: LWT ─────────────────────────────────────────────────────────
  will: {
    topic: TOPICS.SYSTEM.STATUS(PUBLISHER_ID),
    payload: JSON.stringify({
      publisher: CLIENT_ID,
      status: 'OFFLINE',
      message: '⚠️ Traffic Sensor System disconnected unexpectedly!',
    }),
    qos: 1,
    retain: true,
    properties: {
      willDelayInterval: LWT_PROPERTIES.WILL_DELAY_INTERVAL,
      messageExpiryInterval: LWT_PROPERTIES.WILL_EXPIRY_INTERVAL,
      userProperties: { 'alert-level': 'CRITICAL', 'source': CLIENT_ID },
    },
  },
});

let publishCount = 0;

// ── Fitur 10: Flow Controller ───────────────────────────────────────────────
// Mensimulasikan MQTT 5.0 receiveMaximum: max QoS 1/2 in-flight bersamaan.
// FlowController tracking ACK via packetsend/packetreceive events.
let flowCtrl;

client.on('connect', () => {
  // Inisialisasi Flow Controller setelah connect
  flowCtrl = new FlowController(client, CLIENT_ID, FLOW_CONTROL.RECEIVE_MAXIMUM);
  flowCtrl.startPeriodicLog(30000);

  console.log('');
  console.log(chalk.cyan.bold('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   🚦 Traffic Sensor Publisher - ONLINE              ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╠══════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan.bold('  ║') + chalk.green('   ClientID: ' + CLIENT_ID.padEnd(38)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.yellow('   Protocol: MQTT 3.1.1 | LWT: Registered'.padEnd(51)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.blue('   Flow Control: receiveMax=' + FLOW_CONTROL.RECEIVE_MAXIMUM + ' (app-level backpressure)') + chalk.cyan.bold('   ║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');

  // Status ONLINE (Fitur 5: Retain)
  client.publish(TOPICS.SYSTEM.STATUS(PUBLISHER_ID),
    JSON.stringify({ publisher: CLIENT_ID, status: 'ONLINE', startedAt: Date.now(),
      _props: { 'source': CLIENT_ID } }),
    { qos: 1, retain: true }
  );

  // Fitur 8: Request-Response
  const responder = new ResponseHandler(client, PUBLISHER_ID);
  responder.setupHandler((request) => {
    console.log(chalk.yellow(`  ⟵ REQUEST received: ${request.command}`));
    if (request.command === 'GET_STATUS') {
      return { status: 'OK', publisher: CLIENT_ID, uptime: process.uptime(), intersections: intersections.length, publishCount };
    }
    if (request.command === 'GET_INTERSECTIONS') return { intersections };
    return null;
  });

  startCongestionPublisher();
  startLightChangePublisher();
  startIncidentPublisher();
  startSummaryPublisher();
  startHeartbeat();
});

// ── Congestion Data (QoS 0 - fire-and-forget, high frequency) ──────────────
function startCongestionPublisher() {
  setInterval(() => {
    const intersection = intersections[Math.floor(Math.random() * intersections.length)];
    const delta = Math.floor(Math.random() * 20) - 10;
    intersection.vehicles = Math.max(0, Math.min(200, intersection.vehicles + delta));
    intersection.congestion = Math.min(1.0, intersection.vehicles / 180);

    const topic = TOPICS.TRAFFIC.CONGESTION(intersection.zone);
    const alias = TOPIC_ALIASES[topic]; // Fitur 3: Topic Alias

    const payload = JSON.stringify({
      intersection_id: intersection.id, name: intersection.name,
      zone: intersection.zone, vehicle_count: intersection.vehicles,
      congestion_level: Math.round(intersection.congestion * 100) / 100,
      status: intersection.congestion > 0.7 ? 'CONGESTED' : 'NORMAL',
      timestamp: Date.now(),
      _alias: alias,                                           // Fitur 3: Topic Alias
      _expiry: Date.now() + (EXPIRY.TRAFFIC_CONGESTION * 1000), // Fitur 6: Expiry
      _ttl: EXPIRY.TRAFFIC_CONGESTION,
      _props: {                                                 // Fitur 4: User Properties
        'source': CLIENT_ID, 'zone': intersection.zone,
        'priority': intersection.congestion > 0.7 ? 'HIGH' : 'NORMAL',
        'unit': 'vehicles', 'data-type': 'congestion', 'topic-alias': String(alias),
      },
    });

    // QoS 0: langsung publish (fire-and-forget, tidak masuk flow ctrl queue)
    client.publish(topic, payload, { qos: QOS.AT_MOST_ONCE });
    publishCount++;
    if (publishCount % 50 === 0) console.log(chalk.gray(`  📊 Published: ${publishCount} messages`));
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
      intersection_id: intersection.id, name: intersection.name,
      zone: intersection.zone, previous_light: prevLight,
      current_light: intersection.light, timestamp: Date.now(),
      _expiry: Date.now() + (EXPIRY.TRAFFIC_LIGHT * 1000), _ttl: EXPIRY.TRAFFIC_LIGHT,
      _props: { 'source': CLIENT_ID, 'zone': intersection.zone, 'event-type': 'light-change', 'intersection': intersection.id },
    });

    // Fitur 10: Flow Control — QoS 1 di-route melalui FlowController
    flowCtrl.publish(topic, payload, { qos: QOS.AT_LEAST_ONCE });
    publishCount++;
    console.log(chalk.green(`  🚦 Light: ${intersection.name} ${prevLight} → ${chalk.bold(intersection.light)}`));
  }, 8000);
}

// ── Incidents (QoS 2 - exactly once, critical) ─────────────────────────────
function startIncidentPublisher() {
  setInterval(() => {
    if (Math.random() > 0.3) return;
    const intersection = intersections[Math.floor(Math.random() * intersections.length)];
    const types = ['ACCIDENT', 'ROADBLOCK', 'CONSTRUCTION', 'FLOODING'];
    const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const type = types[Math.floor(Math.random() * types.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];
    const topic = TOPICS.TRAFFIC.INCIDENT(intersection.zone);
    const payload = JSON.stringify({
      incident_id: `INC-${uuidv4().substring(0, 8).toUpperCase()}`,
      intersection_id: intersection.id, name: intersection.name,
      zone: intersection.zone, type, severity,
      description: `${type} reported at ${intersection.name}`, timestamp: Date.now(),
      _expiry: Date.now() + (EXPIRY.TRAFFIC_INCIDENT * 1000), _ttl: EXPIRY.TRAFFIC_INCIDENT,
      _props: { 'source': CLIENT_ID, 'zone': intersection.zone, 'severity': severity, 'incident-type': type, 'priority': severity === 'CRITICAL' ? 'URGENT' : 'NORMAL' },
    });

    // Fitur 10: Flow Control — QoS 2 di-route melalui FlowController
    flowCtrl.publish(topic, payload, { qos: QOS.EXACTLY_ONCE });
    publishCount++;
    console.log(chalk.red(`  🚨 INCIDENT [${severity}]: ${type} at ${intersection.name}`));
  }, 15000);
}

// ── Summary (QoS 1, Retained) ─────────────────────────────────────────────
function startSummaryPublisher() {
  setInterval(() => {
    const summary = {
      total_intersections: intersections.length, zones: {},
      avg_congestion: 0, total_vehicles: 0, generated_at: Date.now(),
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

    // Fitur 5: Retain — subscriber baru langsung dapat summary terakhir
    client.publish(TOPICS.TRAFFIC.SUMMARY, JSON.stringify({
      ...summary,
      _expiry: Date.now() + (EXPIRY.SUMMARY * 1000), _ttl: EXPIRY.SUMMARY,
      _props: { 'source': CLIENT_ID, 'data-type': 'summary', 'retained': 'true' },
    }), { qos: QOS.AT_LEAST_ONCE, retain: true });
    publishCount++;
    console.log(chalk.blue(`  📋 Summary published (retained) | Vehicles: ${summary.total_vehicles} | Avg congestion: ${summary.avg_congestion}`));
  }, 10000);
}

// ── Heartbeat ────────────────────────────────────────────────────────────────
function startHeartbeat() {
  setInterval(() => {
    const hbTopic = TOPICS.SYSTEM.HEARTBEAT;
    client.publish(hbTopic, JSON.stringify({
      publisher: CLIENT_ID, type: 'traffic',
      uptime: process.uptime(), publishCount, timestamp: Date.now(),
      _alias: TOPIC_ALIASES[hbTopic],          // Fitur 3: Topic Alias
      _expiry: Date.now() + (EXPIRY.SYSTEM_HEARTBEAT * 1000), _ttl: EXPIRY.SYSTEM_HEARTBEAT,
      _props: { 'source': CLIENT_ID, 'type': 'heartbeat', 'topic-alias': String(TOPIC_ALIASES[hbTopic]) },
    }), { qos: QOS.AT_MOST_ONCE });
  }, 5000);
}

client.on('error', (err) => console.error(chalk.red(`  ✖ Error: ${err.message || err.toString() || JSON.stringify(err)}`)));
client.on('offline', () => console.log(chalk.yellow('  ⚠ Publisher offline')));

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n  Shutting down Traffic Publisher...'));
  client.publish(TOPICS.SYSTEM.STATUS(PUBLISHER_ID),
    JSON.stringify({ publisher: CLIENT_ID, status: 'OFFLINE', stoppedAt: Date.now() }),
    { qos: 1, retain: true }, () => { client.end(true); process.exit(0); }
  );
});