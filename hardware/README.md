# Homies Specimen #01 - Hardware Architecture & Pinout Netlist

## Microcontroller: ESP32-C3 DevKitM-1 (RISC-V 160MHz)

### Pinout Mapping

| Pin / Net | Target Peripheral | Bus Type | Logic Level | Circuit Role |
|---|---|---|---|---|
| `GPIO 4` | DHT22 / AM2302 Sensor | OneWire | 3.3V (4.7kΩ pull-up) | Ambient air temperature & relative humidity telemetry |
| `GPIO 5` | PC817 Optocoupler Relay | Digital Output | 3.3V Active-LOW | Submersible nutrient water pump power switching |
| `GPIO 6` | Bus Reset Pulse / Watchdog | Digital Output | 3.3V Active-HIGH | Transient restart pulse and external watchdog ping |
| `GPIO 8` | On-board Status LED | Digital Output | 3.3V Active-LOW | Heartbeat & autonomous fail-safe event indicator |
| `GPIO 9` | Boot Button | Digital Input | 3.3V Pull-Up | Hardware reset and firmware flash bootstrap |
| `3V3` | Sensor VCC | Power Rail | 3.3V DC (max 500mA) | Clean logic reference voltage |
| `5V / VBUS` | Relay Coil & Pump Stage | Power Rail | 5.0V DC (2.0A adapter) | Motor coil and switching power bus |
| `GND` | Common Ground Plane | Ground | 0V reference | Star-ground topology across analog & digital returns |

### Power Architecture

- **Main Input**: 5V DC via USB-C or isolated DC-DC step down module.
- **Relay Isolation**: Optical PC817 isolation separates 3.3V MCU logic grounds from inductive kickback during inductive motor de-energization.
- **Reverse Polarity & Spike Protection**: Flyback diode across relay coil prevents MCU latch-up.

### Fail-Safe Topology

1. **Autonomous 15-Minute Hardware Timeout**: If broker connection hangs or command logic stalls, firmware enforces hard cutoff at `900,000 ms`.
2. **Offline Biological Cycle**: During sustained network loss (>60 seconds), firmware switches to offline periodic hydration (3 minutes ON, 30 minutes OFF) to prevent plant root desiccation.
