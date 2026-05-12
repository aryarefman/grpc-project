// ============================================================================
// WebSocket Bridge - gRPC ↔ WebSocket Gateway
// Connects existing gRPC streaming services to browser WebSocket clients.
// Features:
//   - gRPC stream → WebSocket broadcast (traffic, emergency, environment)
//   - Server-Initiated Events (proactive push from server)
//   - Command & Control: browser → WebSocket → gRPC call
// ============================================================================

const WebSocket = require('ws');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const store = require('./store/inMemoryStore');

const PROTO_OPTIONS = {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
};

// ── Load protos ──────────────────────────────────────────────────────────────
const trafficProto   = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, '..', 'protos', 'traffic.proto'), PROTO_OPTIONS));
const emergencyProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, '..', 'protos', 'emergency.proto'), PROTO_OPTIONS));
const environmentProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, '..', 'protos', 'environment.proto'), PROTO_OPTIONS));

const GRPC_ADDR = 'localhost:50060';

function makeClients() {
  const trafficClient   = new trafficProto.citynexus.traffic.TrafficService(GRPC_ADDR,   grpc.credentials.createInsecure());
  const emergencyClient = new emergencyProto.citynexus.emergency.EmergencyService(GRPC_ADDR, grpc.credentials.createInsecure());
  const envClient       = new environmentProto.citynexus.environment.EnvironmentService(GRPC_ADDR, grpc.credentials.createInsecure());
  return { trafficClient, emergencyClient, envClient };
}

// ── Broadcast helpers ────────────────────────────────────────────────────────
function broadcast(wss, type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// ── Active gRPC streaming calls (one per ws-server lifecycle) ────────────────
let trafficStream    = null;
let emergencyStream  = null;
let activeClients    = null;   // gRPC client set
let serverPushTimer  = null;

function startGrpcStreams(wss) {
  const { trafficClient, emergencyClient, envClient } = makeClients();
  activeClients = { trafficClient, emergencyClient, envClient };

  // ── 1. MonitorTraffic Stream → WebSocket ─────────────────────────────────
  trafficStream = trafficClient.MonitorTraffic({ zone: 'ALL' });
  trafficStream.on('data', (update) => {
    broadcast(wss, 'traffic_update', update);
  });
  trafficStream.on('error', (err) => {
    if (err.code !== grpc.status.CANCELLED) {
      console.error('[WS-Bridge] trafficStream error:', err.message);
      setTimeout(() => startGrpcStreams(wss), 3000);
    }
  });
  trafficStream.on('end', () => {
    console.log('[WS-Bridge] trafficStream ended');
  });

  // ── 2. SubscribeAlerts Stream → WebSocket ────────────────────────────────
  emergencyStream = emergencyClient.SubscribeAlerts({ zone: 'ALL', min_severity: 'LOW' });
  emergencyStream.on('data', (event) => {
    broadcast(wss, 'emergency_event', event);
    // Server-Initiated: if HIGH or CRITICAL, push a special alert notification
    if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
      broadcast(wss, 'server_alert', {
        title: `🚨 ${event.severity} ALERT`,
        message: `${event.alert_type} at ${event.location}`,
        details: event.description,
        severity: event.severity,
        zone: event.zone,
        ts: event.timestamp,
      });
    }
  });
  emergencyStream.on('error', (err) => {
    if (err.code !== grpc.status.CANCELLED) {
      console.error('[WS-Bridge] emergencyStream error:', err.message);
    }
  });

  // ── 3. Environment: poll sensors from store every 4s & push via WS ───────
  // (LiveSensorStream is bidi; we proxy through the store's simulated data)
  const envPollInterval = setInterval(() => {
    const sensors = store.getAllSensors();
    broadcast(wss, 'sensor_update', { sensors });
  }, 4000);

  // Store interval reference for cleanup
  trafficStream._envPollInterval = envPollInterval;

  console.log('[WS-Bridge] gRPC streams connected and bridged to WebSocket');
}

