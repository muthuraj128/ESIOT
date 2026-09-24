import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { router } from './routes.js';
import { initMqtt } from './mqttService.js';
import { initVirtualDevice } from './virtualDevice.js';
import { initScheduler } from './scheduler.js';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Attach API Router
app.use('/api', router);

// Default welcome route
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Tree Health Monitor Backend API</title></head>
      <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem;">
        <h1>🌴 Tree Health Monitoring System - Render Backend API</h1>
        <p>Status: <strong style="color: #4ade80;">RUNNING</strong></p>
        <p>MQTT Broker: <code>${config.mqttBrokerUrl}</code></p>
        <p>Target Device: <code>${config.deviceId}</code></p>
        <hr style="border-color: #334155; margin: 1.5rem 0;" />
        <h3>Available API Endpoints:</h3>
        <ul>
          <li><code>GET /api/dashboard</code></li>
          <li><code>POST /api/check-now</code></li>
          <li><code>GET /api/history</code></li>
          <li><code>GET /api/schedules</code></li>
          <li><code>GET /api/events</code> (Server-Sent Events)</li>
        </ul>
      </body>
    </html>
  `);
});

// Start MQTT & Services
initMqtt();
initVirtualDevice();
initScheduler();

app.listen(config.port, () => {
  console.log(`
  ======================================================
  🌴 TREE HEALTH MONITORING SYSTEM - BACKEND SERVER 🌴
  ======================================================
  🚀 Express API Server running on port ${config.port}
  📡 MQTT Broker: ${config.mqttBrokerUrl}
  Target Device: ${config.deviceId}
  Target Tree:   ${config.treeId}
  ======================================================
  `);
});
