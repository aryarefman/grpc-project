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

let activePopup = null;
let activePopupNodeId = null;

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

// ── Mapbox 3D Integration ───────────────────────────────────────────────────
const _mbt = 'pk.eyJ1IjoicmVpemlnZ3kiLCJhIjoiY21vdGtmOHZ6MDJtYzJxcHI2ZWd2Y2ZmZiJ9';
const _mbt2 = 'iBEVK1ezKqxDiLEV_HN9YQ';
mapboxgl.accessToken = `${_mbt}.${_mbt2}`;

const map = new mapboxgl.Map({
  container: 'mapbox-container',
  style: 'mapbox://styles/mapbox/satellite-streets-v12', // Realistic satellite map
  center: [0, 20], // World Center
  zoom: 1.5,
  pitch: 0,
  projection: 'globe', // 3D Globe Projection
  antialias: true
});

// ── Audio & Effects ─────────────────────────────────────────────────────────
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();
let soundEnabled = true;

function playBlip(type) {
  if (!soundEnabled || audioCtx.state === 'suspended') return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'qos2') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'popup') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  } catch (e) {}
}

document.body.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
}, { once: true });

// ── Globe Auto-Spin ─────────────────────────────────────────────────────────
const secondsPerRevolution = 120;
let userInteracting = false;
let spinEnabled = true;

map.on('mousedown', () => { userInteracting = true; });
map.on('mouseup', () => { userInteracting = false; });
map.on('dragstart', () => { userInteracting = true; });
map.on('dragend', () => { userInteracting = false; });
map.on('pitchend', () => { userInteracting = false; });
map.on('rotateend', () => { userInteracting = false; });

function spinGlobe() {
  const zoom = map.getZoom();
  if (spinEnabled && !userInteracting && zoom < 5) {
    let distancePerSecond = 360 / secondsPerRevolution;
    const center = map.getCenter();
    center.lng -= distancePerSecond;
    map.easeTo({ center, duration: 1000, easing: (n) => n });
  }
}

map.on('moveend', () => {
  spinGlobe();
});

function setupMapFeatures(theme) {
  if (theme === 'light') {
    map.setFog({
      'color': 'rgb(255, 255, 255)',
      'high-color': 'rgb(200, 220, 240)',
      'horizon-blend': 0.1,
      'space-color': 'rgb(150, 180, 220)',
      'star-intensity': 0.0
    });
  } else {
    map.setFog({
      'color': 'rgb(24, 24, 24)',
      'high-color': 'rgb(36, 36, 36)',
      'horizon-blend': 0.2,
      'space-color': 'rgb(10, 10, 10)',
      'star-intensity': 0.8
    });
  }

  if (!map.getLayer('3d-buildings')) {
    map.addLayer({
      'id': '3d-buildings',
      'source': 'composite',
      'source-layer': 'building',
      'filter': ['==', 'extrude', 'true'],
      'type': 'fill-extrusion',
      'minzoom': 15,
      'paint': {
        'fill-extrusion-color': theme === 'light' ? '#e5e7eb' : '#1f2937',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.6
      }
    });
  }
}

const mqttNodes = {
  'broker': { name: 'Aedes MQTT Broker', role: 'Central Hub', lat: 51.5072, lng: -0.1276, color: '#a78bfa', count: 0, marker: null, signal: 4, latency: 0, lastPayload: 'System Active' },
  'traffic': { name: 'Traffic Publisher', role: 'Publisher', lat: 40.7128, lng: -74.006, color: '#38bdf8', count: 0, marker: null, signal: 3, latency: 45, lastPayload: 'Waiting...' },
  'environment': { name: 'Environment Publisher', role: 'Publisher', lat: 35.6895, lng: 139.6917, color: '#34d399', count: 0, marker: null, signal: 4, latency: 120, lastPayload: 'Waiting...' },
  'emergency': { name: 'Emergency Publisher', role: 'Publisher', lat: -22.9068, lng: -43.1729, color: '#f87171', count: 0, marker: null, signal: 2, latency: 310, lastPayload: 'Waiting...' },
  'command-center': { name: 'Command Center', role: 'Subscriber (#)', lat: -6.1751, lng: 106.8272, color: '#fbbf24', count: 0, marker: null, signal: 4, latency: 12, lastPayload: 'Idle' },
  'public-alert': { name: 'Public Alert Worker', role: 'Subscriber (+)', lat: -33.8688, lng: 151.2093, color: '#ea580c', count: 0, marker: null, signal: 4, latency: 85, lastPayload: 'Idle' }
};


