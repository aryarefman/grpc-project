// ============================================================================
// NovaPulse MQTT - Feature Configuration
// QoS, Expiry, Flow Control (MQTT 5.0), Retain settings
// ============================================================================

const QOS = {
  AT_MOST_ONCE: 0,   // Fire-and-forget (sensor data)
  AT_LEAST_ONCE: 1,  // Guaranteed delivery (status updates)
  EXACTLY_ONCE: 2,   // Critical messages (emergency alerts)
};

// ── Message Expiry Intervals (seconds) ──────────────────────────────────────
// MQTT 5.0: messageExpiryInterval di packet properties
// Broker otomatis buang pesan yang sudah melewati expiry
const EXPIRY = {
  TRAFFIC_CONGESTION: 60,
  TRAFFIC_INCIDENT: 3600,
  TRAFFIC_LIGHT: 120,
  ENVIRONMENT_READING: 300,
  ENVIRONMENT_ALERT: 3600,
  EMERGENCY_ALERT: 7200,
  EMERGENCY_DISPATCH: 3600,
  SYSTEM_HEARTBEAT: 30,
  SUMMARY: 600,
  UNIT_STATUS: 300,
};

// ── MQTT 5.0 Flow Control ───────────────────────────────────────────────────
// Digunakan di connection options → broker enforce secara otomatis
// receiveMaximum: max QoS 1/2 messages inflight bersamaan
// maximumPacketSize: ukuran maksimum packet yang diterima
const FLOW_CONTROL = {
  RECEIVE_MAXIMUM: 10,
  MAX_PACKET_SIZE: 4096,
};

// ── LWT (Last Will and Testament) Properties ────────────────────────────────
// MQTT 5.0: will properties di connection options
const LWT_PROPERTIES = {
  WILL_DELAY_INTERVAL: 5,        // Tunggu 5 detik sebelum kirim LWT
  WILL_EXPIRY_INTERVAL: 3600,    // LWT message expire setelah 1 jam
};

module.exports = { QOS, EXPIRY, FLOW_CONTROL, LWT_PROPERTIES };
