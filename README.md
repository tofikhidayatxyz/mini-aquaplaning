# Mini Aquaplaning (Homies Edge Node)

> Reference local-first edge controller and automation runtime for closed-loop aquaponics environments (homies.id Specimen #01).

This repository contains the embedded firmware, local MQTT gateway, and operator dashboard powering the Aquaponics Edge Node specimen on [homies.id](https://homies.id).

---

## Architecture Overview

The system operates 100% locally on your LAN without third-party cloud dependencies:

```
[ ESP32-C3 Node ] <--(Local WiFi / MQTT:1883)--> [ Go Edge Hub + Broker ] <--(HTTP / WS)--> [ Web Dashboard ]
      |
      +---> GPIO 5: Optocoupler Relay (Submersible Pump)
      +---> GPIO 6: Peripheral Bus Reset (Hardware Watchdog)
      +---> Local Watchdog: 15-min max continuous runtime safety cutoff
      +---> Standalone Cycle: Autonomous 3-min hydration cycle if network severed
```

1. **Firmware (`src/main.cpp`)**:
   - Target: ESP32-C3 RISC-V microcontroller (PlatformIO / Arduino).
   - Local-First Autonomous Fail-Safe 1: Automatic 15-minute continuous run cutoff protects pump motors from dry running, independent of broker commands.
   - Local-First Autonomous Fail-Safe 2: Standalone periodic biological cycle keeps roots hydrated even during total LAN/broker outages.
   - Local MQTT client with automatic reconnection and Last Will & Testament (LWT).
   - Optically isolated relay triggers (Active-Low) on GPIO 5.
   - Non-blocking 1000ms watchdog pulse generator on GPIO 6.

2. **Backend Gateway (`webapps/backend/`)**:
   - Go service embedding an in-memory MQTT broker (`github.com/mochi-mqtt/server/v2`).
   - Atomic state persistence (`state.json` via temp file rename) to prevent corruption across power cuts.
   - REST API endpoints for status, relay switching, and pulse reboot.
   - Captures `esp32/alerts` telemetry for autonomous safety events.

3. **Frontend Dashboard (`webapps/frontend/`)**:
   - Vite + React control console.
   - Real-time relay toggle, transient pulse monitor, and autonomous cron schedule queues.

---

## Hardware Pinout & Specs

| Pin / Interface | Function | Logic Level | Description |
|---|---|---|---|
| **GPIO 5** | Primary Pump Relay | Active-LOW | Optocoupler-isolated 10A/250VAC spray pump trigger |
| **GPIO 6** | Hardware Watchdog | Active-LOW | 1000ms isolated cold-bus reboot pulse |
| **USB-CDC** | Serial Telemetry | 115200 baud | Real-time debug log and network diagnostic scan |

---

## MQTT Specification

Broker runs locally on port `1883` (configurable via `MQTT_PORT`).

| Topic | Direction | Payload | Retained | Purpose |
|---|---|---|---|---|
| `esp32/status` | ESP32 -> Broker | `online` / `offline` | Yes (QoS 1) | LWT connection status |
| `esp32/shower/set` | Hub -> ESP32 | `1` / `0` | No | Request pump relay state |
| `esp32/shower/status` | ESP32 -> Hub | `1` / `0` | Yes | Confirmed physical relay state |
| `esp32/reboot/trigger` | Hub -> ESP32 | `1` | No | Request 1s peripheral reset pulse |
| `esp32/alerts` | ESP32 -> Hub | string alert code | No | Autonomous safety trip alerts |

---

## Getting Started

### 1. Embedded Firmware (ESP32-C3)

```bash
# Copy template and set your local WiFi / Broker parameters
cp include/secrets.h.example include/secrets.h

# Build and flash via PlatformIO
pio run --target upload
```

### 2. Edge Broker Gateway (Go)

```bash
cd webapps/backend
go run .
```

### 3. Frontend Web Console (React)

```bash
cd webapps/frontend
npm install
npm run dev
```

---

## License

MIT License (c) 2026 Tofik Hidayat / Homies Systems.