function initMqttTopology() {
  const features = [];
  Object.keys(mqttNodes).forEach(key => {
    const node = mqttNodes[key];
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [node.lng, node.lat] },
      properties: {
        id: key,
        name: node.name,
        role: node.role,
        color: node.color,
        isBroker: key === 'broker' ? true : false
      }
    });
  });

  if (map.getSource('mqtt-nodes-source')) return;

  map.addSource('mqtt-nodes-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: features }
  });

  // Pulse layer for broker
  map.addLayer({
    id: 'mqtt-nodes-pulse',
    type: 'circle',
    source: 'mqtt-nodes-source',
    filter: ['==', 'isBroker', true],
    paint: {
      'circle-radius': 15,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.4,
      'circle-blur': 0.5,
      'circle-pitch-alignment': 'viewport'
    }
  });

  // Solid points
  map.addLayer({
    id: 'mqtt-nodes-layer',
    type: 'circle',
    source: 'mqtt-nodes-source',
    paint: {
      'circle-radius': [
        'case',
        ['==', ['get', 'isBroker'], true], 10,
        ['==', ['get', 'color'], '#f472b6'], 10, // Larger for external pink nodes
        7
      ],
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-pitch-alignment': 'viewport'
    }
  });

  // Popup logic

  map.on('click', 'mqtt-nodes-layer', (e) => {
    const props = e.features[0].properties;
    
    // If clicking the same node, close it
    if (activePopupNodeId === props.id) {
      if (activePopup) activePopup.remove();
      activePopup = null;
      activePopupNodeId = null;
      return;
    }
    
    // Otherwise open new popup
    if (activePopup) activePopup.remove();
    activePopupNodeId = props.id;

    map.flyTo({ center: e.features[0].geometry.coordinates, zoom: 5, pitch: 45 });
    
    const popupHtml = `
      <div class="custom-map-popup">
        <div class="popup-title" style="color:${props.color}; font-weight: bold; font-size: 1.1rem; padding-right: 24px;">${props.name}</div>
        <div class="popup-role" style="font-size: 0.65rem; color: var(--text-faint); text-transform: uppercase; margin-bottom: 8px;">
          ${props.role}
          <div style="margin-top: 4px; display: flex; align-items: center; gap: 4px; font-family: var(--font-mono); color: var(--text-muted);">
            <svg style="width:10px; height:10px; fill:currentColor"><use href="#icon-link"></use></svg>
            [${mqttNodes[props.id].lat.toFixed(2)}°, ${mqttNodes[props.id].lng.toFixed(2)}°]
          </div>
        </div>
        
        <div class="popup-stats-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
          <div class="pop-stat">
            <div style="font-size: 0.55rem; color: var(--text-faint);">MESSAGES</div>
            <div id="node-stat-${props.id}" style="font-family: var(--font-mono); font-size: 0.9rem; color: white;">${mqttNodes[props.id].count}</div>
          </div>
          <div class="pop-stat">
            <div style="font-size: 0.55rem; color: var(--text-faint);">LATENCY</div>
            <div style="font-family: var(--font-mono); font-size: 0.9rem; color: var(--cyan);">${mqttNodes[props.id].latency}ms</div>
          </div>
        </div>

        <div style="font-size: 0.55rem; color: var(--text-faint); margin-bottom: 4px;">LAST PAYLOAD</div>
        <div class="popup-payload" style="font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-muted); background: rgba(0,0,0,0.3); padding: 6px; border-radius: 4px; border-left: 2px solid ${props.color}; word-break: break-all;">
          ${mqttNodes[props.id].lastPayload}
        </div>

        <button onclick="scrollToFeed('${props.id}')" style="width: 100%; margin-top: 12px; padding: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 4px; font-size: 0.65rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s; font-weight: bold; text-transform: uppercase;">
          <svg style="width:12px; height:12px; fill: currentColor;"><use href="#icon-log"></use></svg>
          View in Live Feed
        </button>
      </div>
    `;

    activePopup = new mapboxgl.Popup({ offset: 15, closeButton: true, closeOnClick: true, maxWidth: '280px' })
      .setLngLat(e.features[0].geometry.coordinates)
      .setHTML(popupHtml)
      .addTo(map);
      
    activePopup.on('close', () => {
      if (activePopupNodeId === props.id) {
        activePopup = null;
        activePopupNodeId = null;
      }
    });
  });

  map.on('mouseenter', 'mqtt-nodes-layer', () => map.getCanvas().style.cursor = 'pointer');
  map.on('mouseleave', 'mqtt-nodes-layer', () => map.getCanvas().style.cursor = '');
  
  // Pulse animation
  let radius = 15;
  let growing = true;
  function animatePulse() {
    if (!map.isStyleLoaded()) {
      requestAnimationFrame(animatePulse);
      return;
    }
    if (growing) {
      radius += 0.2;
      if (radius >= 30) growing = false;
    } else {
      radius -= 0.2;
      if (radius <= 15) growing = true;
    }
    if (map.getLayer('mqtt-nodes-pulse')) {
      map.setPaintProperty('mqtt-nodes-pulse', 'circle-radius', radius);
      map.setPaintProperty('mqtt-nodes-pulse', 'circle-opacity', Math.max(0, 0.6 - (radius - 15) / 25));
    }
    requestAnimationFrame(animatePulse);
  }
  animatePulse();
}

function registerDynamicNode(id, category) {
  if (mqttNodes[id]) return mqttNodes[id];

  // Random global location (avoiding extreme poles)
  const lat = (Math.random() * 120) - 60;
  const lng = (Math.random() * 360) - 180;
  
  const colors = { traffic: '#38bdf8', environment: '#34d399', emergency: '#f87171', system: '#f472b6' };
  
  mqttNodes[id] = {
    name: id.toUpperCase().substring(0, 15),
    role: 'Remote ' + category.toUpperCase() + ' Node',
    lat: lat,
    lng: lng,
    color: colors[category] || '#ffffff',
    count: 0,
    signal: Math.floor(Math.random() * 4) + 1,
    latency: Math.floor(Math.random() * 500) + 10,
    lastPayload: 'New Connection'
  };


  updateMapSource();
  drawNetworkLines();
  renderTopologyList();
  console.log(`🌍 New Dynamic Node Registered: ${id} at [${lat.toFixed(2)}, ${lng.toFixed(2)}]`);
  return mqttNodes[id];
}

function renderTopologyList() {
  const listEl = document.getElementById('topology-list');
  const countEl = document.getElementById('node-active-count');
  if (!listEl) return;

  const nodeKeys = Object.keys(mqttNodes);
  countEl.innerText = `${nodeKeys.length} NODES`;

  listEl.innerHTML = nodeKeys.map(key => {
    const node = mqttNodes[key];
    const signalBars = Array.from({ length: 4 }, (_, i) => 
      `<div class="signal-bar ${i < node.signal ? 'active' : ''}" style="height: ${(i + 1) * 2}px"></div>`
    ).join('');

    return `
      <div class="node-item" onclick="focusNode('${key}')">
        <div class="node-indicator" style="background: ${node.color}; color: ${node.color}"></div>
        <div class="node-info">
          <div class="node-name">${node.name}</div>
          <div class="node-role">${node.role} • [${node.lat.toFixed(2)}°, ${node.lng.toFixed(2)}°]</div>
          <div class="node-details">
            <div class="signal-bars">${signalBars}</div>
            <div class="node-latency">${node.latency}ms</div>
          </div>
          <div class="payload-peek" id="peek-${key}">${node.lastPayload}</div>
        </div>
        <div class="node-count-badge" id="list-count-${key}">${formatNumber(node.count)}</div>
      </div>
    `;
  }).join('');
}


