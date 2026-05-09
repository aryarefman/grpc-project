// ============================================================================
// NovaPulse MQTT - Topic Registry
// Central definition of all MQTT topics, wildcards, shared subscriptions
// ============================================================================

const ZONES = ['CENTRAL', 'NORTH', 'SOUTH', 'EAST', 'WEST'];
const SENSOR_TYPES = ['air_quality', 'temperature', 'humidity', 'noise', 'water_quality'];

// ── Topic Builders ──────────────────────────────────────────────────────────
const TOPICS = {
  TRAFFIC: {
    CONGESTION: (zone) => `novapulse/traffic/${zone}/congestion`,
    INCIDENT: (zone) => `novapulse/traffic/${zone}/incident`,
    LIGHT_CHANGE: (zone) => `novapulse/traffic/${zone}/light-change`,
    SUMMARY: 'novapulse/traffic/summary',
  },
  ENVIRONMENT: {
    READING: (zone, sensorType) => `novapulse/environment/${zone}/${sensorType}/reading`,
    ALERT: (zone) => `novapulse/environment/${zone}/alert`,
    SUMMARY: 'novapulse/environment/summary',
  },
  EMERGENCY: {
    ALERT_NEW: 'novapulse/emergency/alert/new',
    ALERT_UPDATE: 'novapulse/emergency/alert/update',
    ALERT_RESOLVED: 'novapulse/emergency/alert/resolved',
    DISPATCH_REQUEST: 'novapulse/emergency/dispatch/request',
    DISPATCH_RESPONSE: 'novapulse/emergency/dispatch/response',
    UNIT_STATUS: (unitId) => `novapulse/emergency/unit/${unitId}/status`,
  },
  SYSTEM: {
    HEARTBEAT: 'novapulse/system/heartbeat',
    STATUS: (component) => `novapulse/system/status/${component}`,
    COMMAND_REQUEST: 'novapulse/system/command/request',
    COMMAND_RESPONSE: (correlationId) => `novapulse/system/command/response/${correlationId}`,
  },
};

// ── Wildcard Subscriptions ──────────────────────────────────────────────────
const WILDCARDS = {
  ALL: 'novapulse/#',
  ALL_TRAFFIC: 'novapulse/traffic/#',
  ALL_TRAFFIC_CONGESTION: 'novapulse/traffic/+/congestion',
  ALL_TRAFFIC_INCIDENTS: 'novapulse/traffic/+/incident',
  ALL_ENVIRONMENT: 'novapulse/environment/#',
  ALL_ENV_READINGS: 'novapulse/environment/+/+/reading',
  ALL_ENV_ALERTS: 'novapulse/environment/+/alert',
  ALL_EMERGENCY: 'novapulse/emergency/#',
  ALL_SYSTEM_STATUS: 'novapulse/system/status/+',
  ALL_UNIT_STATUS: 'novapulse/emergency/unit/+/status',
};

// ── Shared Subscription (load-balanced) ─────────────────────────────────────
const SHARED_TOPICS = {
  EMERGENCY_ALERT_WORKERS: '$share/alert-workers/novapulse/emergency/alert/new',
};

// ── Topic Alias Map (reduces bandwidth for frequent topics) ─────────────────
const TOPIC_ALIASES = {
  'novapulse/traffic/CENTRAL/congestion': 1,
  'novapulse/traffic/NORTH/congestion': 2,
  'novapulse/traffic/SOUTH/congestion': 3,
  'novapulse/traffic/EAST/congestion': 4,
  'novapulse/traffic/WEST/congestion': 5,
  'novapulse/environment/CENTRAL/air_quality/reading': 6,
  'novapulse/environment/CENTRAL/temperature/reading': 7,
  'novapulse/system/heartbeat': 8,
};

module.exports = { TOPICS, WILDCARDS, SHARED_TOPICS, TOPIC_ALIASES, ZONES, SENSOR_TYPES };
