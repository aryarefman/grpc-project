// ============================================================================
// NovaPulse MQTT - Feature Configuration
// QoS, Expiry, Flow Control (MQTT 5.0), Retain settings
// ============================================================================

const QOS = {
  AT_MOST_ONCE: 0,   // Fire-and-forget (sensor data)
  AT_LEAST_ONCE: 1,  // Guaranteed delivery (status updates)
  EXACTLY_ONCE: 2,   // Critical messages (emergency alerts)
};

// ── Message Expiry Intervals (seconds) ─────────────────────────────────────
// Fitur 6: MQTT 5.0 messageExpiryInterval di packet properties
// Broker otomatis drop pesan yang sudah melewati TTL
const EXPIRY = {
  TRAFFIC_CONGESTION: 60,      // 60 detik — data cepat basi
  TRAFFIC_INCIDENT: 3600,      // 1 jam
  TRAFFIC_LIGHT: 120,          // 2 menit
  ENVIRONMENT_READING: 300,    // 5 menit
  ENVIRONMENT_ALERT: 3600,     // 1 jam
  EMERGENCY_ALERT: 7200,       // 2 jam
  EMERGENCY_DISPATCH: 3600,    // 1 jam
  SYSTEM_HEARTBEAT: 30,        // 30 detik — heartbeat cepat basi
  SUMMARY: 600,                // 10 menit
  UNIT_STATUS: 300,            // 5 menit
};

// ── MQTT 5.0 Flow Control (Fitur 10) ────────────────────────────────────────
// AKTIF: dipassing ke mqtt.connect() properties di semua client
// receiveMaximum → subscriber memberitahu broker: "max N pesan in-flight"
//   sebelum aku kirim ACK (Backpressure). Broker WAJIB patuh.
// maximumPacketSize → client tolak packet yang melebihi batas ukuran ini
const FLOW_CONTROL = {
  RECEIVE_MAXIMUM: 10,         // Max 10 QoS 1/2 pesan in-flight bersamaan
  MAX_PACKET_SIZE: 4096,       // Max 4KB per packet
};

// ── LWT (Last Will and Testament) Properties (Fitur 7) ─────────────────────
// AKTIF: dipassing ke will.properties di semua publisher
// willDelayInterval → broker tunggu N detik sebelum kirim LWT
//   (memberi kesempatan reconnect sebelum announce offline)
// willExpiryInterval → LWT message expire setelah N detik di retain storage
const LWT_PROPERTIES = {
  WILL_DELAY_INTERVAL: 5,        // Tunggu 5 detik sebelum kirim LWT
  WILL_EXPIRY_INTERVAL: 3600,    // LWT message expire setelah 1 jam
};

module.exports = { QOS, EXPIRY, FLOW_CONTROL, LWT_PROPERTIES };
