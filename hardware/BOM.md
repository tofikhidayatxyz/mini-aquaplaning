# Homies Specimen #01 - Hardware Bill of Materials (BOM)

> Verified sub-$3 reference edge architecture for closed-loop aquaponic / biological automation.

## Component Breakdown

| Item | Component | Footprint / Package | Function | Unit Cost (USD) | Source / Notes |
|---|---|---|---|---|---|
| 1 | ESP32-C3 SuperMini | Module (160MHz RISC-V, 4MB Flash, WiFi/BLE) | Core controller & edge telemetry node | $1.45 | LCSC / AliExpress OEM |
| 2 | DHT22 / AM2302 | 3-pin SIP | Air temperature & humidity sensing | $0.68 | Aosong Electronics |
| 3 | 1-Channel 5V Relay Module | Isolated PC817 Optocoupler | Submersible water pump switching | $0.35 | Generic Songle SRD-05VDC |
| 4 | Resistors (4.7kΩ, 10kΩ) | 0805 SMD / 1/4W axial | Pull-up & pull-down bus stabilization | $0.02 | Yageo |
| 5 | AMS1117-3.3 LDO (optional) | SOT-223 | Step-down regulation if powered from 5V rail | $0.05 | Advanced Monolithic Systems |
| 6 | DC-DC Buck / USB-C Breakout | 5V 2A input | Power delivery stage | $0.20 | Generic Type-C female |
| **Total** | | | **Complete Edge Node BOM** | **$2.75** | **Sub-$3 Target Met** |

## Sourcing & Production Notes

- **Target BOM**: Under $3.00 for single unit prototype, scalable to <$1.90 at 1k MOQ.
- **Microcontroller Choice**: ESP32-C3 provides single-core 32-bit RISC-V architecture with native hardware cryptographic acceleration, low power consumption, and integrated WiFi 802.11 b/g/n + BLE 5.0.
- **Fail-Safe Mechanism**: Active-low optocoupler isolation protects MCU GPIO against inductive back-EMF and back-power spikes during pump motor cutoffs.
