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

// MQTT Topics
#define TOPIC_STATUS "esp32/status"
#define TOPIC_SHOWER_SET "esp32/shower/set"
#define TOPIC_SHOWER_STATUS "esp32/shower/status"
#define TOPIC_REBOOT_TRIGGER "esp32/reboot/trigger"

// Client instances
WiFiClient espClient;
PubSubClient client(espClient);

// Timing variables
unsigned long lastReconnectAttempt = 0;
unsigned long rebootTriggerTime = 0;
bool rebootActive = false;

// Function declarations
void setupWifi();
void callback(char *topic, byte *payload, unsigned int length);
bool reconnect();
void publishShowerStatus();

void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println("\n==============================================");
  Serial.println("     ESP32-C3 Smart Relay Controller          ");
  Serial.println("==============================================");

  // Initialize pins
  pinMode(SHOWER_PIN, OUTPUT);
  pinMode(REBOOT_PIN, OUTPUT);

  // Set initial states
  digitalWrite(SHOWER_PIN, RELAY_OFF);
  digitalWrite(REBOOT_PIN, RELAY_OFF);

  // Set up WiFi and MQTT
  setupWifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void setupWifi() {
  delay(10);

  // Set station mode first to allow scanning
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

  // Enable auto-reconnect so ESP32 background task manages connection retries
  // automatically
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
    Serial.println("Common Status Codes:");
    Serial.println(
        "  1 = WL_NO_SSID_AVAIL (Network not found/too far/5GHz-only issue)");
    Serial.println("  4 = WL_CONNECT_FAILED (Incorrect password)");
    Serial.println("  6 = WL_DISCONNECTED (Connecting/Disconnected)");
    Serial.println("Will keep retrying in loop...");
  }
}

void callback(char *topic, byte *payload, unsigned int length) {
  // Parse payload into string
  String messageTemp;
  for (unsigned int i = 0; i < length; i++) {
    messageTemp += (char)payload[i];
  }
  messageTemp.trim();

  Serial.printf("MQTT Message arrived on [%s]: %s\n", topic,
                messageTemp.c_str());

  // 1. Shower (Pin 5) - stored state
  if (String(topic) == TOPIC_SHOWER_SET) {
    if (messageTemp == "1" || messageTemp.equalsIgnoreCase("on")) {
      digitalWrite(SHOWER_PIN, RELAY_ON);
      Serial.println("Shower (GPIO 5) -> ON");
      publishShowerStatus();
    } else if (messageTemp == "0" || messageTemp.equalsIgnoreCase("off")) {
      digitalWrite(SHOWER_PIN, RELAY_OFF);
      Serial.println("Shower (GPIO 5) -> OFF");
      publishShowerStatus();
    }
  }
  // 2. Reboot (Pin 6) - single state trigger
  else if (String(topic) == TOPIC_REBOOT_TRIGGER) {
    if (messageTemp == "1" || messageTemp.equalsIgnoreCase("trigger")) {
      digitalWrite(REBOOT_PIN, RELAY_ON);
      rebootTriggerTime = millis();
      rebootActive = true;
      Serial.println("Reboot (GPIO 6) triggered! Pulsing Pin HIGH...");
    }
  }
}

bool reconnect() {
  Serial.print("Attempting MQTT connection... ");
  // Create a client ID based on MAC address
  String clientId = "ESP32C3-Relay-" + String(WiFi.macAddress());

  // Connect with Last Will and Testament
  // Will Topic: esp32/status, Will QoS: 1, Will Retain: true, Will Message:
  // offline
  if (client.connect(clientId.c_str(), TOPIC_STATUS, 1, true, "offline")) {
    Serial.println("Connected to MQTT Broker.");

    // Publish online status (retained)
    client.publish(TOPIC_STATUS, "online", true);

    // Subscribe to control topics
    client.subscribe(TOPIC_SHOWER_SET);
    client.subscribe(TOPIC_REBOOT_TRIGGER);

    // Publish current status
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
  // 1. Maintain WiFi and MQTT connection
  if (WiFi.status() != WL_CONNECTED) {
    // Print a status dot periodically while waiting for automatic background
    // reconnect
    unsigned long now = millis();
    if (now - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = now;
      Serial.printf(
          "WiFi offline, status = %d. Waiting for auto-reconnect...\n",
          WiFi.status());
    }
  } else {
    // WiFi is connected, verify MQTT connection
    if (!client.connected()) {
      unsigned long now = millis();
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

  // 2. Handle Reboot pin pulse (Single State Trigger) non-blockingly
  if (rebootActive) {
    unsigned long now = millis();
    // Keep Pin 6 HIGH for 1000ms, then pull it back LOW
    if (now - rebootTriggerTime >= 1000) {
      digitalWrite(REBOOT_PIN, RELAY_OFF);
      rebootActive = false;
      Serial.println("Reboot pulse complete. GPIO 6 -> LOW");
    }
  }
}
