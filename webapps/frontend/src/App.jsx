import React, { useState, useEffect } from 'react';
import { ShowerHead, RotateCcw, Wifi, WifiOff, RefreshCw, Terminal, CheckCircle2, AlertCircle } from 'lucide-react';

// Use a relative API path so requests go through the same origin as the page.
// This works behind the nginx reverse proxy and the Cloudflare Tunnel without
// triggering mixed-content errors on HTTPS.
const API_BASE = '/api';

export default function App() {
  const [status, setStatus] = useState({
    shower: false,
    esp32_connected: false,
    last_updated: ''
  });
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [rebootTimeLeft, setRebootTimeLeft] = useState(0); // in seconds
  const [toasts, setToasts] = useState([]);

  // Fetch status from Go backend
  const fetchStatus = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/status`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setBackendOnline(true);
      } else {
        setBackendOnline(false);
      }
    } catch (error) {
      console.error("Failed to fetch state:", error);
      setBackendOnline(false);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Poll for status update
  useEffect(() => {
    fetchStatus(true);
    const interval = setInterval(() => {
      fetchStatus(false);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Countdown timer for reboot active state
  useEffect(() => {
    if (rebootTimeLeft <= 0) return;
    const timer = setTimeout(() => {
      setRebootTimeLeft(rebootTimeLeft - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [rebootTimeLeft]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Toggle Shower (Pin 5)
  const handleShowerToggle = async (e) => {
    const newState = e.target.checked;
    setToggleLoading(true);
    try {
      const response = await fetch(`${API_BASE}/shower`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: newState }),
      });
      if (response.ok) {
        // Optimistic UI update, will be overwritten by next fetchStatus poll
        setStatus((prev) => ({ ...prev, shower: newState }));
        addToast(`Shower requested: ${newState ? 'ON' : 'OFF'}`, 'success');
      } else {
        addToast('Failed to set shower state', 'error');
      }
    } catch (error) {
      addToast('Network error setting shower state', 'error');
    } finally {
      setToggleLoading(false);
    }
  };

  // Trigger Reboot (Pin 6)
  const handleRebootTrigger = async () => {
    if (rebootTimeLeft > 0) return;
    try {
      const response = await fetch(`${API_BASE}/reboot`, {
        method: 'POST',
      });
      if (response.ok) {
        setRebootTimeLeft(5); // Show active state for 5 seconds
        addToast('Hardware reboot trigger sent!', 'success');
      } else {
        addToast('Failed to trigger reboot', 'error');
      }
    } catch (error) {
      addToast('Network error sending reboot trigger', 'error');
    }
  };

  return (
    <div className="container">
      {/* Header Section */}
      <header>
        <div className="logo-section">
          <Terminal size={24} className="card-icon" />
          <h1>AQUAPLANING</h1>
        </div>
        <p className="subtitle">
          Vercel-inspired dashboard for control operations over your ESP32-C3 relay system. Connected using Go and Mochi MQTT.
        </p>
      </header>

      {/* Connection Status Bar */}
      <div className="status-bar">
        <div className="status-indicator">
          {loading ? (
            <>
              <RefreshCw size={14} className="spin" style={{ color: '#888' }} />
              <span style={{ color: '#888' }}>Initializing...</span>
            </>
          ) : !backendOnline ? (
            <>
              <span className="dot offline" />
              <span style={{ color: 'var(--accent-red)' }}>Backend Offline</span>
            </>
          ) : status.esp32_connected ? (
            <>
              <span className="dot online" />
              <span style={{ color: 'var(--accent-green)' }}>ESP32 Online</span>
            </>
          ) : (
            <>
              <span className="dot offline" />
              <span style={{ color: '#888' }}>ESP32 Disconnected</span>
            </>
          )}
        </div>
        <div className="network-details">
          IP: {window.location.host} | SSID: ByteLogic Inovation
        </div>
      </div>

      {/* Control Grid */}
      <main className="control-grid">
        {/* Shower Card (GPIO 5) */}
        <div className="card">
          <div className="card-header">
            <div className="card-title-row">
              <h2 className="card-title">Shower Relay</h2>
              <ShowerHead 
                size={22} 
                className="card-icon" 
                style={{ color: status.shower && status.esp32_connected ? 'var(--accent-green)' : '#555' }}
              />
            </div>
            <p className="card-description">
              Control the shower on GPIO 5. The state is recorded and persisted on the backend database (state.json).
            </p>
          </div>

          <div className="card-body">
            <div className="toggle-wrapper">
              <span className={`toggle-state-text ${status.shower ? 'active' : ''}`}>
                {status.shower ? 'ACTIVE' : 'INACTIVE'}
              </span>
              <label className="switch">
                <input 
                  type="checkbox"
                  id="shower-switch"
                  checked={status.shower}
                  onChange={handleShowerToggle}
                  disabled={!status.esp32_connected || toggleLoading}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
        </div>

        {/* Reboot Card (GPIO 6) */}
        <div className="card">
          <div className="card-header">
            <div className="card-title-row">
              <h2 className="card-title">Hardware Reboot</h2>
              <RotateCcw 
                size={20} 
                className={`card-icon ${rebootTimeLeft > 0 ? 'spin' : ''}`}
                style={{ color: rebootTimeLeft > 0 ? 'var(--accent-red)' : '#555' }}
              />
            </div>
            <p className="card-description">
              Triggers a single 1-second pulse on GPIO 6 to initiate a reboot sequence. State is transient and not saved.
            </p>
          </div>

          <div className="card-body">
            <button 
              id="reboot-btn"
              className={`action-button ${rebootTimeLeft > 0 ? 'pulse-active' : ''}`}
              onClick={handleRebootTrigger}
              disabled={!status.esp32_connected || rebootTimeLeft > 0}
            >
              {rebootTimeLeft > 0 ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  <span>Rebooting ({rebootTimeLeft}s)</span>
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  <span>Trigger Reboot</span>
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.type === 'success' ? (
              <CheckCircle2 size={16} style={{ color: 'var(--accent-green)' }} />
            ) : (
              <AlertCircle size={16} style={{ color: 'var(--accent-red)' }} />
            )}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer>
        AP-C3 // SYSTEM: ACTIVE // VER: 1.0.0
      </footer>
    </div>
  );
}
