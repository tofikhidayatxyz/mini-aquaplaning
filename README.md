# Mini Aquaplaning (Homies Edge Node)

> Reference local-first edge controller and automation runtime for closed-loop aquaponics environments.

This repository contains the complete embedded firmware, local MQTT gateway, and operator dashboard powering the Aquaponics Edge Node specimen on [homies.id](https://homies.id).

---

## Architecture Overview

The system operates 100% locally on your LAN without third-party cloud dependencies:

```
[ ESP32-C3 Node ] <--(Local WiFi / MQTT:1883)--> [ Go Edge Hub + Broker ] <--(HTTP / WS)--> [ Web Dashboard ]
      |
      +---> GPIO 5: Optocoupler Relay (Submersible Pump)
      +---> GPIO 6: Peripheral Bus Reset (Hardware Watchdog)
```

1. **Firmware (`src/main.cpp`)**:
   - Target: ESP32-C3 RISC-V microcontroller (PlatformIO / Arduino).
   - Local MQTT client with automatic reconnection and Last Will & Testament (LWT).
   - Optically isolated relay triggers (Active-Low) on GPIO 5.
   - Non-blocking 1000ms watchdog pulse generator on GPIO 6.

2. **Backend Gateway (`webapps/backend/`)**:
   - Go service embedding an in-memory MQTT broker (`github.com/mochi-mqtt/server/v2`).
   - JSON state persistence (`state.json`) with thread-safe file sync.
   - REST API endpoints for status, relay switching, and pulse reboot.

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

---

## Getting Started

### 1. Flash the ESP32-C3 Microcontroller

1. Install [PlatformIO Core](https://platformio.org/install/cli) or PlatformIO IDE.
2. Copy the credentials template:
   ```bash
   cp include/secrets.h.example include/secrets.h
   ```
3. Edit `include/secrets.h` with your local 2.4 GHz WiFi SSID and MQTT broker IP.
4. Build and upload firmware over USB:
   ```bash
   pio run -e esp32-c3-devkitm-1 -t upload
   pio device monitor
   ```

### 2. Run the Local Backend Hub

Requires Go 1.22+.

```bash
cd webapps/backend
go build -o server .
PORT=8080 MQTT_PORT=1883 ./server
```

### 3. Run the Frontend Dashboard

Requires Node.js 18+.

```bash
cd webapps/frontend
npm install
npm run dev
```

Open `http://localhost:5173` to access the local control panel.

---

## Production Deployment (PM2)

For persistent LAN deployments on edge boards (e.g. Raspberry Pi, Orange Pi):

```bash
cd webapps
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
```

---

## License

MIT License. See [LICENSE](LICENSE) for details. Developed by Homies Systems.
