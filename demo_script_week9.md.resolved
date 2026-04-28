# 🎬 Skrip Demo Presentasi Week 9
## NovaPulse — Smart City gRPC + WebSocket Command Center

> **Durasi target:** 10–14 menit | **Format:** On Camera + Screen Share

---

## 📋 CHECKLIST SEBELUM REKAMAN

- [ ] Jalankan server: `npm run server` di folder `grpc-project`
- [ ] Buka browser ke `http://localhost:3000`
- [ ] Siapkan VS Code dengan tab berikut sudah terbuka:
  - `server/index.js`
  - `server/websocketBridge.js`
  - `server/webServer.js`
  - `server/store/inMemoryStore.js`
  - `protos/traffic.proto`
  - `web/app.js`

---

## 🎙️ SEGMEN 1 — DESKRIPSI & ARSITEKTUR (2–3 menit)

### Kata Pembuka
> *"Halo, perkenalkan saya [nama]. Ini adalah presentasi Week 9 — implementasi WebSocket yang terintegrasi dengan gRPC. Proyeknya bernama NovaPulse, Smart City Command & Control Center."*

### Deskripsi Proyek
> *"NovaPulse adalah sistem monitoring kota pintar real-time. Ada tiga layanan gRPC di backend: TrafficService untuk manajemen persimpangan dan lampu lalu lintas, EmergencyService untuk alert darurat dan dispatch unit, dan EnvironmentService untuk sensor IoT seperti kualitas udara dan suhu."*

### Arsitektur (sambil tunjuk diagram)

```
┌──────────────────────────────────────────────┐
│           BROWSER (web/app.js)               │
│   WebSocket Client + Event-Driven Rendering  │
└──────────────┬───────────────────────────────┘
               │ ws://localhost:3000 (JSON)
┌──────────────▼───────────────────────────────┐
│   server/websocketBridge.js  (PORT 3000)     │
│  • Broadcast gRPC stream data → browser      │
│  • Server Push (heartbeat, proactive alert)  │
│  • Terima command browser → panggil gRPC     │
└──────────────┬───────────────────────────────┘
               │ gRPC localhost:50051
┌──────────────▼───────────────────────────────┐
│   server/index.js  (gRPC PORT 50051)         │
│   TrafficService | EmergencyService | Env    │
│   server/services/trafficService.js  dll     │
└──────────────┬───────────────────────────────┘
               │
┌──────────────▼───────────────────────────────┐
│   server/store/inMemoryStore.js              │
│   Centralized state + EventEmitter           │
│   Auto-simulation tiap 3–5 detik            │
└──────────────────────────────────────────────┘
```

> *"Browser berkomunikasi lewat WebSocket ke Bridge di port 3000. Bridge meneruskan data gRPC streaming ke browser, dan menerima command dari browser untuk memanggil gRPC. Semua data terpusat di InMemoryStore yang juga EventEmitter — setiap perubahan data langsung emit event yang ditangkap streaming RPC."*

---

## 🎙️ SEGMEN 2 — DEMO FITUR (5–7 menit)

---

### 🔌 FITUR 1: Implementasi WebSocket