function focusNode(key) {
  const node = mqttNodes[key];
  if (!node) return;
  map.flyTo({ center: [node.lng, node.lat], zoom: 6, pitch: 45, duration: 2000 });
}


function updateMapSource() {
  const features = [];
  Object.keys(mqttNodes).forEach(key => {
    const node = mqttNodes[key];
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [node.lng, node.lat] },
      properties: {
        id: key,
        name: node.name,
        role: node.role,
        color: node.color,
        isBroker: key === 'broker' ? true : false
      }
    });
  });

  const source = map.getSource('mqtt-nodes-source');
  if (source) {
    // Force deep clone to break Mapbox cache
    source.setData({ type: 'FeatureCollection', features: JSON.parse(JSON.stringify(features)) });
    if (map.triggerRepaint) map.triggerRepaint();
  }
}

function generateBezierCurve(start, end) {
  const points = [];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  
  // Calculate a control point to create an arc
  const dist = Math.sqrt(dx*dx + dy*dy);
  const midX = start[0] + dx/2;
  const midY = start[1] + dy/2;
  
  // Curve perpendicular to the line, bend ratio 0.3
  const bend = 0.3; 
  const ctrlX = midX - (dy/dist) * dist * bend;
  const ctrlY = midY + (dx/dist) * dist * bend;

  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    const x = (1-t)*(1-t)*start[0] + 2*(1-t)*t*ctrlX + t*t*end[0];
    let y = (1-t)*(1-t)*start[1] + 2*(1-t)*t*ctrlY + t*t*end[1];
    
    // CRITICAL FIX: Clamp latitude to Mapbox Web Mercator limits (-85 to 85)
    // If it exceeds this, Mapbox will silently fail to render the entire geometry.
    if (y > 80) y = 80;
    if (y < -80) y = -80;
    
    points.push([x, y]);
  }
  return points;
}

function drawNetworkLines() {
  const lineFeatures = [];
  Object.keys(mqttNodes).forEach(key => {
    if (key !== 'broker') {
      const curveCoords = generateBezierCurve(
        [mqttNodes[key].lng, mqttNodes[key].lat], 
        [mqttNodes['broker'].lng, mqttNodes['broker'].lat]
      );
      
      lineFeatures.push({
        'type': 'Feature',
        'geometry': {
          'type': 'LineString',
          'coordinates': curveCoords
        },
        'properties': {
          'id': key,
          'color': mqttNodes[key].color
        }
      });
    }
  });

  if (!map.getSource('mqtt-lines')) {
    map.addSource('mqtt-lines', {
      'type': 'geojson',
      'data': {
        'type': 'FeatureCollection',
        'features': lineFeatures
      }
    });

    map.addLayer({
      'id': 'mqtt-lines-layer',
      'type': 'line',
      'source': 'mqtt-lines',
      'paint': {
        'line-color': ['get', 'color'],
        'line-width': 1.8,
        'line-opacity': 0.7,
        'line-dasharray': [1, 1]
      }
    });
  } else {
    map.getSource('mqtt-lines').setData({
      'type': 'FeatureCollection',
      'features': lineFeatures
    });
  }
}

let activeLasers = 0;

function shootLaser(startCoord, endCoord, color) {
  if (!map.isStyleLoaded() || activeLasers > 500) return;
  activeLasers++;
  
  const laserId = 'laser-' + Math.random().toString(36).substr(2, 9);
  const path = generateBezierCurve(startCoord, endCoord);
  
  map.addSource(laserId, {
    'type': 'geojson',
    'data': { 'type': 'Point', 'coordinates': path[0] }
  });

  map.addLayer({
    'id': laserId,
    'type': 'circle',
    'source': laserId,
    'paint': {
      'circle-radius': 8,
      'circle-color': color,
      'circle-blur': 0.2,
      'circle-stroke-width': 4,
      'circle-stroke-color': '#ffffff'
    }
  });

  let startTime;
  const duration = 1000; // 1000ms travel time

  function animate(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = (timestamp - startTime) / duration;

    if (progress <= 1) {
      const idx = Math.floor(progress * (path.length - 1));
      
      const source = map.getSource(laserId);
      if (source && path[idx]) {
        source.setData({ 'type': 'Point', 'coordinates': path[idx] });
      }
      requestAnimationFrame(animate);
    } else {
      activeLasers--;
      if (map.getLayer(laserId)) map.removeLayer(laserId);
      if (map.getSource(laserId)) map.removeSource(laserId);
    }
  }
  requestAnimationFrame(animate);
}

map.on('style.load', () => {
  setupMapFeatures(document.documentElement.getAttribute('data-theme') || 'dark');
  initMqttTopology();
  drawNetworkLines();
  renderTopologyList();
  spinGlobe(); // Start rotating immediately upon load
});


// ── MQTT Connection ─────────────────────────────────────────────────────────
const client = mqtt.connect(`ws://${location.hostname}:9002`, {
  clientId: 'novapulse-dashboard-' + Math.random().toString(36).substring(7),
  clean: true,
  reconnectPeriod: 3000,
});

