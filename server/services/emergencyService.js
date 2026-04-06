// ============================================================================
// EmergencyService - gRPC Service Implementation
// Provides: Unary RPCs + Server-side Streaming
// ============================================================================

const grpc = require('@grpc/grpc-js');
const store = require('../store/inMemoryStore');

const VALID_ALERT_TYPES = ['FIRE', 'MEDICAL', 'CRIME', 'NATURAL_DISASTER', 'HAZMAT', 'TRAFFIC_ACCIDENT'];
const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_UNIT_STATUSES = ['AVAILABLE', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'RETURNING'];
const SEVERITY_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

const emergencyService = {
  // ── Unary: Create alert ─────────────────────────────────────────────────
  CreateAlert(call, callback) {
    const { type, severity, location, zone, description, reporter_name } = call.request;
    console.log(`[Emergency] CreateAlert: ${type} at ${location}`);

    // Error handling
    if (!type || !severity || !location || !zone || !description) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'type, severity, location, zone, and description are required',
      });
    }

    if (!VALID_ALERT_TYPES.includes(type.toUpperCase())) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: `Invalid alert type. Must be one of: ${VALID_ALERT_TYPES.join(', ')}`,
      });
    }

    if (!VALID_SEVERITIES.includes(severity.toUpperCase())) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}`,
      });
    }

    const alert = store.createAlert({
      ...call.request,
      type: type.toUpperCase(),
      severity: severity.toUpperCase(),
      zone: zone.toUpperCase(),
    });

    callback(null, {
      success: true,
      message: `Emergency alert created: ${type} at ${location}`,
      alert_id: alert.alert_id,
    });
  },

  // ── Unary: Get alert ────────────────────────────────────────────────────
  GetAlert(call, callback) {
    const { alert_id } = call.request;
    console.log(`[Emergency] GetAlert: ${alert_id}`);

    if (!alert_id) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'alert_id is required',
      });
    }

    const alert = store.getEmergencyAlert(alert_id);
    if (!alert) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Alert ${alert_id} not found`,
      });
    }

    callback(null, alert);
  },

  // ── Unary: List active alerts ───────────────────────────────────────────
  ListActiveAlerts(call, callback) {
    console.log('[Emergency] ListActiveAlerts');
    const alerts = store.getActiveAlerts();
    callback(null, { alerts });
  },

  // ── Unary: Dispatch unit ────────────────────────────────────────────────
  DispatchUnit(call, callback) {
    const { alert_id, unit_id } = call.request;
    console.log(`[Emergency] DispatchUnit: ${unit_id} -> ${alert_id}`);

    if (!alert_id || !unit_id) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'alert_id and unit_id are required',
      });
    }

    const alert = store.getEmergencyAlert(alert_id);
    if (!alert) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Alert ${alert_id} not found`,
      });
    }

    if (alert.status === 'RESOLVED') {
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: `Alert ${alert_id} is already resolved`,
      });
    }

    const unit = store.getUnit(unit_id);
    if (!unit) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Unit ${unit_id} not found`,
      });
    }

    if (unit.status !== 'AVAILABLE') {
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: `Unit ${unit_id} is not available (current status: ${unit.status})`,
      });
    }

    const result = store.dispatchUnit(alert_id, unit_id);
    if (!result) {
      return callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to dispatch unit',
      });
    }

    callback(null, {
      success: true,
      message: `${result.unit.name} dispatched to ${alert.location}`,
      alert_id,
      unit_id,
      estimated_arrival: result.estimated_arrival,
    });
  },

  // ── Unary: Update unit status ───────────────────────────────────────────
  UpdateUnitStatus(call, callback) {
    const { unit_id, status, latitude, longitude, notes } = call.request;
    console.log(`[Emergency] UpdateUnitStatus: ${unit_id} -> ${status}`);

    if (!unit_id || !status) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'unit_id and status are required',
      });
    }

    if (!VALID_UNIT_STATUSES.includes(status.toUpperCase())) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: `Invalid status. Must be one of: ${VALID_UNIT_STATUSES.join(', ')}`,
      });
    }

    const unit = store.updateUnit(unit_id, {
      status: status.toUpperCase(),
      latitude,
      longitude,
      notes,
    });

    if (!unit) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Unit ${unit_id} not found`,
      });
    }

    callback(null, {
      success: true,
      message: `Unit ${unit.name} status updated to ${status}`,
      unit_id,
      current_status: unit.status,
    });
  },

  // ── Unary: Get unit ─────────────────────────────────────────────────────
  GetUnit(call, callback) {
    const { unit_id } = call.request;
    console.log(`[Emergency] GetUnit: ${unit_id}`);

    if (!unit_id) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'unit_id is required',
      });
    }

    const unit = store.getUnit(unit_id);
    if (!unit) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Unit ${unit_id} not found`,
      });
    }

    callback(null, unit);
  },

  // ── Unary: List all units ───────────────────────────────────────────────
  ListUnits(call, callback) {
    console.log('[Emergency] ListUnits');
    const units = store.getAllUnits();
    callback(null, { units });
  },

  // ── Unary: Resolve alert ────────────────────────────────────────────────
  ResolveAlert(call, callback) {
    const { alert_id, resolved_by, resolution_notes } = call.request;
    console.log(`[Emergency] ResolveAlert: ${alert_id}`);

    if (!alert_id) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'alert_id is required',
      });
    }

    const alert = store.getEmergencyAlert(alert_id);
    if (!alert) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Alert ${alert_id} not found`,
      });
    }

    if (alert.status === 'RESOLVED') {
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: `Alert ${alert_id} is already resolved`,
      });
    }

    const resolved = store.resolveEmergencyAlert(
      alert_id,
      resolved_by || 'System',
      resolution_notes || ''
    );

    callback(null, {
      success: true,
      message: `Alert ${alert_id} resolved successfully`,
      alert_id,
    });
  },

  // ── Server-side Streaming: Subscribe to emergency alerts ────────────────
  SubscribeAlerts(call) {
    const { zone, min_severity } = call.request;
    const subscribeZone = (zone || 'ALL').toUpperCase();
    const minSev = (min_severity || 'LOW').toUpperCase();
    const minSevOrder = SEVERITY_ORDER[minSev] || 0;

    console.log(`[Emergency] SubscribeAlerts started for zone: ${subscribeZone}, min severity: ${minSev}`);

    // Send current active alerts first
    const activeAlerts = store.getActiveAlerts();
    activeAlerts
      .filter(a => subscribeZone === 'ALL' || a.zone === subscribeZone)
      .filter(a => (SEVERITY_ORDER[a.severity] || 0) >= minSevOrder)
      .forEach(a => {
        call.write({
          event_id: `INIT-${a.alert_id}`,
          event_type: 'EXISTING_ALERT',
          alert_id: a.alert_id,
          alert_type: a.type,
          severity: a.severity,
          location: a.location,
          zone: a.zone,
          description: a.description,
          unit_id: '',
          unit_name: '',
          timestamp: a.created_at,
        });
      });

    // Listen for new emergency events
    const onEvent = (event) => {
      if (subscribeZone !== 'ALL' && event.zone !== subscribeZone) return;
      if ((SEVERITY_ORDER[event.severity] || 0) < minSevOrder) return;

      try {
        call.write(event);
      } catch (err) {
        store.removeListener('emergency_event', onEvent);
      }
    };

    store.on('emergency_event', onEvent);

    // Clean up on client disconnect
    call.on('cancelled', () => {
      console.log(`[Emergency] SubscribeAlerts cancelled for zone: ${subscribeZone}`);
      store.removeListener('emergency_event', onEvent);
    });

    call.on('error', () => {
      store.removeListener('emergency_event', onEvent);
    });
  },
};

module.exports = emergencyService;
