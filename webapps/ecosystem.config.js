// PM2 process definition for the AQUAPLANING app.
// Start with:  pm2 start ecosystem.config.js
// Save/boot:   pm2 save && pm2 startup
//
// Backend  : Go binary (REST API + embedded MQTT broker)
//            - HTTP API  on $PORT (default 8080, overridden to 8090 below)
//            - MQTT broker on 1883 (hardcoded in main.go for the ESP32-C3)
// Frontend : Vite production preview serving the built dist/ bundle
module.exports = {
  apps: [
    {
      name: 'aquaplaning-backend',
      cwd: __dirname + '/backend',
      script: './aquaplaning-backend',
      interpreter: 'none',          // run the compiled binary directly, not via node
      env: { PORT: '8090' },        // REST API port (8080 is taken by code-server)
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '200M',
      out_file: './pm2-backend.out.log',
      error_file: './pm2-backend.err.log',
      time: true,
    },
    {
      name: 'aquaplaning-frontend',
      cwd: __dirname + '/frontend',
      script: './node_modules/.bin/vite',
      args: 'preview --host 0.0.0.0 --port 4173 --strictPort',
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '300M',
      out_file: './pm2-frontend.out.log',
      error_file: './pm2-frontend.err.log',
      time: true,
    },
  ],
};
