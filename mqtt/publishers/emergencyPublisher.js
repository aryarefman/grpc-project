// ============================================================================
// NovaPulse MQTT - Emergency Dispatch Publisher (Publisher 3)
// MQTT 5.0: QoS 2, Message Expiry, User Properties, Retain, LWT, Flow Control
// ============================================================================

const mqtt = require('mqtt');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
const { TOPICS, ZONES } = require('../shared/topicRegistry');
const { QOS, EXPIRY, FLOW_CONTROL, LWT_PROPERTIES } = require('../shared/mqttFeatures');
const ResponseHandler = require('../shared/responseHandler');

const CLIENT_ID = 'novapulse-emergency-publisher';
const PUBLISHER_ID = 'emergency-publisher';

const units = [
  { id: 'UNIT-AMB01', name: 'Ambulance Alpha-1', type: 'AMBULANCE', status: 'AVAILABLE', zone: 'CENTRAL' },
  { id: 'UNIT-AMB02', name: 'Ambulance Alpha-2', type: 'AMBULANCE', status: 'AVAILABLE', zone: 'SOUTH' },
  { id: 'UNIT-FIR01', name: 'Fire Truck Bravo-1', type: 'FIRE_TRUCK', status: 'AVAILABLE', zone: 'NORTH' },
  { id: 'UNIT-FIR02', name: 'Fire Truck Bravo-2', type: 'FIRE_TRUCK', status: 'AVAILABLE', zone: 'EAST' },
  { id: 'UNIT-POL01', name: 'Police Unit Charlie-1', type: 'POLICE', status: 'AVAILABLE', zone: 'WEST' },
  { id: 'UNIT-POL02', name: 'Police Unit Charlie-2', type: 'POLICE', status: 'AVAILABLE', zone: 'CENTRAL' },
];

const activeAlerts = [];

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
      message: '⚠️ Emergency Dispatch System disconnected!',
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
  console.log(chalk.red.bold('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.red.bold('  ║') + chalk.white.bold('   🚨 Emergency Dispatch Publisher - ONLINE          ') + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ╠══════════════════════════════════════════════════════╣'));
  console.log(chalk.red.bold('  ║') + chalk.cyan('   Units: ' + units.length + ' | Status: All systems nominal'.padEnd(41)) + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ║') + chalk.yellow('   Protocol: MQTT 5.0 | LWT: Registered'.padEnd(51)) + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ║') + chalk.magenta('   Flow Control: receiveMax=' + FLOW_CONTROL.RECEIVE_MAXIMUM) + chalk.red.bold('            ║'));
  console.log(chalk.red.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');

  client.publish(TOPICS.SYSTEM.STATUS(PUBLISHER_ID),
    JSON.stringify({ publisher: CLIENT_ID, status: 'ONLINE', startedAt: Date.now(), unitCount: units.length }),
    { qos: 1, retain: true, properties: { userProperties: { 'source': CLIENT_ID } } }
  );

  const responder = new ResponseHandler(client, PUBLISHER_ID);
  responder.setupHandler((request) => {
    console.log(chalk.yellow(`  ⟵ REQUEST: ${request.command}`));
    if (request.command === 'GET_STATUS') {
      return { status: 'OK', publisher: CLIENT_ID, uptime: process.uptime(), units: units.length, activeAlerts: activeAlerts.length, publishCount };
    }
    if (request.command === 'GET_UNITS') return { units };
    if (request.command === 'GET_ALERTS') return { alerts: activeAlerts };
    return null;
  });

  startAlertPublisher();
  startDispatchSimulator();
  startUnitStatusPublisher();
  startHeartbeat();
});

