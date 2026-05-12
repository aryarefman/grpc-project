// ============================================================================
// NovaPulse MQTT - Environment Sensor Publisher (Publisher 2)
// MQTT 5.0: QoS, Message Expiry, User Properties, Retain, LWT, Flow Control
// ============================================================================

const mqtt = require('mqtt');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
const { TOPICS, ZONES, SENSOR_TYPES } = require('../shared/topicRegistry');
const { QOS, EXPIRY, FLOW_CONTROL, LWT_PROPERTIES } = require('../shared/mqttFeatures');
const ResponseHandler = require('../shared/responseHandler');

const CLIENT_ID = 'novapulse-environment-publisher';
const PUBLISHER_ID = 'environment-publisher';

const sensors = [
  { id: 'SNS-001', name: 'AQ-Sensor Shinjuku', type: 'air_quality', zone: 'CENTRAL', value: 72, unit: 'AQI' },
  { id: 'SNS-002', name: 'Temp-Sensor Shibuya', type: 'temperature', zone: 'WEST', value: 32.5, unit: '°C' },
  { id: 'SNS-003', name: 'Humidity-Sensor Roppongi', type: 'humidity', zone: 'SOUTH', value: 65, unit: '%' },
  { id: 'SNS-004', name: 'Noise-Sensor Ginza', type: 'noise', zone: 'EAST', value: 55, unit: 'dB' },
  { id: 'SNS-005', name: 'Water-Sensor Sumida River', type: 'water_quality', zone: 'EAST', value: 44, unit: 'WQI' },
  { id: 'SNS-006', name: 'AQ-Sensor Akihabara', type: 'air_quality', zone: 'NORTH', value: 88, unit: 'AQI' },
  { id: 'SNS-007', name: 'Temp-Sensor Asakusa', type: 'temperature', zone: 'EAST', value: 34, unit: '°C' },
  { id: 'SNS-008', name: 'Noise-Sensor Ueno', type: 'noise', zone: 'NORTH', value: 68, unit: 'dB' },
];

const thresholds = {
  air_quality: { warn: 100, critical: 150 },
  temperature: { warn: 35, critical: 40 },
  humidity: { warn: 80, critical: 90 },
  noise: { warn: 70, critical: 85 },
  water_quality: { warn: 40, critical: 20 },
};

