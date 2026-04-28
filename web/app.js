/**
 * NovaPulse — Smart City Command & Control
 * WebSocket client + Event-Driven UI (3 dynamic components + Command Bridge)
 * 
 * DESIGN: Silhouette icons + Premium Cyberpunk Aesthetics
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  intersections: {},   // id → data
  alerts:        [],   // active emergency alerts
  sensors:       {},   // id → data
  units:         {},   // id → data
  totalAlerts:   0,    // notification counter
  notifications: [],   // persistent history
  map:           null, // Leaflet instance
  markers:       {},   // id → Marker instance
};

// ── Default Coordinates (Jakarta) ─────────────────────────────────────────────
const COORDINATES = {
  'INT-001': [-6.2088, 106.8456],
  'INT-002': [-6.2297, 106.8372],
  'INT-003': [-6.1954, 106.8231],
  'INT-004': [-6.1481, 106.8298],
  'INT-005': [-6.2250, 106.8100],
  'INT-006': [-6.1500, 106.8350],
  'INT-007': [-6.2615, 106.8106],
  'INT-008': [-6.2146, 106.8451],
};

// ── WebSocket Setup ───────────────────────────────────────────────────────────
const WS_URL = `ws://${location.host}`;
let ws = null;
let reconnectTimer = null;

function connectWS() {
  setWsStatus('connecting');

  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    setWsStatus('connected');
    logActivity('SYSTEM', 'Quantum link established with NovaPulse Core', 'system');
    clearTimeout(reconnectTimer);
  });

  ws.addEventListener('close', () => {
    setWsStatus('disconnected');
    logActivity('SYSTEM', 'Link severed — attempting resync in 3s...', 'error');
    reconnectTimer = setTimeout(connectWS, 3000);
  });

  ws.addEventListener('error', () => {
    setWsStatus('disconnected');
  });

  ws.addEventListener('message', (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      handleMessage(msg);
    } catch (e) {
      console.error('[WS] Protocol error:', e);
    }
  });
}

function sendCommand(command, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    setCmdOutput('⚠ OFFLINE: WebSocket link inactive', 'error');
    return;
  }
  ws.send(JSON.stringify({ command, params }));
  setCmdOutput(`▶ Uplink: ${command.toUpperCase()}`, '');
}

// ── Message Router ────────────────────────────────────────────────────────────
function handleMessage(msg) {
  switch (msg.type) {

    case 'initial_state':
      // Sync local state with server snapshot (reset first to prevent duplicates on reconnect)
      state.intersections = {};
      state.sensors = {};
      state.alerts = [];
      state.units = {};
      (msg.data.intersections || []).forEach(i => { state.intersections[i.intersection_id] = i; });
      (msg.data.sensors       || []).forEach(s => { state.sensors[s.sensor_id] = s; });
      (msg.data.alerts        || []).forEach(a => { state.alerts.push(a); });
      (msg.data.units         || []).forEach(u => { state.units[u.unit_id] = u; });
      renderAll();
      populateSelects();
      updateKpis();
      logActivity('SYSTEM', `State synchronized: ${Object.keys(state.intersections).length} nodes, ${Object.keys(state.sensors).length} sensors mapped`, 'system');
      updateMapMarkers();
      break;

    // ── Traffic Updates (Component 1 & 2) ───────────────────────────────────
    case 'traffic_update': {
      const u = msg.data;
      if (u.intersection_id) {
        state.intersections[u.intersection_id] = {
          ...(state.intersections[u.intersection_id] || {}),
          ...u,
        };
      }
      renderTrafficChart();
      renderIntersections();
      updateKpis();
      updateMapMarkers();
      const level = u.event_type === 'INCIDENT' ? 'warning' : 'info';
      logActivity('TRAFFIC', `[${u.event_type}] ${u.name || u.intersection_id}: ${u.details}`, level);
      break;
    }

    // ── Emergency Events ────────────────────────────────────────────────────
    case 'emergency_event': {
      const ev = msg.data;
      logActivity('EMERGENCY', `🚨 [${ev.event_type}] ${ev.alert_type} in ${ev.zone}`, 'error');
      
      if (ev.event_type === 'NEW_ALERT') {
        const newAlert = {
          alert_id: ev.alert_id,
          type: ev.alert_type,
          severity: ev.severity,
          location: ev.location,
          zone: ev.zone,
          description: ev.description,
          status: 'PENDING',
          latitude: ev.latitude || COORDINATES['INT-001'][0],
          longitude: ev.longitude || COORDINATES['INT-001'][1],
        };
        state.alerts.push(newAlert);
        showToast(`🚨 NEW ${ev.severity} ALERT`, `${ev.alert_type} at ${ev.location}`, ev.description, ev.severity);
        if (ev.severity === 'CRITICAL' || ev.severity === 'HIGH') playAlertSound();
        
        // Fly to alert on map
        if (state.map && newAlert.latitude && newAlert.longitude) {
          state.map.flyTo([newAlert.latitude, newAlert.longitude], 15, { animate: true, duration: 2 });
        }
      } else if (ev.event_type === 'ALERT_RESOLVED') {
        // Remove map markers for this alert BEFORE removing from state array
        removeAlertMarkers(ev.alert_id);
        state.alerts = state.alerts.filter(a => a.alert_id !== ev.alert_id);
        showToast('✅ ALERT RESOLVED', `${ev.alert_type} at ${ev.location}`, 'Situation normalized', 'INFO');
      }
      renderEmergencyAlerts();
      updateKpis();
      updateMapMarkers();
      break;
    }

    // ── Sensor Updates ────────────────────────────────────────────────────
    case 'sensor_update': {
      (msg.data.sensors || []).forEach(s => { state.sensors[s.sensor_id] = s; });
      renderSensors();
      updateKpis();
      updateMapMarkers();
      break;
    }

    // ── Server-Initiated Proactive Events ──────────────────────────────────
    case 'server_alert': {
      const sa = msg.data;
      showToast(sa.title, sa.message, sa.details, sa.severity || 'INFO');
      logActivity('PROACTIVE', `📡 ${sa.title}: ${sa.message}`, sa.severity === 'CRITICAL' ? 'error' : 'warning');
      state.totalAlerts++;
      const badge = document.getElementById('alert-count');
      badge.textContent = state.totalAlerts;
      badge.style.display = 'flex';
      break;
    }

    case 'system_heartbeat': {
      // Heartbeat is a backup — updateKpis() is the primary source of truth
      // Just trigger a KPI refresh from local state to stay in sync
      updateKpis();
      break;
    }

    // ── Command Feedback ────────────────────────────────────────────────────
    case 'cmd_result': {
      const r = msg.data;
      setCmdOutput(`✅ EXECUTION SUCCESS: ${r.command.toUpperCase()}`, 'success');
      logActivity('COMMAND', `Uplink command [${r.command}] confirmed`, 'success');
      
      // Secondary state sync if command returned data
      if (r.command === 'list_intersections' && r.result.intersections) {
        r.result.intersections.forEach(i => { state.intersections[i.intersection_id] = i; });
        renderAll(); populateSelects();
      }
      if (r.command === 'list_units' && r.result.units) {
        r.result.units.forEach(u => { state.units[u.unit_id] = u; });
        populateUnitSelect();
      }
      break;
    }

    case 'cmd_error': {
      const e = msg.data;
      setCmdOutput(`❌ EXECUTION FAILED: ${e.error}`, 'error');
      logActivity('COMMAND', `Uplink command [${e.command}] rejected: ${e.error}`, 'error');
      break;
    }

    default:
      console.log('[WS] Unknown signal type:', msg.type);
  }
}

// ── Render Logic ──────────────────────────────────────────────────────────────

/** COMPONENT 1: High-Performance Canvas Chart */
function renderTrafficChart() {
  const canvas = document.getElementById('traffic-chart');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  const dpr    = window.devicePixelRatio || 1;
  const W      = canvas.clientWidth;
  const H      = canvas.clientHeight;

  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
  }

  ctx.clearRect(0, 0, W, H);

  const entries = Object.values(state.intersections);
  if (entries.length === 0) return;

  const pad  = { top: 20, right: 10, bottom: 30, left: 40 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top  - pad.bottom;
  const barW   = Math.max(12, (chartW / entries.length) - 8);
  const gap    = (chartW - barW * entries.length) / (entries.length + 1);

  const computedStyle = getComputedStyle(document.body);
  const mutedColor = computedStyle.getPropertyValue('--text-muted').trim() || 'rgba(148, 163, 184, 0.6)';
  const gridColor = computedStyle.getPropertyValue('--border-bright').trim() || 'rgba(148, 163, 184, 0.15)';

  // Background Grid
  ctx.strokeStyle = gridColor;
  ctx.lineWidth   = 1;
  ctx.font        = '10px JetBrains Mono, monospace';
  ctx.fillStyle   = mutedColor;
  ctx.textAlign   = 'right';

  for (let p = 0; p <= 4; p++) {
    const y = pad.top + chartH * (1 - p / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillText(`${p * 25}%`, pad.left - 8, y + 4);
  }

  // Bar Rendering
  entries.forEach((inter, idx) => {
    const cong = Math.min(1, inter.congestion_level || 0);
    const x = pad.left + gap + idx * (barW + gap);
    const barH = chartH * cong;
    const y = pad.top + chartH - barH;

    let color = '#06b6d4'; // Cyan
    if (cong > 0.7) color = '#ef4444'; // Red
    else if (cong > 0.5) color = '#f59e0b'; // Yellow

    // Draw Bar with Shadow Glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = color + '44';
    
    const gradient = ctx.createLinearGradient(x, y, x, y + barH);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color + '66');
    ctx.fillStyle = gradient;
    
    // Rounded bar
    const r = 4;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [r, r, 0, 0]);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Value Label above bar
    ctx.fillStyle = color;
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(cong * 100)}%`, x + barW / 2, y - 8);

    // X-Axis Labels
    const label = (inter.intersection_id || '').replace('INT-', '');
    ctx.fillStyle = mutedColor;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + barW / 2, H - 10);
  });
}

/** COMPONENT 2: Status Indicator Matrix */
function renderIntersections() {
  const grid = document.getElementById('intersection-grid');
  if (!grid) return;

  const entries = Object.values(state.intersections);
  if (entries.length === 0) { grid.innerHTML = '<div class="empty-state">SCANNING FOR NODES...</div>'; return; }

  // Sort by congestion desc
  entries.sort((a, b) => (b.congestion_level || 0) - (a.congestion_level || 0));

  grid.innerHTML = entries.map(i => {
    const cong    = Math.min(1, i.congestion_level || 0);
    const pct     = Math.round(cong * 100);
    const color   = cong > 0.7 ? '#ef4444' : cong > 0.5 ? '#f59e0b' : '#10b981';
    const light   = (i.current_light || 'RED').toUpperCase();
    const short   = (i.name || i.intersection_id || '').substring(0, 24);

    return `
      <div class="int-row">
        <div class="int-light light-${light}"></div>
        <div class="int-name">${short}</div>
        <div class="int-cong-bar"><div class="int-cong-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="int-vehicles">${i.vehicle_count || 0}V</div>
      </div>`;
  }).join('');
}

/** COMPONENT 3: Activity Log */
const MAX_LOG_ENTRIES = 100;
function logActivity(label, message, level = 'info') {
  const log = document.getElementById('activity-log');
  if (!log) return;

  const ts   = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const item = document.createElement('div');
  item.className = `log-entry log-${level}`;
  item.innerHTML = `
    <span class="log-ts">${ts}</span>
    <span class="log-label">${label}</span>
    <span class="log-msg">${escHtml(message)}</span>`;

  log.prepend(item); // Newest at top
  
  // Flash effect for new log
  item.style.backgroundColor = 'var(--border-bright)';
  setTimeout(() => { item.style.backgroundColor = ''; }, 1000);

  while (log.children.length > MAX_LOG_ENTRIES) {
    log.removeChild(log.lastChild);
  }
}

/** SENSOR TELEMETRY */
const SENSOR_ICONS = {
  AIR_QUALITY:   'aqi',
  TEMPERATURE:   'sensor',
  HUMIDITY:      'sensor',
  NOISE:         'sensor',
  WATER_QUALITY: 'sensor',
};

function renderSensors() {
  const grid = document.getElementById('sensor-grid');
  if (!grid) return;

  const entries = Object.values(state.sensors);
  const iconMap = {
    'AIR_QUALITY': 'icon-aqi',
    'TEMPERATURE': 'icon-temp',
    'HUMIDITY': 'icon-humidity',
    'NOISE': 'icon-noise',
    'WATER_QUALITY': 'icon-water'
  };

  grid.innerHTML = entries.map(s => {
    const quality = (s.quality_level || 'UNKNOWN').toUpperCase();
    return `
    <div class="sensor-card quality-${quality}">
      <div class="card-header">
        <span class="sensor-type">${s.type.replace('_', ' ')}</span>
        <svg class="icon-sm"><use href="#${iconMap[s.type] || 'icon-sensor'}"></use></svg>
      </div>
      <div class="sensor-value">${s.value}${s.unit}</div>
      <div class="sensor-name">${s.name}</div>
      <div class="sensor-quality quality-${quality}">${quality}</div>
    </div>
  `}).join('');
}

/** EMERGENCY QUEUE */
const EMERGENCY_ICONS = {
  FIRE: 'fire',
  MEDICAL: 'emergency',
  CRIME: 'alert',
  TRAFFIC_ACCIDENT: 'car',
  NATURAL_DISASTER: 'alert',
  HAZMAT: 'sensor'
};

function renderEmergencyAlerts() {
  const list = document.getElementById('emergency-list');
  if (!list) return;

  const active = state.alerts.filter(a => a.status !== 'RESOLVED');
  document.getElementById('alert-count-badge').textContent = `${active.length} THREATS`;

  const emergencyCard = document.querySelector('.card-emergency');
  if (emergencyCard) {
    const hasDangerous = active.some(a => a.severity === 'HIGH' || a.severity === 'CRITICAL');
    if (hasDangerous) emergencyCard.classList.add('danger-blink');
    else emergencyCard.classList.remove('danger-blink');
  }

  if (active.length === 0) {
    list.innerHTML = `
      <div class="empty-state-v2">
        <div class="radar-container">
          <div class="radar-ping"></div>
          <svg class="icon-lg"><use href="#icon-shield"></use></svg>
        </div>
        <div class="empty-title">SITUATION NORMAL</div>
        <div class="empty-desc">All sectors stabilized. System actively monitoring gRPC streams for anomalies.</div>
      </div>`;
    return;
  }

  active.sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (order[a.severity] || 4) - (order[b.severity] || 4);
  });

  list.innerHTML = active.map(a => {
    const iconKey = EMERGENCY_ICONS[a.type] || 'alert';
    return `
    <div class="alert-card ${a.severity}">
      <div class="card-header">
        <div class="card-title-group">
          <svg class="icon-sm"><use href="#icon-${iconKey}"></use></svg>
          <div class="alert-type">${a.type}</div>
        </div>
        <span class="alert-pill">${a.severity}</span>
      </div>
      <div class="alert-location">📍 ${a.location}</div>
      <div class="alert-desc">${a.description}</div>
      <div class="alert-meta">
        <span class="alert-pill">${a.zone}</span>
        <span class="alert-pill">${a.status}</span>
        <span class="alert-pill" style="opacity:0.5">${a.alert_id}</span>
        <button class="btn-resolve" onclick="resolveAlert('${a.alert_id}')">RESOLVE</button>
      </div>
    </div>`}).join('');
}

/** COMPONENT: Live Map */
function initMap() {
  const container = document.getElementById('map-container');
  if (!container || state.map) return;

  // Initialize Leaflet map
  state.map = L.map('map-container', {
    center: [-6.2088, 106.8456],
    zoom: 13,
    zoomControl: false,
    attributionControl: false
  });

  // Select tiles based on current theme
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  const tileUrl = theme === 'dark' 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  L.tileLayer(tileUrl, {
    maxZoom: 19
  }).addTo(state.map);

  L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  
  logActivity('SYSTEM', 'Geospatial Intelligence Engine initialized', 'system');
}

function updateMapMarkers() {
  if (!state.map) return;

  // 1. Nodes (Intersections) — cyan circleMarker
  Object.values(state.intersections).forEach(i => {
    const lat = i.latitude || i.lat;
    const lng = i.longitude || i.lng;
    if (!lat || isNaN(lat)) return;
    
    const markerId = `int-${i.intersection_id}`;
    
    if (!state.markers[markerId]) {
      state.markers[markerId] = L.circleMarker([lat, lng], {
        radius: 6,
        color: '#ffffff',
        fillColor: '#0ea5e9',
        fillOpacity: 1,
        weight: 2,
      }).addTo(state.map);
    }
    
    const status = i.congestion_level > 0.7 ? '<span style="color:#ef4444">CRITICAL</span>' : 'OPTIMAL';
    state.markers[markerId].bindPopup(`
      <div style="font-family:var(--font); padding: 5px;">
        <strong style="display:block; margin-bottom:5px;">${i.name}</strong>
        <div style="font-size:0.75rem; color:var(--text-muted)">
          Node ID: ${i.intersection_id}<br>
          Signal: ${i.current_light}<br>
          Congestion: ${Math.round(i.congestion_level * 100)}%<br>
          Status: ${status}
        </div>
      </div>
    `);
  });

  // 2. Sensors — purple circleMarker
  Object.values(state.sensors).forEach(s => {
    const lat = s.latitude || s.lat;
    const lng = s.longitude || s.lng;
    const markerId = `sns-${s.sensor_id}`;
    
    if (!lat || lat === 0 || isNaN(lat)) return;

    if (!state.markers[markerId]) {
      state.markers[markerId] = L.circleMarker([lat, lng], {
        radius: 5,
        color: '#ffffff',
        fillColor: '#a855f7',
        fillOpacity: 1,
        weight: 2,
      }).addTo(state.map);
    }
    
    state.markers[markerId].bindPopup(`
      <div style="font-family:var(--font); padding: 5px;">
        <strong style="display:block; margin-bottom:5px;">${s.name}</strong>
        <div style="font-size:0.75rem; color:var(--text-muted)">
          Type: ${s.type.replace('_', ' ')}<br>
          Value: ${s.value}${s.unit}<br>
          Quality: ${s.quality_level}
        </div>
      </div>
    `);
  });

  // 3. Incidents/Alerts — red circleMarker + pulsing halo
  state.alerts.forEach(a => {
    const markerId = `alert-${a.alert_id}`;
    if (a.status === 'RESOLVED') {
      if (state.markers[markerId]) {
        state.map.removeLayer(state.markers[markerId]);
        delete state.markers[markerId];
      }
      if (state.markers[markerId + '-halo']) {
        state.map.removeLayer(state.markers[markerId + '-halo']);
        delete state.markers[markerId + '-halo'];
      }
      return;
    }

    const lat = a.latitude;
    const lng = a.longitude;
    if (!lat || lat === 0 || isNaN(lat)) return;

    if (!state.markers[markerId]) {
      // Halo (pulsing ring)
      state.markers[markerId + '-halo'] = L.circleMarker([lat, lng], {
        radius: 20,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.12,
        weight: 2,
        opacity: 0.4,
        className: 'incident-halo-pulse',
      }).addTo(state.map);

      // Core dot
      state.markers[markerId] = L.circleMarker([lat, lng], {
        radius: 7,
        color: '#ffffff',
        fillColor: '#ef4444',
        fillOpacity: 1,
        weight: 2,
      }).addTo(state.map);
    }
    
    state.markers[markerId].bindPopup(`
      <div style="font-family:var(--font); padding: 5px;">
        <strong style="display:block; color:#ef4444; margin-bottom:5px;">🚨 ${a.type}</strong>
        <div style="font-size:0.75rem; color:var(--text-muted)">
          Severity: ${a.severity}<br>
          Location: ${a.location}<br>
          ${a.description}
        </div>
      </div>
    `);
  });
}


/** Remove alert markers from map */
function removeAlertMarkers(alertId) {
  if (!state.map) return;
  const markerId = `alert-${alertId}`;
  if (state.markers[markerId]) {
    state.map.removeLayer(state.markers[markerId]);
    delete state.markers[markerId];
  }
  if (state.markers[markerId + '-halo']) {
    state.map.removeLayer(state.markers[markerId + '-halo']);
    delete state.markers[markerId + '-halo'];
  }
}

/** KPI UPDATES — computed from local state */
function updateKpis() {
  const intersections = Object.values(state.intersections);
  const sensors = Object.values(state.sensors);
  const activeAlerts = state.alerts.filter(a => a.status !== 'RESOLVED');
  const criticalAlerts = activeAlerts.filter(a => a.severity === 'CRITICAL');
  const congested = intersections.filter(i => (i.congestion_level || 0) > 0.7).length;

  const aqiSensors = sensors.filter(s => s.type === 'AIR_QUALITY');
  const avgAqi = aqiSensors.length > 0
    ? Math.round(aqiSensors.reduce((sum, s) => sum + s.value, 0) / aqiSensors.length)
    : 0;

  document.getElementById('kpi-intersections-val').textContent = intersections.length;
  document.getElementById('kpi-congested-val').textContent = congested;
  document.getElementById('kpi-alerts-val').textContent = criticalAlerts.length;
  document.getElementById('kpi-aqi-val').textContent = avgAqi || '0';
  document.getElementById('kpi-sensors-val').textContent = sensors.length;
  colorKpiAqi(avgAqi);
}

function colorKpiAqi(aqi) {
  const el = document.getElementById('kpi-aqi-val');
  if (!el) return;
  if (aqi > 150)      el.className = 'kpi-value value-red';
  else if (aqi > 100) el.className = 'kpi-value value-orange';
  else                el.className = 'kpi-value value-cyan';
}

// ── UI Logic ──────────────────────────────────────────────────────────────────

function populateSelects() {
  const nodes = document.getElementById('cmd-intersection-id');
  if (nodes) {
    const list = Object.values(state.intersections);
    nodes.innerHTML = list.map(i => `<option value="${i.intersection_id}">${i.intersection_id} - ${i.name}</option>`).join('');
  }
  
  populateUnitSelect();
}

function populateUnitSelect() {
  const units = document.getElementById('cmd-dispatch-unit');
  if (!units) return;
  const list = Object.values(state.units).filter(u => u.status === 'AVAILABLE');
  if (list.length === 0) {
    units.innerHTML = '<option value="">NO ASSETS AVAILABLE</option>';
  } else {
    units.innerHTML = list.map(u => `<option value="${u.unit_id}">${u.name} [${u.type}]</option>`).join('');
  }
}

function setWsStatus(status) {
  const dot = document.getElementById('ws-status-dot');
  const lbl = document.getElementById('ws-status-label');
  if (!dot || !lbl) return;
  dot.className = `ws-dot ${status}`;
  lbl.textContent = status === 'connected' ? 'SECURE LINK ACTIVE' : status.toUpperCase() + '...';
}

function setCmdOutput(text, type = '') {
  const el = document.getElementById('cmd-output');
  if (!el) return;
  el.textContent = text;
  el.className   = `cmd-output ${type}`;
}

function showToast(title, message, detail = '', severity = 'INFO') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Clear previous toasts to show only one at a time
  container.innerHTML = '';

  const toast = document.createElement('div');
  toast.className = `toast toast-${severity}`;
  toast.innerHTML = `
    <div class="toast-header">
      <div class="toast-title">${escHtml(title)}</div>
      <svg class="icon-sm" style="opacity:0.5"><use href="#icon-alert"></use></svg>
    </div>
    <div class="toast-msg">${escHtml(message)}</div>
    ${detail ? `<div class="toast-detail">${escHtml(detail)}</div>` : ''}`;
  
  toast.onclick = () => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
    // Scroll to emergency section if it's a serious alert
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      document.querySelector('.card-emergency').scrollIntoView({ behavior: 'smooth' });
    }
  };

  container.appendChild(toast);

  // Add to persistent history
  state.notifications.unshift({ title, msg: message, detail, severity, ts: new Date().toLocaleTimeString('en-GB', { hour12: false }) });
  if (state.notifications.length > 20) state.notifications.pop();
  renderNotifications();

  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }
  }, 8000);
}

/** RENDER NOTIFICATIONS DROPDOWN */
function renderNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (state.notifications.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding: 20px;">NO RECENT ALERTS</div>';
    return;
  }

  list.innerHTML = state.notifications.map(n => `
    <div class="notif-item notif-${n.severity.toLowerCase()}">
      <div class="notif-item-header">
        <span class="notif-item-tag badge-${n.severity.toLowerCase() || 'info'}">${n.severity}</span>
        <span class="notif-item-ts">${n.ts}</span>
      </div>
      <div class="notif-item-title">${n.title}</div>
      <div class="notif-item-msg">${n.msg}</div>
    </div>
  `).join('');
}

function renderAll() {
  initMap();
  renderTrafficChart();
  renderIntersections();
  renderSensors();
  renderEmergencyAlerts();
  updateMapMarkers();
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ── Event Bindings ────────────────────────────────────────────────────────────

function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  if(!themeToggle) return;

  const getPreferredTheme = () => {
    if (localStorage.getItem('theme')) return localStorage.getItem('theme');
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const setTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      themeIcon.innerHTML = '<use href="#icon-sun"></use>';
    } else {
      themeIcon.innerHTML = '<use href="#icon-moon"></use>';
    }
    
    // Switch Map Tiles
    if (state.map) {
      const tileUrl = theme === 'dark' 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      
      // Remove old layers
      state.map.eachLayer(layer => {
        if (layer instanceof L.TileLayer) state.map.removeLayer(layer);
      });
      
      // Add new layer
      L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(state.map);
    }

    renderTrafficChart();
  };

  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });

  setTheme(getPreferredTheme());
}

function init() {
  initTheme();
  // Tab Switcher
  document.querySelectorAll('.cmd-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cmd-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('panel-traffic').style.display   = tab === 'traffic'   ? 'flex' : 'none';
      document.getElementById('panel-emergency').style.display = tab === 'emergency' ? 'flex' : 'none';
    });
  });

  // Traffic Override
  document.getElementById('btn-update-light').addEventListener('click', () => {
    sendCommand('update_traffic_light', {
      intersection_id: document.getElementById('cmd-intersection-id').value,
      new_light: document.getElementById('cmd-light').value,
      duration_seconds: parseInt(document.getElementById('cmd-duration').value) || 60,
      reason: document.getElementById('cmd-reason').value || 'Manual override'
    });
  });

  // Incident Broadcast
  document.getElementById('btn-report-incident').addEventListener('click', () => {
    sendCommand('report_incident', {
      intersection_id: document.getElementById('cmd-intersection-id').value,
      type: document.getElementById('cmd-incident-type').value,
      severity: document.getElementById('cmd-incident-severity').value,
      description: document.getElementById('cmd-incident-desc').value || 'System manual report'
    });
  });

  // Emergency Initiation
  document.getElementById('btn-create-alert').addEventListener('click', () => {
    sendCommand('create_alert', {
      type: document.getElementById('cmd-alert-type').value,
      severity: document.getElementById('cmd-alert-severity').value,
      location: document.getElementById('cmd-alert-location').value || 'Unknown Sector',
      zone: document.getElementById('cmd-alert-zone').value,
      description: document.getElementById('cmd-alert-desc').value || 'Alert triggered from Command Center'
    });
  });

  // Asset Deployment
  document.getElementById('btn-dispatch-unit').addEventListener('click', () => {
    sendCommand('dispatch_unit', {
      alert_id: document.getElementById('cmd-dispatch-alert').value,
      unit_id: document.getElementById('cmd-dispatch-unit').value
    });
  });

  // Log Purge
  document.getElementById('clear-log-btn').addEventListener('click', () => {
    const log = document.getElementById('activity-log');
    if (log) log.innerHTML = '';
    logActivity('KERNEL', 'Buffer cleared', 'system');
  });

  // Window Resize
  window.addEventListener('resize', () => renderTrafficChart());

  // Start Clock
  setInterval(() => {
    const el = document.getElementById('server-time');
    if (el) {
      el.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    }
  }, 1000);

  // Alert Bell Click
  const bell = document.getElementById('alert-bell');
  if (bell) {
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('notif-dropdown');
      if (dropdown) dropdown.classList.toggle('active');
      
      state.totalAlerts = 0;
      const badge = document.getElementById('alert-count');
      if (badge) {
        badge.textContent = '0';
        badge.style.display = 'none';
      }
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  connectWS();
}

function resolveAlert(alertId) {
  // Use a custom modal or just send it if the user clicked resolve
  sendCommand('resolve_alert', { alert_id: alertId });
  logActivity('COMMAND', `Initiating resolution for ${alertId}...`, 'info');
}

window.resolveAlert = resolveAlert;

/** Perfect Touch: Synthesized Alert Sound */
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    // Silent fail if audio is blocked
  }
}

document.addEventListener('DOMContentLoaded', init);
