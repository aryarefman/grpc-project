# ✅ NovaPulse MQTT Extension — Completion Report

## Status: **FULLY OPERATIONAL**

Semua komponen MQTT telah berhasil diimplementasikan, diuji, dan berjalan dengan benar.

---

## 📂 File Structure

```
mqtt/
├── broker/
│   └── mqttBroker.js          # Aedes broker (TCP:1883 + WS:9001)
├── publishers/
│   ├── trafficPublisher.js    # 🚦 Publisher lalu lintas
│   ├── environmentPublisher.js # 🌿 Publisher sensor lingkungan  
│   └── emergencyPublisher.js  # 🚨 Publisher dispatch darurat
├── subscribers/
│   ├── commandCenterSub.js    # 📡 Subscriber wildcard `#`
│   └── publicAlertSub.js      # 📢 Subscriber wildcard `+` + shared
├── shared/
│   ├── topicRegistry.js       # Sentralisasi struktur topik
│   ├── mqttFeatures.js        # QoS, Expiry, FlowControl config
│   └── requestResponse.js     # Helper request-response pattern
└── dashboard/
    ├── server.js              # Express server (port 3001)
    ├── index.html             # Dashboard UI
    ├── style.css              # Premium dark theme
    └── app.js                 # MQTT WebSocket client
```

## 🚀 Cara Menjalankan

Buka **6 terminal** terpisah, lalu jalankan secara berurutan:

```bash
# Terminal 1 - Broker
npm run mqtt:broker

# Terminal 2 - Traffic Publisher
npm run mqtt:pub:traffic

# Terminal 3 - Environment Publisher
npm run mqtt:pub:environment

# Terminal 4 - Emergency Publisher
npm run mqtt:pub:emergency

# Terminal 5 - Command Center Subscriber
npm run mqtt:sub:command-center

# Terminal 6 - Public Alert Subscriber
npm run mqtt:sub:public-alert

# Terminal 7 (opsional) - Dashboard Web
npm run mqtt:dashboard
# Buka http://localhost:3001
```

## ✅ 10 Fitur MQTT yang Diimplementasikan

| # | Fitur | Implementasi | Lokasi |
|---|-------|-------------|--------|
| 1 | **Pub/Sub & QoS** | QoS 0 (congestion), QoS 1 (light-change), QoS 2 (incidents/emergency) | Semua publisher |
| 2 | **Wildcard** | `#` (command center), `+` (public alert) | Subscribers |
| 3 | **Topic Alias** | Disimulasikan melalui `_props` (Aedes 0.51 = MQTT 3.1.1) | Shared modules |
| 4 | **User Properties** | Metadata kaya dalam `_props.userProperties` setiap message | Semua publisher |
| 5 | **Retain** | Status publisher & summary tersimpan untuk subscriber baru | traffic/env/emergency |
| 6 | **Expiry** | `messageExpiryInterval` di `_props` (60s-3600s) | Semua publisher |
| 7 | **Last Will (LWT)** | Auto-detected saat publisher disconnect paksa | Semua publisher |
| 8 | **Request-Response** | `responseTopic` + `correlationData` pattern | requestResponse.js |
| 9 | **Shared Subscription** | `$share/alert-workers/...` untuk load balancing | publicAlertSub.js |
| 10 | **Flow Control** | Backpressure queue + inflight limiter | mqttFeatures.js |

## 🖥️ Dashboard Features

- **Real-time message feed** dengan filter per kategori
- **Publisher health cards** dengan LWT status
- **QoS distribution** bar chart  
- **Feature checklist** auto-detected dari message flow
- **Interactive controls**: Send Command, Burst Test, Publish Test
- **Dark glassmorphism theme** dengan animasi

## 📦 Dependencies

```json
{
  "aedes": "^0.51.3",
  "mqtt": "^4.3.8",
  "ws": "^8.20.0",
  "express": "^5.2.1"
}
```

> [!NOTE]
> Menggunakan `aedes@0.51.3` (MQTT 3.1.1) karena `aedes@1.0.2` memiliki bug `connack timeout`. 
> Fitur MQTT 5.0 (User Properties, Expiry, Topic Alias) disimulasikan melalui `_props` field dalam JSON payload.
