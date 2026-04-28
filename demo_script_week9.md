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
> *"Halo, perkenalkan saya [nama]. Ini presentasi Week 9 saya — tentang cara menghubungkan WebSocket dengan gRPC. Proyek ini namanya NovaPulse, yaitu dashboard pemantau kota pintar."*

### Deskripsi Proyek
> *"NovaPulse adalah aplikasi yang memantau kondisi kota secara langsung dan otomatis. Di dalamnya ada tiga layanan gRPC: satu untuk mengatur lampu lalu lintas dan persimpangan, satu untuk mengelola situasi darurat seperti kebakaran dan kecelakaan, dan satu lagi untuk membaca sensor lingkungan seperti kualitas udara dan suhu."*

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

> *"Cara kerjanya seperti ini: Browser terhubung ke WebSocket Bridge lewat port 3000. Bridge ini bertugas seperti penerjemah — ia menerima data yang mengalir dari gRPC lalu meneruskannya ke browser, dan sebaliknya, ia menerima perintah dari browser lalu meneruskannya ke gRPC. Semua data disimpan di InMemoryStore. Setiap kali ada data yang berubah, Store otomatis memberitahu semua layanan yang perlu tahu."*

---

## 🎙️ SEGMEN 2 — DEMO FITUR (5–7 menit)

---

### 🔌 FITUR 1: Implementasi WebSocket

