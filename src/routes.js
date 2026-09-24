import express from 'express';
import {
  getDashboardSummary,
  getHistory,
  getSchedules,
  saveSchedules
} from './database.js';
import { sendCheckNowCommand, subscribeEvents } from './mqttService.js';
import { setSimulatorConfig } from './virtualDevice.js';

export const router = express.Router();

// SSE clients list
const sseClients = new Set();

// Broadcast event to all connected SSE browser clients
function broadcastSSE(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

// Subscribe to MQTT events to forward to SSE
subscribeEvents((eventType, data) => {
  broadcastSSE(eventType, data);
});

// GET /api/health
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const summary = await getDashboardSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/check-now
router.post('/check-now', async (req, res) => {
  try {
    const { check_type } = req.body || {};
    sendCheckNowCommand(check_type || 'MANUAL');
    res.json({
      success: true,
      message: 'START_TEST command published to MQTT broker.',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/history
router.get('/history', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : null;
    const history = await getHistory(days);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/schedules
router.get('/schedules', async (req, res) => {
  try {
    const schedules = await getSchedules();
    res.json({ success: true, data: schedules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/schedules
router.post('/schedules', async (req, res) => {
  try {
    const { schedules } = req.body;
    if (!Array.isArray(schedules)) {
      return res.status(400).json({ success: false, error: 'Schedules must be an array.' });
    }
    const updated = await saveSchedules(schedules);
    broadcastSSE('schedules_updated', updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/simulator/config
router.post('/simulator/config', (req, res) => {
  try {
    const { active, forceUnhealthy } = req.body;
    const status = setSimulatorConfig({ active, forceUnhealthy });
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/events (Server-Sent Events endpoint)
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE Stream Connected' })}\n\n`);
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});
