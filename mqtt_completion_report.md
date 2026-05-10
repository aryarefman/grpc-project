# ✅ NovaPulse MQTT Extension — Completion Report

## Status: **FULLY OPERATIONAL & POLISHED**

Semua komponen MQTT telah berhasil diimplementasikan, diuji, dan diperhalus dengan standar UI/UX premium. Project ini siap untuk didemokan.

---

## 📂 File Structure

```
mqtt/
├── broker/
│   └── mqttBroker.js          # Aedes broker (TCP:1883 + WS:9001)
├── publishers/
│   ├── trafficPublisher.js    # 🚦 Publisher lalu lintas (QoS 0, 1, 2)
│   ├── environmentPublisher.js # 🌿 Publisher sensor lingkungan (QoS 1) 
│   └── emergencyPublisher.js  # 🚨 Publisher dispatch darurat (QoS 2)
├── subscribers/
│   ├── commandCenterSub.js    # 📡 Subscriber wildcard `#`
│   └── publicAlertSub.js      # 📢 Subscriber wildcard `+` + shared
├── shared/
│   ├── topicRegistry.js       # Sentralisasi struktur topik
│   ├── mqttFeatures.js        # QoS, Expiry, FlowControl config
│   └── requestResponse.js     # Helper request-response pattern
└── dashboard/
    ├── logo.png               # Brand asset baru (Local)
    ├── index.html             # Dashboard UI (Modern Glassmorphism)
    ├── style.css              # Premium dark theme + animations
    └── app.js                 # MQTT Engine & 3D Globe Logic
```

## 🚀 Cara Menjalankan

Buka terminal di folder `mqtt`, lalu jalankan secara berurutan:

```bash
# 1. Jalankan Broker (Wajib)
node broker/mqttBroker.js

# 2. Jalankan Dashboard (Buka browser ke index.html)

# 3. Jalankan Publisher (Pilih salah satu atau semua)
node publishers/trafficPublisher.js
node publishers/environmentPublisher.js
node publishers/emergencyPublisher.js
```

## ✅ 10 Fitur MQTT yang Diimplementasikan

| # | Fitur | Implementasi | Lokasi |
|---|-------|-------------|--------|
| 1 | **Pub/Sub & QoS** | QoS 0 (congestion), QoS 1 (light-change), QoS 2 (incidents/emergency) | Semua publisher |
| 2 | **Wildcard** | `#` (command center), `+` (public alert) | Subscribers |
| 3 | **Topic Alias** | Mengurangi beban bandwidth pada topik yang berulang | Shared modules |
| 4 | **User Properties** | Metadata kaya (`source`, `priority`, `severity`) dalam payload | Semua publisher |
| 5 | **Retain** | Status terakhir tetap tersedia untuk subscriber baru | Status LWT |
| 6 | **Expiry** | `messageExpiryInterval` untuk pesan darurat (TTL) | Semua publisher |
| 7 | **Last Will (LWT)** | Auto-detected di dashboard: "LWT: TRIGGERED" saat offline | Semua publisher |
| 8 | **Request-Response** | Pola korelasi ID untuk perintah interaktif | requestResponse.js |
| 9 | **Shared Subscription** | Load balancing alert ke beberapa worker subscriber | publicAlertSub.js |
| 10 | **Flow Control** | Inflight limiter & queue management | mqttFeatures.js |

## 💎 Dashboard Enhancements (Update Mei 2026)

- **Branding Premium:** Integrasi logo lokal `logo.png` dan tipografi modern.
- **3D Globe Interaction:** 
    - **Ballistic Curves:** Garis lengkung dinamis menghubungkan node ke broker.
    - **Dynamic Registration:** Node baru terdaftar otomatis di globe saat heartbeat terdeteksi.
    - **Auto-Cleanup:** Popup otomatis tertutup saat reset globe dilakukan.
- **Advanced Navigation:**
    - **Deep Linking:** Tombol "View in Live Feed" di peta langsung mem-filter feed sesuai ID node.
    - **Clear Filter:** Tombol pembersih pencarian cepat untuk kembali ke mode "All Live".
- **Visual Polish:**
    - **Sparklines:** Grafik mini di KPI cards yang sudah diposisikan agar tidak menimpa teks.
    - **Empty States:** Pesan status yang informatif saat tidak ada pesan masuk.
- **Audio Notification:** Sistem notifikasi suara (*Blip*) khusus untuk pesan **QoS 2** (Critical Alert) dengan log audit di console.

---

> [!IMPORTANT]
> Project ini memenuhi seluruh kriteria Tugas Project Implementasi MQTT Minggu 11:
> - Tidak memerlukan hardware (Simulation-based).
> - 3 Publisher berbeda role + 2 Subscriber.
> - Dashboard monitoring interaktif.
> - Full implementasi protokol MQTT.
