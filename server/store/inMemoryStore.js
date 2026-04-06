// ============================================================================
// CityNexus - In-Memory Data Store
// Centralized state management with event emitter for real-time updates
// ============================================================================

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class InMemoryStore extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Support many concurrent clients

    // ── Traffic Data ────────────────────────────────────────────────────
    this.intersections = new Map();
    this.incidents = new Map();

    // ── Environment Data ────────────────────────────────────────────────
    this.sensors = new Map();
    this.sensorReadings = new Map(); // sensor_id -> [readings]
    this.sensorAlerts = new Map();

    // ── Emergency Data ──────────────────────────────────────────────────
    this.alerts = new Map();
    this.units = new Map();

    // Initialize with seed data
    this._seedData();
  }

  // ════════════════════════════════════════════════════════════════════════
  // SEED DATA - Initial state for demo
  // ════════════════════════════════════════════════════════════════════════

  _seedData() {
    // Seed intersections
    const intersections = [
      { id: 'INT-001', name: 'Jl. Sudirman × Jl. Thamrin', zone: 'CENTRAL', current_light: 'GREEN', vehicle_count: 45, congestion_level: 0.3 },
      { id: 'INT-002', name: 'Jl. Gatot Subroto × Jl. Rasuna Said', zone: 'SOUTH', current_light: 'RED', vehicle_count: 120, congestion_level: 0.8 },
      { id: 'INT-003', name: 'Jl. MH Thamrin × Jl. Kebon Sirih', zone: 'CENTRAL', current_light: 'GREEN', vehicle_count: 30, congestion_level: 0.2 },
      { id: 'INT-004', name: 'Jl. Ahmad Yani × Jl. Pemuda', zone: 'NORTH', current_light: 'YELLOW', vehicle_count: 85, congestion_level: 0.6 },
      { id: 'INT-005', name: 'Jl. Diponegoro × Jl. Imam Bonjol', zone: 'WEST', current_light: 'RED', vehicle_count: 95, congestion_level: 0.7 },
      { id: 'INT-006', name: 'Jl. Mangga Dua × Jl. Gunung Sahari', zone: 'NORTH', current_light: 'GREEN', vehicle_count: 60, congestion_level: 0.4 },
      { id: 'INT-007', name: 'Jl. Panglima Polim × Jl. Wolter Monginsidi', zone: 'SOUTH', current_light: 'GREEN', vehicle_count: 25, congestion_level: 0.15 },
      { id: 'INT-008', name: 'Jl. Casablanca × Jl. Prof. Dr. Satrio', zone: 'EAST', current_light: 'RED', vehicle_count: 110, congestion_level: 0.75 },
    ];

    intersections.forEach(i => {
      this.intersections.set(i.id, {
        ...i,
        intersection_id: i.id,
        status: i.congestion_level > 0.7 ? 'CONGESTED' : 'NORMAL',
        last_updated: Date.now(),
      });
    });

    // Seed sensors
    const sensors = [
      { name: 'AQ-Sensor Sudirman', type: 'AIR_QUALITY', location: 'Jl. Sudirman No. 1', zone: 'CENTRAL', lat: -6.2088, lng: 106.8456 },
      { name: 'Temp-Sensor Thamrin', type: 'TEMPERATURE', location: 'Jl. Thamrin No. 5', zone: 'CENTRAL', lat: -6.1954, lng: 106.8231 },
      { name: 'Humidity-Sensor Kemang', type: 'HUMIDITY', location: 'Jl. Kemang Raya', zone: 'SOUTH', lat: -6.2615, lng: 106.8106 },
      { name: 'Noise-Sensor Mangga Dua', type: 'NOISE', location: 'Jl. Mangga Dua Raya', zone: 'NORTH', lat: -6.1481, lng: 106.8298 },
      { name: 'AQ-Sensor Kuningan', type: 'AIR_QUALITY', location: 'Jl. Kuningan', zone: 'EAST', lat: -6.2297, lng: 106.8372 },
      { name: 'Water-Sensor Ciliwung', type: 'WATER_QUALITY', location: 'Sungai Ciliwung', zone: 'CENTRAL', lat: -6.2146, lng: 106.8451 },
    ];

    sensors.forEach(s => {
      const id = `SNS-${uuidv4().substring(0, 8).toUpperCase()}`;
      const value = this._generateSensorValue(s.type);
      this.sensors.set(id, {
        sensor_id: id,
        name: s.name,
        type: s.type,
        location: s.location,
        zone: s.zone,
        latitude: s.lat,
        longitude: s.lng,
        value: value.value,
        unit: value.unit,
        quality_level: value.quality,
        status: 'ONLINE',
        last_reading_at: Date.now(),
      });
      this.sensorReadings.set(id, []);
    });

    // Seed emergency units
    const units = [
      { name: 'Ambulance Alpha-1', type: 'AMBULANCE', lat: -6.2088, lng: 106.8456, personnel: 3 },
      { name: 'Ambulance Alpha-2', type: 'AMBULANCE', lat: -6.1954, lng: 106.8231, personnel: 3 },
      { name: 'Fire Truck Bravo-1', type: 'FIRE_TRUCK', lat: -6.2297, lng: 106.8372, personnel: 6 },
      { name: 'Fire Truck Bravo-2', type: 'FIRE_TRUCK', lat: -6.2615, lng: 106.8106, personnel: 5 },
      { name: 'Police Unit Charlie-1', type: 'POLICE', lat: -6.1481, lng: 106.8298, personnel: 2 },
      { name: 'Police Unit Charlie-2', type: 'POLICE', lat: -6.2146, lng: 106.8451, personnel: 2 },
      { name: 'HAZMAT Team Delta-1', type: 'HAZMAT', lat: -6.2200, lng: 106.8300, personnel: 4 },
      { name: 'Rescue Team Echo-1', type: 'RESCUE', lat: -6.1900, lng: 106.8200, personnel: 5 },
    ];

    units.forEach(u => {
      const id = `UNIT-${uuidv4().substring(0, 6).toUpperCase()}`;
      this.units.set(id, {
        unit_id: id,
        name: u.name,
        type: u.type,
        status: 'AVAILABLE',
        latitude: u.lat,
        longitude: u.lng,
        current_alert_id: '',
        personnel_count: u.personnel,
        last_updated: Date.now(),
      });
    });

    console.log(`[Store] Seeded ${this.intersections.size} intersections`);
    console.log(`[Store] Seeded ${this.sensors.size} sensors`);
    console.log(`[Store] Seeded ${this.units.size} emergency units`);

    // Start simulation
    this._startSimulation();
  }

  _generateSensorValue(type) {
    switch (type) {
      case 'AIR_QUALITY':
        const aqi = Math.floor(Math.random() * 200) + 20;
        return { value: aqi, unit: 'AQI', quality: aqi < 50 ? 'GOOD' : aqi < 100 ? 'MODERATE' : aqi < 150 ? 'POOR' : 'HAZARDOUS' };
      case 'TEMPERATURE':
        const temp = 25 + Math.random() * 15;
        return { value: Math.round(temp * 10) / 10, unit: '°C', quality: temp < 30 ? 'GOOD' : temp < 35 ? 'MODERATE' : 'POOR' };
      case 'HUMIDITY':
        const hum = 40 + Math.random() * 50;
        return { value: Math.round(hum * 10) / 10, unit: '%', quality: hum > 40 && hum < 70 ? 'GOOD' : 'MODERATE' };
      case 'NOISE':
        const noise = 30 + Math.random() * 70;
        return { value: Math.round(noise * 10) / 10, unit: 'dB', quality: noise < 55 ? 'GOOD' : noise < 70 ? 'MODERATE' : 'POOR' };
      case 'WATER_QUALITY':
        const wq = Math.random() * 100;
        return { value: Math.round(wq * 10) / 10, unit: 'WQI', quality: wq > 80 ? 'GOOD' : wq > 50 ? 'MODERATE' : 'POOR' };
      default:
        return { value: 0, unit: 'N/A', quality: 'UNKNOWN' };
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // SIMULATION - Automatic state changes to demonstrate streaming
  // ════════════════════════════════════════════════════════════════════════

  _startSimulation() {
    // Simulate traffic changes every 5 seconds
    setInterval(() => {
      const ids = Array.from(this.intersections.keys());
      const randomId = ids[Math.floor(Math.random() * ids.length)];
      const intersection = this.intersections.get(randomId);

      if (intersection) {
        // Randomly update vehicle count and congestion
        const delta = Math.floor(Math.random() * 20) - 10;
        intersection.vehicle_count = Math.max(0, Math.min(200, intersection.vehicle_count + delta));
        intersection.congestion_level = Math.min(1.0, Math.max(0, intersection.vehicle_count / 180));
        
        // Only update status if not explicitly BLOCKED by an incident
        if (intersection.status !== 'BLOCKED') {
          intersection.status = intersection.congestion_level > 0.7 ? 'CONGESTED' : 'NORMAL';
        }
        intersection.last_updated = Date.now();

        // Cycle traffic light occasionally - ONLY if not in manual override or blocked
        if (!intersection.manual_until || Date.now() > intersection.manual_until) {
          if (intersection.status !== 'BLOCKED' && Math.random() < 0.3) {
            const lights = ['RED', 'YELLOW', 'GREEN'];
            const currentIdx = lights.indexOf(intersection.current_light);
            intersection.current_light = lights[(currentIdx + 1) % lights.length];
            
            this.emit('traffic_update', {
              intersection_id: randomId,
              name: intersection.name,
              event_type: 'LIGHT_CHANGE',
              current_light: intersection.current_light,
              vehicle_count: intersection.vehicle_count,
              congestion_level: intersection.congestion_level,
              details: `Auto-cycle: ${intersection.current_light}`,
              timestamp: Date.now(),
              zone: intersection.zone,
            });
          }
        }

        this.intersections.set(randomId, intersection);
        this.emit('traffic_update', {
          intersection_id: randomId,
          name: intersection.name,
          event_type: 'CONGESTION_UPDATE',
          current_light: intersection.current_light,
          vehicle_count: intersection.vehicle_count,
          congestion_level: intersection.congestion_level,
          details: `Traffic update at ${intersection.name}`,
          timestamp: Date.now(),
          zone: intersection.zone,
          status: intersection.status,
        });
      }
    }, 5000);

    // Simulate sensor value changes every 3 seconds
    setInterval(() => {
      const ids = Array.from(this.sensors.keys());
      const randomId = ids[Math.floor(Math.random() * ids.length)];
      const sensor = this.sensors.get(randomId);

      if (sensor) {
        const newVal = this._generateSensorValue(sensor.type);
        sensor.value = newVal.value;
        sensor.unit = newVal.unit;
        sensor.quality_level = newVal.quality;
        sensor.last_reading_at = Date.now();
        this.sensors.set(randomId, sensor);
      }
    }, 3000);
  }

  // ════════════════════════════════════════════════════════════════════════
  // TRAFFIC OPERATIONS
  // ════════════════════════════════════════════════════════════════════════

  getIntersection(id) {
    return this.intersections.get(id) || null;
  }

  getAllIntersections() {
    return Array.from(this.intersections.values());
  }

  updateTrafficLight(id, newLight, durationSeconds, reason) {
    const intersection = this.intersections.get(id);
    if (!intersection) return null;

    const previousLight = intersection.current_light;
    intersection.current_light = newLight;
    intersection.last_updated = Date.now();
    
    // Set manual override duration
    if (durationSeconds > 0) {
      intersection.manual_until = Date.now() + (durationSeconds * 1000);
    }
    
    this.intersections.set(id, intersection);

    this.emit('traffic_update', {
      intersection_id: id,
      name: intersection.name,
      event_type: 'LIGHT_CHANGE',
      current_light: newLight,
      vehicle_count: intersection.vehicle_count,
      congestion_level: intersection.congestion_level,
      details: `Light changed from ${previousLight} to ${newLight}. Reason: ${reason}`,
      timestamp: Date.now(),
      zone: intersection.zone,
      status: intersection.status,
    });

    return { previousLight, currentLight: newLight };
  }

  createIncident(data) {
    const id = `INC-${uuidv4().substring(0, 8).toUpperCase()}`;
    const incident = {
      incident_id: id,
      intersection_id: data.intersection_id,
      type: data.type,
      severity: data.severity,
      description: data.description,
      reported_by: data.reported_by,
      status: 'OPEN',
      reported_at: Date.now(),
      resolved_at: 0,
      resolved_by: '',
      resolution_notes: '',
    };
    this.incidents.set(id, incident);

    // Update intersection status if severity is HIGH or CRITICAL
    const intersection = this.intersections.get(data.intersection_id);
    if (intersection && (data.severity === 'HIGH' || data.severity === 'CRITICAL')) {
      intersection.status = 'BLOCKED';
      intersection.congestion_level = 1.0;
      this.intersections.set(data.intersection_id, intersection);
    }

    this.emit('traffic_update', {
      intersection_id: data.intersection_id,
      name: intersection ? intersection.name : 'Unknown',
      event_type: 'INCIDENT',
      current_light: intersection ? intersection.current_light : '',
      vehicle_count: intersection ? intersection.vehicle_count : 0,
      congestion_level: intersection ? intersection.congestion_level : 0,
      details: `${data.severity} ${data.type}: ${data.description}`,
      timestamp: Date.now(),
      zone: intersection ? intersection.zone : '',
      status: intersection ? intersection.status : 'BLOCKED',
    });

    // ── CROSS-SERVICE ORCHESTRATION ────────────────────────────────────
    // Automatically trigger emergency alert for high severity incidents
    if (data.severity === 'HIGH' || data.severity === 'CRITICAL') {
      const intersection = this.intersections.get(data.intersection_id);
      this.createAlert({
        type: data.type === 'ACCIDENT' ? 'MEDICAL' : 'GENERAL',
        severity: data.severity,
        location: intersection ? intersection.name : 'Unknown Intersection',
        zone: intersection ? intersection.zone : 'ALL',
        latitude: intersection ? intersection.latitude : 0,
        longitude: intersection ? intersection.longitude : 0,
        description: `AUTOMATIC ALERT: ${data.severity} traffic incident (${data.type}) reported at ${intersection ? intersection.name : data.intersection_id}. ${data.description}`,
        reporter_name: 'CityNexus TrafficSystem',
        reporter_contact: 'INTERNAL',
      });
    }

    return incident;
  }

  getIncident(id) {
    return this.incidents.get(id) || null;
  }

  resolveIncident(id, resolvedBy, notes) {
    const incident = this.incidents.get(id);
    if (!incident) return null;

    incident.status = 'RESOLVED';
    incident.resolved_at = Date.now();
    incident.resolved_by = resolvedBy;
    incident.resolution_notes = notes;
    this.incidents.set(id, incident);

    // Restore intersection status
    const intersection = this.intersections.get(incident.intersection_id);
    if (intersection) {
      intersection.status = 'NORMAL';
      intersection.congestion_level = Math.max(0.3, intersection.congestion_level - 0.3);
      this.intersections.set(incident.intersection_id, intersection);
    }

    return incident;
  }

  // ════════════════════════════════════════════════════════════════════════
  // ENVIRONMENT OPERATIONS
  // ════════════════════════════════════════════════════════════════════════

  registerSensor(data) {
    const id = `SNS-${uuidv4().substring(0, 8).toUpperCase()}`;
    const initialValue = this._generateSensorValue(data.type);
    const sensor = {
      sensor_id: id,
      name: data.name,
      type: data.type,
      location: data.location,
      zone: data.zone,
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
      value: initialValue.value,
      unit: initialValue.unit,
      quality_level: initialValue.quality,
      status: 'ONLINE',
      last_reading_at: Date.now(),
    };
    this.sensors.set(id, sensor);
    this.sensorReadings.set(id, []);
    return sensor;
  }

  getSensor(id) {
    return this.sensors.get(id) || null;
  }

  getAllSensors() {
    return Array.from(this.sensors.values());
  }

  removeSensor(id) {
    if (!this.sensors.has(id)) return false;
    this.sensors.delete(id);
    this.sensorReadings.delete(id);
    return true;
  }

  updateSensorReading(sensorId, value, metadata) {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) return null;

    const prevValue = sensor.value;
    const newVal = this._generateSensorValue(sensor.type);
    sensor.value = value !== undefined ? value : newVal.value;
    sensor.quality_level = newVal.quality;
    sensor.last_reading_at = Date.now();
    this.sensors.set(sensorId, sensor);

    // Store reading history
    const readings = this.sensorReadings.get(sensorId) || [];
    readings.push({ value: sensor.value, timestamp: Date.now(), metadata });
    if (readings.length > 100) readings.shift(); // Keep last 100
    this.sensorReadings.set(sensorId, readings);

    // Check thresholds and generate alerts
    const alerts = [];
    const thresholds = {
      AIR_QUALITY: { warn: 100, critical: 150 },
      TEMPERATURE: { warn: 35, critical: 40 },
      HUMIDITY: { warn: 80, critical: 90 },
      NOISE: { warn: 70, critical: 85 },
      WATER_QUALITY: { warn: 40, critical: 20 }, // Lower is worse for WQ
    };

    const threshold = thresholds[sensor.type];
    if (threshold) {
      if (sensor.type === 'WATER_QUALITY') {
        if (sensor.value < threshold.critical) {
          alerts.push(this._createSensorAlert(sensor, 'THRESHOLD_EXCEEDED', 'CRITICAL', threshold.critical));
        } else if (sensor.value < threshold.warn) {
          alerts.push(this._createSensorAlert(sensor, 'THRESHOLD_EXCEEDED', 'WARNING', threshold.warn));
        }
      } else {
        if (sensor.value > threshold.critical) {
          alerts.push(this._createSensorAlert(sensor, 'THRESHOLD_EXCEEDED', 'CRITICAL', threshold.critical));
        } else if (sensor.value > threshold.warn) {
          alerts.push(this._createSensorAlert(sensor, 'THRESHOLD_EXCEEDED', 'WARNING', threshold.warn));
        }
      }
    }

    // Check rapid change
    if (Math.abs(sensor.value - prevValue) > (prevValue * 0.3)) {
      alerts.push(this._createSensorAlert(sensor, 'RAPID_CHANGE', 'WARNING', prevValue));
    }

    // ── CROSS-SERVICE ORCHESTRATION ────────────────────────────────────
    // Automatically trigger emergency alert and traffic control for critical sensor readings
    alerts.forEach(alert => {
      if (alert.severity === 'CRITICAL') {
        // 1. Trigger Emergency Alert
        this.createAlert({
          type: 'ENV_HAZARD',
          severity: 'CRITICAL',
          location: sensor.location,
          zone: sensor.zone,
          latitude: sensor.latitude,
          longitude: sensor.longitude,
          description: `AUTOMATIC ALERT: ${alert.message}`,
          reporter_name: 'CityNexus EnvSystem',
          reporter_contact: 'INTERNAL',
        });

        // 2. Automated Traffic Control: Block intersections in the same zone if Air Quality or Gas is hazardous
        if (sensor.type === 'AIR_QUALITY' || sensor.type === 'GAS_LEVEL') {
          Array.from(this.intersections.values())
            .filter(i => i.zone === sensor.zone)
            .forEach(intersection => {
              this.updateTrafficLight(
                intersection.intersection_id,
                'RED',
                300,
                `AUTOMATED SAFETY BLOCK: Critical ${sensor.type} detected in zone ${sensor.zone}`
              );
            });
        }
      }
    });

    return { sensor, alerts };
  }

  _createSensorAlert(sensor, alertType, severity, thresholdValue) {
    return {
      alert_id: `SALRT-${uuidv4().substring(0, 8).toUpperCase()}`,
      sensor_id: sensor.sensor_id,
      sensor_name: sensor.name,
      alert_type: alertType,
      severity: severity,
      message: `${alertType}: ${sensor.name} (${sensor.type}) value ${sensor.value}${sensor.unit} exceeded threshold ${thresholdValue}${sensor.unit}`,
      current_value: sensor.value,
      threshold_value: thresholdValue,
      timestamp: Date.now(),
    };
  }

  getAreaReport(zone) {
    const sensors = Array.from(this.sensors.values()).filter(
      s => zone === 'ALL' || s.zone === zone
    );

    const byType = {};
    sensors.forEach(s => {
      if (!byType[s.type]) byType[s.type] = [];
      byType[s.type].push(s.value);
    });

    const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const avgAqi = avg(byType.AIR_QUALITY || []);
    const avgTemp = avg(byType.TEMPERATURE || []);
    const avgHum = avg(byType.HUMIDITY || []);
    const avgNoise = avg(byType.NOISE || []);

    let overall = 'GOOD';
    if (avgAqi > 150 || avgTemp > 40) overall = 'HAZARDOUS';
    else if (avgAqi > 100 || avgTemp > 35) overall = 'POOR';
    else if (avgAqi > 50 || avgTemp > 30) overall = 'MODERATE';
    else if (avgAqi < 30 && avgTemp < 28) overall = 'EXCELLENT';

    return {
      zone,
      avg_air_quality_index: Math.round(avgAqi * 100) / 100,
      avg_temperature: Math.round(avgTemp * 100) / 100,
      avg_humidity: Math.round(avgHum * 100) / 100,
      avg_noise_level: Math.round(avgNoise * 100) / 100,
      overall_quality: overall,
      active_sensors: sensors.filter(s => s.status === 'ONLINE').length,
      alerts_count: 0,
      sensor_readings: sensors,
      generated_at: Date.now(),
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // EMERGENCY OPERATIONS
  // ════════════════════════════════════════════════════════════════════════

  createAlert(data) {
    const id = `ALRT-${uuidv4().substring(0, 8).toUpperCase()}`;
    const alert = {
      alert_id: id,
      type: data.type,
      severity: data.severity,
      location: data.location,
      zone: data.zone,
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
      description: data.description,
      reporter_name: data.reporter_name,
      reporter_contact: data.reporter_contact,
      status: 'PENDING',
      assigned_units: [],
      created_at: Date.now(),
      resolved_at: 0,
      resolution_notes: '',
    };
    this.alerts.set(id, alert);

    this.emit('emergency_event', {
      event_id: `EVT-${uuidv4().substring(0, 8).toUpperCase()}`,
      event_type: 'NEW_ALERT',
      alert_id: id,
      alert_type: data.type,
      severity: data.severity,
      location: data.location,
      zone: data.zone,
      description: data.description,
      unit_id: '',
      unit_name: '',
      timestamp: Date.now(),
    });

    return alert;
  }

  getEmergencyAlert(id) {
    return this.alerts.get(id) || null;
  }

  getActiveAlerts() {
    return Array.from(this.alerts.values()).filter(a => a.status !== 'RESOLVED');
  }

  dispatchUnit(alertId, unitId) {
    const alert = this.alerts.get(alertId);
    const unit = this.units.get(unitId);
    if (!alert || !unit) return null;

    unit.status = 'DISPATCHED';
    unit.current_alert_id = alertId;
    unit.last_updated = Date.now();
    this.units.set(unitId, unit);

    alert.status = 'DISPATCHED';
    alert.assigned_units.push(unitId);
    this.alerts.set(alertId, alert);

    this.emit('emergency_event', {
      event_id: `EVT-${uuidv4().substring(0, 8).toUpperCase()}`,
      event_type: 'UNIT_DISPATCHED',
      alert_id: alertId,
      alert_type: alert.type,
      severity: alert.severity,
      location: alert.location,
      zone: alert.zone,
      description: `${unit.name} dispatched to ${alert.location}`,
      unit_id: unitId,
      unit_name: unit.name,
      timestamp: Date.now(),
    });

    return { alert, unit, estimated_arrival: `${Math.floor(Math.random() * 10) + 3} minutes` };
  }

  updateUnit(unitId, data) {
    const unit = this.units.get(unitId);
    if (!unit) return null;

    if (data.status) unit.status = data.status;
    if (data.latitude !== undefined) unit.latitude = data.latitude;
    if (data.longitude !== undefined) unit.longitude = data.longitude;
    unit.last_updated = Date.now();
    this.units.set(unitId, unit);

    if (unit.current_alert_id) {
      const alert = this.alerts.get(unit.current_alert_id);
      if (alert) {
        if (data.status === 'ON_SCENE') {
          alert.status = 'IN_PROGRESS';
          this.alerts.set(unit.current_alert_id, alert);
        }
        this.emit('emergency_event', {
          event_id: `EVT-${uuidv4().substring(0, 8).toUpperCase()}`,
          event_type: 'STATUS_UPDATE',
          alert_id: alert.alert_id,
          alert_type: alert.type,
          severity: alert.severity,
          location: alert.location,
          zone: alert.zone,
          description: `${unit.name} status: ${data.status}${data.notes ? '. ' + data.notes : ''}`,
          unit_id: unitId,
          unit_name: unit.name,
          timestamp: Date.now(),
        });
      }
    }

    return unit;
  }

  getUnit(id) {
    return this.units.get(id) || null;
  }

  getAllUnits() {
    return Array.from(this.units.values());
  }

  resolveEmergencyAlert(alertId, resolvedBy, notes) {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;

    alert.status = 'RESOLVED';
    alert.resolved_at = Date.now();
    alert.resolution_notes = notes;
    this.alerts.set(alertId, alert);

    // Free assigned units
    alert.assigned_units.forEach(unitId => {
      const unit = this.units.get(unitId);
      if (unit) {
        unit.status = 'AVAILABLE';
        unit.current_alert_id = '';
        unit.last_updated = Date.now();
        this.units.set(unitId, unit);
      }
    });

    this.emit('emergency_event', {
      event_id: `EVT-${uuidv4().substring(0, 8).toUpperCase()}`,
      event_type: 'ALERT_RESOLVED',
      alert_id: alertId,
      alert_type: alert.type,
      severity: alert.severity,
      location: alert.location,
      zone: alert.zone,
      description: `Alert resolved by ${resolvedBy}. ${notes}`,
      unit_id: '',
      unit_name: '',
      timestamp: Date.now(),
    });

    return alert;
  }
}

// Singleton instance
const store = new InMemoryStore();
module.exports = store;
