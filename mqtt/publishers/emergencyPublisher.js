// ============================================================================
// NovaPulse MQTT - Emergency Dispatch Publisher (Publisher 3)
// Publishes: emergency alerts, dispatch events, unit status updates
// Features: QoS 2, User Properties, Retain, Expiry, LWT, Request-Response
// ============================================================================

const mqtt = require('mqtt');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
const { TOPICS, ZONES } = require('../shared/topicRegistry');
const { QOS, EXPIRY, FlowControlledPublisher } = require('../shared/mqttFeatures');
const RequestResponseHandler = require('../shared/requestResponse');

const CLIENT_ID = 'novapulse-emergency-publisher';

// ── Simulated emergency units ───────────────────────────────────────────────
const units = [
  { id: 'UNIT-AMB01', name: 'Ambulance Alpha-1', type: 'AMBULANCE', status: 'AVAILABLE', zone: 'CENTRAL' },
  { id: 'UNIT-AMB02', name: 'Ambulance Alpha-2', type: 'AMBULANCE', status: 'AVAILABLE', zone: 'SOUTH' },
  { id: 'UNIT-FIR01', name: 'Fire Truck Bravo-1', type: 'FIRE_TRUCK', status: 'AVAILABLE', zone: 'NORTH' },
  { id: 'UNIT-FIR02', name: 'Fire Truck Bravo-2', type: 'FIRE_TRUCK', status: 'AVAILABLE', zone: 'EAST' },
  { id: 'UNIT-POL01', name: 'Police Unit Charlie-1', type: 'POLICE', status: 'AVAILABLE', zone: 'WEST' },
  { id: 'UNIT-POL02', name: 'Police Unit Charlie-2', type: 'POLICE', status: 'AVAILABLE', zone: 'CENTRAL' },
];

const activeAlerts = [];

// ── Connect with LWT ────────────────────────────────────────────────────────
const brokerUrl = process.env.MQTT_URL || 'mqtt://localhost:1883';
const client = mqtt.connect(brokerUrl, {
  clientId: CLIENT_ID,
  protocolVersion: 4,
  clean: true,
  will: {
    topic: TOPICS.SYSTEM.STATUS('emergency-publisher'),
    payload: JSON.stringify({ publisher: CLIENT_ID, status: 'OFFLINE', lastSeen: Date.now(), message: '⚠️ Emergency Dispatch System disconnected!', _props: { userProperties: { 'alert-level': 'CRITICAL', 'source': CLIENT_ID } } }),
    qos: 1,
    retain: true,
  },
});

let flowCtrl;
let publishCount = 0;

client.on('connect', () => {
  console.log('');
  console.log(chalk.red.bold('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.red.bold('  ║') + chalk.white.bold('   🚨 Emergency Dispatch Publisher - ONLINE          ') + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ╠══════════════════════════════════════════════════════╣'));
  console.log(chalk.red.bold('  ║') + chalk.cyan('   Units: ' + units.length + ' | Status: All systems nominal'.padEnd(41)) + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ║') + chalk.yellow('   Protocol: MQTT 5.0 | LWT: Registered'.padEnd(51)) + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');

  client.publish(TOPICS.SYSTEM.STATUS('emergency-publisher'),
    JSON.stringify({ publisher: CLIENT_ID, status: 'ONLINE', startedAt: Date.now(), unitCount: units.length, _props: { userProperties: { 'source': CLIENT_ID } } }),
    { qos: 1, retain: true }
  );

  flowCtrl = new FlowControlledPublisher(client);
  const reqRes = new RequestResponseHandler(client);

  reqRes.setupRequestHandler((request) => {
    console.log(chalk.yellow(`  ⟵ REQUEST: ${request.command}`));
    if (request.command === 'GET_STATUS') {
      return { status: 'OK', publisher: CLIENT_ID, uptime: process.uptime(), units: units.length, activeAlerts: activeAlerts.length, publishCount };
    }
    if (request.command === 'GET_UNITS') return { units };
    if (request.command === 'GET_ALERTS') return { alerts: activeAlerts };
    return { error: 'Unknown command' };
  });

  startAlertPublisher();
  startDispatchSimulator();
  startUnitStatusPublisher();
  startHeartbeat();
});

