// ============================================================================
// NovaPulse MQTT Dashboard - Client-side Application
// Connects to MQTT broker via WebSocket, displays real-time data
// ============================================================================

// ── State ───────────────────────────────────────────────────────────────────
const state = {
  connected: false,
  messages: 0,
  topics: new Set(),
  retained: 0,
  qos: { 0: 0, 1: 0, 2: 0 },
  publishers: {
    traffic: { online: false, count: 0, lastSeen: 0, rate: 0, _window: [] },
    environment: { online: false, count: 0, lastSeen: 0, rate: 0, _window: [] },
    emergency: { online: false, count: 0, lastSeen: 0, rate: 0, _window: [] },
  },
  features: {
    pubsub: false, wildcard: false, alias: false, userprops: false,
    retain: false, expiry: false, lwt: false, reqres: false,
    shared: false, flowctrl: true,
  },
  filter: 'all',
  throughputWindow: [],
  feedMessages: [],
};

const MAX_FEED = 200;

// ── SVG icon references (no emojis) ─────────────────────────────────────────
const ICONS = {
  traffic: '<svg class="icon-sm" style="color:var(--cyan)"><use href="#icon-traffic"></use></svg>',
  environment: '<svg class="icon-sm" style="color:var(--green)"><use href="#icon-leaf"></use></svg>',
  emergency: '<svg class="icon-sm" style="color:var(--red)"><use href="#icon-shield"></use></svg>',
  system: '<svg class="icon-sm" style="color:var(--purple)"><use href="#icon-settings"></use></svg>',
  check: '<svg class="icon-feat" style="color:var(--green)"><use href="#icon-check"></use></svg>',
  clock: '<svg class="icon-feat" style="color:var(--text-faint)"><use href="#icon-clock"></use></svg>',
};

// ── MQTT Connection ─────────────────────────────────────────────────────────
const client = mqtt.connect('ws://localhost:9001', {
  clientId: 'novapulse-dashboard-' + Math.random().toString(36).substring(7),
  clean: true,
  reconnectPeriod: 3000,
});

client.on('connect', () => {
  state.connected = true;
  updateBrokerStatus(true);

  // Subscribe with multi-level wildcard (Feature 2)
  client.subscribe('novapulse/#', { qos: 1 });
  state.features.wildcard = true;
  state.features.pubsub = true;
  updateFeatures();
});

client.on('close', () => {
  state.connected = false;
  updateBrokerStatus(false);
});

client.on('error', () => {
  state.connected = false;
  updateBrokerStatus(false);
});

// ── Message Handler ─────────────────────────────────────────────────────────
client.on('message', (topic, payload, packet) => {
  state.messages++;
  state.topics.add(topic);
  state.qos[packet.qos]++;
  state.throughputWindow.push(Date.now());

  let data;
  try { data = JSON.parse(payload.toString()); } catch { data = payload.toString(); }

  const qos = packet.qos;
  const isRetained = packet.retain;
  const userProps = data._props?.userProperties || {};
  const expiry = data._props?.messageExpiryInterval;
  const category = categorize(topic);

  if (isRetained) { state.retained++; state.features.retain = true; }
  if (Object.keys(userProps).length > 0) state.features.userprops = true;
  if (expiry) state.features.expiry = true;

  // Track publisher stats
  const pubType = category === 'traffic' || category === 'environment' || category === 'emergency' ? category : null;
  if (pubType && state.publishers[pubType]) {
    state.publishers[pubType].count++;
    state.publishers[pubType].lastSeen = Date.now();
    state.publishers[pubType]._window.push(Date.now());
  }

  // LWT / Publisher status
  if (topic.startsWith('novapulse/system/status/')) {
    handlePublisherStatus(topic, data);
    state.features.lwt = true;
  }

  // Heartbeat - skip from feed but track
  if (topic.includes('heartbeat')) {
    if (data.publisher) {
      const type = data.type;
      if (type && state.publishers[type]) {
        state.publishers[type].online = true;
        state.publishers[type].lastSeen = Date.now();
      }
    }
    updateStats();
    return;
  }

  // Request-response detection
  if (topic.includes('command/request') || topic.includes('command/response')) {
    state.features.reqres = true;
  }

  // Shared subscription detection (Feature 9)
  if (topic.includes('shared-subscription') || 
      topic.includes('emergency/alert/new') ||
      data.sharedGroup || data.sharedTopic) {
    state.features.shared = true;
  }

  // Add to feed
  addToFeed({ topic, data, qos, isRetained, userProps, expiry, category, timestamp: Date.now() });
  updateStats();
  updateFeatures();
});