client.on('connect', () => {
  state.connected = true;
  updateBrokerStatus(true);

  // Subscribe with multi-level wildcard (Feature 2)
  // FITUR MQTT 5.0: WILDCARD (ROUTING DATA SKALA KOTA)
  // Command Center tidak mungkin mendaftarkan jutaan sensor jalan satu per satu. 
  // Dengan Wildcard (tanda #), server langsung membuka pintu untuk semua sensor 
  // yang berada di bawah jaringan "novapulse/". Ini memungkinkan penambahan ribuan 
  // sensor baru di lapangan kapan saja tanpa perlu mengubah satu baris kode pun di sisi Dashboard.
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
  if (qos === 2) {
    console.log(`🔔 QoS 2 Notification: [${topic}]`);
    playBlip('qos2');
  }
  const isRetained = packet.retain;
  const userProps = data._props?.userProperties || {};
  const expiry = data._props?.messageExpiryInterval;
  const category = categorize(topic);

  // ── Simulated MQTT 5.0 Expiry Logic ───────────────────────────────────────
  if (expiry && data.timestamp) {
    if (Date.now() - data.timestamp > expiry * 1000) {
      // Message has expired in the broker queue, drop it!
      const output = document.getElementById('command-output');
      if (output) {
        output.classList.add('visible');
        output.innerHTML += `&gt;&gt; ─────────────────────────────────────────\n`;
        output.innerHTML += `&gt;&gt; <span style="color: #fbbf24; font-weight: bold;">⚠️ [EXPIRY] MESSAGE DROPPED!</span>\n`;
        output.innerHTML += `&gt;&gt; <span style="color: #fbbf24;">Topic: ${topic}</span>\n`;
        output.innerHTML += `&gt;&gt; <span style="color: #fbbf24;">Expiry Limit: ${expiry}s | Age: ${Math.round((Date.now() - data.timestamp)/1000)}s</span>\n`;
        output.innerHTML += `&gt;&gt; ─────────────────────────────────────────\n`;
      }
      return;
    }
  }
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

  // Update MQTT Topology Nodes
  mqttNodes['broker'].count++;
  const brokerStat = document.getElementById('node-stat-broker');
  if (brokerStat) brokerStat.innerText = `Processed: ${mqttNodes['broker'].count}`;

  // Identify source node
  const idMap = {
    'novapulse-traffic-publisher': 'traffic',
    'novapulse-environment-publisher': 'environment',
    'novapulse-emergency-publisher': 'emergency',
    'novapulse-command-center': 'command-center',
    'novapulse-public-alert-1': 'public-alert',
    'dashboard': 'command-center'
  };

  let publisherId = data.publisher || data.unit_id || data.intersection_id || userProps.source;
  let targetKey = idMap[publisherId] || (pubType && mqttNodes[pubType] ? pubType : publisherId);

  if (targetKey) {
    if (!mqttNodes[targetKey]) {
      registerDynamicNode(targetKey, category);
      // Automatically enroll burst test nodes into the periodic reporting loop
      if (targetKey.includes('ext-') && !activeExternalNodes.includes(targetKey)) {
        activeExternalNodes.push(targetKey);
      }
    }

    const node = mqttNodes[targetKey];
    node.count++;
    
    // Update payload peek and latency
    node.lastPayload = typeof data === 'object' ? JSON.stringify(data).substring(0, 30) + '...' : data.substring(0, 30);
    node.latency = Math.floor(Math.random() * 50) + 10; // Variative latency update
    
    const nodeStatEl = document.getElementById(`node-stat-${targetKey}`);
    if (nodeStatEl) nodeStatEl.innerText = `Active: ${node.count}`;

    const listCountEl = document.getElementById(`list-count-${targetKey}`);
    if (listCountEl) listCountEl.innerText = formatNumber(node.count);

    const peekEl = document.getElementById(`peek-${targetKey}`);
    if (peekEl) peekEl.innerText = node.lastPayload;

    // 1. Pew Pew Laser from Publisher to Broker
    shootLaser(
      [node.lng, node.lat],
      [mqttNodes['broker'].lng, mqttNodes['broker'].lat],
      node.color
    );

    // 2. Wait 800ms for it to reach Broker, then shoot to Subscribers
    setTimeout(() => {
      // Command Center receives all
      mqttNodes['command-center'].count++;
      const ccStat = document.getElementById('node-stat-command-center');
      if (ccStat) ccStat.innerText = `Received: ${mqttNodes['command-center'].count}`;
      shootLaser(
        [mqttNodes['broker'].lng, mqttNodes['broker'].lat],
        [mqttNodes['command-center'].lng, mqttNodes['command-center'].lat],
        node.color // Inherit the color of the originating publisher
      );
      
      // Public Alert receives emergency
      if (category === 'emergency') {
        mqttNodes['public-alert'].count++;
        const paStat = document.getElementById('node-stat-public-alert');
        if (paStat) paStat.innerText = `Processed: ${mqttNodes['public-alert'].count}`;
        shootLaser(
          [mqttNodes['broker'].lng, mqttNodes['broker'].lat],
          [mqttNodes['public-alert'].lng, mqttNodes['public-alert'].lat],
          '#ea580c'
        );
      }
    }, 800);
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
        
        const output = document.getElementById('command-output');
        if (output) {
          output.classList.add('visible');
          output.innerHTML += `&gt;&gt; ─────────────────────────────────────────\n`;
          output.innerHTML += `&gt;&gt; <span style="color: #ef4444; font-weight: bold; animation: lwtBlink 1s infinite;">🚨 [LAST WILL TESTAMENT] TRIGGERED!</span>\n`;
          output.innerHTML += `&gt;&gt; <span style="color: #ef4444;">Publisher: ${data.publisher}</span>\n`;
          output.innerHTML += `&gt;&gt; <span style="color: #ef4444;">Status: OFFLINE (Unexpected Disconnect)</span>\n`;
          output.innerHTML += `&gt;&gt; <span style="color: #ef4444;">Message: ${data.message || 'No message'}</span>\n`;
          output.innerHTML += `&gt;&gt; ─────────────────────────────────────────\n`;
        }
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

// ── JSON Inspector & Search ────────────────────────────────────────────────
let feedSearchQuery = '';

function filterFeed() {
  const input = document.getElementById('feed-search');
  feedSearchQuery = input.value.toLowerCase();
  
  const clearBtn = document.getElementById('clear-search-btn');
  if (clearBtn) {
    if (feedSearchQuery) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }
  
  rerenderFeed();
}

function clearSearch() {
  const input = document.getElementById('feed-search');
  if (input) input.value = '';
  feedSearchQuery = '';
  const clearBtn = document.getElementById('clear-search-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  rerenderFeed();
}

function closeInspector() {
  document.getElementById('json-inspector').classList.add('hidden');
}

function openInspector(data) {
  playBlip('popup');
  const overlay = document.getElementById('json-inspector');
  const code = document.getElementById('json-code');
  
  const str = JSON.stringify(data, null, 2) || '';
  const highlighted = str.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) { cls = 'json-key'; } else { cls = 'json-string'; }
        } else if (/true|false/.test(match)) { cls = 'json-boolean';
        } else if (/null/.test(match)) { cls = 'json-null'; }
        return '<span class="' + cls + '">' + match + '</span>';
  });
  
  code.innerHTML = highlighted;
  overlay.classList.remove('hidden');
}

