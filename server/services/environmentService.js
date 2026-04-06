// ============================================================================
// EnvironmentService - gRPC Service Implementation
// Provides: Unary RPCs + Bi-directional Streaming
// ============================================================================

const grpc = require('@grpc/grpc-js');
const store = require('../store/inMemoryStore');

const VALID_SENSOR_TYPES = ['AIR_QUALITY', 'TEMPERATURE', 'HUMIDITY', 'NOISE', 'WATER_QUALITY'];

const environmentService = {
  // ── Unary: Register sensor ──────────────────────────────────────────────
  RegisterSensor(call, callback) {
    const { name, type, location, zone, latitude, longitude } = call.request;
    console.log(`[Environment] RegisterSensor: ${name} (${type})`);

    // Error handling
    if (!name || !type || !location || !zone) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'name, type, location, and zone are required',
      });
    }

    if (!VALID_SENSOR_TYPES.includes(type.toUpperCase())) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: `Invalid sensor type. Must be one of: ${VALID_SENSOR_TYPES.join(', ')}`,
      });
    }

    const sensor = store.registerSensor({
      name,
      type: type.toUpperCase(),
      location,
      zone: zone.toUpperCase(),
      latitude: latitude || 0,
      longitude: longitude || 0,
    });

    callback(null, {
      success: true,
      message: `Sensor "${name}" registered successfully`,
      sensor_id: sensor.sensor_id,
    });
  },

  // ── Unary: Get sensor reading ───────────────────────────────────────────
  GetSensorReading(call, callback) {
    const { sensor_id } = call.request;
    console.log(`[Environment] GetSensorReading: ${sensor_id}`);

    if (!sensor_id) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'sensor_id is required',
      });
    }

    const sensor = store.getSensor(sensor_id);
    if (!sensor) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Sensor ${sensor_id} not found`,
      });
    }

    callback(null, sensor);
  },

  // ── Unary: List all sensors ─────────────────────────────────────────────
  ListSensors(call, callback) {
    console.log('[Environment] ListSensors');
    const sensors = store.getAllSensors();
    callback(null, { sensors });
  },

  // ── Unary: Get area report ──────────────────────────────────────────────
  GetAreaReport(call, callback) {
    const { zone } = call.request;
    console.log(`[Environment] GetAreaReport: ${zone || 'ALL'}`);

    const report = store.getAreaReport((zone || 'ALL').toUpperCase());
    callback(null, report);
  },

  // ── Unary: Remove sensor ───────────────────────────────────────────────
  RemoveSensor(call, callback) {
    const { sensor_id } = call.request;
    console.log(`[Environment] RemoveSensor: ${sensor_id}`);

    if (!sensor_id) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'sensor_id is required',
      });
    }

    const removed = store.removeSensor(sensor_id);
    if (!removed) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Sensor ${sensor_id} not found`,
      });
    }

    callback(null, {
      success: true,
      message: `Sensor ${sensor_id} removed successfully`,
    });
  },

  // ── Bi-directional Streaming: Live sensor data exchange ─────────────────
  LiveSensorStream(call) {
    console.log('[Environment] LiveSensorStream started');
    let messageCount = 0;

    // Handle incoming sensor data from client
    call.on('data', (sensorData) => {
      messageCount++;
      const { sensor_id, value, timestamp, metadata } = sensorData;
      console.log(`[Environment] Received sensor data #${messageCount}: ${sensor_id} = ${value}`);

      // Validate sensor exists
      const sensor = store.getSensor(sensor_id);
      if (!sensor) {
        // Send error alert back to client
        try {
          call.write({
            alert_id: `ERR-${Date.now()}`,
            sensor_id: sensor_id,
            sensor_name: 'UNKNOWN',
            alert_type: 'SENSOR_OFFLINE',
            severity: 'WARNING',
            message: `Sensor ${sensor_id} not found. Please register the sensor first.`,
            current_value: value,
            threshold_value: 0,
            timestamp: Date.now(),
          });
        } catch (err) {
          // Stream already closed
        }
        return;
      }

      // Update sensor reading and check thresholds
      const result = store.updateSensorReading(sensor_id, value, metadata || {});

      if (result && result.alerts.length > 0) {
        // Stream alerts back to client
        result.alerts.forEach(alert => {
          try {
            call.write(alert);
            console.log(`[Environment] Alert sent: ${alert.alert_type} - ${alert.severity} for ${sensor_id}`);
          } catch (err) {
            // Stream already closed
          }
        });
      }
    });

    // Handle client end
    call.on('end', () => {
      console.log(`[Environment] LiveSensorStream ended. Processed ${messageCount} messages.`);
      call.end();
    });

    // Handle errors
    call.on('error', (err) => {
      if (err.code !== grpc.status.CANCELLED) {
        console.error(`[Environment] LiveSensorStream error: ${err.message}`);
      }
    });

    call.on('cancelled', () => {
      console.log('[Environment] LiveSensorStream cancelled by client');
    });
  },
};

module.exports = environmentService;