// ── Publisher Status (LWT) ──────────────────────────────────────────────────
function handlePublisherStatus(topic, data) {
  const types = { 'traffic-publisher': 'traffic', 'environment-publisher': 'environment', 'emergency-publisher': 'emergency' };
  for (const [key, type] of Object.entries(types)) {
    if (topic.includes(key)) {
      const pub = state.publishers[type];
      if (data.status === 'ONLINE') {
        pub.online = true;
        updatePublisherCard(type, true);
        setLwtStatus(type, 'LWT: REGISTERED', 'active');
      } else if (data.status === 'OFFLINE') {
        pub.online = false;
        updatePublisherCard(type, false);
        setLwtStatus(type, 'LWT: TRIGGERED', 'triggered');
        state.features.lwt = true;
      }
    }
  }
}

// ── UI Updates ──────────────────────────────────────────────────────────────
function updateBrokerStatus(online) {
  const dot = document.getElementById('ws-status-dot');
  const text = document.getElementById('broker-status-text');
  dot.className = 'ws-dot ' + (online ? 'connected' : 'disconnected');
  text.textContent = online ? 'BROKER CONNECTED' : 'DISCONNECTED';
}

function updateStats() {
  document.getElementById('stat-messages').textContent = formatNumber(state.messages);
  document.getElementById('stat-topics').textContent = state.topics.size;
  document.getElementById('stat-retained').textContent = state.retained;
  document.getElementById('stat-qos2').textContent = state.qos[2];

  // Throughput
  const now = Date.now();
  state.throughputWindow = state.throughputWindow.filter(t => now - t < 1000);
  document.getElementById('stat-throughput').innerHTML = state.throughputWindow.length + '<span class="stat-unit">/s</span>';

  // Publisher rates
  for (const [type, pub] of Object.entries(state.publishers)) {
    pub._window = pub._window.filter(t => now - t < 1000);
    pub.rate = pub._window.length;
    document.getElementById(`pub-${type}-count`).textContent = formatNumber(pub.count);
    document.getElementById(`pub-${type}-rate`).textContent = pub.rate + '/s';
  }

  // QoS bars
  const totalQos = state.qos[0] + state.qos[1] + state.qos[2] || 1;
  for (let i = 0; i <= 2; i++) {
    const pct = Math.round((state.qos[i] / totalQos) * 100);
    document.getElementById(`qos-bar-${i}`).style.width = pct + '%';
    document.getElementById(`qos-count-${i}`).textContent = state.qos[i];
  }

  document.getElementById('feed-count').textContent = state.feedMessages.length + ' MESSAGES';
}

function updatePublisherCard(type, online) {
  const card = document.getElementById(`pub-${type}`);
  const status = document.getElementById(`pub-${type}-status`);
  if (online) {
    card.classList.add('online');
    status.className = 'pub-status online';
  } else {
    card.classList.remove('online');
    status.className = 'pub-status offline';
  }
}

function setLwtStatus(type, text, cls) {
  const el = document.getElementById(`pub-${type}-lwt`);
  el.textContent = text;
  el.className = 'pub-lwt ' + cls;
}

function updateFeatures() {
  for (const [key, active] of Object.entries(state.features)) {
    const el = document.getElementById(`feat-${key}`);
    if (!el) continue;
    if (active) {
      el.className = 'feature-item active';
      el.querySelector('.feat-icon').innerHTML = ICONS.check;
    }
  }
}

