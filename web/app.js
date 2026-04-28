/**
 * NovaPulse — Smart City Control Center
 * WebSocket client + Event-Driven UI (3 dynamic components + Command Bridge)
 *
 * Component 1: Live Traffic Congestion Chart (Canvas)
 * Component 2: Intersection Status Indicators (live light + congestion bar)
 * Component 3: Activity Log (auto-scrolling, real-time entries)
 *
 * Extra: Sensor Grid, Emergency Alerts panel, Toast notifications,
 *        Server-Initiated Events, Command & Control Bridge → gRPC
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  intersections: {},   // id → data
  alerts:        [],   // active emergency alerts
  sensors:       {},   // id → data
  units:         {},   // id → data
  totalAlerts:   0,    // notification counter
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
    logActivity('SYSTEM', 'WebSocket connected to NovaPulse server', 'system');
    clearTimeout(reconnectTimer);
  });

  ws.addEventListener('close', () => {
    setWsStatus('disconnected');
    logActivity('SYSTEM', 'WebSocket disconnected — reconnecting in 3s…', 'error');
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
      console.error('[WS] Parse error:', e);
    }
  });
}

function sendCommand(command, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    setCmdOutput('⚠ WebSocket not connected', 'error');
    return;
  }
  ws.send(JSON.stringify({ command, params }));
  setCmdOutput(`⏳ Sent: ${command}`, '');
}

// ── Message Router ────────────────────────────────────────────────────────────
function handleMessage(msg) {
  switch (msg.type) {

    case 'initial_state':
      // Populate all panels from initial snapshot
      (msg.data.intersections || []).forEach(i => { state.intersections[i.intersection_id] = i; });
      (msg.data.sensors       || []).forEach(s => { state.sensors[s.sensor_id] = s; });
      (msg.data.alerts        || []).forEach(a => { state.alerts.push(a); });
      (msg.data.units         || []).forEach(u => { state.units[u.unit_id] = u; });
      renderAll();
      populateSelects();
      logActivity('SYSTEM', `Initial state loaded: ${Object.keys(state.intersections).length} intersections, ${Object.keys(state.sensors).length} sensors`, 'system');
      break;

    // ── Component 1 & 2: Traffic Updates ─────────────────────────────────────
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
      const icon = u.event_type === 'INCIDENT' ? '⚠️' : u.event_type === 'LIGHT_CHANGE' ? '🚦' : '🚗';
      const lvl  = u.event_type === 'INCIDENT' ? 'warning' : 'info';
      logActivity('TRAFFIC', `${icon} ${u.name || u.intersection_id}: ${u.details || u.event_type}`, lvl);
      break;
    }

    // ── Emergency Events ──────────────────────────────────────────────────────
    case 'emergency_event': {
      const ev = msg.data;
      logActivity('EMERGENCY', `🚨 [${ev.event_type}] ${ev.alert_type} @ ${ev.location} — ${ev.severity}`, 'error');
      // Refresh active alerts list
      if (ev.event_type === 'NEW_ALERT') {
        state.alerts.push({
          alert_id: ev.alert_id,
          type: ev.alert_type,
          severity: ev.severity,
          location: ev.location,
          zone: ev.zone,
          description: ev.description,
          status: 'PENDING',
        });
      } else if (ev.event_type === 'ALERT_RESOLVED') {
        state.alerts = state.alerts.filter(a => a.alert_id !== ev.alert_id);
      }
      renderEmergencyAlerts();
      updateKpis();
      break;
    }

    // ── Component: Sensor Updates ─────────────────────────────────────────────
    case 'sensor_update': {
      (msg.data.sensors || []).forEach(s => { state.sensors[s.sensor_id] = s; });
      renderSensors();
      const avgAqi = computeAvgAqi();
      document.getElementById('kpi-aqi-val').textContent = avgAqi > 0 ? avgAqi : '—';
      colorKpiAqi(avgAqi);
      break;
    }

    // ── Server-Initiated Events ───────────────────────────────────────────────
    case 'server_alert': {
      const sa = msg.data;
      showToast(sa.title, sa.message, sa.details, sa.severity || 'INFO');
      logActivity('SERVER', `📡 ${sa.title}: ${sa.message}`, sa.severity === 'INFO' ? 'success' : 'warning');
      state.totalAlerts++;
      document.getElementById('alert-count').textContent = state.totalAlerts;
      break;
    }

    case 'system_heartbeat': {
      const hb = msg.data;
      document.getElementById('server-time').textContent = new Date(hb.server_time).toLocaleTimeString();
      document.getElementById('kpi-intersections-val').textContent = hb.intersections_total;
      document.getElementById('kpi-congested-val').textContent = hb.congested_count;
      document.getElementById('kpi-alerts-val').textContent = hb.active_alerts;
      document.getElementById('kpi-aqi-val').textContent = hb.avg_aqi || '—';
      break;
    }

    // ── Command Results ───────────────────────────────────────────────────────
    case 'cmd_result': {
      const r = msg.data;
      setCmdOutput(`✅ ${r.command}:\n${JSON.stringify(r.result, null, 2)}`, 'success');
      logActivity('CMD', `✅ ${r.command} succeeded`, 'success');
      // Update selects if we fetched data
      if (r.command === 'list_intersections' && r.result.intersections) {
        r.result.intersections.forEach(i => { state.intersections[i.intersection_id] = i; });
        renderAll(); populateSelects();
      }
      if (r.command === 'list_units' && r.result.units) {
        r.result.units.forEach(u => { state.units[u.unit_id] = u; });
        populateUnitSelect();
      }
      if (r.command === 'list_active_alerts' && r.result.alerts) {
        state.alerts = r.result.alerts;
        renderEmergencyAlerts();
        updateKpis();
      }
      break;
    }

    case 'cmd_error': {
      const e = msg.data;
      setCmdOutput(`❌ ${e.command}: ${e.error}`, 'error');
      logActivity('CMD', `❌ ${e.command} failed: ${e.error}`, 'error');
      break;
    }

    default:
      console.log('[WS] Unknown message type:', msg.type);
  }
}

// ── Render Functions ──────────────────────────────────────────────────────────

/** COMPONENT 1: Canvas Bar Chart — Live Traffic Congestion */
function renderTrafficChart() {
  const canvas = document.getElementById('traffic-chart');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  const dpr    = window.devicePixelRatio || 1;
  const W      = canvas.clientWidth;
  const H      = canvas.clientHeight;

  // Scale for HiDPI
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
  }

  ctx.clearRect(0, 0, W, H);

  const entries = Object.values(state.intersections);
  if (entries.length === 0) return;

  const pad  = { top: 16, right: 16, bottom: 40, left: 36 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top  - pad.bottom;
  const barW   = Math.max(8, (chartW / entries.length) - 6);
  const gap    = (chartW - barW * entries.length) / (entries.length + 1);

  // Grid lines
  ctx.strokeStyle = 'rgba(99,118,164,0.12)';
  ctx.lineWidth   = 1;
  for (let p = 0; p <= 4; p++) {
    const y = pad.top + chartH * (1 - p / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.fillStyle   = 'rgba(148,163,184,0.5)';
    ctx.font        = '9px Inter, sans-serif';
    ctx.textAlign   = 'right';
    ctx.fillText(`${p * 25}%`, pad.left - 4, y + 3);
  }

  // Bars
  entries.forEach((inter, idx) => {
    const cong = Math.min(1, inter.congestion_level || 0);
    const x = pad.left + gap + idx * (barW + gap);
    const barH = chartH * cong;
    const y = pad.top + chartH - barH;

    // Bar color
    let color, glow;
    if (cong > 0.7)       { color = '#ef4444'; glow = 'rgba(239,68,68,0.35)'; }
    else if (cong > 0.5)  { color = '#f59e0b'; glow = 'rgba(245,158,11,0.35)'; }
    else                   { color = '#22d3ee'; glow = 'rgba(34,211,238,0.35)'; }

    // Glow shadow
    ctx.shadowColor = glow;
    ctx.shadowBlur  = 8;

    // Gradient fill
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color.replace(')', ', 0.4)').replace('rgb', 'rgba'));

    ctx.fillStyle = grad;
    // Rounded top corners
    const r = Math.min(4, barW / 2, barH / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + barW, y, x + barW, y + barH, r);
    ctx.arcTo(x + barW, y + barH, x, y + barH, 0);
    ctx.arcTo(x, y + barH, x, y, 0);
    ctx.arcTo(x, y, x + barW, y, r);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    // Label (short ID)
    const label = (inter.intersection_id || '').replace('INT-', '');
    ctx.fillStyle   = 'rgba(148,163,184,0.7)';
    ctx.font        = '9px JetBrains Mono, monospace';
    ctx.textAlign   = 'center';
    ctx.fillText(label, x + barW / 2, H - pad.bottom + 13);

    // Percentage on bar
    if (barH > 18) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font      = 'bold 9px Inter, sans-serif';
      ctx.fillText(`${Math.round(cong * 100)}%`, x + barW / 2, y + 12);
    }
  });
}