**[Tunjukkan browser http://localhost:3000, lihat status bar atas]**

> *"Saat browser dibuka, koneksi WebSocket langsung terbentuk. Status berubah jadi SECURE LINK ACTIVE — dot hijau berkedip. Activity Log langsung terisi tanpa klik apapun, karena server langsung push initial state."*

**[Buka DevTools → Network → WS, tunjukkan frame masuk]**

> *"Di DevTools kita bisa lihat frame WebSocket yang masuk tiap beberapa detik — format JSON dengan field `type`, `data`, dan `ts`. Inilah perbedaan WebSocket: koneksi persistent, server bisa kirim kapan saja tanpa diminta."*

**📍 Kode yang relevan:**

```
📄 server/webServer.js — Baris 6–35
```
```javascript
// Baris 24–27: HTTP Server + pasang WebSocket bridge
const httpServer = http.createServer(app);
attachWebSocket(httpServer);          // ← Bridge dipasang ke server yang sama
httpServer.listen(WEB_PORT, ...);     // Port 3000: HTTP + WS sekaligus
```
> 💡 **Kesimpulan Inti:** Satu HTTP server di port 3000 melayani dua protokol sekaligus — HTTP untuk file statis (HTML/CSS/JS) dan WebSocket untuk komunikasi real-time. Browser tidak perlu port berbeda.

```
📄 server/websocketBridge.js — Baris 312–347
```
```javascript
// Baris 312–313: Buat WebSocket server menempel ke HTTP server
function attachWebSocket(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer });

  // Baris 316–319: Delay 1.5 detik lalu mulai gRPC stream + server push
  setTimeout(() => {
    startGrpcStreams(wss);
    startServerPush(wss);
  }, 1500);

  // Baris 321–335: Saat browser connect → kirim initial state
  wss.on('connection', (ws, req) => {
    ws.send(JSON.stringify({
      type: 'initial_state',
      data: { intersections, alerts, sensors, units },
    }));
    ws.on('message', (raw) => handleClientCommand(ws, wss, raw));
  });
}
```
> 💡 **Kesimpulan Inti:** Saat browser baru connect, server langsung push `initial_state` berisi seluruh data kota — jadi UI sudah terisi penuh tanpa perlu browser melakukan request apapun. Setiap message dari browser juga langsung diteruskan ke `handleClientCommand` (Command Bridge).

```
📄 web/app.js — Baris 21–54
```
```javascript
// Baris 25–44: Koneksi WebSocket dari sisi browser
function connectWS() {
  ws = new WebSocket(WS_URL);                    // Baris 28
  ws.addEventListener('open', () => {            // Baris 30
    setWsStatus('connected');                    // → dot hijau
  });
  ws.addEventListener('close', () => {           // Baris 36
    reconnectTimer = setTimeout(connectWS, 3000); // auto-reconnect
  });
  ws.addEventListener('message', (evt) => {      // Baris 46
    handleMessage(JSON.parse(evt.data));          // → router pesan
  });
}
```
> 💡 **Kesimpulan Inti:** Browser membuka satu koneksi WebSocket persistent yang menangani semua jenis data — traffic, emergency, sensor, command result — cukup dengan satu event listener `message` yang meneruskan ke router `handleMessage()`.

---

### 📊 FITUR 2: Event-Driven UI — 3 Komponen Dinamis

> *"Ada 3 komponen yang berubah dinamis berdasarkan pesan WebSocket."*

**[Tunjukkan ketiga komponen sambil narasi]**

#### Komponen 1 — Traffic Chart (Canvas Bar Chart)

> *"Komponen pertama adalah bar chart di atas. Di-render ulang setiap ada `traffic_update`. Bar merah = macet >70%, kuning 50–70%, hijau normal. Bergerak sendiri karena simulasi di InMemoryStore."*

**📍 Kode:**
```
📄 web/app.js — Baris 186–267
```
```javascript
// Baris 186: fungsi render Chart dipanggil tiap traffic_update
function renderTrafficChart() {
  const canvas = document.getElementById('traffic-chart');
  // Baris 229–266: Loop tiap intersection → gambar bar
  entries.forEach((inter, idx) => {
    const cong = Math.min(1, inter.congestion_level || 0);
    let color = '#06b6d4';              // cyan = normal
    if (cong > 0.7) color = '#ef4444'; // merah = macet
    else if (cong > 0.5) color = '#f59e0b'; // kuning
    // → gambar bar dengan rounded rect + gradient
  });
}
```
> 💡 **Kesimpulan Inti:** Chart dirender ulang dari nol setiap ada data baru masuk — warna bar berubah otomatis berdasarkan nilai `congestion_level` yang datang dari WebSocket, tanpa library Chart.js, murni HTML5 Canvas.

```
📄 web/app.js — Baris 81–93 (trigger render dari WebSocket)
```
```javascript
case 'traffic_update': {              // Baris 81
  state.intersections[u.intersection_id] = { ...u };
  renderTrafficChart();               // Baris 89 → update chart
  renderIntersections();              // Baris 90 → update grid
  logActivity('TRAFFIC', ...);        // Baris 92 → update log
}
```
> 💡 **Kesimpulan Inti:** Satu event `traffic_update` dari WebSocket memicu tiga komponen sekaligus — chart, grid, dan log — inilah inti dari arsitektur event-driven: satu sumber data, banyak komponen yang bereaksi.

#### Komponen 2 — Intersection Grid (Status Indikator)

> *"Komponen kedua adalah grid status persimpangan — lampu, congestion bar, jumlah kendaraan. Diurutkan otomatis dari yang paling padat."*

**📍 Kode:**
```
📄 web/app.js — Baris 270–295
```
```javascript
// Baris 270: fungsi render grid
function renderIntersections() {
  // Baris 278: sort dari congestion tertinggi
  entries.sort((a, b) => (b.congestion_level||0) - (a.congestion_level||0));
  // Baris 280–294: generate HTML tiap baris: light dot + nama + bar + count
  grid.innerHTML = entries.map(i => `
    <div class="int-row">
      <div class="int-light light-${i.current_light}"></div>
      <div class="int-name">${i.name}</div>
      <div class="int-cong-fill" style="width:${pct}%"></div>
      <div class="int-vehicles">${i.vehicle_count}V</div>
    </div>`).join('');
}
```
> 💡 **Kesimpulan Inti:** Grid ini bukan hanya tampilan statis — data diurutkan ulang setiap render sehingga persimpangan paling macet selalu tampil di atas secara otomatis, tanpa interaksi user.

#### Komponen 3 — Activity Log (Live Stream Log)

> *"Komponen ketiga adalah Activity Log. Setiap pesan WebSocket apapun dicatat di sini — TRAFFIC biru, EMERGENCY merah, PROACTIVE oranye, COMMAND hijau."*

**📍 Kode:**
```
📄 web/app.js — Baris 298–320
```
```javascript
// Baris 299: dipanggil dari setiap case di handleMessage()
function logActivity(label, message, level = 'info') {
  const item = document.createElement('div');
  item.className = `log-entry log-${level}`;   // Baris 305: warna per level
  item.innerHTML = `
    <span class="log-ts">${ts}</span>
    <span class="log-label">${label}</span>
    <span class="log-msg">${message}</span>`;
  log.prepend(item);   // Baris 311: newest di atas
  // Baris 314–315: flash effect 1 detik
  item.style.backgroundColor = 'var(--border-bright)';
  setTimeout(() => { item.style.backgroundColor = ''; }, 1000);
}
```
> 💡 **Kesimpulan Inti:** Activity Log adalah bukti nyata aliran data real-time — setiap event WebSocket yang masuk, apapun jenisnya, selalu tercatat di sini dengan timestamp dan warna berbeda per kategori. Ini yang membedakan sistem event-driven dari polling biasa.

---

### 📡 FITUR 3: Server-Initiated Events

> *"Server mendorong data ke browser TANPA ada request dari klien. Ada dua mekanisme."*

**[Tunggu KPI bar update sendiri, lalu tunjukkan toast muncul]**

> *"Mekanisme pertama: System Heartbeat — setiap 15 detik, server push ringkasan kondisi kota ke semua browser. KPI bar atas (Intersections, Congested, Alerts, AQI) diupdate dari sini tanpa browser minta."*

> *"Mekanisme kedua: saat gRPC stream menerima emergency event severity HIGH atau CRITICAL, Bridge langsung push `server_alert` khusus — toast notifikasi muncul otomatis."*

**📍 Kode — Heartbeat (proactive push tiap 15 detik):**
```
📄 server/websocketBridge.js — Baris 119–152
```
```javascript
// Baris 119–120: setInterval 15 detik — tidak ada trigger dari browser
function startServerPush(wss) {
  serverPushTimer = setInterval(() => {
    const intersections = store.getAllIntersections();    // Baris 122
    const congested = intersections.filter(i => i.congestion_level > 0.7).length;
    const activeAlerts = store.getActiveAlerts();        // Baris 124
    const avgAqi = /* hitung rata-rata AQI sensor */;   // Baris 126–128

    broadcast(wss, 'system_heartbeat', {                 // Baris 130
      intersections_total: intersections.length,
      congested_count: congested,
      active_alerts: activeAlerts.length,
      avg_aqi: Math.round(avgAqi),
      server_time: new Date().toISOString(),
    });

    // Baris 139–150: jika ada alert CRITICAL, push ulang proaktif
    activeAlerts.filter(a => a.severity === 'CRITICAL').forEach(a => {
      broadcast(wss, 'server_alert', { title: '⚠️ CRITICAL SITUATION ONGOING', ... });
    });
  }, 15000);   // ← 15 detik, tanpa diminta
}
```
> 💡 **Kesimpulan Inti:** `startServerPush()` adalah implementasi **Server-Initiated Events** yang murni — server yang berinisiatif kirim data ke browser menggunakan `setInterval`, bukan karena ada request. Browser hanya duduk dan menerima.

**📍 Kode — Proactive alert saat gRPC emergency stream:**
```
📄 server/websocketBridge.js — Baris 69–83
```
```javascript
// Baris 70: subscribe gRPC SubscribeAlerts stream
emergencyStream = emergencyClient.SubscribeAlerts({ zone: 'ALL', min_severity: 'LOW' });
emergencyStream.on('data', (event) => {
  broadcast(wss, 'emergency_event', event);           // Baris 72: broadcast normal

  // Baris 73–83: jika HIGH/CRITICAL → push server_alert TAMBAHAN (proaktif)
  if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
    broadcast(wss, 'server_alert', {
      title: `🚨 ${event.severity} ALERT`,
      message: `${event.alert_type} at ${event.location}`,
      severity: event.severity,
    });
  }
});
```
> 💡 **Kesimpulan Inti:** Ini adalah "double push" — saat event darurat HIGH/CRITICAL datang dari gRPC stream, Bridge tidak hanya meneruskan event biasa tapi juga mengirim `server_alert` tambahan secara proaktif. Server yang memutuskan kapan browser perlu diberi tahu.

**📍 Kode — Handler di browser:**
```
📄 web/app.js — Baris 131–150
```
```javascript
case 'server_alert': {                                 // Baris 131
  showToast(sa.title, sa.message, sa.details, sa.severity);  // Baris 133
  logActivity('PROACTIVE', `📡 ${sa.title}`, ...);    // Baris 134
  state.totalAlerts++;                                 // Baris 135
  badge.textContent = state.totalAlerts;               // Baris 137: angka di bel
}

case 'system_heartbeat': {                             // Baris 142
  document.getElementById('kpi-intersections-val').textContent = hb.intersections_total; // Baris 145
  document.getElementById('kpi-congested-val').textContent = hb.congested_count;
  document.getElementById('kpi-alerts-val').textContent = hb.active_alerts;
  document.getElementById('kpi-aqi-val').textContent = hb.avg_aqi;
}
```
> 💡 **Kesimpulan Inti:** `server_alert` dan `system_heartbeat` adalah dua tipe pesan yang **100% diprakarsai server** — browser di sisi client tidak pernah meminta data ini, semua inisiatif ada di server. Ini adalah inti perbedaan WebSocket dari HTTP biasa.

---

### 🕹️ FITUR 4: Command & Control Bridge

> *"Browser kirim instruksi via WebSocket → Bridge terima → panggil gRPC → hasilnya balik ke browser."*

**[Scroll ke Command Center, demo update lampu + buat alert]**

**Demo 1 — Pilih INT-001, set RED, klik UPDATE:**
> *"Browser kirim JSON `{ command: 'update_traffic_light', params: {...} }` via WebSocket. Bridge terima, panggil gRPC `UpdateTrafficLight`, hasilnya di-send balik ke browser. Grid intersection langsung update."*

**Demo 2 — Tab Emergency, create FIRE CRITICAL, klik CREATE:**
> *"Alert muncul di Emergency Queue. Karena CRITICAL, server_alert proaktif juga muncul. Klik RESOLVE — alert hilang, unit kembali AVAILABLE."*

**📍 Kode — Kirim command dari browser:**
```
📄 web/app.js — Baris 56–63
```
```javascript
// Baris 56: satu fungsi untuk semua command
function sendCommand(command, params = {}) {
  ws.send(JSON.stringify({ command, params }));  // Baris 61: kirim via WebSocket
  setCmdOutput(`▶ Uplink: ${command.toUpperCase()}`, '');
}
```

```
📄 web/app.js — Baris 590–597 (event listener tombol)
```
```javascript
// Baris 590: klik tombol UPDATE LIGHT
document.getElementById('btn-update-light').addEventListener('click', () => {
  sendCommand('update_traffic_light', {
    intersection_id: document.getElementById('cmd-intersection-id').value,
    new_light:       document.getElementById('cmd-light').value,
    duration_seconds: parseInt(document.getElementById('cmd-duration').value),
    reason:          document.getElementById('cmd-reason').value,
  });
});
```

**📍 Kode — Bridge terima command → panggil gRPC:**
```
📄 server/websocketBridge.js — Baris 156–193
```
```javascript
// Baris 156: handler semua command dari browser
function handleClientCommand(ws, wss, raw) {
  const { command, params } = JSON.parse(raw);   // Baris 160

  switch (command) {
    // Baris 173–193: command update_traffic_light
    case 'update_traffic_light':
      trafficClient.UpdateTrafficLight({          // ← gRPC Unary call
        intersection_id: params.intersection_id,
        new_light: params.new_light,
        duration_seconds: params.duration_seconds || 60,
        reason: params.reason || 'WebUI Override',
      }, (err, res) => {
        ws.send(JSON.stringify({ type: 'cmd_result', data: { command, result: res } }));
        broadcast(wss, 'server_alert', {          // Baris 184: notif ke semua
          title: '🚦 Traffic Light Updated', ...
        });
      });
      break;

    // Baris 222–238: command create_alert → gRPC EmergencyService
    case 'create_alert':
      emergencyClient.CreateAlert({ ... }, (err, res) => {
        ws.send(JSON.stringify({ type: 'cmd_result', data: { command, result: res } }));
      });
      break;
  }
}
```

**📍 Kode — gRPC service handler di backend:**
```
📄 server/services/trafficService.js — Baris 45–85
```
```javascript
// Baris 45: handler gRPC UpdateTrafficLight (Unary RPC)
UpdateTrafficLight(call, callback) {
  const { intersection_id, new_light, duration_seconds, reason } = call.request; // Baris 46
  // Baris 57–62: validasi input
  if (!VALID_LIGHTS.includes(new_light.toUpperCase())) {
    return callback({ code: grpc.status.INVALID_ARGUMENT, message: '...' });
  }
  // Baris 64–69: update ke store
  const result = store.updateTrafficLight(intersection_id, new_light, duration_seconds, reason);
  callback(null, { success: true, previous_light: result.previousLight, ... }); // Baris 78
}
```

**📍 Kode — Store update + emit event (trigger stream):**
```
📄 server/store/inMemoryStore.js — Baris 233–261
```
```javascript
// Baris 233: updateTrafficLight di store
updateTrafficLight(id, newLight, durationSeconds, reason) {
  intersection.current_light = newLight;         // Baris 238: update state
  intersection.manual_until = Date.now() + (durationSeconds * 1000); // Baris 243

  this.emit('traffic_update', {                  // Baris 248: emit event
    intersection_id: id,
    event_type: 'LIGHT_CHANGE',
    current_light: newLight,
    details: `Light changed to ${newLight}. Reason: ${reason}`,
  });
}
```

```
📄 server/services/trafficService.js — Baris 225–236 (stream listener)
```
```javascript
// Baris 225–228: listener di MonitorTraffic stream
const onUpdate = (update) => {
  call.write(update);   // ← push ke gRPC stream → ditangkap Bridge → broadcast WS
};
store.on('traffic_update', onUpdate);  // Baris 236
```

---

## 🎙️ SEGMEN 3 — CODE WALKTHROUGH (3–4 menit)

### 1. Proto — Definisi Kontrak
```
📄 protos/traffic.proto — Baris 10–35
```
```protobuf
service TrafficService {
  // Baris 20: Unary RPC — request-response biasa
  rpc UpdateTrafficLight (TrafficLightUpdate) returns (TrafficLightResponse);

  // Baris 34: Server-side Streaming → sumber data real-time ke WebSocket
  rpc MonitorTraffic (MonitorRequest) returns (stream TrafficUpdate);
}
```
```
📄 protos/emergency.proto — Baris 10–41
```
```protobuf
service EmergencyService {
  rpc CreateAlert (CreateAlertRequest) returns (AlertResponse);  // Baris 14: Unary
  rpc SubscribeAlerts (SubscribeRequest) returns (stream EmergencyEvent); // Baris 40: Streaming
}
```

### 2. InMemoryStore — Event Source
```
📄 server/store/inMemoryStore.js — Baris 9 & 148–202
```
```javascript
// Baris 9: extends EventEmitter — kunci arsitektur event-driven
class InMemoryStore extends EventEmitter {

  // Baris 148: simulasi otomatis tanpa trigger dari luar
  _startSimulation() {
    setInterval(() => {                        // Baris 150: tiap 5 detik
      intersection.vehicle_count += delta;     // Baris 158: update acak
      intersection.congestion_level = ...;    // Baris 159
      this.emit('traffic_update', { ... });   // Baris 189: trigger stream
    }, 5000);

    setInterval(() => {                        // Baris 205: tiap 3 detik
      sensor.value = newVal.value;            // Baris 212: update sensor
    }, 3000);
  }

  // Baris 302–316: Cross-service orchestration
  // createIncident() HIGH/CRITICAL → otomatis panggil createAlert()
  if (data.severity === 'HIGH' || data.severity === 'CRITICAL') {
    this.createAlert({ type: 'MEDICAL', ... }); // Baris 306: auto emergency alert
  }
}
```

### 3. websocketBridge.js — Inti Integrasi
```
📄 server/websocketBridge.js — Baris 35–42 (broadcast helper)
```
```javascript
// Baris 35: helper fan-out ke semua browser yang terhubung
function broadcast(wss, type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN)  // Baris 38: hanya yang aktif
      client.send(msg);
  });
}
```

```
📄 server/websocketBridge.js — Baris 50–102 (gRPC → WS)
```
```javascript
// Baris 50: sambungkan semua gRPC stream ke WebSocket
function startGrpcStreams(wss) {
  // Baris 55–67: Traffic stream
  trafficStream = trafficClient.MonitorTraffic({ zone: 'ALL' });
  trafficStream.on('data', (update) => {
    broadcast(wss, 'traffic_update', update);  // Baris 57 → semua browser
  });

  // Baris 70–89: Emergency stream + proactive server_alert
  emergencyStream = emergencyClient.SubscribeAlerts({ zone: 'ALL', min_severity: 'LOW' });
  emergencyStream.on('data', (event) => {
    broadcast(wss, 'emergency_event', event);  // Baris 72
    if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
      broadcast(wss, 'server_alert', { ... }); // Baris 75 → proaktif
    }
  });

  // Baris 93–96: Environment sensor poll tiap 4 detik
  setInterval(() => {
    broadcast(wss, 'sensor_update', { sensors: store.getAllSensors() });
  }, 4000);
}
```

### 4. web/app.js — Event Router Browser
```
📄 web/app.js — Baris 66–181
```
```javascript
// Baris 66: satu router untuk semua tipe pesan WebSocket
function handleMessage(msg) {
  switch (msg.type) {
    case 'initial_state':    // Baris 69 → renderAll() + populateSelects()
    case 'traffic_update':   // Baris 81 → renderTrafficChart() + renderIntersections() + logActivity()
    case 'emergency_event':  // Baris 97 → renderEmergencyAlerts() + showToast() + playAlertSound()
    case 'sensor_update':    // Baris 123 → renderSensors() + updateKpis()
    case 'server_alert':     // Baris 131 → showToast() + logActivity() + update badge bel
    case 'system_heartbeat': // Baris 142 → update 4 KPI value di navbar
    case 'cmd_result':       // Baris 154 → setCmdOutput() + logActivity()
    case 'cmd_error':        // Baris 171 → setCmdOutput() error
  }
}
```

---

## 🎙️ PENUTUP (30 detik)

> *"Untuk merangkum, NovaPulse mengimplementasikan keempat requirement Week 9:*
>
> *✅ WebSocket Implementation — gRPC stream di-bridge ke WebSocket, data mengalir otomatis (`websocketBridge.js` baris 50–102)*
>
> *✅ Event-Driven UI — 3 komponen dinamis: Chart (baris 186), Grid (baris 270), Log (baris 298) di `web/app.js`*
>
> *✅ Server-Initiated Events — Heartbeat 15 detik (`websocketBridge.js` baris 119) + proactive alert (baris 74)*
>
> *✅ Command & Control Bridge — Browser → WebSocket → gRPC (`websocketBridge.js` baris 156–303)*
>
> *Terima kasih."*

---

## 📌 TABEL REFERENSI CEPAT

| Fitur | File | Baris Kunci |
|---|---|---|
| WebSocket server attach | `server/webServer.js` | 24–27 |
| WebSocket connect (browser) | `web/app.js` | 25–54 |
| gRPC stream → WS broadcast | `server/websocketBridge.js` | 50–102 |
| Server heartbeat push | `server/websocketBridge.js` | 119–152 |
| Command handler Bridge | `server/websocketBridge.js` | 156–303 |
| gRPC UpdateTrafficLight impl | `server/services/trafficService.js` | 45–85 |
| gRPC MonitorTraffic stream | `server/services/trafficService.js` | 202–247 |
| Store emit event | `server/store/inMemoryStore.js` | 248, 289, 550 |
| Store simulasi otomatis | `server/store/inMemoryStore.js` | 148–218 |
| Cross-service orchestration | `server/store/inMemoryStore.js` | 302–316 |
| Message router (browser) | `web/app.js` | 66–181 |
| Chart render | `web/app.js` | 186–267 |
| Grid render | `web/app.js` | 270–295 |
| Activity log render | `web/app.js` | 298–320 |
| sendCommand (browser) | `web/app.js` | 56–63 |
| Proto Unary + Streaming | `protos/traffic.proto` | 14–34 |
