// ============================================================================
// TrafficService - gRPC Service Implementation
// Provides: Unary RPCs + Server-side Streaming
// ============================================================================

const grpc = require('@grpc/grpc-js');
const store = require('../store/inMemoryStore');

const VALID_LIGHTS = ['RED', 'YELLOW', 'GREEN'];
const VALID_INCIDENT_TYPES = ['ACCIDENT', 'CONSTRUCTION', 'FLOOD', 'BREAKDOWN'];
const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const trafficService = {
  // ── Unary: Get intersection status ──────────────────────────────────────
  GetIntersectionStatus(call, callback) {
    const { intersection_id } = call.request;
    console.log(`[Traffic] GetIntersectionStatus: ${intersection_id}`);

    if (!intersection_id) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'intersection_id is required',
      });
    }

    const intersection = store.getIntersection(intersection_id);
    if (!intersection) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Intersection ${intersection_id} not found`,
      });
    }

    callback(null, intersection);
  },

  // ── Unary: List all intersections ───────────────────────────────────────
  ListIntersections(call, callback) {
    console.log('[Traffic] ListIntersections');
    const intersections = store.getAllIntersections();
    callback(null, { intersections });
  },

  // ── Unary: Update traffic light ─────────────────────────────────────────
  UpdateTrafficLight(call, callback) {
    const { intersection_id, new_light, duration_seconds, reason } = call.request;
    console.log(`[Traffic] UpdateTrafficLight: ${intersection_id} -> ${new_light}`);

    // Error handling: validate inputs
    if (!intersection_id) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'intersection_id is required',
      });
    }

    if (!new_light || !VALID_LIGHTS.includes(new_light.toUpperCase())) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: `Invalid light value. Must be one of: ${VALID_LIGHTS.join(', ')}`,
      });
    }

    const result = store.updateTrafficLight(
      intersection_id,
      new_light.toUpperCase(),
      duration_seconds,
      reason || 'Manual override'
    );

    if (!result) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Intersection ${intersection_id} not found`,
      });
    }

    callback(null, {
      success: true,
      message: `Traffic light updated successfully`,
      intersection_id,
      previous_light: result.previousLight,
      current_light: result.currentLight,
    });
  },

  // ── Unary: Report incident ──────────────────────────────────────────────
  ReportIncident(call, callback) {
    const { intersection_id, type, severity, description, reported_by } = call.request;
    console.log(`[Traffic] ReportIncident at ${intersection_id}: ${type}`);

    // Error handling
    if (!intersection_id || !type || !severity || !description) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'intersection_id, type, severity, and description are required',
      });
    }

    if (!VALID_INCIDENT_TYPES.includes(type.toUpperCase())) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: `Invalid incident type. Must be one of: ${VALID_INCIDENT_TYPES.join(', ')}`,
      });
    }

    if (!VALID_SEVERITIES.includes(severity.toUpperCase())) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}`,
      });
    }

    const intersection = store.getIntersection(intersection_id);
    if (!intersection) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Intersection ${intersection_id} not found`,
      });
    }

    const incident = store.createIncident({
      intersection_id,
      type: type.toUpperCase(),
      severity: severity.toUpperCase(),
      description,
      reported_by: reported_by || 'Anonymous',
    });

    callback(null, {
      success: true,
      message: `Incident reported successfully`,
      incident_id: incident.incident_id,
      status: incident.status,
    });
  },

  // ── Unary: Get incident ─────────────────────────────────────────────────
  GetIncident(call, callback) {
    const { incident_id } = call.request;
    console.log(`[Traffic] GetIncident: ${incident_id}`);

    if (!incident_id) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'incident_id is required',
      });
    }

    const incident = store.getIncident(incident_id);
    if (!incident) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Incident ${incident_id} not found`,
      });
    }

    callback(null, incident);
  },

  // ── Unary: Resolve incident ─────────────────────────────────────────────
  ResolveIncident(call, callback) {
    const { incident_id, resolved_by, resolution_notes } = call.request;
    console.log(`[Traffic] ResolveIncident: ${incident_id}`);

    if (!incident_id) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'incident_id is required',
      });
    }

    const incident = store.getIncident(incident_id);
    if (!incident) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Incident ${incident_id} not found`,
      });
    }

    if (incident.status === 'RESOLVED') {
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: `Incident ${incident_id} is already resolved`,
      });
    }

    const resolved = store.resolveIncident(
      incident_id,
      resolved_by || 'System',
      resolution_notes || ''
    );

    callback(null, {
      success: true,
      message: 'Incident resolved successfully',
      incident_id: resolved.incident_id,
    });
  },

  // ── Server-side Streaming: Monitor traffic ──────────────────────────────
  MonitorTraffic(call) {
    const { zone } = call.request;
    const monitorZone = (zone || 'ALL').toUpperCase();
    console.log(`[Traffic] MonitorTraffic started for zone: ${monitorZone}`);

    // Send initial state
    const intersections = store.getAllIntersections();
    intersections
      .filter(i => monitorZone === 'ALL' || i.zone === monitorZone)
      .forEach(i => {
        call.write({
          intersection_id: i.intersection_id,
          name: i.name,
          event_type: 'INITIAL_STATE',
          current_light: i.current_light,
          vehicle_count: i.vehicle_count,
          congestion_level: i.congestion_level,
          details: `Initial state for ${i.name}`,
          timestamp: Date.now(),
        });
      });

    // Listen for real-time updates
    const onUpdate = (update) => {
      if (monitorZone === 'ALL' || update.zone === monitorZone) {
        try {
          call.write(update);
        } catch (err) {
          // Client disconnected
          store.removeListener('traffic_update', onUpdate);
        }
      }
    };

    store.on('traffic_update', onUpdate);

    // Clean up on client disconnect
    call.on('cancelled', () => {
      console.log(`[Traffic] MonitorTraffic cancelled for zone: ${monitorZone}`);
      store.removeListener('traffic_update', onUpdate);
    });

    call.on('error', () => {
      store.removeListener('traffic_update', onUpdate);
    });
  },
};

module.exports = trafficService;