function stopGrpcStreams() {
  if (trafficStream) {
    if (trafficStream._envPollInterval) {
      clearInterval(trafficStream._envPollInterval);
    }
    trafficStream.cancel();
    trafficStream = null;
  }
  if (emergencyStream) {
    emergencyStream.cancel();
    emergencyStream = null;
  }
}

// ── Server-Initiated Events: proactive push every 15s ────────────────────────
function startServerPush(wss) {
  serverPushTimer = setInterval(() => {
    // Push a system heartbeat with summary stats
    const intersections = store.getAllIntersections();
    const congested = intersections.filter(i => i.congestion_level > 0.7).length;
    const activeAlerts = store.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'CRITICAL');
    const sensors = store.getAllSensors();
    const avgAqi = sensors
      .filter(s => s.type === 'AIR_QUALITY')
      .reduce((sum, s, _, arr) => sum + s.value / arr.length, 0);

    broadcast(wss, 'system_heartbeat', {
      intersections_total: intersections.length,
      congested_count: congested,
      active_alerts: criticalAlerts.length,
      avg_aqi: Math.round(avgAqi),
      sensors_total: sensors.filter(s => s.status === 'ONLINE').length,
      server_time: new Date().toISOString(),
    });

    // Proactive: if there are critical alerts, re-broadcast them
    activeAlerts
      .filter(a => a.severity === 'CRITICAL')
      .forEach(a => {
        broadcast(wss, 'server_alert', {
          title: '⚠️ CRITICAL SITUATION ONGOING',
          message: `${a.type} at ${a.location}`,
          details: a.description,
          severity: a.severity,
          zone: a.zone,
          ts: Date.now(),
        });
      });
  }, 15000);
}

