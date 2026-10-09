import React, { useState, useEffect } from 'react';
import { 
  ShowerHead, 
  RotateCcw, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Terminal, 
  Clock, 
  Activity, 
  Cpu
} from 'lucide-react';
import './index.css';

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
  const [rebootTimeLeft, setRebootTimeLeft] = useState(0);
  const [toasts, setToasts] = useState([]);

  // Automated edge crons specification
  const [crons] = useState([
    {
      id: 'cron-pump',
      name: 'Hydro-Pump Nitrogen Siphon',
      schedule: '*/45 * * * *',
      interval: 'Every 45 mins',
      target: 'GPIO 5 (Submersible Relay)'
    },
    {
      id: 'cron-feeder',
      name: 'Bio-Feed Cycle (Pellet Dispense)',
      schedule: '0 8,19 * * *',
      interval: 'Daily at 08:00 & 19:00',
      target: 'Automated 2-min Misting'
    },
    {
      id: 'cron-watchdog',
      name: 'Hardware Self-Test Pulse',
      schedule: '0 3 * * 0',
      interval: 'Weekly maintenance',
      target: 'GPIO 6 (Watchdog)'
    }
  ]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

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
      setBackendOnline(false);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus(true);
    const interval = setInterval(() => fetchStatus(false), 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (rebootTimeLeft <= 0) return;
    const timer = setTimeout(() => {
      setRebootTimeLeft(rebootTimeLeft - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [rebootTimeLeft]);

  const handleShowerToggle = async (e) => {
    const nextState = e.target.checked;
    setToggleLoading(true);
    try {
      const response = await fetch(`${API_BASE}/shower`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextState }),
      });
      if (response.ok) {
        setStatus((prev) => ({ ...prev, shower: nextState }));
        addToast(`Pump relay requested: ${nextState ? 'ON' : 'OFF'}`);
      } else {
        addToast('Failed to set relay state', 'error');
      }
    } catch (err) {
      addToast('Network error toggling relay', 'error');
    } finally {
      setToggleLoading(false);
    }
  };

  const handleRebootTrigger = async () => {
    if (rebootTimeLeft > 0) return;
    try {
      const response = await fetch(`${API_BASE}/reboot`, { method: 'POST' });
      if (response.ok) {
        setRebootTimeLeft(5);
        addToast('Hardware watchdog reboot triggered', 'success');
      } else {
        addToast('Failed to trigger reboot', 'error');
      }
    } catch (err) {
      addToast('Network error sending reboot trigger', 'error');
    }
  };

  return (
    <div className="container" style={{ maxWidth: '1080px', margin: '0 auto', padding: '32px 20px' }}>
      <header style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <Terminal size={24} style={{ color: '#10b981' }} />
          <h1 style={{ fontSize: '26px', fontWeight: '700', letterSpacing: '-0.02em', margin: 0 }}>
            AQUAPLANING
          </h1>
          <span style={{ 
            fontSize: '11px', 
            padding: '3px 10px', 
            borderRadius: '999px', 
            background: 'rgba(16, 185, 129, 0.12)', 
            color: '#10b981',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            fontWeight: '600'
          }}>
            ESP32-C3 Firmware v1.2
          </span>
        </div>
        <p style={{ color: '#888', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
          Edge controller for closed-loop aquaponics automation. Local-first MQTT telemetry with Go broker.
        </p>
      </header>

      {/* Connection Status Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '12px 18px',
        borderRadius: '10px',
        background: '#111',
        border: '1px solid #222',
        marginBottom: '28px',
        fontSize: '13px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {loading ? (
            <>
              <RefreshCw size={14} className="spin" style={{ color: '#888' }} />
              <span style={{ color: '#888' }}>Checking hardware...</span>
            </>
          ) : !backendOnline ? (
            <>
              <span className="dot offline" />
              <span style={{ color: 'var(--accent-red)' }}>Backend Gateway Offline</span>
            </>
          ) : status.esp32_connected ? (
            <>
              <span className="dot online" />
              <span style={{ color: 'var(--accent-green)', fontWeight: '600' }}>ESP32-C3 Online</span>
              <span style={{ color: '#555' }}>•</span>
              <span style={{ color: '#888' }}>Latency &lt; 3ms Local</span>
            </>
          ) : (
            <>
              <span className="dot offline" />
              <span style={{ color: '#888' }}>ESP32 Node Disconnected</span>
            </>
          )}
        </div>
        <div style={{ color: '#777', fontFamily: 'monospace', fontSize: '12px' }}>
          Host: {window.location.host} // Subnet: Local LAN
        </div>
      </div>

      {/* Control Grid */}
      <main className="control-grid" style={{ marginBottom: '28px' }}>
        {/* Pump Relay Card (GPIO 5) */}
        <div className="card">
          <div className="card-header">
            <div className="card-title-row">
              <h2 className="card-title">Spray Pump Relay (GPIO 5)</h2>
              <ShowerHead 
                size={22} 
                className="card-icon" 
                style={{ color: status.shower && status.esp32_connected ? 'var(--accent-green)' : '#555' }}
              />
            </div>
            <p className="card-description">
              Controls the submersible spray pump via optical isolation. Synchronized across local state ledger and MQTT broker.
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

        {/* Watchdog / Cold Reset Card (GPIO 6) */}
        <div className="card">
          <div className="card-header">
            <div className="card-title-row">
              <h2 className="card-title">Hardware Watchdog (GPIO 6)</h2>
              <RotateCcw 
                size={20} 
                className={`card-icon ${rebootTimeLeft > 0 ? 'spin' : ''}`}
                style={{ color: rebootTimeLeft > 0 ? 'var(--accent-red)' : '#555' }}
              />
            </div>
            <p className="card-description">
              Triggers an isolated 1000ms pulse on GPIO 6 to force cold-restart of peripheral buses without resetting MCU.
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
                  <span>Pulsing ({rebootTimeLeft}s)</span>
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  <span>Trigger Pulse</span>
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* Automated Schedules Section */}
      <section style={{
        background: '#0d0d0d',
        border: '1px solid #222',
        borderRadius: '14px',
        padding: '24px',
        marginBottom: '28px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '8px', 
              background: 'rgba(16, 185, 129, 0.1)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: '#10b981'
            }}>
              <Clock size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Autonomous Schedule Engine</h3>
              <span style={{ fontSize: '12px', color: '#666' }}>Hardware timer queue running on local controller</span>
            </div>
          </div>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '6px',
            background: '#1a1a1a',
            color: '#10b981',
            fontFamily: 'monospace',
            fontWeight: '600'
          }}>
            3 QUEUES SYNCD
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {crons.map((cron) => (
            <div key={cron.id} style={{
              background: '#141414',
              border: '1px solid #262626',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#f0f0f0', marginBottom: '3px' }}>
                  {cron.name}
                </div>
                <div style={{ fontSize: '11px', color: '#888', display: 'flex', gap: '8px' }}>
                  <span style={{ fontFamily: 'monospace', color: '#10b981' }}>{cron.schedule}</span>
                  <span>•</span>
                  <span>{cron.interval}</span>
                  <span>•</span>
                  <span style={{ color: '#aaa' }}>{cron.target}</span>
                </div>
              </div>
              <span style={{ 
                fontSize: '11px', 
                padding: '2px 8px', 
                borderRadius: '4px', 
                background: 'rgba(16, 185, 129, 0.15)', 
                color: '#10b981',
                fontWeight: '600'
              }}>
                ARMED
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Toast Notifications */}
      {toasts.length > 0 && (
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
      )}

      <footer style={{ textAlign: 'center', fontSize: '12px', color: '#555', marginTop: '36px' }}>
        AQUAPLANING EDGE RUNTIME // HOMIES LIVING SYSTEMS // LOCAL MESH ACTIVE
      </footer>
    </div>
  );
}
