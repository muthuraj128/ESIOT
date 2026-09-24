import mqtt from 'mqtt';
import { config } from './config.js';

let simulatorClient = null;
let isSimulatorActive = false; // Disabled by default to ensure 100% real hardware data
let simulateUnhealthyNext = false;
let heartbeatInterval = null;
let activeTestTimeout = null;

export function initVirtualDevice() {
  console.log('🤖 Virtual ESP32 Hardware Simulator ready (Disabled by default for real hardware mode).');

  simulatorClient = mqtt.connect(config.mqttBrokerUrl, {
    clientId: 'thm_virtual_esp32_' + Math.random().toString(16).substring(2, 6),
    clean: true
  });

  simulatorClient.on('connect', () => {
    // Subscribe to commands for THM-0001
    const commandTopic = `devices/${config.deviceId}/command`;
    simulatorClient.subscribe(commandTopic);
    startHeartbeat();
  });

  simulatorClient.on('message', (topic, payload) => {
    if (!isSimulatorActive) return; // Ignore commands when simulator is off

    try {
      const msg = JSON.parse(payload.toString());
      if (msg.action === 'START_TEST' || msg.raw === 'START_TEST') {
        run15SecondTest(msg.check_type || 'MANUAL');
      }
    } catch {
      if (payload.toString() === 'START_TEST') {
        run15SecondTest('MANUAL');
      }
    }
  });
}

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  heartbeatInterval = setInterval(() => {
    if (isSimulatorActive) sendHeartbeat();
  }, 10000);
}

function sendHeartbeat() {
  if (!simulatorClient || !simulatorClient.connected) return;
  
  const statusTopic = `devices/${config.deviceId}/status`;
  const payload = JSON.stringify({
    device_id: config.deviceId,
    online: true,
    mode: 'VIRTUAL_SIMULATOR',
    rssi: -62,
    battery: 97,
    firmware: 'v1.0.4-IR-SIM'
  });
  
  simulatorClient.publish(statusTopic, payload);
}

function run15SecondTest(checkType) {
  if (!isSimulatorActive) return;

  const isUnhealthy = simulateUnhealthyNext;
  simulateUnhealthyNext = false;

  if (activeTestTimeout) clearTimeout(activeTestTimeout);

  if (isUnhealthy) {
    const detectionTime = 7.4;
    activeTestTimeout = setTimeout(() => {
      publishResult({
        device_id: config.deviceId,
        check_type: checkType,
        result: 'UNHEALTHY',
        detected: true,
        detection_time: detectionTime,
        started_at: new Date(Date.now() - detectionTime * 1000).toISOString(),
        notes: 'IR Sensor obstacle detected at 7.4s during observation window.'
      });
    }, detectionTime * 1000);
  } else {
    activeTestTimeout = setTimeout(() => {
      publishResult({
        device_id: config.deviceId,
        check_type: checkType,
        result: 'HEALTHY',
        detected: false,
        detection_time: 15.0,
        started_at: new Date(Date.now() - 15000).toISOString(),
        notes: 'Full 15-second observation window completed with 0 obstacle detections.'
      });
    }, 15000);
  }
}

function publishResult(resultObj) {
  if (!simulatorClient || !simulatorClient.connected) return;

  const resultTopic = `devices/${config.deviceId}/result`;
  const payload = JSON.stringify(resultObj);
  
  simulatorClient.publish(resultTopic, payload, { qos: 1 });
}

export function setSimulatorConfig({ active, forceUnhealthy }) {
  if (active !== undefined) {
    isSimulatorActive = active;
    if (active) sendHeartbeat();
  }
  if (forceUnhealthy !== undefined) simulateUnhealthyNext = forceUnhealthy;
  return { isSimulatorActive, simulateUnhealthyNext };
}