/** COMPONENT 2: Intersection Status Indicators */
function renderIntersections() {
  const grid = document.getElementById('intersection-grid');
  if (!grid) return;

  const entries = Object.values(state.intersections);
  if (entries.length === 0) { grid.innerHTML = '<div class="empty-state">No data yet…</div>'; return; }

  // Sort by congestion desc
  entries.sort((a, b) => (b.congestion_level || 0) - (a.congestion_level || 0));

  grid.innerHTML = entries.map(i => {
    const cong    = Math.min(1, i.congestion_level || 0);
    const pct     = Math.round(cong * 100);
    const barColor = cong > 0.7 ? 'var(--red)' : cong > 0.5 ? 'var(--yellow)' : 'var(--green)';
    const light   = (i.current_light || 'RED').toUpperCase();
    const zone    = i.zone || '—';
    const shortName = (i.name || i.intersection_id || '').substring(0, 30);

    return `
      <div class="int-row" title="${i.name || ''} | Vehicles: ${i.vehicle_count || 0} | Status: ${i.status || ''}">
        <div class="int-light light-${light}"></div>
        <div class="int-name">${shortName}</div>
        <div class="int-cong-bar"><div class="int-cong-fill" style="width:${pct}%;background:${barColor}"></div></div>
        <div class="int-vehicles">${i.vehicle_count || 0}v</div>
        <div class="int-zone">${zone}</div>
      </div>`;
  }).join('');
}