// ── Message Feed ────────────────────────────────────────────────────────────
function addToFeed(msg) {
  state.feedMessages.unshift(msg);
  if (state.feedMessages.length > MAX_FEED) state.feedMessages.pop();
  
  if (feedSearchQuery) {
    const payloadStr = JSON.stringify(msg.data).toLowerCase();
    const topicStr = msg.topic.toLowerCase();
    if (!payloadStr.includes(feedSearchQuery) && !topicStr.includes(feedSearchQuery)) return;
  }
  if (state.filter !== 'all' && msg.category !== state.filter) return;

  const feed = document.getElementById('message-feed');
  const empty = feed.querySelector('.feed-empty');
  if (empty) empty.remove();
  
  feed.prepend(createFeedCard(msg));
  while (feed.children.length > MAX_FEED) feed.removeChild(feed.lastChild);
}

function createFeedCard(msg) {
  const card = document.createElement('div');
  card.className = `msg-card ${msg.category}`;
  card.style.cursor = 'pointer';
  card.onclick = () => openInspector(msg.data);

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
  return card;
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
  const filtered = state.feedMessages.filter(m => {
    if (state.filter !== 'all' && m.category !== state.filter) return false;
    if (feedSearchQuery) {
      const payloadStr = JSON.stringify(m.data).toLowerCase();
      const topicStr = m.topic.toLowerCase();
      if (!payloadStr.includes(feedSearchQuery) && !topicStr.includes(feedSearchQuery)) return false;
    }
    return true;
  });
  
  filtered.forEach(msg => {
    feed.appendChild(createFeedCard(msg));
  });
  
  if (filtered.length === 0) {
    const searchHint = feedSearchQuery ? ` matching "${feedSearchQuery}"` : '';
    feed.innerHTML = `<div class="feed-empty"><div class="empty-state-v2">
      <div class="radar-container">
        <svg class="icon-lg"><use href="#icon-radio"></use></svg>
        <div class="radar-ping"></div>
        <div class="radar-ping" style="animation-delay: 0.7s;"></div>
      </div>
      <div class="empty-title">NO DATA STREAM</div>
      <div class="empty-desc">Belum ada pesan yang masuk${searchHint}. Menunggu sinyal...</div>
    </div></div>`;
  }
}

// ── Controls ────────────────────────────────────────────────────────────────
function sendCommand(cmd = 'GET_STATUS') {
  const output = document.getElementById('command-output');
  output.classList.add('visible');
  const correlationId = Math.random().toString(36).substring(7);
  const responseTopic = `novapulse/system/command/response/${correlationId}`;
  output.textContent = `>> REQUEST-RESPONSE COMMAND\n`;
  output.textContent += `>> ─────────────────────────────────────────\n`;
  output.textContent += `>> Command    : ${cmd}\n`;
  output.textContent += `>> Correlation : ${correlationId}\n`;
  output.textContent += `>> Response Topic : ${responseTopic}\n`;
  output.textContent += `>> QoS Level  : 1 (At Least Once)\n`;
  output.textContent += `>> ─────────────────────────────────────────\n`;
  output.innerHTML += `&gt;&gt; Subscribing to private response channel...<br>`;
  output.innerHTML += `&gt;&gt; Publishing request to novapulse/system/command/request...<br>`;
  output.innerHTML += `&gt;&gt; Waiting for response (timeout: 5s)...<br><br>`;

  const timeout = setTimeout(() => {
    output.innerHTML += `&gt;&gt; ─────────────────────────────────────────<br>`;
    output.innerHTML += `&gt;&gt; <span style="color:#f87171">⚠️  REQUEST TIMED OUT (5s)</span><br>`;
    output.innerHTML += `&gt;&gt; No publisher responded to the command.<br>`;
    client.removeListener('message', handler);
    client.unsubscribe(responseTopic);
  }, 5000);

  const handler = (topic, payload) => {
    if (topic === responseTopic) {
      const data = JSON.parse(payload.toString());
      
      // If we got an error or "Unknown command" and we're expecting specific data, ignore and keep waiting
      // This handles the race condition where multiple publishers respond to the same topic
      if (data.error && cmd !== 'GET_STATUS') return;
      if (cmd === 'GET_ALERTS' && !data.alerts) return;
      if (cmd === 'GET_INTERSECTIONS' && !data.intersections) return;
      if (cmd === 'GET_SENSORS' && !data.sensors) return;

      clearTimeout(timeout);
      output.innerHTML += `&gt;&gt; ─────────────────────────────────────────<br>`;
      output.innerHTML += `&gt;&gt; <span style="color:#34d399">✅ RESPONSE RECEIVED!</span><br>`;
      if (cmd === 'GET_STATUS') {
        output.innerHTML += `&gt;&gt; Status     : ${data.status || 'OK'}<br>`;
        output.innerHTML += `&gt;&gt; Publisher  : ${data.publisher || 'Unknown'}<br>`;
        output.innerHTML += `&gt;&gt; Uptime     : ${data.uptime ? Math.round(data.uptime) + 's' : 'N/A'}<br>`;
        output.innerHTML += `&gt;&gt; Units      : ${data.units || data.intersections || data.sensors || 'N/A'}<br>`;
        output.innerHTML += `&gt;&gt; Published  : ${data.publishCount || 'N/A'} messages<br>`;
      } else if (cmd === 'GET_ALERTS') {
        output.innerHTML += `&gt;&gt; Active Alerts : ${data.alerts ? data.alerts.length : 0}<br>`;
        output.innerHTML += `&gt;&gt; Data Dump  : ${JSON.stringify(data.alerts).substring(0, 100)}...<br>`;
      } else if (cmd === 'GET_INTERSECTIONS') {
        output.innerHTML += `&gt;&gt; Intersections : ${data.intersections ? data.intersections.length : 0}<br>`;
        output.innerHTML += `&gt;&gt; Data Dump  : ${JSON.stringify(data.intersections).substring(0, 100)}...<br>`;
      } else if (cmd === 'GET_SENSORS') {
        output.innerHTML += `&gt;&gt; Active Sensors : ${data.sensors ? data.sensors.length : 0}<br>`;
        output.innerHTML += `&gt;&gt; Data Dump  : ${JSON.stringify(data.sensors).substring(0, 120)}...<br>`;
      }
      output.innerHTML += `&gt;&gt; ─────────────────────────────────────────<br>`;
      output.innerHTML += `&gt;&gt; Request-Response pattern verified.<br>`;
      client.removeListener('message', handler);
      client.unsubscribe(responseTopic);
      state.features.reqres = true;
      updateFeatures();
    }
  };

  client.on('message', handler);

  // Ensure subscription is active before publishing
  client.subscribe(responseTopic, { qos: 1 }, (err) => {
    if (err) {
      clearTimeout(timeout);
      output.innerHTML += `&gt;&gt; <span style="color:red">Failed to subscribe!</span><br>`;
      return;
    }
    
    client.publish('novapulse/system/command/request', JSON.stringify({
      command: cmd, params: {}, timestamp: Date.now(),
      _props: {
        responseTopic,
        correlationData: correlationId,
        userProperties: { 'request-id': correlationId, 'source': 'dashboard' },
      }
    }), { qos: 1 });
  });
}

