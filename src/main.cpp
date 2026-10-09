#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>

#if __has_include("secrets.h")
#include "secrets.h"
#endif

// Fallback configuration if secrets.h is not defined
#ifndef WIFI_SSID
#define WIFI_SSID "YOUR_WIFI_SSID"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#endif

#ifndef MQTT_SERVER
#define MQTT_SERVER "192.168.1.100"
#endif

#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif

// WiFi Configuration
const char *ssid = WIFI_SSID;
const char *password = WIFI_PASSWORD;

// MQTT Configuration
const char *mqtt_server = MQTT_SERVER;
const uint16_t mqtt_port = MQTT_PORT;

// Pin Definitions
#define SHOWER_PIN 5
#define REBOOT_PIN 6

// Relay logic triggers (Active-Low)
#define RELAY_ON LOW
#define RELAY_OFF HIGH

// Local Safety Thresholds & Autonomous Biological Timing
const unsigned long MAX_SHOWER_RUNTIME_MS = 15UL * 60UL * 1000UL; // 15 mins max run
const unsigned long OFFLINE_CYCLE_PERIOD_MS = 30UL * 60UL * 1000UL; // 30 min window
const unsigned long OFFLINE_CYCLE_PUMP_ON_MS = 3UL * 60UL * 1000UL; // 3 min pulse

// MQTT Topics
#define TOPIC_STATUS "esp32/status"
#define TOPIC_SHOWER_SET "esp32/shower/set"
#define TOPIC_SHOWER_STATUS "esp32/shower/status"
#define TOPIC_REBOOT_TRIGGER "esp32/reboot/trigger"
#define TOPIC_ALERTS "esp32/alerts"

// Client instances
WiFiClient espClient;
PubSubClient client(espClient);

// Timing & state tracking
unsigned long lastReconnectAttempt = 0;
unsigned long rebootTriggerTime = 0;
bool rebootActive = false;

// Local-first autonomous state
unsigned long lastShowerStartTime = 0;
unsigned long lastMqttSeen = 0;
bool autonomousOfflineFallback = true;

// Function declarations
void setupWifi();
void callback(char *topic, byte *payload, unsigned int length);
bool reconnect();
void publishShowerStatus();
void setShowerState(bool turnOn, const char *reason);

void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println("\n==============================================");
  Serial.println("  ESP32-C3 Autonomous Biological Controller   ");
  Serial.println("  Specimen #01 - Local-First Habitats Runtime ");
  Serial.println("==============================================");

  // Initialize pins
  pinMode(SHOWER_PIN, OUTPUT);
  pinMode(REBOOT_PIN, OUTPUT);

  // Set initial safe states
  digitalWrite(SHOWER_PIN, RELAY_OFF);
  digitalWrite(REBOOT_PIN, RELAY_OFF);

  // Set up WiFi and MQTT
  setupWifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  lastMqttSeen = millis();
}

void setupWifi() {
  delay(10);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  Serial.println("\nScanning for available 2.4 GHz WiFi networks...");
  int n = WiFi.scanNetworks();
  Serial.println("Scan complete.");
  if (n == 0) {
    Serial.println("No networks found. Ensure 2.4 GHz is active.");
  } else {
    Serial.printf("%d networks found:\n", n);
    for (int i = 0; i < n; ++i) {
      Serial.printf("  %d: %s (%d dBm)\n", i + 1, WiFi.SSID(i).c_str(),
                    WiFi.RSSI(i));
      delay(10);
    }
  }
  Serial.println("----------------------------------------------");

  Serial.printf("Connecting to WiFi: %s\n", ssid);
  WiFi.setAutoReconnect(true);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected successfully!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.printf("\nWiFi connection failed! Status Code: %d\n", WiFi.status());
    Serial.println("Will retry automatically via background watchdog.");
  }
}

void setShowerState(bool turnOn, const char *reason) {
  bool currentOn = (digitalRead(SHOWER_PIN) == RELAY_ON);
  if (turnOn) {
    digitalWrite(SHOWER_PIN, RELAY_ON);
    lastShowerStartTime = millis();
    Serial.printf("[SHOWER] -> ON (Reason: %s)\n", reason);
  } else {
    digitalWrite(SHOWER_PIN, RELAY_OFF);
    Serial.printf("[SHOWER] -> OFF (Reason: %s)\n", reason);
  }

  if (currentOn != turnOn && client.connected()) {
    publishShowerStatus();
  }
}