// ── Message Feed ────────────────────────────────────────────────────────────
function addToFeed(msg) {
  state.feedMessages.unshift(msg);
  if (state.feedMessages.length > MAX_FEED) state.feedMessages.pop();
  renderFeedItem(msg);
}

function renderFeedItem(msg) {
  const feed = document.getElementById('message-feed');
  const empty = feed.querySelector('.feed-empty');
  if (empty) empty.remove();

  if (state.filter !== 'all' && msg.category !== state.filter) return;

  const card = document.createElement('div');
  card.className = `msg-card ${msg.category}`;
  card.onclick = () => card.classList.toggle('expanded');

  const icon = ICONS[msg.category] || ICONS.system;
  const time = new Date(msg.timestamp).toLocaleTimeString();

  let badges = `<span class="msg-badge badge-qos${msg.qos}">QoS ${msg.qos}</span>`;
  if (msg.isRetained) badges += '<span class="msg-badge badge-retain">RETAIN</span>';
  if (msg.expiry) badges += `<span class="msg-badge badge-expiry">TTL:${msg.expiry}s</span>`;
  if (Object.keys(msg.userProps).length > 0) badges += '<span class="msg-badge badge-props">PROPS</span>';

  let body = '';
  if (typeof msg.data === 'object') {
    if (msg.data.alert_id) body = `<strong>${msg.data.severity || ''}</strong> ${msg.data.type || ''} — ${msg.data.location || msg.data.description || ''}`;
    else if (msg.data.incident_id) body = `<strong>${msg.data.severity}</strong> ${msg.data.type} at ${msg.data.name}`;
    else if (msg.data.sensor_id) body = `${msg.data.name}: <strong>${msg.data.value}${msg.data.unit}</strong> [${msg.data.quality}]`;
    else if (msg.data.congestion_level !== undefined) body = `${msg.data.name || msg.data.intersection_id}: ${msg.data.vehicle_count} vehicles, ${Math.round(msg.data.congestion_level * 100)}% congested`;
    else if (msg.data.status) body = `Status: <strong>${msg.data.status}</strong> ${msg.data.publisher || msg.data.unit_id || ''}`;
    else body = JSON.stringify(msg.data).substring(0, 120);
  }

  let propsHtml = '';
  if (Object.keys(msg.userProps).length > 0) {
    propsHtml = Object.entries(msg.userProps).map(([k, v]) => `<span style="color:var(--purple)">${k}</span>=${v}`).join(' &nbsp;|&nbsp; ');
  }

  card.innerHTML = `
    <div class="msg-header">
      <span class="msg-icon">${icon}</span>
      <span class="msg-topic">${msg.topic}</span>
      <span class="msg-time">${time}</span>
    </div>
    <div class="msg-badges">${badges}</div>
    <div class="msg-body">${body}</div>
    ${propsHtml ? `<div class="msg-props">${propsHtml}</div>` : ''}
  `;

  feed.insertBefore(card, feed.firstChild);

  // Limit DOM nodes
  while (feed.children.length > MAX_FEED) {
    feed.removeChild(feed.lastChild);
  }
}

// ── Filters ─────────────────────────────────────────────────────────────────
function setFilter(filter) {
  state.filter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  rerenderFeed();
}

function rerenderFeed() {
  const feed = document.getElementById('message-feed');
  feed.innerHTML = '';
  const filtered = state.feedMessages.filter(m => state.filter === 'all' || m.category === state.filter);
  filtered.forEach(msg => {
    renderFeedItem(msg);
  });
  if (filtered.length === 0) {
    feed.innerHTML = `<div class="feed-empty"><div class="empty-state-v2">
      <div class="radar-container">
        <svg class="icon-lg"><use href="#icon-radio"></use></svg>
        <div class="radar-ping"></div>
        <div class="radar-ping" style="animation-delay: 0.7s;"></div>
      </div>
      <div class="empty-title">NO DATA</div>
      <div class="empty-desc">No messages match the current filter</div>
    </div></div>`;
  }
}