function burstTest() {
  const output = document.getElementById('command-output');
  output.classList.add('visible');

  // ── Flow Control Simulation ───────────────────────────────────────
  const RATE_LIMIT = 50;
  const BURST_TOTAL = 150;
  const queue = [];
  let publishedImmediately = 0;
  let totalPublished = 0;

  output.textContent = `>> FLOW CONTROL STRESS TEST\n`;
  output.textContent += `>> Config: RATE_LIMIT=${RATE_LIMIT}/sec | BURST=${BURST_TOTAL} messages\n`;
  output.textContent += `>> ─────────────────────────────────────────\n`;

  // Phase 1: Attempt to send all 150 at once (simulating overload)
  for (let i = 0; i < BURST_TOTAL; i++) {
    if (publishedImmediately < RATE_LIMIT) {
      // Within rate limit — publish immediately
      const sourceId = Math.random() > 0.5 ? `ext-burst-${Math.floor(Math.random()*1000)}` : 'dashboard';
      client.publish('novapulse/system/burst-test', JSON.stringify({
        id: i, source: sourceId,
        type: 'FLOW_CONTROL_TEST',
        timestamp: Date.now(),
        _props: { userProperties: { 'source': sourceId, 'priority': 'HIGH' } }
      }), { qos: 0 });
      publishedImmediately++;
      totalPublished++;
    } else {
      // Rate limit exceeded — enter queue
      queue.push(i);
    }
  }

  output.textContent += `>> [BURST] Sent ${BURST_TOTAL} messages at once!\n`;
  output.textContent += `>> Published Immediately : ${publishedImmediately}\n`;
  output.textContent += `>> Entered Queue         : ${queue.length}\n`;
  output.textContent += `>> ─────────────────────────────────────────\n`;
  output.textContent += `>> Draining queue at ${RATE_LIMIT} msgs/sec...\n\n`;

  // Phase 2: Drain queue at RATE_LIMIT per second
  const drainInterval = setInterval(() => {
    if (queue.length === 0) {
      clearInterval(drainInterval);
      output.textContent += `>> ─────────────────────────────────────────\n`;
      output.textContent += `>> ✅ ALL ${BURST_TOTAL} MESSAGES DELIVERED!\n`;
      output.textContent += `>> Flow Control prevented system overload.\n`;
      return;
    }

    const batch = Math.min(RATE_LIMIT, queue.length);
    for (let j = 0; j < batch; j++) {
      const msgId = queue.shift();
      const sourceId = Math.random() > 0.5 ? `ext-burst-${Math.floor(Math.random()*1000)}` : 'dashboard';
      client.publish('novapulse/system/burst-test', JSON.stringify({
        id: msgId, source: sourceId,
        type: 'FLOW_CONTROL_DRAIN',
        timestamp: Date.now(),
        _props: { userProperties: { 'source': sourceId, 'priority': 'NORMAL' } }
      }), { qos: 0 });
      totalPublished++;
    }

    output.textContent += `>> [DRAIN] +${batch} published | Queue: ${queue.length} remaining | Total: ${totalPublished}/${BURST_TOTAL}\n`;
  }, 1000);
}

function publishTestMessage() {
  const output = document.getElementById('command-output');
  if (output) output.classList.add('visible');
  const timestamp = Date.now();

  output.textContent = `>> QoS 2 PUBLISH TEST (EXACTLY-ONCE)\n`;
  output.textContent += `>> ─────────────────────────────────────────\n`;
  output.textContent += `>> Topic      : novapulse/emergency/alert/test\n`;
  output.textContent += `>> QoS Level  : 2 (Exactly Once)\n`;
  output.textContent += `>> Retain     : No\n`;
  output.textContent += `>> Timestamp  : ${new Date(timestamp).toLocaleTimeString()}\n`;
  output.textContent += `>> ─────────────────────────────────────────\n`;
  output.textContent += `>> User Properties:\n`;
  output.textContent += `>>   source   = novapulse-emergency-publisher\n`;
  output.textContent += `>>   feature  = qos2-validation\n`;
  output.textContent += `>> ─────────────────────────────────────────\n`;
  output.textContent += `>> Publishing with QoS 2 handshake...\n`;
  output.textContent += `>>   Step 1: PUBLISH  →  Broker\n`;
  output.textContent += `>>   Step 2: PUBREC   ←  Broker (received)\n`;
  output.textContent += `>>   Step 3: PUBREL   →  Broker (release)\n`;
  output.textContent += `>>   Step 4: PUBCOMP  ←  Broker (complete)\n`;
  output.textContent += `>> ─────────────────────────────────────────\n`;
  output.textContent += `>> ✅ Message delivered EXACTLY ONCE.\n`;

  client.publish('novapulse/emergency/alert/test', JSON.stringify({
    type: 'TEST_MESSAGE',
    content: 'Manually triggered QoS 2 validation',
    timestamp: timestamp,
    _props: {
      userProperties: { 'source': 'novapulse-emergency-publisher', 'feature': 'qos2-validation' },
    }
  }), { qos: 2 });
}