void callback(char *topic, byte *payload, unsigned int length) {
  lastMqttSeen = millis();
  String messageTemp;
  for (unsigned int i = 0; i < length; i++) {
    messageTemp += (char)payload[i];
  }
  messageTemp.trim();

  Serial.printf("MQTT Message arrived on [%s]: %s\n", topic, messageTemp.c_str());

  if (String(topic) == TOPIC_SHOWER_SET) {
    if (messageTemp == "1" || messageTemp.equalsIgnoreCase("on")) {
      setShowerState(true, "mqtt_command");
    } else if (messageTemp == "0" || messageTemp.equalsIgnoreCase("off")) {
      setShowerState(false, "mqtt_command");
    }
  } else if (String(topic) == TOPIC_REBOOT_TRIGGER) {
    if (messageTemp == "1" || messageTemp.equalsIgnoreCase("trigger")) {
      digitalWrite(REBOOT_PIN, RELAY_ON);
      rebootTriggerTime = millis();
      rebootActive = true;
      Serial.println("Reboot pulse initiated. Pulsing GPIO 6 HIGH...");
    }
  }
}

bool reconnect() {
  Serial.print("Attempting MQTT connection... ");
  String clientId = "ESP32C3-Relay-" + String(WiFi.macAddress());

  if (client.connect(clientId.c_str(), TOPIC_STATUS, 1, true, "offline")) {
    Serial.println("Connected to MQTT Broker.");
    lastMqttSeen = millis();

    client.publish(TOPIC_STATUS, "online", true);
    client.subscribe(TOPIC_SHOWER_SET);
    client.subscribe(TOPIC_REBOOT_TRIGGER);

    publishShowerStatus();
    return true;
  } else {
    Serial.printf("Failed, state = %d\n", client.state());
    return false;
  }
}

void publishShowerStatus() {
  bool isShowerOn = (digitalRead(SHOWER_PIN) == RELAY_ON);
  const char *statusStr = isShowerOn ? "1" : "0";
  client.publish(TOPIC_SHOWER_STATUS, statusStr, true);
  Serial.printf("Published Shower Status: %s\n", statusStr);
}

void loop() {
  unsigned long now = millis();

  // 1. Maintain WiFi and MQTT connection (Non-blocking)
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = now;
      Serial.printf("WiFi offline (status %d). Waiting for auto-reconnect...\n", WiFi.status());
    }
  } else {
    if (!client.connected()) {
      if (now - lastReconnectAttempt > 5000) {
        lastReconnectAttempt = now;
        if (reconnect()) {
          lastReconnectAttempt = 0;
        }
      }
    } else {
      client.loop();
    }
  }

  // 2. Local-First Autonomous Fail-Safe 1: Max Continuous Run Cutoff
  // Prevents motor burnout and dry pump damage even if network drops during ON cycle
  bool isShowerOn = (digitalRead(SHOWER_PIN) == RELAY_ON);
  if (isShowerOn && (now - lastShowerStartTime >= MAX_SHOWER_RUNTIME_MS)) {
    Serial.println("[AUTONOMOUS SAFETY] Max runtime exceeded! Tripping shower relay locally.");
    setShowerState(false, "safety_max_runtime_cutoff");
    if (client.connected()) {
      client.publish(TOPIC_ALERTS, "warning:max_runtime_cutoff", false);
    }
  }

  // 3. Local-First Autonomous Fail-Safe 2: Standalone Biological Cycling
  // If disconnected from broker for > 60 seconds, run autonomous irrigation rhythm
  bool isNetworkDisconnected = (!client.connected() || WiFi.status() != WL_CONNECTED);
  if (autonomousOfflineFallback && isNetworkDisconnected && (now - lastMqttSeen > 60000UL)) {
    unsigned long cycleWindow = now % OFFLINE_CYCLE_PERIOD_MS;
    if (cycleWindow < OFFLINE_CYCLE_PUMP_ON_MS) {
      if (!isShowerOn) {
        Serial.println("[AUTONOMOUS OFFLINE] Starting scheduled periodic hydration.");
        setShowerState(true, "offline_autonomous_cycle");
      }
    } else {
      if (isShowerOn) {
        Serial.println("[AUTONOMOUS OFFLINE] Ending periodic hydration cycle.");
        setShowerState(false, "offline_autonomous_cycle_end");
      }
    }
  }

  // 4. Handle Reboot pin pulse (Single State Trigger) non-blockingly
  if (rebootActive) {
    if (now - rebootTriggerTime >= 1000) {
      digitalWrite(REBOOT_PIN, RELAY_OFF);
      rebootActive = false;
      Serial.println("Reboot pulse complete. GPIO 6 -> LOW");
    }
  }
}
