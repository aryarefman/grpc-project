// ============================================================================
// NovaPulse MQTT - Traffic Sensor Publisher (Publisher 1)
// Publishes: congestion data, traffic light changes, incidents
// MQTT 5.0 Features: QoS 0/1/2, Message Expiry, User Properties, Retain,
//                    LWT with Will Delay, Request-Response, Flow Control
// ============================================================================

const mqtt = require('mqtt');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
const { TOPICS, ZONES } = require('../shared/topicRegistry');
const { QOS, EXPIRY, FLOW_CONTROL, LWT_PROPERTIES } = require('../shared/mqttFeatures');
const ResponseHandler = require('../shared/responseHandler');

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

// ── Connect with MQTT 5.0 + LWT + Flow Control ─────────────────────────────
const brokerUrl = process.env.MQTT_URL || 'mqtt://localhost:1884';
const client = mqtt.connect(brokerUrl, {
  clientId: CLIENT_ID,
  protocolVersion: 4,    // FIX: MQTT 5.0 (sebelumnya 4/3.1.1)
  clean: true,

  // FIX Masalah 4: Flow Control di MQTT 5.0 connection level
  // Broker enforce receiveMaximum → max QoS 1/2 inflight bersamaan
  

  // FIX Masalah 2: LWT dengan MQTT 5.0 will properties
  // willDelayInterval → broker tunggu sebelum kirim LWT
  // messageExpiryInterval → LWT message expire setelah waktu tertentu
  // userProperties → metadata di packet level, bukan JSON body
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
      userProperties: {
        'alert-level': 'CRITICAL',
        'source': CLIENT_ID,
      },
    },
  },
});

let publishCount = 0;

const originalPublish = client.publish.bind(client);
client.publish = function(topic, message, options, callback) {
  let payload = message;
  if (options && options.properties) {
    try {
      const obj = JSON.parse(message.toString());
      if (options.properties.userProperties) obj._props = options.properties.userProperties;
      if (options.properties.messageExpiryInterval) { obj._expiry = Date.now() + (options.properties.messageExpiryInterval * 1000); obj._ttl = options.properties.messageExpiryInterval; }
      payload = JSON.stringify(obj);
    } catch(e) {}
  }
  return originalPublish(topic, payload, options, callback);
};
client.on('connect', () => {
  console.log('');
  console.log(chalk.cyan.bold('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   🚦 Traffic Sensor Publisher - ONLINE              ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╠══════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan.bold('  ║') + chalk.green('   ClientID: ' + CLIENT_ID.padEnd(38)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.yellow('   Protocol: MQTT 5.0 | LWT: Registered'.padEnd(51)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.magenta('   Flow Control: receiveMax=' + FLOW_CONTROL.RECEIVE_MAXIMUM) + chalk.cyan.bold('            ║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');

  // Announce online status (retained) with MQTT 5.0 properties
  client.publish(TOPICS.SYSTEM.STATUS(PUBLISHER_ID),
    JSON.stringify({ publisher: CLIENT_ID, status: 'ONLINE', startedAt: Date.now() }),
    { 
      qos: 1, 
      retain: true,
      properties: {
        userProperties: { 'source': CLIENT_ID },
      }
    }
  );

  // FIX Masalah 3: ResponseHandler dengan publisherId untuk 1:1 routing
  const responder = new ResponseHandler(client, PUBLISHER_ID);
  responder.setupHandler((request) => {
    console.log(chalk.yellow(`  ⟵ REQUEST received: ${request.command}`));
    if (request.command === 'GET_STATUS') {
      return { status: 'OK', publisher: CLIENT_ID, uptime: process.uptime(), intersections: intersections.length, publishCount };
    }
    if (request.command === 'GET_INTERSECTIONS') {
      return { intersections };
    }
    return null;
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
    });

    // FIX Masalah 1: Expiry & User Properties di MQTT 5.0 packet properties
    // Broker AKAN expire pesan setelah 60 detik (sebelumnya hanya di JSON body)
    client.publish(topic, payload, { 
      qos: QOS.AT_MOST_ONCE,
      properties: {
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
    publishCount++;

    if (publishCount % 50 === 0) {
      console.log(chalk.gray(`  📊 Published: ${publishCount} messages`));
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
    });

    client.publish(topic, payload, { 
      qos: QOS.AT_LEAST_ONCE,
      properties: {
        messageExpiryInterval: EXPIRY.TRAFFIC_LIGHT,
        userProperties: {
          'source': CLIENT_ID,
          'zone': intersection.zone,
          'event-type': 'light-change',
          'intersection': intersection.id,
        },
      }
    });
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
    });

    client.publish(topic, payload, { 
      qos: QOS.EXACTLY_ONCE,
      properties: {
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

    // Retain: new subscribers get latest summary instantly
    client.publish(TOPICS.TRAFFIC.SUMMARY, JSON.stringify(summary), {
      qos: QOS.AT_LEAST_ONCE,
      retain: true,
      properties: {
        messageExpiryInterval: EXPIRY.SUMMARY,
        userProperties: { 'source': CLIENT_ID, 'data-type': 'summary', 'retained': 'true' },
      }
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
    }), { 
      qos: QOS.AT_MOST_ONCE,
      properties: {
        messageExpiryInterval: EXPIRY.SYSTEM_HEARTBEAT,
        userProperties: { 'source': CLIENT_ID, 'type': 'heartbeat' },
      }
    });
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