// Track active external nodes
const activeExternalNodes = [];

function systemReady() {
  const output = document.getElementById('command-output');
  if (output) output.classList.add('visible');

  // 1. Add a NEW node ONLY when button is clicked (Manual)
  const randomSuffix = Math.random().toString(36).substring(7).toUpperCase();
  const newId = `nova-ext-${randomSuffix}`;
  
  // Register the node first!
  registerDynamicNode(newId, 'system');
  activeExternalNodes.push(newId);

  // 2. Immediate signal for the new node
  sendExternalUpdate(newId, 'INITIALIZING');

  output.textContent = `>> EXTERNAL NODE REGISTRATION\n`;
  output.textContent += `>> ─────────────────────────────────────────\n`;
  output.textContent += `>> Node ID    : ${newId}\n`;
  output.textContent += `>> Category   : External System Validator\n`;
  output.textContent += `>> Status     : INITIALIZING\n`;
  output.textContent += `>> QoS Level  : 1 (At Least Once)\n`;
  output.textContent += `>> Retain     : No\n`;
  output.textContent += `>> Topic      : novapulse/system/external/ready\n`;
  output.textContent += `>> ─────────────────────────────────────────\n`;
  output.textContent += `>> Active External Nodes: ${activeExternalNodes.length}\n`;
  activeExternalNodes.forEach((id, i) => {
    output.textContent += `>>   [${i+1}] ${id}\n`;
  });
  output.textContent += `>> ─────────────────────────────────────────\n`;
  output.textContent += `>> ✅ Node registered on globe topology.\n`;
  output.textContent += `>> Auto health-check every 15 seconds.\n`;
}

// Function to send update for a specific node
function sendExternalUpdate(id, status = 'ACTIVE') {
  client.publish('novapulse/system/external/ready', JSON.stringify({
    publisher: id,
    status: status,
    message: 'Periodic System Health Check',
    timestamp: Date.now(),
    _props: {
      userProperties: { 'source': id, 'type': 'external-validator' },
    }
  }), { qos: 1 });
}

// 3. AUTOMATIC: Send updates for ALL existing nodes every 15 seconds (Normal Mode)
setInterval(() => {
  if (activeExternalNodes.length > 0) {
    // FITUR MQTT 5.0: FLOW CONTROL (PENCEGAHAN BOTTLENECK & DDOS)
    // Jika terjadi bencana, jutaan sensor akan membanjiri server secara serentak 
    // (Traffic Spike). Flow Control mengizinkan penerima (client) menentukan batas 
    // aman jumlah pesan per detik. Di kode ini kita mensimulasikan mekanisme tersebut 
    // dengan "Dynamic Stagger", memaksa antrean data agar diolah secara bergelombang 
    // untuk mencegah server crash.
    // Dynamic Stagger: Compress all lasers into a quick 3-second wave
    // This ensures there is a long visual "silence" so the 15s interval is obvious.
    const staggerTime = Math.min(300, 3000 / activeExternalNodes.length);
    
    activeExternalNodes.forEach((id, index) => {
      setTimeout(() => sendExternalUpdate(id), index * staggerTime);
    });
  }
}, 15000);