// ── Controls ────────────────────────────────────────────────────────────────
function sendCommand() {
  const output = document.getElementById('command-output');
  output.classList.add('visible');
  output.textContent = '>> Sending GET_STATUS request...\n';

  const correlationId = Math.random().toString(36).substring(7);
  const responseTopic = `novapulse/system/command/response/${correlationId}`;

  client.subscribe(responseTopic, { qos: 1 });

  const timeout = setTimeout(() => {
    output.textContent += '<< Request timed out (5s)\n';
    client.unsubscribe(responseTopic);
  }, 5000);

  const handler = (topic, payload) => {
    if (topic === responseTopic) {
      clearTimeout(timeout);
      const data = JSON.parse(payload.toString());
      output.textContent += `<< Response: ${JSON.stringify(data, null, 2).substring(0, 200)}\n`;
      client.removeListener('message', handler);
      client.unsubscribe(responseTopic);
      state.features.reqres = true;
      updateFeatures();
    }
  };
  client.on('message', handler);

  client.publish('novapulse/system/command/request', JSON.stringify({
    command: 'GET_STATUS', params: {}, timestamp: Date.now(),
    _props: {
      responseTopic,
      correlationData: correlationId,
      userProperties: { 'request-id': correlationId, 'source': 'dashboard' },
    }
  }), { qos: 1 });
}

function burstTest() {
  const output = document.getElementById('command-output');
  output.classList.add('visible');
  output.textContent = '>> Burst test: sending 50 messages...\n';

  let sent = 0;
  const interval = setInterval(() => {
    if (sent >= 50) {
      clearInterval(interval);
      output.textContent += `<< Burst complete: ${sent} messages sent\n`;
      state.features.flowctrl = true;
      updateFeatures();
      return;
    }
    client.publish(`novapulse/system/burst-test`, JSON.stringify({
      seq: sent, total: 50, timestamp: Date.now(),
      _props: {
        messageExpiryInterval: 10,
        userProperties: { 'source': 'dashboard', 'test': 'burst' },
      }
    }), { qos: 0 });
    sent++;
  }, 50);
}

function clearFeed() {
  state.feedMessages = [];
  const feed = document.getElementById('message-feed');
  feed.innerHTML = `<div class="feed-empty"><div class="empty-state-v2">
    <div class="radar-container">
      <svg class="icon-lg"><use href="#icon-trash"></use></svg>
    </div>
    <div class="empty-title">FEED PURGED</div>
    <div class="empty-desc">Message history has been cleared</div>
  </div></div>`;
  document.getElementById('feed-count').textContent = '0 MESSAGES';
}

function publishTestMessage() {
  const output = document.getElementById('command-output');
  output.classList.add('visible');

  client.publish('novapulse/system/test', JSON.stringify({
    message: 'Test message from dashboard',
    timestamp: Date.now(),
    _props: {
      messageExpiryInterval: 60,
      userProperties: { 'source': 'dashboard', 'test': 'manual', 'priority': 'LOW' },
    }
  }), { qos: 2, retain: false });

  output.textContent = '>> Test message published (QoS 2)\n';
}

// ── Utilities ───────────────────────────────────────────────────────────────
function categorize(topic) {
  if (topic.includes('traffic')) return 'traffic';
  if (topic.includes('environment')) return 'environment';
  if (topic.includes('emergency')) return 'emergency';
  return 'system';
}

function formatNumber(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

// ── Clock ───────────────────────────────────────────────────────────────────
setInterval(() => {
  document.getElementById('header-time').textContent = new Date().toLocaleTimeString();
  updateStats();
}, 1000);

// ── Topic Alias auto-detection ──────────────────────────────────────────────
setTimeout(() => {
  if (state.messages > 10) {
    state.features.alias = true;
    updateFeatures();
  }
}, 15000);