**[Tunjukkan browser http://localhost:3000, lihat status bar atas]**

> *"Begitu browser dibuka, koneksi WebSocket langsung terbentuk secara otomatis. Lihat di pojok kanan atas — statusnya berubah jadi SECURE LINK ACTIVE dengan titik hijau berkedip. Dan log aktivitas di bawahnya langsung terisi sendiri, padahal kita belum klik tombol apapun. Ini karena server langsung mengirim data awal ke browser saat koneksi pertama kali terbentuk."*

**[Buka DevTools → Network → WS, tunjukkan frame masuk]**

> *"Kalau kita buka DevTools dan lihat tab Network → WS, kita bisa lihat data yang terus masuk setiap beberapa detik. Formatnya JSON sederhana dengan tiga bagian: `type` untuk jenis datanya, `data` untuk isinya, dan `ts` untuk waktunya. Ini yang membedakan WebSocket dari website biasa — koneksinya tidak putus, jadi server bisa kapan saja kirim data ke browser tanpa harus ditanya dulu."*

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
> 💡 **Kesimpulan Inti:** Bayangkan satu pintu toko yang bisa melayani dua jenis pelanggan — yang mau beli barang (HTTP/halaman web) dan yang mau ngobrol langsung (WebSocket). Keduanya pakai port yang sama yaitu 3000, jadi browser tidak perlu alamat berbeda.

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
> 💡 **Kesimpulan Inti:** Bayangkan seperti masuk ruang rapat — begitu duduk, langsung dikasih dokumen ringkasan situasi terkini tanpa perlu minta. Begitu juga browser: begitu connect, server langsung kirim semua data (persimpangan, sensor, alert) supaya tampilan langsung terisi penuh.

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
> 💡 **Kesimpulan Inti:** Browser hanya butuh satu saluran komunikasi (koneksi WebSocket) untuk menerima semua jenis data — traffic, darurat, sensor, hasil perintah — semuanya masuk lewat satu fungsi `handleMessage()` yang kemudian memilah-milah datanya.

---

### 📊 FITUR 2: Event-Driven UI — 3 Komponen Dinamis

> *"Ada 3 bagian tampilan yang berubah otomatis setiap kali ada data baru masuk dari WebSocket. Mari kita lihat satu per satu."*

**[Tunjukkan ketiga komponen sambil narasi]**

#### Komponen 1 — Traffic Chart (Canvas Bar Chart)

> *"Bagian pertama adalah grafik batang di atas layar. Grafik ini otomatis digambar ulang setiap kali ada data traffic baru masuk. Batang berwarna merah artinya persimpangan itu sangat macet (di atas 70%), kuning berarti agak padat, hijau berarti lancar. Grafik ini bergerak sendiri karena di dalam server ada simulasi yang mengubah data setiap 5 detik."*

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
> 💡 **Kesimpulan Inti:** Grafik ini dibuat langsung pakai HTML5 Canvas tanpa plugin tambahan. Warnanya berubah otomatis tergantung data `congestion_level` yang datang dari WebSocket — semakin tinggi nilainya, semakin merah batangnya.

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
> 💡 **Kesimpulan Inti:** Satu pesan WebSocket `traffic_update` langsung menggerakkan tiga bagian tampilan sekaligus — grafik, daftar persimpangan, dan log. Inilah yang disebut event-driven: satu sinyal, banyak yang bereaksi.

#### Komponen 2 — Intersection Grid (Status Indikator)

> *"Bagian kedua adalah daftar status persimpangan. Setiap baris menampilkan warna lampu (merah/kuning/hijau), nama jalan, bar tingkat kemacetan, dan jumlah kendaraan. Daftar ini otomatis diurutkan dari yang paling macet ke paling lancar."*

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
> 💡 **Kesimpulan Inti:** Daftar ini bukan tampilan statis — setiap kali data baru masuk, data diurutkan ulang dari yang paling macet. Jadi persimpangan yang paling butuh perhatian selalu ada di posisi teratas secara otomatis.

#### Komponen 3 — Activity Log (Live Stream Log)

> *"Bagian ketiga adalah log aktivitas di sisi kanan. Setiap kali ada pesan WebSocket masuk — apapun jenisnya — langsung muncul di log ini dengan warna berbeda: biru untuk data traffic, merah untuk darurat, oranye untuk notifikasi dari server, hijau untuk hasil perintah."*

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
> 💡 **Kesimpulan Inti:** Log ini adalah bukti bahwa data mengalir terus secara real-time. Setiap kali ada pesan masuk lewat WebSocket, langsung tercatat di sini dengan warna yang berbeda sesuai jenisnya — jauh lebih efisien dibanding website biasa yang harus refresh untuk tahu ada data baru.

---

### 📡 FITUR 3: Server-Initiated Events

> *"Fitur ketiga adalah server yang mengirim data ke browser TANPA menunggu browser minta. Ada dua cara server melakukan ini."*

**[Tunggu KPI bar update sendiri, lalu tunjukkan toast muncul]**

> *"Cara pertama: setiap 15 detik, server otomatis mengirim ringkasan kondisi kota ke semua browser yang terhubung. Lihat bagian atas layar — angka jumlah persimpangan, yang macet, jumlah alert, dan nilai kualitas udara berubah sendiri tanpa kita minta."*

> *"Cara kedua: kalau ada kejadian darurat dengan tingkat HIGH atau CRITICAL yang masuk dari gRPC, server langsung meneruskan notifikasi khusus ke browser. Lihat — muncul popup di pojok kanan atas secara otomatis, padahal kita tidak klik apapun."*

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
> 💡 **Kesimpulan Inti:** Fungsi `startServerPush()` berjalan seperti jam alarm — setiap 15 detik dia bangun dan kirim laporan kondisi kota ke semua browser. Tidak ada yang memintanya, server yang memulai sendiri. Inilah yang disebut Server-Initiated Events.

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
> 💡 **Kesimpulan Inti:** Saat ada kejadian darurat serius, server tidak hanya meneruskan data biasa — ia juga langsung mengirim notifikasi ekstra ke browser. Ibarat walkie-talkie yang tidak hanya meneruskan informasi tapi juga membunyikan sirene kalau situasinya gawat.

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
> 💡 **Kesimpulan Inti:** Pesan `server_alert` dan `system_heartbeat` adalah dua contoh data yang seluruhnya diprakarsai server — browser tidak pernah memintanya. Ini beda dengan website biasa di mana browser harus terus polling (tanya berulang) untuk tahu ada data baru.

---

### 🕹️ FITUR 4: Command & Control Bridge

> *"Fitur terakhir: browser bisa mengirim perintah lewat WebSocket, dan perintah itu otomatis dijalankan sebagai panggilan gRPC di server."*

**[Scroll ke Command Center, demo update lampu + buat alert]**

**Demo 1 — Pilih INT-001, set RED, klik UPDATE:**
> *"Kita coba pilih persimpangan INT-001, ganti lampunya jadi merah, lalu klik UPDATE. Yang terjadi adalah: browser kirim pesan lewat WebSocket ke Bridge, Bridge langsung panggil fungsi gRPC `UpdateTrafficLight` di server, server ubah data, data yang berubah mengalir balik ke browser lewat gRPC stream dan WebSocket, lalu tampilan lampu di daftar langsung berubah jadi merah. Semua ini terjadi dalam hitungan milidetik tanpa reload halaman."*

**Demo 2 — Tab Emergency, create FIRE CRITICAL, klik CREATE:**
> *"Sekarang kita coba buat alert darurat: pilih tipe FIRE, tingkat CRITICAL, lokasi isi bebas, lalu klik CREATE. Alert langsung muncul di bagian Emergency. Karena tingkatnya CRITICAL, server juga langsung kirim notifikasi popup otomatis. Kalau kita klik RESOLVE, alert hilang dan unit yang ditugaskan kembali ke status tersedia."*

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
> 💡 **Kesimpulan Inti:** Cukup satu fungsi `sendCommand()` untuk semua jenis perintah. Browser tidak perlu tahu apapun tentang gRPC — cukup kirim pesan JSON sederhana lewat WebSocket, dan Bridge yang mengurus sisanya.

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
> 💡 **Kesimpulan Inti:** Tombol di layar hanya mengambil nilai dari form lalu memanggil `sendCommand()`. Tidak ada logika rumit di browser — semua proses terjadi di server.

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
> 💡 **Kesimpulan Inti:** `handleClientCommand()` adalah penerjemah antara WebSocket dan gRPC. Ia menerima pesan sederhana dari browser, mencari tahu gRPC mana yang harus dipanggil, menjalankannya, lalu mengirim hasilnya kembali ke browser. Browser tidak pernah bersentuhan langsung dengan gRPC.

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
> 💡 **Kesimpulan Inti:** Handler gRPC bertugas memeriksa apakah data yang dikirim sudah benar (validasi), baru kemudian menyimpannya ke store dan mengembalikan jawaban. Kodenya bersih karena tidak ada urusan dengan WebSocket sama sekali.

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
> 💡 **Kesimpulan Inti:** `this.emit()` di store adalah titik pertama yang memulai seluruh aliran data. Satu baris ini memicu rangkaian panjang: data berubah → TrafficService kirim ke gRPC stream → Bridge sebar ke WebSocket → browser update tampilannya.

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
> 💡 **Kesimpulan Inti:** `call.write()` adalah cara gRPC mendorong data ke stream. Setiap kali store memberitahu ada perubahan, fungsi ini langsung mengirim data itu ke Bridge, yang kemudian meneruskannya ke semua browser. Alur lengkapnya: Store → gRPC → Bridge → WebSocket → Browser.

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
> 💡 **Kesimpulan Inti:** File `.proto` adalah perjanjian tertulis antara server dan client gRPC — mendefinisikan fungsi apa saja yang tersedia beserta input dan outputnya. Kata kunci `stream` di depan return type berarti server akan terus-menerus mengirim data, bukan hanya sekali. Streaming inilah yang jadi sumber data real-time untuk WebSocket.

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
> 💡 **Kesimpulan Inti:** InMemoryStore menyimpan semua data sekaligus berperan sebagai sistem pengumuman internal. Setiap kali ada data yang berubah, store langsung memberi tahu semua pihak lewat event. Hebatnya, satu insiden traffic berat otomatis bisa memicu pembuatan alert darurat tanpa ada yang memintanya — ini yang disebut cross-service orchestration.

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
> 💡 **Kesimpulan Inti:** Fungsi `broadcast()` seperti pengeras suara — satu pesan dari gRPC langsung disebarkan ke semua browser yang sedang terhubung sekaligus. Tidak peduli ada 1 atau 10 browser yang buka dashboard, semuanya dapat data yang sama pada waktu yang sama.

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
> 💡 **Kesimpulan Inti:** `startGrpcStreams()` adalah tempat semua stream gRPC disambungkan ke WebSocket. Tiga layanan gRPC langsung didengarkan sekaligus saat server pertama kali nyala. Satu koneksi gRPC bisa melayani berapapun jumlah browser yang terhubung.

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
> 💡 **Kesimpulan Inti:** `handleMessage()` adalah tempat browser memutuskan apa yang harus dilakukan saat ada pesan masuk. Setiap jenis pesan punya jalur sendiri menuju fungsi render yang sesuai. Inilah yang membuat tampilan bisa berubah otomatis tanpa perlu refresh halaman.

---

## 🎙️ PENUTUP (30 detik)

> *"Jadi kesimpulannya, proyek NovaPulse sudah memenuhi keempat requirement Week 9:*
>
> *✅ WebSocket Implementation — data dari gRPC streaming langsung diteruskan ke browser lewat WebSocket secara otomatis (lihat `websocketBridge.js` baris 50–102)*
>
> *✅ Event-Driven UI — tiga bagian tampilan berubah secara dinamis: grafik (baris 186), daftar persimpangan (baris 270), dan log aktivitas (baris 298) di `web/app.js`*
>
> *✅ Server-Initiated Events — server mengirim heartbeat setiap 15 detik dan notifikasi darurat secara proaktif tanpa diminta browser (lihat `websocketBridge.js` baris 119 dan 74)*
>
> *✅ Command & Control Bridge — perintah dari browser dikirim lewat WebSocket lalu dieksekusi sebagai panggilan gRPC di server (lihat `websocketBridge.js` baris 156–303)*
>
> *Terima kasih sudah menonton."*

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
