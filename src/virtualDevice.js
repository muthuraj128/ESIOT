import mqtt from 'mqtt';
import { config } from './config.js';

let simulatorClient = null;
let isSimulatorActive = true;
let simulateUnhealthyNext = false;
let heartbeatInterval = null;
let activeTestTimeout = null;

export function initVirtualDevice() {
  console.log('🤖 Initializing Virtual ESP32 Hardware Simulator (THM-0001)...');

  simulatorClient = mqtt.connect(config.mqttBrokerUrl, {
    clientId: 'thm_virtual_esp32_' + Math.random().toString(16).substring(2, 6),
    clean: true
  });

  simulatorClient.on('connect', () => {
    console.log('🤖 Virtual ESP32 Simulator Connected to MQTT Broker!');
    
    // Subscribe to commands for THM-0001
    const commandTopic = `devices/${config.deviceId}/command`;
    simulatorClient.subscribe(commandTopic, (err) => {
      if (!err) {
        console.log(`🤖 Virtual ESP32 listening on topic: ${commandTopic}`);
      }
    });

    // Start 10-second periodic heartbeat
    startHeartbeat();
  });

  simulatorClient.on('message', (topic, payload) => {
    if (!isSimulatorActive) return; // If user toggles hardware-only mode

    try {
      const msg = JSON.parse(payload.toString());
      console.log('🤖 Virtual ESP32 received MQTT command:', msg);

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
  
  // Send immediate status
  sendHeartbeat();
  
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
  console.log(`🤖 Virtual ESP32: Starting 15-second IR Sensor Test Window [Type: ${checkType}]...`);

  // Determine if this test will trigger an obstacle (Unhealthy) or pass clean (Healthy)
  const isUnhealthy = simulateUnhealthyNext;
  simulateUnhealthyNext = false; // reset flag

  if (activeTestTimeout) clearTimeout(activeTestTimeout);

  if (isUnhealthy) {
    // Detect object at 7.4 seconds
    const detectionTime = 7.4;
    console.log(`🤖 Virtual ESP32: IR Sensor obstacle DETECTED at ${detectionTime}s! Triggering UNHEALTHY result.`);
    
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
    // 15 seconds clean observation window
    console.log('🤖 Virtual ESP32: Monitoring IR sensor for 15 seconds (No object detected)...');
    
    activeTestTimeout = setTimeout(() => {
      console.log('🤖 Virtual ESP32: 15-second observation window completed clean. Result: HEALTHY.');
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
  
  simulatorClient.publish(resultTopic, payload, { qos: 1 }, (err) => {
    if (!err) {
      console.log(`🤖 Virtual ESP32 published result to [${resultTopic}]:`, resultObj.result);
    }
  });
}

export function setSimulatorConfig({ active, forceUnhealthy }) {
  if (active !== undefined) isSimulatorActive = active;
  if (forceUnhealthy !== undefined) simulateUnhealthyNext = forceUnhealthy;
  return { isSimulatorActive, simulateUnhealthyNext };
}