/** COMPONENT 3: Activity Log */
const MAX_LOG_ENTRIES = 120;
function logActivity(label, message, level = 'info') {
  const log  = document.getElementById('activity-log');
  if (!log) return;

  const ts   = new Date().toLocaleTimeString('en-GB');
  const item = document.createElement('div');
  item.className = `log-entry log-${level}`;
  item.innerHTML = `
    <span class="log-ts">${ts}</span>
    <span class="log-label">${label}</span>
    <span class="log-msg">${escHtml(message)}</span>`;

  log.appendChild(item);

  // Limit entries
  while (log.children.length > MAX_LOG_ENTRIES) {
    log.removeChild(log.firstChild);
  }

  // Auto-scroll to bottom
  log.scrollTop = log.scrollHeight;
}

/** Sensor Grid */
const SENSOR_TYPE_ICONS = {
  AIR_QUALITY:   '🌬️',
  TEMPERATURE:   '🌡️',
  HUMIDITY:      '💧',
  NOISE:         '🔊',
  WATER_QUALITY: '🚿',
};

function renderSensors() {
  const grid = document.getElementById('sensor-grid');
  if (!grid) return;

  const entries = Object.values(state.sensors);
  if (entries.length === 0) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">No sensor data yet…</div>'; return; }

  grid.innerHTML = entries.map(s => {
    const icon    = SENSOR_TYPE_ICONS[s.type] || '📡';
    const quality = (s.quality_level || 'UNKNOWN').toUpperCase();
    const valueStr = s.value !== undefined ? `${s.value} ${s.unit || ''}` : '—';

    return `
      <div class="sensor-card ${quality}" title="${s.name} | ${s.location} | Zone: ${s.zone}">
        <div class="sensor-name">${icon} ${s.name}</div>
        <div class="sensor-type">${s.type.replace('_', ' ')}</div>
        <div class="sensor-value">${valueStr}</div>
        <span class="sensor-quality quality-${quality}">${quality}</span>
      </div>`;
  }).join('');

  document.getElementById('kpi-sensors-val').textContent = entries.filter(s => s.status === 'ONLINE').length;
}