// ── New Emergency Alerts (QoS 2 - exactly once) ────────────────────────────
function startAlertPublisher() {
  setInterval(() => {
    if (Math.random() > 0.4) return; // 40% chance

    const types = ['FIRE', 'MEDICAL', 'TRAFFIC_ACCIDENT', 'NATURAL_DISASTER', 'CRIME', 'ENV_HAZARD'];
    const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const locations = [
      'Copacabana Beach', 'Ipanema', 'Maracanã Stadium', 'Centro',
      'Arcos da Lapa', 'Leblon', 'Botafogo', 'Santa Teresa',
    ];

    const type = types[Math.floor(Math.random() * types.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];
    const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
    const location = locations[Math.floor(Math.random() * locations.length)];

    const alert = {
      alert_id: `ALRT-${uuidv4().substring(0, 8).toUpperCase()}`,
      type, severity, zone, location,
      description: `${type.replace('_', ' ')} emergency at ${location}`,
      reporter: 'NovaPulse Emergency System',
      status: 'PENDING',
      created_at: Date.now(),
    };

    activeAlerts.push(alert);
    if (activeAlerts.length > 20) activeAlerts.shift();

    // Feature 1: QoS 2
    alert._props = {
      messageExpiryInterval: EXPIRY.EMERGENCY_ALERT,
      userProperties: {
        'source': CLIENT_ID,
        'severity': severity,
        'alert-type': type,
        'zone': zone,
        'priority': severity === 'CRITICAL' || severity === 'HIGH' ? 'URGENT' : 'NORMAL',
      },
    };
    flowCtrl.publish(TOPICS.EMERGENCY.ALERT_NEW, JSON.stringify(alert), {
      qos: QOS.EXACTLY_ONCE,
    });
    publishCount++;

    const colors = { CRITICAL: chalk.bgRed.white, HIGH: chalk.red, MEDIUM: chalk.yellow, LOW: chalk.gray };
    console.log((colors[severity] || chalk.white)(`  🚨 NEW ALERT [${severity}]: ${type} at ${location} (${zone})`));
  }, 12000);
}

// ── Dispatch Simulation (Request-Response pattern for dispatch) ─────────────
function startDispatchSimulator() {
  setInterval(() => {
    const pendingAlert = activeAlerts.find(a => a.status === 'PENDING');
    const availableUnit = units.find(u => u.status === 'AVAILABLE');
    if (!pendingAlert || !availableUnit) return;

    // Dispatch
    availableUnit.status = 'DISPATCHED';
    availableUnit.current_alert = pendingAlert.alert_id;
    pendingAlert.status = 'DISPATCHED';

    // Publish dispatch request (QoS 2)
    const dispatch = {
      dispatch_id: `DSP-${uuidv4().substring(0, 8).toUpperCase()}`,
      alert_id: pendingAlert.alert_id,
      unit_id: availableUnit.id,
      unit_name: availableUnit.name,
      location: pendingAlert.location,
      zone: pendingAlert.zone,
      estimated_arrival: `${Math.floor(Math.random() * 10) + 3} minutes`,
      timestamp: Date.now(),
    };

    dispatch._props = {
      messageExpiryInterval: EXPIRY.EMERGENCY_DISPATCH,
      userProperties: { 'source': CLIENT_ID, 'dispatch-type': 'auto', 'zone': pendingAlert.zone },
    };
    flowCtrl.publish(TOPICS.EMERGENCY.DISPATCH_REQUEST, JSON.stringify(dispatch), {
      qos: QOS.EXACTLY_ONCE,
    });

    // Publish dispatch response/confirmation
    flowCtrl.publish(TOPICS.EMERGENCY.DISPATCH_RESPONSE, JSON.stringify({
      ...dispatch, confirmed: true, status: 'DISPATCHED',
      _props: { userProperties: { 'source': CLIENT_ID, 'response-type': 'confirmation' } }
    }), { qos: QOS.EXACTLY_ONCE });

    // Alert update
    flowCtrl.publish(TOPICS.EMERGENCY.ALERT_UPDATE, JSON.stringify({
      alert_id: pendingAlert.alert_id, status: 'DISPATCHED', unit_assigned: availableUnit.id, timestamp: Date.now(),
      _props: { userProperties: { 'source': CLIENT_ID, 'event': 'dispatch' } }
    }), { qos: QOS.AT_LEAST_ONCE });

    publishCount += 3;
    console.log(chalk.magenta(`  🚑 DISPATCHED: ${availableUnit.name} → ${pendingAlert.location}`));

    // Simulate resolution after delay
    setTimeout(() => {
      availableUnit.status = 'AVAILABLE';
      availableUnit.current_alert = null;
      pendingAlert.status = 'RESOLVED';

      flowCtrl.publish(TOPICS.EMERGENCY.ALERT_RESOLVED, JSON.stringify({
        alert_id: pendingAlert.alert_id, resolved_by: availableUnit.name,
        resolution: 'Situation resolved', timestamp: Date.now(),
        _props: { userProperties: { 'source': CLIENT_ID, 'event': 'resolved' } }
      }), { qos: QOS.AT_LEAST_ONCE });
      publishCount++;
      console.log(chalk.green(`  ✅ RESOLVED: ${pendingAlert.alert_id} by ${availableUnit.name}`));
    }, 20000 + Math.random() * 10000);
  }, 8000);
}

// ── Unit Status (QoS 1, Retained per unit) ──────────────────────────────────
function startUnitStatusPublisher() {
  setInterval(() => {
    units.forEach(unit => {
      const topic = TOPICS.EMERGENCY.UNIT_STATUS(unit.id);
      // Feature 5: Retain (latest unit status always available)
      client.publish(topic, JSON.stringify({
        unit_id: unit.id, name: unit.name, type: unit.type,
        status: unit.status, zone: unit.zone,
        current_alert: unit.current_alert || null,
        timestamp: Date.now(),
        _props: {
          messageExpiryInterval: EXPIRY.SUMMARY,
          userProperties: { 'source': CLIENT_ID, 'unit-type': unit.type, 'status': unit.status },
        }
      }), { qos: QOS.AT_LEAST_ONCE, retain: true });
    });
    publishCount += units.length;
  }, 15000);
}

// ── Heartbeat ───────────────────────────────────────────────────────────────
function startHeartbeat() {
  setInterval(() => {
    client.publish(TOPICS.SYSTEM.HEARTBEAT, JSON.stringify({
      publisher: CLIENT_ID, type: 'emergency', uptime: process.uptime(), publishCount, activeAlerts: activeAlerts.filter(a => a.status !== 'RESOLVED').length, timestamp: Date.now(),
      _props: { messageExpiryInterval: EXPIRY.SYSTEM_HEARTBEAT, userProperties: { 'source': CLIENT_ID, 'type': 'heartbeat' } }
    }), { qos: 0 });
  }, 5000);
}

client.on('error', (err) => console.error(chalk.red(`  ✖ Error: ${err.message}`)));
process.on('SIGINT', () => {
  client.publish(TOPICS.SYSTEM.STATUS('emergency-publisher'),
    JSON.stringify({ publisher: CLIENT_ID, status: 'OFFLINE', stoppedAt: Date.now() }),
    { qos: 1, retain: true }, () => { client.end(true); process.exit(0); });
});
