package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	mqtt "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/hooks/auth"
	"github.com/mochi-mqtt/server/v2/listeners"
	"github.com/mochi-mqtt/server/v2/packets"
)

// State defines the structure of the system status stored in state.json
type State struct {
	Shower         bool      `json:"shower"`
	ESP32Connected bool      `json:"esp32_connected"`
	LastUpdated    time.Time `json:"last_updated"`
}

// Global state controller
type StateController struct {
	sync.Mutex
	state     State
	filePath  string
	mqttServer *mqtt.Server
}

func NewStateController(filePath string) *StateController {
	sc := &StateController{
		filePath: filePath,
		state: State{
			Shower:         false,
			ESP32Connected: false,
			LastUpdated:    time.Now(),
		},
	}
	sc.load()
	return sc
}

func (sc *StateController) load() {
	sc.Lock()
	defer sc.Unlock()
	file, err := os.Open(sc.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Println("State file does not exist, initializing new state.")
			sc.saveNoLock()
			return
		}
		log.Printf("Error opening state file: %v\n", err)
		return
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&sc.state); err != nil {
		log.Printf("Error decoding state: %v\n", err)
	}
}

func (sc *StateController) saveNoLock() {
	data, err := json.MarshalIndent(sc.state, "", "  ")
	if err != nil {
		log.Printf("Error marshalling state: %v\n", err)
		return
	}
	err = os.WriteFile(sc.filePath, data, 0644)
	if err != nil {
		log.Printf("Error writing state file: %v\n", err)
	}
}

func (sc *StateController) SetShower(state bool) {
	sc.Lock()
	sc.state.Shower = state
	sc.state.LastUpdated = time.Now()
	sc.saveNoLock()
	sc.Unlock()
}

func (sc *StateController) SetConnection(connected bool) {
	sc.Lock()
	sc.state.ESP32Connected = connected
	sc.state.LastUpdated = time.Now()
	sc.saveNoLock()
	sc.Unlock()
}

func (sc *StateController) GetState() State {
	sc.Lock()
	defer sc.Unlock()
	return sc.state
}

// Custom hook to intercept MQTT messages and client lifecycle events
type StatusHook struct {
	mqtt.HookBase
	sc *StateController
}

func (h *StatusHook) ID() string {
	return "status-interceptor"
}

// Tells Mochi MQTT server which events this hook handles
func (h *StatusHook) Provides(b byte) bool {
	return b == mqtt.OnPublish || b == mqtt.OnConnect || b == mqtt.OnDisconnect
}

// OnConnect is called when a client connects successfully
func (h *StatusHook) OnConnect(cl *mqtt.Client, pk packets.Packet) error {
	log.Printf("Client connected to broker: %s\n", cl.ID)
	// Check if the client is our ESP32-C3 relay
	if strings.HasPrefix(cl.ID, "ESP32C3-Relay") {
		h.sc.SetConnection(true)
		log.Println("[Hook] ESP32 connection state updated to: ONLINE (OnConnect)")
	}
	return nil
}

// OnDisconnect is called when a client disconnects from the broker
func (h *StatusHook) OnDisconnect(cl *mqtt.Client, err error, expire bool) {
	log.Printf("Client disconnected from broker: %s\n", cl.ID)
	if strings.HasPrefix(cl.ID, "ESP32C3-Relay") {
		h.sc.SetConnection(false)
		log.Println("[Hook] ESP32 connection state updated to: OFFLINE (OnDisconnect)")
	}
}

// OnPublish is called when a PUBLISH packet is received
func (h *StatusHook) OnPublish(cl *mqtt.Client, pk packets.Packet) (packets.Packet, error) {
	topic := pk.TopicName
	payload := string(pk.Payload)

	log.Printf("[Hook] MQTT publish received [topic: %s]: %s\n", topic, payload)

	if topic == "esp32/shower/status" {
		if payload == "1" {
			h.sc.SetShower(true)
			log.Println("[Hook] State updated: Shower ON")
		} else if payload == "0" {
			h.sc.SetShower(false)
			log.Println("[Hook] State updated: Shower OFF")
		}
	} else if topic == "esp32/status" {
		if payload == "online" {
			h.sc.SetConnection(true)
			log.Println("[Hook] ESP32 status updated: ONLINE")
		} else if payload == "offline" {
			h.sc.SetConnection(false)
			log.Println("[Hook] ESP32 status updated: OFFLINE")
		}
	}

	return pk, nil
}

func main() {
	stateFile := "state.json"
	sc := NewStateController(stateFile)

	// Create Mochi MQTT server
	server := mqtt.New(&mqtt.Options{
		InlineClient: true,
	})
	sc.mqttServer = server

	// Allow all credentials for testing
	_ = server.AddHook(new(auth.AllowHook), nil)

	// Register custom message handler hook
	statusHook := &StatusHook{sc: sc}
	err := server.AddHook(statusHook, nil)
	if err != nil {
		log.Fatalf("Failed to add status hook: %v", err)
	}

	// Create standard TCP listener explicitly on 0.0.0.0 to allow IPv4 connections
	tcpListener := listeners.NewTCP(listeners.Config{
		ID:      "t1",
		Address: "0.0.0.0:1883",
	})
	err = server.AddListener(tcpListener)
	if err != nil {
		log.Fatalf("Failed to add TCP listener: %v", err)
	}

	// Start MQTT Broker
	go func() {
		log.Println("Starting embedded Mochi MQTT Broker on port 1883...")
		if err := server.Serve(); err != nil {
			log.Fatalf("MQTT Broker failure: %v", err)
		}
	}()

	// Setup HTTP Handlers for React Frontend
	http.HandleFunc("/api/status", corsHandler(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sc.GetState())
	}))

	http.HandleFunc("/api/shower", corsHandler(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Failed to read body", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		var req struct {
			State bool `json:"state"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		payload := "0"
		if req.State {
			payload = "1"
		}

		// Publish status change request to ESP32
		log.Printf("Publishing shower state request: %s to topic esp32/shower/set\n", payload)
		err = server.Publish("esp32/shower/set", []byte(payload), true, 1)
		if err != nil {
			log.Printf("Error publishing to MQTT: %v\n", err)
			http.Error(w, "Failed to publish message", http.StatusInternalServerError)
			return
		}

		// We do not set the status locally directly. Instead, we let the ESP32 confirm it,
		// and the OnMessage hook will update state.json.
		// However, we return success here to indicate the command was sent.
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true}`))
	}))

	http.HandleFunc("/api/reboot", corsHandler(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Publish pulse trigger request to ESP32
		log.Println("Publishing reboot trigger to topic esp32/reboot/trigger")
		err = server.Publish("esp32/reboot/trigger", []byte("1"), false, 1)
		if err != nil {
			log.Printf("Error publishing reboot trigger to MQTT: %v\n", err)
			http.Error(w, "Failed to publish reboot trigger", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true}`))
	}))

	// Start HTTP Server explicitly on 0.0.0.0 (port configurable via PORT env, default 8080)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Starting HTTP REST API Server on port %s...\n", port)
	if err := http.ListenAndServe("0.0.0.0:"+port, nil); err != nil {
		log.Fatalf("HTTP Server failure: %v", err)
	}
}

// corsHandler wraps an HTTP handler to enable CORS
func corsHandler(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		h(w, r)
	}
}
