# 🧠 NovaPulse - Smart City gRPC Nervous System

# Output
## Server
<img width="1482" height="1003" alt="image" src="https://github.com/user-attachments/assets/d6d040e8-1db5-4176-9208-f5010bd2d4dc" />

## Traffic
<img width="1125" height="848" alt="image" src="https://github.com/user-attachments/assets/5d0ba6aa-47a4-42a1-baf5-5eaaa6136242" />
<img width="670" height="382" alt="image" src="https://github.com/user-attachments/assets/39108b7e-e36d-45ff-9b9d-999ad00f8c90" />

## Environment
<img width="969" height="847" alt="image" src="https://github.com/user-attachments/assets/bd5f22a5-80c8-44da-a5d3-e90903992500" />
<img width="1037" height="1053" alt="image" src="https://github.com/user-attachments/assets/3990cc4c-a633-49b1-ba51-a072bfd8633e" />

## Emergency
<img width="880" height="638" alt="image" src="https://github.com/user-attachments/assets/23dbf5c5-9639-4f83-a230-e369485a6c09" />
<img width="1394" height="929" alt="image" src="https://github.com/user-attachments/assets/360be17f-077f-456e-9ae0-555a3afa3e6d" />

## Dashboard
<img width="560" height="1026" alt="image" src="https://github.com/user-attachments/assets/16eee969-0b8c-47b7-a460-9de02bbe0578" />
<img width="1389" height="365" alt="image" src="https://github.com/user-attachments/assets/3d5cb122-c088-4f90-9060-1def9a236452" />

> Sistem monitoring, manajemen, dan **orkestrasi** kota pintar secara real-time menggunakan gRPC

## 📋 Deskripsi
NovaPulse adalah sistem **Smart City Central Nervous System** yang tidak hanya memonitor, tetapi juga melakukan **orkestrasi otomatis** antar infrastruktur kota. Sistem ini menggunakan protokol **gRPC** untuk komunikasi antar-layanan (Traffic, Environment, Emergency) dengan latensi ultra-rendah dan manajemen state yang reaktif.

## 🎯 Tujuan
- Memonitor lalu lintas kota secara real-time
- Mengelola sensor lingkungan (IoT) untuk kualitas udara, suhu, kelembaban, dll.
- Menangani dan mendispatch unit darurat ke lokasi insiden
- Demonstrasi komunikasi gRPC dengan berbagai pola streaming

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────┐
│                    CityNexus gRPC Server (:50051)                │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  🚦 Traffic      │  │  🌿 Environment  │  │  🚨 Emergency  │  │
│  │  Service         │  │  Service         │  │  Service       │  │
│  │                  │  │                  │  │                │  │
│  │  • Unary RPC     │  │  • Unary RPC     │  │  • Unary RPC   │  │
│  │  • Server-side   │  │  • Bidi          │  │  • Server-side │  │
│  │    Streaming     │  │    Streaming     │  │    Streaming   │  │
│  └──────────────────┘  └──────────────────┘  └────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              In-Memory Store (EventEmitter)                  │  │
│  │  • Intersections  • Sensors  • Alerts  • Units              │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
          │              │              │              │
     ┌────┘         ┌────┘         ┌────┘         ┌────┘
     ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│ Traffic  │  │ Environ  │  │ Emergency│  │  Dashboard   │