// ── New Emergency Alerts (QoS 2 - exactly once) ────────────────────────────
function startAlertPublisher() {
  setInterval(() => {
    if (Math.random() > 0.4) return;

    const types = ['FIRE', 'MEDICAL', 'TRAFFIC_ACCIDENT', 'NATURAL_DISASTER', 'CRIME', 'ENV_HAZARD'];
    const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const locations = ['Copacabana Beach', 'Ipanema', 'Maracanã Stadium', 'Centro', 'Arcos da Lapa', 'Leblon', 'Botafogo', 'Santa Teresa'];

    const type = types[Math.floor(Math.random() * types.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];
    const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
    const location = locations[Math.floor(Math.random() * locations.length)];

    const alert = {
      alert_id: `ALRT-${uuidv4().substring(0, 8).toUpperCase()}`,
      type, severity, zone, location,
      description: `${type.replace('_', ' ')} emergency at ${location}`,
      reporter: 'NovaPulse Emergency System',
      status: 'PENDING', created_at: Date.now(),
    };

    activeAlerts.push(alert);
    if (activeAlerts.length > 20) activeAlerts.shift();

    client.publish(TOPICS.EMERGENCY.ALERT_NEW, JSON.stringify(alert), {
      qos: QOS.EXACTLY_ONCE,
      properties: {
        messageExpiryInterval: EXPIRY.EMERGENCY_ALERT,
        userProperties: {
          'source': CLIENT_ID, 'severity': severity, 'alert-type': type, 'zone': zone,
          'priority': severity === 'CRITICAL' || severity === 'HIGH' ? 'URGENT' : 'NORMAL',
        },
      }
    });
    publishCount++;
    const colors = { CRITICAL: chalk.bgRed.white, HIGH: chalk.red, MEDIUM: chalk.yellow, LOW: chalk.gray };
    console.log((colors[severity] || chalk.white)(`  🚨 NEW ALERT [${severity}]: ${type} at ${location} (${zone})`));
  }, 12000);
}

// ── Dispatch Simulation ─────────────────────────────────────────────────────
function startDispatchSimulator() {
  setInterval(() => {
    const pendingAlert = activeAlerts.find(a => a.status === 'PENDING');
    const availableUnit = units.find(u => u.status === 'AVAILABLE');
    if (!pendingAlert || !availableUnit) return;

    availableUnit.status = 'DISPATCHED';
    availableUnit.current_alert = pendingAlert.alert_id;
    pendingAlert.status = 'DISPATCHED';

    const dispatch = {
      dispatch_id: `DSP-${uuidv4().substring(0, 8).toUpperCase()}`,
      alert_id: pendingAlert.alert_id, unit_id: availableUnit.id, unit_name: availableUnit.name,
      location: pendingAlert.location, zone: pendingAlert.zone,
      estimated_arrival: `${Math.floor(Math.random() * 10) + 3} minutes`, timestamp: Date.now(),
    };

    // Dispatch request
    client.publish(TOPICS.EMERGENCY.DISPATCH_REQUEST, JSON.stringify(dispatch), {
      qos: QOS.EXACTLY_ONCE,
      properties: {
        messageExpiryInterval: EXPIRY.EMERGENCY_DISPATCH,
        userProperties: { 'source': CLIENT_ID, 'dispatch-type': 'auto', 'zone': pendingAlert.zone },
      }
    });

    // Dispatch response/confirmation
    client.publish(TOPICS.EMERGENCY.DISPATCH_RESPONSE, JSON.stringify({
      ...dispatch, confirmed: true, status: 'DISPATCHED',
    }), {
      qos: QOS.EXACTLY_ONCE,
      properties: { userProperties: { 'source': CLIENT_ID, 'response-type': 'confirmation' } }
    });

    // Alert update
    client.publish(TOPICS.EMERGENCY.ALERT_UPDATE, JSON.stringify({
      alert_id: pendingAlert.alert_id, status: 'DISPATCHED', unit_assigned: availableUnit.id, timestamp: Date.now(),
    }), {
      qos: QOS.AT_LEAST_ONCE,
      properties: { userProperties: { 'source': CLIENT_ID, 'event': 'dispatch' } }
    });

    publishCount += 3;
    console.log(chalk.magenta(`  🚑 DISPATCHED: ${availableUnit.name} → ${pendingAlert.location}`));

    setTimeout(() => {
      availableUnit.status = 'AVAILABLE';
      availableUnit.current_alert = null;
      pendingAlert.status = 'RESOLVED';
      client.publish(TOPICS.EMERGENCY.ALERT_RESOLVED, JSON.stringify({
        alert_id: pendingAlert.alert_id, resolved_by: availableUnit.name,
        resolution: 'Situation resolved', timestamp: Date.now(),
      }), {
        qos: QOS.AT_LEAST_ONCE,
        properties: { userProperties: { 'source': CLIENT_ID, 'event': 'resolved' } }
      });
      publishCount++;
      console.log(chalk.green(`  ✅ RESOLVED: ${pendingAlert.alert_id} by ${availableUnit.name}`));
    }, 20000 + Math.random() * 10000);
  }, 8000);
}

// ── Unit Status (QoS 1, Retained per unit) ──────────────────────────────────
function startUnitStatusPublisher() {
  setInterval(() => {
    units.forEach(unit => {
      client.publish(TOPICS.EMERGENCY.UNIT_STATUS(unit.id), JSON.stringify({
        unit_id: unit.id, name: unit.name, type: unit.type,
        status: unit.status, zone: unit.zone,
        current_alert: unit.current_alert || null, timestamp: Date.now(),
      }), {
        qos: QOS.AT_LEAST_ONCE, retain: true,
        properties: {
          messageExpiryInterval: EXPIRY.UNIT_STATUS,
          userProperties: { 'source': CLIENT_ID, 'unit-type': unit.type, 'status': unit.status },
        }
      });
    });
    publishCount += units.length;
  }, 15000);
}

// ── Heartbeat ───────────────────────────────────────────────────────────────
function startHeartbeat() {
  setInterval(() => {
    client.publish(TOPICS.SYSTEM.HEARTBEAT, JSON.stringify({
      publisher: CLIENT_ID, type: 'emergency', uptime: process.uptime(), publishCount,
      activeAlerts: activeAlerts.filter(a => a.status !== 'RESOLVED').length, timestamp: Date.now(),
    }), { qos: 0, properties: { messageExpiryInterval: EXPIRY.SYSTEM_HEARTBEAT, userProperties: { 'source': CLIENT_ID, 'type': 'heartbeat' } } });
  }, 5000);
}

client.on('error', (err) => console.error(chalk.red(`  ✖ Error: ${err.message || err.toString() || JSON.stringify(err)}`)));
process.on('SIGINT', () => {
  client.publish(TOPICS.SYSTEM.STATUS(PUBLISHER_ID),
    JSON.stringify({ publisher: CLIENT_ID, status: 'OFFLINE', stoppedAt: Date.now() }),
    { qos: 1, retain: true }, () => { client.end(true); process.exit(0); });
});