/** Emergency Alerts */
function renderEmergencyAlerts() {
  const list = document.getElementById('emergency-list');
  if (!list) return;

  const active = state.alerts.filter(a => a.status !== 'RESOLVED');
  document.getElementById('alert-count-badge').textContent = `${active.length} ACTIVE`;

  if (active.length === 0) {
    list.innerHTML = '<div class="empty-state">✅ No active alerts</div>';
    return;
  }

  // Sort by severity
  const ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  active.sort((a, b) => (ORDER[a.severity] || 4) - (ORDER[b.severity] || 4));

  list.innerHTML = active.map(a => `
    <div class="alert-card ${a.severity}" title="${a.alert_id}">
      <div class="alert-type">[${a.type || '—'}]</div>
      <div class="alert-location">📍 ${a.location || '—'}</div>
      <div class="alert-desc">${(a.description || '').substring(0, 100)}${(a.description || '').length > 100 ? '…' : ''}</div>
      <div class="alert-meta">
        <span class="alert-pill pill-sev-${a.severity}">${a.severity}</span>
        <span class="alert-pill pill-zone">${a.zone || '—'}</span>
        <span class="alert-pill pill-status">${a.status || '—'}</span>
      </div>
    </div>`).join('');
}

/** Render everything */
function renderAll() {
  renderTrafficChart();
  renderIntersections();
  renderSensors();
  renderEmergencyAlerts();
  updateKpis();
}

function updateKpis() {
  const intersections = Object.values(state.intersections);
  const congested     = intersections.filter(i => (i.congestion_level || 0) > 0.7).length;
  const activeAlerts  = state.alerts.filter(a => a.status !== 'RESOLVED').length;
  const onlineSensors = Object.values(state.sensors).filter(s => s.status === 'ONLINE').length;

  document.getElementById('kpi-intersections-val').textContent = intersections.length || '—';
  document.getElementById('kpi-congested-val').textContent     = congested || '0';
  document.getElementById('kpi-alerts-val').textContent        = activeAlerts || '0';
  document.getElementById('kpi-sensors-val').textContent       = onlineSensors || '—';
}

function computeAvgAqi() {
  const aqis = Object.values(state.sensors).filter(s => s.type === 'AIR_QUALITY');
  if (aqis.length === 0) return 0;
  return Math.round(aqis.reduce((s, x) => s + (x.value || 0), 0) / aqis.length);
}

function colorKpiAqi(aqi) {
  const el = document.getElementById('kpi-aqi-val');
  if (!el) return;
  if (aqi > 150)      el.style.color = 'var(--red)';
  else if (aqi > 100) el.style.color = 'var(--yellow)';
  else if (aqi > 50)  el.style.color = 'var(--orange)';
  else                el.style.color = 'var(--green)';
}

// ── Selects ───────────────────────────────────────────────────────────────────
function populateSelects() {
  populateIntersectionSelect();
  populateUnitSelect();
}

function populateIntersectionSelect() {
  const sel = document.getElementById('cmd-intersection-id');
  if (!sel) return;
  const entries = Object.values(state.intersections);
  if (entries.length === 0) return;
  sel.innerHTML = entries.map(i =>
    `<option value="${i.intersection_id}">${i.intersection_id} — ${(i.name || '').substring(0, 30)}</option>`
  ).join('');
}

function populateUnitSelect() {
  const sel = document.getElementById('cmd-dispatch-unit');
  if (!sel) return;
  const available = Object.values(state.units).filter(u => u.status === 'AVAILABLE');
  if (available.length === 0) {
    sel.innerHTML = '<option value="">— no available units —</option>';
    return;
  }
  sel.innerHTML = available.map(u =>
    `<option value="${u.unit_id}">${u.unit_id} — ${u.name}</option>`
  ).join('');
}

// ── Status helpers ────────────────────────────────────────────────────────────
function setWsStatus(status) {
  const dot   = document.getElementById('ws-status-dot');
  const label = document.getElementById('ws-status-label');
  if (!dot || !label) return;
  dot.className   = `ws-dot ${status}`;
  const labels = { connected: 'Connected', disconnected: 'Disconnected', connecting: 'Connecting…' };
  label.textContent = labels[status] || status;
}