│ Client   │  │ Client   │  │ Client   │  │  Client      │
│ (CLI)    │  │ (CLI)    │  │ (CLI)    │  │  (Multi-svc) │
└──────────┘  └──────────┘  └──────────┘  └──────────────┘
```

## 🚀 Fitur-fitur

### Fitur Utama & Kompleksitas 🏆
| Fitur | Status | Detail Implementasi |
|-------|--------|---------------------|
| **Service Orchestration** | 🔥 **NEW** | **Otomasi Lintas Layanan:** Insiden Traffic otomatis memicu Emergency Alert. Polusi udara tinggi otomatis menutup jalan (Traffic Block). |
| Request-Response (Unary) | ✅ | Digunakan untuk CRUD penuh di ketiga service. |
| Server-side Streaming | ✅ | Real-time monitoring traffic dan emergency alerts via gRPC stream. |
| Bi-directional Streaming | 🚀 **PRO** | Live sensor data exchange: Sensor kirim data, Server kirim alert balik secara simultan. |
| Error Handling | ✅ | Implementasi kode status gRPC (NOT_FOUND, INVALID_ARGUMENT, dll). |
| Multi-Client Support | ✅ | Demo 4 terminal berbeda yang saling terhubung satu sama lain. |

### Service Details

#### 🚦 TrafficService (`traffic.proto`)
- **Unary RPCs:**
  - `GetIntersectionStatus` - Status persimpangan
  - `ListIntersections` - List semua persimpangan
  - `UpdateTrafficLight` - Update lampu lalu lintas
  - `ReportIncident` - Lapor insiden
  - `GetIncident` - Detail insiden
  - `ResolveIncident` - Selesaikan insiden
- **Server-side Streaming:**
  - `MonitorTraffic` - Monitor real-time perubahan lalu lintas per zona

#### 🌿 EnvironmentService (`environment.proto`)
- **Unary RPCs:**
  - `RegisterSensor` - Daftarkan sensor IoT baru
  - `GetSensorReading` - Baca data sensor
  - `ListSensors` - List semua sensor
  - `GetAreaReport` - Laporan lingkungan per area
  - `RemoveSensor` - Hapus sensor
- **Bi-directional Streaming:**
  - `LiveSensorStream` - Data sensor masuk, alert keluar secara bersamaan

#### 🚨 EmergencyService (`emergency.proto`)
- **Unary RPCs:**
  - `CreateAlert` - Buat alert darurat
  - `GetAlert` - Detail alert
  - `ListActiveAlerts` - List alert aktif
  - `DispatchUnit` - Dispatch unit ke alert
  - `UpdateUnitStatus` - Update status unit
  - `GetUnit` / `ListUnits` - Info unit
  - `ResolveAlert` - Selesaikan alert
- **Server-side Streaming:**
  - `SubscribeAlerts` - Subscribe real-time emergency events dengan filter severity

## 📁 Struktur Proyek

```
project rgpc/
├── protos/                          # Protocol Buffers definitions
│   ├── traffic.proto                # Traffic service definition
│   ├── environment.proto            # Environment service definition
│   └── emergency.proto              # Emergency service definition
├── server/
│   ├── index.js                     # Main server entry point
│   ├── services/
│   │   ├── trafficService.js        # Traffic service implementation
│   │   ├── environmentService.js    # Environment service implementation
│   │   └── emergencyService.js      # Emergency service implementation
│   └── store/
│       └── inMemoryStore.js         # Centralized state management
├── client/
│   ├── trafficClient.js             # Traffic interactive CLI client
│   ├── environmentClient.js         # Environment interactive CLI client
│   ├── emergencyClient.js           # Emergency interactive CLI client
│   └── dashboard.js                 # Unified dashboard (multi-service)
├── package.json
└── README.md
```

## 🛠️ Instalasi & Menjalankan

### 1. Install dependencies
```bash
cd "project rgpc"
npm install
```

### 2. Jalankan Server
```bash
npm run server
```
Server akan berjalan di `localhost:50051`

### 3. Jalankan Client (di terminal terpisah)

**Traffic Client:**
```bash
npm run client:traffic
```

**Environment Client:**
```bash
npm run client:environment
```

**Emergency Client:**
```bash
npm run client:emergency
```

**Unified Dashboard:**
```bash
npm run client:dashboard
```

## 🔧 Error Handling

Sistem mengimplementasikan error handling yang komprehensif menggunakan gRPC status codes:

| Status Code | Penggunaan |
|-------------|-----------|
| `INVALID_ARGUMENT` | Input tidak valid / parameter kosong |
| `NOT_FOUND` | Resource tidak ditemukan |
| `FAILED_PRECONDITION` | State tidak valid (mis: resolve alert yang sudah resolved) |
| `INTERNAL` | Generic server error |

Contoh error handling:
```javascript
if (!intersection_id) {
  return callback({
    code: grpc.status.INVALID_ARGUMENT,
    message: 'intersection_id is required',
  });
}
```

## 🔄 Streaming Patterns

### Server-side Streaming (MonitorTraffic)
```
Client ──── MonitorRequest ────► Server
Client ◄─── TrafficUpdate ──── Server  (stream)
Client ◄─── TrafficUpdate ──── Server  (stream)
Client ◄─── TrafficUpdate ──── Server  (stream)
              ...
```

### Bi-directional Streaming (LiveSensorStream)
```
Client ──── SensorDataInput ──► Server
Client ◄─── SensorAlert ─────  Server
Client ──── SensorDataInput ──► Server
Client ◄─── SensorAlert ─────  Server
              ...
```

## 👥 Multi-Client Support

Sistem mendukung multiple client secara bersamaan:
- Buka **4 terminal berbeda**, jalankan server + 3 client
- Dashboard client menghubungi ketiga service sekaligus
- EventEmitter mendukung banyak listener (max 100)
- Setiap client stream dikelola secara independen

## 🎮 Demo Scenarios

### Scenario 1: Traffic Incident
1. Client Traffic: List intersections → pilih ID
2. Client Traffic: Report incident (ACCIDENT, CRITICAL)
3. Client Traffic: Monitor traffic → lihat update real-time
4. Client Dashboard: City overview → lihat dampak

### Scenario 2: Emergency Response
1. Client Emergency: Create alert (FIRE, HIGH)
2. Client Emergency: List units → pilih unit AVAILABLE
3. Client Emergency: Dispatch unit
4. Client Emergency: Update unit status (EN_ROUTE → ON_SCENE)
5. Client Emergency: Resolve alert

### Scenario 3: IoT Monitoring
1. Client Environment: List sensors
2. Client Environment: Live sensor stream → kirim data
3. Amati alert saat threshold terlampaui
4. Client Dashboard: City overview → lihat environmental status

## 📚 Teknologi

- **Runtime:** Node.js
- **gRPC Library:** `@grpc/grpc-js`
- **Proto Loader:** `@grpc/proto-loader`
- **UUID Generator:** `uuid`
- **State Management:** Custom in-memory store with EventEmitter