// ── Command & Control handler ────────────────────────────────────────────────
// Each message from browser: { command, params }
function handleClientCommand(ws, wss, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  const { command, params = {} } = msg;
  const { trafficClient, emergencyClient } = activeClients || {};

  if (!trafficClient || !emergencyClient) {
    ws.send(JSON.stringify({ type: 'cmd_error', data: { command, error: 'gRPC clients not ready' } }));
    return;
  }

  console.log(`[WS-Bridge] Command received: ${command}`, params);

  switch (command) {

    // ── Traffic commands ────────────────────────────────────────────────────
    case 'update_traffic_light':
      trafficClient.UpdateTrafficLight({
        intersection_id: params.intersection_id,
        new_light: params.new_light,
        duration_seconds: params.duration_seconds || 60,
        reason: params.reason || 'WebUI Override',
      }, (err, res) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'cmd_error', data: { command, error: err.message } }));
        } else {
          ws.send(JSON.stringify({ type: 'cmd_result', data: { command, result: res } }));
          broadcast(wss, 'server_alert', {
            title: '🚦 Traffic Light Updated',
            message: `Intersection ${params.intersection_id}: ${params.new_light}`,
            details: `Reason: ${params.reason || 'WebUI Override'}`,
            severity: 'INFO',
            ts: Date.now(),
          });
        }
      });
      break;

    case 'report_incident':
      trafficClient.ReportIncident({
        intersection_id: params.intersection_id,
        type: params.type || 'ACCIDENT',
        severity: params.severity || 'MEDIUM',
        description: params.description || 'Reported via WebUI',
        reported_by: params.reported_by || 'WebUI Operator',
      }, (err, res) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'cmd_error', data: { command, error: err.message } }));
        } else {
          ws.send(JSON.stringify({ type: 'cmd_result', data: { command, result: res } }));
        }
      });
      break;

    case 'list_intersections':
      trafficClient.ListIntersections({}, (err, res) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'cmd_error', data: { command, error: err.message } }));
        } else {
          ws.send(JSON.stringify({ type: 'cmd_result', data: { command, result: res } }));
        }
      });
      break;

    // ── Emergency commands ──────────────────────────────────────────────────
    case 'create_alert':
      emergencyClient.CreateAlert({
        type: params.type || 'FIRE',
        severity: params.severity || 'HIGH',
        location: params.location || 'WebUI Location',
        zone: params.zone || 'CENTRAL',
        description: params.description || 'Alert created via WebUI',
        reporter_name: params.reporter_name || 'WebUI Operator',
        reporter_contact: 'webui@novapulse.city',
      }, (err, res) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'cmd_error', data: { command, error: err.message } }));
        } else {
          ws.send(JSON.stringify({ type: 'cmd_result', data: { command, result: res } }));
        }
      });
      break;

    case 'dispatch_unit':
      emergencyClient.DispatchUnit({
        alert_id: params.alert_id,
        unit_id: params.unit_id,
      }, (err, res) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'cmd_error', data: { command, error: err.message } }));
        } else {
          ws.send(JSON.stringify({ type: 'cmd_result', data: { command, result: res } }));
          broadcast(wss, 'server_alert', {
            title: '🚑 Unit Dispatched',
            message: res.message,
            details: `ETA: ${res.estimated_arrival}`,
            severity: 'INFO',
            ts: Date.now(),
          });
        }
      });
      break;

    case 'list_active_alerts':
      emergencyClient.ListActiveAlerts({}, (err, res) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'cmd_error', data: { command, error: err.message } }));
        } else {
          ws.send(JSON.stringify({ type: 'cmd_result', data: { command, result: res } }));
        }
      });
      break;

    case 'list_units':
      emergencyClient.ListUnits({}, (err, res) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'cmd_error', data: { command, error: err.message } }));
        } else {
          ws.send(JSON.stringify({ type: 'cmd_result', data: { command, result: res } }));
        }
      });
      break;

    case 'resolve_alert':
      emergencyClient.ResolveAlert({
        alert_id: params.alert_id,
        resolved_by: params.resolved_by || 'WebUI Operator',
        resolution_notes: params.notes || 'Resolved via Command Center',
      }, (err, res) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'cmd_error', data: { command, error: err.message } }));
        } else {
          ws.send(JSON.stringify({ type: 'cmd_result', data: { command, result: res } }));
          broadcast(wss, 'server_alert', {
            title: '✅ Alert Resolved',
            message: `Alert ${params.alert_id} has been cleared.`,
            details: params.notes || 'Resolved via Command Center',
            severity: 'INFO',
            ts: Date.now(),
          });
        }
      });
      break;

    default:
      ws.send(JSON.stringify({ type: 'cmd_error', data: { command, error: `Unknown command: ${command}` } }));
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Attach WebSocket server to an existing HTTP server.
 * @param {http.Server} httpServer
 */
function attachWebSocket(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer });

  // Start streaming gRPC → WebSocket (with small delay to let gRPC server bind)
  setTimeout(() => {
    startGrpcStreams(wss);
    startServerPush(wss);
  }, 1500);

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[WS-Bridge] Client connected: ${clientIp}`);

    // Send initial snapshot on connect
    const intersections = store.getAllIntersections();
    const alerts        = store.getActiveAlerts();
    const sensors       = store.getAllSensors();
    const units         = store.getAllUnits();

    ws.send(JSON.stringify({
      type: 'initial_state',
      data: { intersections, alerts, sensors, units },
      ts: Date.now(),
    }));

    // Handle commands from browser
    ws.on('message', (raw) => handleClientCommand(ws, wss, raw));

    ws.on('close', () => {
      console.log(`[WS-Bridge] Client disconnected: ${clientIp}`);
    });

    ws.on('error', (err) => {
      console.error('[WS-Bridge] Client error:', err.message);
    });
  });

  wss.on('error', (err) => {
    console.error('[WS-Bridge] WSS error:', err.message);
  });

  // Cleanup on process exit
  process.on('SIGINT', () => {
    stopGrpcStreams();
    if (serverPushTimer) clearInterval(serverPushTimer);
    wss.close();
  });

  console.log('[WS-Bridge] WebSocket server attached and ready.');
  return wss;
}

module.exports = { attachWebSocket };