function setCmdOutput(text, type = '') {
  const el = document.getElementById('cmd-output');
  if (!el) return;
  el.textContent = text;
  el.className   = `cmd-output ${type}`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(title, message, detail = '', severity = 'INFO') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${severity}`;
  toast.innerHTML = `
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      <div class="toast-msg">${escHtml(message)}</div>
      ${detail ? `<div class="toast-detail">${escHtml(detail)}</div>` : ''}
    </div>`;
  container.appendChild(toast);

  // Auto-dismiss
  const DURATION = severity === 'CRITICAL' ? 8000 : 5000;
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 350);
  }, DURATION);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Command & Control Bridge ──────────────────────────────────────────────────
function initCommandPanel() {
  // Tab switcher
  document.querySelectorAll('.cmd-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cmd-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('panel-traffic').style.display   = tab === 'traffic'   ? '' : 'none';
      document.getElementById('panel-emergency').style.display = tab === 'emergency' ? '' : 'none';
    });
  });

  // ── Traffic commands ──────────────────────────────────────────────────────
  document.getElementById('btn-update-light').addEventListener('click', () => {
    const id       = document.getElementById('cmd-intersection-id').value;
    const newLight = document.getElementById('cmd-light').value;
    const duration = parseInt(document.getElementById('cmd-duration').value, 10) || 60;
    const reason   = document.getElementById('cmd-reason').value || 'WebUI Override';

    if (!id) { setCmdOutput('⚠ Please select an intersection', 'error'); return; }

    sendCommand('update_traffic_light', {
      intersection_id: id,
      new_light: newLight,
      duration_seconds: duration,
      reason,
    });
  });

  document.getElementById('btn-report-incident').addEventListener('click', () => {
    const id       = document.getElementById('cmd-intersection-id').value;
    const type     = document.getElementById('cmd-incident-type').value;
    const severity = document.getElementById('cmd-incident-severity').value;
    const desc     = document.getElementById('cmd-incident-desc').value || 'Reported via WebUI';

    if (!id) { setCmdOutput('⚠ Please select an intersection', 'error'); return; }

    sendCommand('report_incident', {
      intersection_id: id,
      type,
      severity,
      description: desc,
      reported_by: 'WebUI Operator',
    });
  });

  // ── Emergency commands ────────────────────────────────────────────────────
  document.getElementById('btn-create-alert').addEventListener('click', () => {
    sendCommand('create_alert', {
      type:          document.getElementById('cmd-alert-type').value,
      severity:      document.getElementById('cmd-alert-severity').value,
      location:      document.getElementById('cmd-alert-location').value || 'WebUI Location',
      zone:          document.getElementById('cmd-alert-zone').value,
      description:   document.getElementById('cmd-alert-desc').value || 'Created via WebUI',
      reporter_name: 'WebUI Operator',
    });
  });

  document.getElementById('btn-dispatch-unit').addEventListener('click', () => {
    const alert_id = document.getElementById('cmd-dispatch-alert').value.trim();
    const unit_id  = document.getElementById('cmd-dispatch-unit').value;

    if (!alert_id) { setCmdOutput('⚠ Please enter an Alert ID', 'error'); return; }
    if (!unit_id)  { setCmdOutput('⚠ Please select a unit', 'error'); return; }

    sendCommand('dispatch_unit', { alert_id, unit_id });
  });

  // Clear log button
  document.getElementById('clear-log-btn').addEventListener('click', () => {
    const log = document.getElementById('activity-log');
    if (log) log.innerHTML = '';
    logActivity('SYSTEM', 'Log cleared', 'system');
  });
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const el = document.getElementById('server-time');
    if (el && el.textContent === '--:--:--') {
      el.textContent = new Date().toLocaleTimeString();
    }
  }
  tick();
  setInterval(tick, 1000);
}

// ── Resize → redraw chart ─────────────────────────────────────────────────────
window.addEventListener('resize', () => renderTrafficChart());

// ── Refresh unit select periodically ─────────────────────────────────────────
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendCommand('list_units');
  }
}, 30000);

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCommandPanel();
  startClock();
  connectWS();
});