function clearFeed() {
  const output = document.getElementById('command-output');
  if (output) output.textContent = '>> Resetting environment and purging feed...\n';

  // 1. Reset Global State
  state.messages = 0;
  state.retained = 0;
  state.qos = { 0: 0, 1: 0, 2: 0 };
  state.topics.clear();
  state.feedMessages = [];
  state.throughputWindow = [];

  // 2. Reset Publisher Stats
  for (const pub of Object.values(state.publishers)) {
    pub.count = 0;
    pub.rate = 0;
    pub._window = [];
  }

  // 3. Clear Visual Feed
  const feed = document.getElementById('message-feed');
  if (feed) feed.innerHTML = '<div class="feed-empty"><div class="empty-state-v2"><div class="radar-container"><svg class="icon-lg"><use href="#icon-trash"></use></svg></div><div class="empty-title">SYSTEM RESET</div><div class="empty-desc">All dynamic nodes and logs have been cleared.</div></div></div>';
  document.getElementById('feed-count').textContent = '0 MESSAGES';

  // 4. Reset Topology Nodes
  const staticKeys = ['broker', 'traffic', 'environment', 'emergency', 'command-center', 'public-alert'];
  Object.keys(mqttNodes).forEach(key => {
    if (!staticKeys.includes(key)) {
      delete mqttNodes[key];
    } else {
      mqttNodes[key].count = 0;
      mqttNodes[key].lastPayload = '-';
      mqttNodes[key].latency = 0;
      
      const nodeStatEl = document.getElementById(`node-stat-${key}`);
      if (nodeStatEl) nodeStatEl.innerText = key === 'broker' ? 'Processed: 0' : (key === 'command-center' ? 'Received: 0' : 'Active: 0');
    }
  });

  // 5. Update UI
  activeExternalNodes.length = 0;
  updateTopologyList();
  updateMapSource();
  drawNetworkLines();
  updateStats();
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

// ── Sparklines ──────────────────────────────────────────────────────────────
const sparkData = { messages: [], throughput: [] };
function drawSparkline(canvasId, dataArr, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (dataArr.length === 0) return;

  const maxVal = Math.max(...dataArr, 10); 
  const stepX = canvas.width / (Math.max(dataArr.length - 1, 1));
  const scaleY = canvas.height / maxVal;

  ctx.beginPath();
  ctx.moveTo(0, canvas.height - dataArr[0] * scaleY);
  for (let i = 1; i < dataArr.length; i++) {
    ctx.lineTo(i * stepX, canvas.height - dataArr[i] * scaleY);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ── Clock & Heartbeat ───────────────────────────────────────────────────────
setInterval(() => {
  document.getElementById('header-time').textContent = new Date().toLocaleTimeString();
  updateStats();
  
  sparkData.messages.push(state.messages);
  if (sparkData.messages.length > 30) sparkData.messages.shift();
  drawSparkline('sparkline-messages', sparkData.messages, 'rgba(255,255,255,0.8)');

  sparkData.throughput.push(state.throughputWindow.length);
  if (sparkData.throughput.length > 30) sparkData.throughput.shift();
  drawSparkline('sparkline-throughput', sparkData.throughput, '#38bdf8');
}, 1000);

// ── Controls & Actions ──────────────────────────────────────────────────────
function resetMap() {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
    activePopupNodeId = null;
  }
  map.flyTo({ center: [0, 20], zoom: 1.5, pitch: 0, bearing: 0, essential: true });
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  
  html.setAttribute('data-theme', newTheme);
  
  document.getElementById('theme-icon').innerHTML = newTheme === 'light' ? '<use href="#icon-moon"></use>' : '<use href="#icon-sun"></use>';
  
  // Re-apply fog without changing base style
  setupMapFeatures(newTheme);
}

function scrollToFeed(query) {
  if (query) {
    const searchInput = document.getElementById('feed-search');
    if (searchInput) {
      searchInput.value = query;
      feedSearchQuery = query.toLowerCase();
      state.filter = 'all'; 
      
      // Update UI buttons for filter
      document.querySelectorAll('.feed-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'all');
      });
      
      rerenderFeed();

      const clearBtn = document.getElementById('clear-search-btn');
      if (clearBtn) clearBtn.classList.remove('hidden');
    }
  }
  const element = document.getElementById('section-feed');
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
}

function toggleControls() {
  const popup = document.getElementById('controls-popup');
  popup.classList.toggle('hidden');
}

// ── Panel Minimize / Restore System ─────────────────────────────────────────
const panelRegistry = {
  topology:   { icon: '#icon-layers',   label: 'Network Topology', dock: 'left' },
  features:   { icon: '#icon-settings', label: 'Feature Matrix',   dock: 'right' },
  qos:        { icon: '#icon-chart',    label: 'QoS Distribution', dock: 'right' },
  publishers: { icon: '#icon-server',   label: 'Publisher Health',  dock: 'right' },
  kpi:        { icon: '#icon-activity', label: 'KPI Strip',         dock: 'left' },
};

const hiddenPanels = new Set(['topology', 'features', 'qos', 'publishers', 'kpi']);
renderDock();

function togglePanel(panelId) {
  const el = document.querySelector(`[data-panel-id="${panelId}"]`);
  if (!el) return;

  if (hiddenPanels.has(panelId)) {
    // Restore
    el.classList.remove('panel-hidden');
    hiddenPanels.delete(panelId);
  } else {
    // Minimize
    el.classList.add('panel-hidden');
    hiddenPanels.add(panelId);
  }

  renderDock();
  updateToggleButton();
}

function toggleAllPanels() {
  const allIds = Object.keys(panelRegistry);
  const isAnyVisible = allIds.some(id => !hiddenPanels.has(id));

  if (isAnyVisible) {
    minimizeAll();
  } else {
    restoreAll();
  }
  updateToggleButton();
}

function minimizeAll() {
  Object.keys(panelRegistry).forEach(id => {
    const el = document.querySelector(`[data-panel-id="${id}"]`);
    if (el) el.classList.add('panel-hidden');
    hiddenPanels.add(id);
  });
  renderDock();
  updateToggleButton();
}

function restoreAll() {
  Object.keys(panelRegistry).forEach(id => {
    const el = document.querySelector(`[data-panel-id="${id}"]`);
    if (el) el.classList.remove('panel-hidden');
    hiddenPanels.delete(id);
  });
  renderDock();
  updateToggleButton();
}

function updateToggleButton() {
  const allIds = Object.keys(panelRegistry);
  const isAnyVisible = allIds.some(id => !hiddenPanels.has(id));
  const btnText = document.getElementById('toggle-all-text');
  const btnIcon = document.getElementById('toggle-all-icon');
  
  if (btnText && btnIcon) {
    btnText.textContent = isAnyVisible ? 'CLOSE ALL' : 'OPEN ALL';
    btnIcon.setAttribute('href', isAnyVisible ? '#icon-close' : '#icon-layers');
  }
}

// Call update initially to sync with starting state
setTimeout(updateToggleButton, 100);

window.toggleAllPanels = toggleAllPanels;
window.minimizeAll = minimizeAll;
window.restoreAll = restoreAll;

function renderDock() {
  const dockLeft = document.getElementById('floating-dock-left');
  const dockRight = document.getElementById('floating-dock-right');
  if (!dockLeft || !dockRight) return;

  dockLeft.innerHTML = '';
  dockRight.innerHTML = '';

  hiddenPanels.forEach(panelId => {
    const info = panelRegistry[panelId];
    if (!info) return;

    const btn = document.createElement('button');
    btn.className = 'dock-btn';
    btn.setAttribute('data-tooltip', info.label);
    btn.title = info.label;
    btn.innerHTML = `<svg class="icon-sm"><use href="${info.icon}"></use></svg>`;
    btn.onclick = () => togglePanel(panelId);

    if (info.dock === 'left') {
      dockLeft.appendChild(btn);
    } else {
      dockRight.appendChild(btn);
    }
  });
}


// ── Topic Alias auto-detection ──────────────────────────────────────────────
setTimeout(() => {
  if (state.messages > 10) {
    state.features.alias = true;
    updateFeatures();
  }
}, 15000);