// ── Connect with MQTT 5.0 + LWT + Flow Control ─────────────────────────────
const brokerUrl = process.env.MQTT_URL || 'mqtt://localhost:1884';
const client = mqtt.connect(brokerUrl, {
  clientId: CLIENT_ID,
  protocolVersion: 4,
  clean: true,
  
  will: {
    topic: TOPICS.SYSTEM.STATUS(PUBLISHER_ID),
    payload: JSON.stringify({
      publisher: CLIENT_ID, status: 'OFFLINE',
      message: '⚠️ Environment Sensor System disconnected unexpectedly!',
    }),
    qos: 1, retain: true,
    properties: {
      willDelayInterval: LWT_PROPERTIES.WILL_DELAY_INTERVAL,
      messageExpiryInterval: LWT_PROPERTIES.WILL_EXPIRY_INTERVAL,
      userProperties: { 'alert-level': 'CRITICAL', 'source': CLIENT_ID },
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
  console.log(chalk.green.bold('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.green.bold('  ║') + chalk.white.bold('   🌿 Environment Sensor Publisher - ONLINE          ') + chalk.green.bold('║'));
  console.log(chalk.green.bold('  ╠══════════════════════════════════════════════════════╣'));
  console.log(chalk.green.bold('  ║') + chalk.cyan('   Sensors: ' + sensors.length + ' active across ' + new Set(sensors.map(s => s.zone)).size + ' zones'.padEnd(27)) + chalk.green.bold('║'));
  console.log(chalk.green.bold('  ║') + chalk.yellow('   Protocol: MQTT 5.0 | LWT: Registered'.padEnd(51)) + chalk.green.bold('║'));
  console.log(chalk.green.bold('  ║') + chalk.magenta('   Flow Control: receiveMax=' + FLOW_CONTROL.RECEIVE_MAXIMUM) + chalk.green.bold('            ║'));
  console.log(chalk.green.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');

  client.publish(TOPICS.SYSTEM.STATUS(PUBLISHER_ID),
    JSON.stringify({ publisher: CLIENT_ID, status: 'ONLINE', startedAt: Date.now(), sensorCount: sensors.length }),
    { qos: 1, retain: true, properties: { userProperties: { 'source': CLIENT_ID } } }
  );

  const responder = new ResponseHandler(client, PUBLISHER_ID);
  responder.setupHandler((request) => {
    console.log(chalk.yellow(`  ⟵ REQUEST: ${request.command}`));
    if (request.command === 'GET_STATUS') {
      return { status: 'OK', publisher: CLIENT_ID, uptime: process.uptime(), sensors: sensors.length, publishCount };
    }
    if (request.command === 'GET_SENSORS') return { sensors };
    if (request.command === 'RESET_SENSOR' && request.params?.sensorId) {
      const sensor = sensors.find(s => s.id === request.params.sensorId);
      if (sensor) { sensor.value = 0; return { success: true, sensor }; }
      return null;
    }
    return null;
  });

  startSensorPublisher();
  startAlertPublisher();
  startSummaryPublisher();
  startHeartbeat();
});

function startSensorPublisher() {
  setInterval(() => {
    const sensor = sensors[Math.floor(Math.random() * sensors.length)];
    const change = (Math.random() - 0.5) * 10;
    if (sensor.type === 'water_quality') sensor.value = Math.max(0, Math.min(100, sensor.value + change));
    else if (sensor.type === 'temperature') sensor.value = Math.max(20, Math.min(45, sensor.value + change * 0.3));
    else if (sensor.type === 'humidity') sensor.value = Math.max(20, Math.min(100, sensor.value + change * 0.5));
    else sensor.value = Math.max(0, Math.min(250, sensor.value + change));
    sensor.value = Math.round(sensor.value * 10) / 10;

    const topic = TOPICS.ENVIRONMENT.READING(sensor.zone, sensor.type);
    const payload = JSON.stringify({
      sensor_id: sensor.id, name: sensor.name, type: sensor.type, zone: sensor.zone,
      value: sensor.value, unit: sensor.unit, quality: getQuality(sensor), timestamp: Date.now(),
    });

    client.publish(topic, payload, {
      qos: QOS.AT_MOST_ONCE,
      properties: {
        messageExpiryInterval: EXPIRY.ENVIRONMENT_READING,
        userProperties: { 'source': CLIENT_ID, 'sensor-id': sensor.id, 'sensor-type': sensor.type, 'zone': sensor.zone, 'unit': sensor.unit, 'quality': getQuality(sensor) },
      }
    });
    publishCount++;
    const quality = getQuality(sensor);
    const color = quality === 'GOOD' ? chalk.green : quality === 'MODERATE' ? chalk.yellow : quality === 'POOR' ? chalk.red : chalk.bgRed.white;
    if (publishCount % 10 === 0) console.log(color(`  📡 ${sensor.name}: ${sensor.value}${sensor.unit} [${quality}]`));
  }, 3000);
}

function getQuality(sensor) {
  const t = thresholds[sensor.type];
  if (!t) return 'UNKNOWN';
  if (sensor.type === 'water_quality') return sensor.value < t.critical ? 'HAZARDOUS' : sensor.value < t.warn ? 'POOR' : sensor.value > 80 ? 'GOOD' : 'MODERATE';
  return sensor.value > t.critical ? 'HAZARDOUS' : sensor.value > t.warn ? 'POOR' : 'GOOD';
}

function startAlertPublisher() {
  setInterval(() => {
    sensors.forEach(sensor => {
      const t = thresholds[sensor.type];
      if (!t) return;
      let severity = null;
      if (sensor.type === 'water_quality') {
        if (sensor.value < t.critical) severity = 'CRITICAL';
        else if (sensor.value < t.warn) severity = 'WARNING';
      } else {
        if (sensor.value > t.critical) severity = 'CRITICAL';
        else if (sensor.value > t.warn) severity = 'WARNING';
      }
      if (severity) {
        const payload = JSON.stringify({
          alert_id: `EALRT-${uuidv4().substring(0, 8).toUpperCase()}`, sensor_id: sensor.id,
          sensor_name: sensor.name, type: sensor.type, zone: sensor.zone, severity,
          value: sensor.value, unit: sensor.unit, threshold: severity === 'CRITICAL' ? t.critical : t.warn,
          message: `${severity}: ${sensor.name} value ${sensor.value}${sensor.unit} exceeded threshold`,
          timestamp: Date.now(),
        });
        client.publish(TOPICS.ENVIRONMENT.ALERT(sensor.zone), payload, {
          qos: QOS.EXACTLY_ONCE,
          properties: {
            messageExpiryInterval: EXPIRY.ENVIRONMENT_ALERT,
            userProperties: { 'source': CLIENT_ID, 'severity': severity, 'sensor-type': sensor.type, 'zone': sensor.zone, 'alert-type': 'threshold-exceeded' },
          }
        });
        publishCount++;
        console.log(chalk.red(`  ${severity === 'CRITICAL' ? '🔴' : '🟡'} ALERT [${severity}]: ${sensor.name} = ${sensor.value}${sensor.unit}`));
      }
    });
  }, 10000);
}

function startSummaryPublisher() {
  setInterval(() => {
    const summary = { sensors: sensors.length, zones: {}, generated_at: Date.now() };
    sensors.forEach(s => {
      if (!summary.zones[s.zone]) summary.zones[s.zone] = {};
      summary.zones[s.zone][s.type] = { value: s.value, unit: s.unit, quality: getQuality(s) };
    });
    client.publish(TOPICS.ENVIRONMENT.SUMMARY, JSON.stringify(summary), {
      qos: QOS.AT_LEAST_ONCE, retain: true,
      properties: { messageExpiryInterval: EXPIRY.SUMMARY, userProperties: { 'source': CLIENT_ID, 'data-type': 'summary', 'retained': 'true' } }
    });
    publishCount++;
  }, 12000);
}

function startHeartbeat() {
  setInterval(() => {
    client.publish(TOPICS.SYSTEM.HEARTBEAT, JSON.stringify({
      publisher: CLIENT_ID, type: 'environment', uptime: process.uptime(), publishCount, timestamp: Date.now(),
    }), { qos: 0, properties: { messageExpiryInterval: EXPIRY.SYSTEM_HEARTBEAT, userProperties: { 'source': CLIENT_ID, 'type': 'heartbeat' } } });
  }, 5000);
}

client.on('error', (err) => console.error(chalk.red(`  ✖ Error: ${err.message || err.toString() || JSON.stringify(err)}`)));
process.on('SIGINT', () => {
  client.publish(TOPICS.SYSTEM.STATUS(PUBLISHER_ID),
    JSON.stringify({ publisher: CLIENT_ID, status: 'OFFLINE', stoppedAt: Date.now() }),
    { qos: 1, retain: true }, () => { client.end(true); process.exit(0); });
});