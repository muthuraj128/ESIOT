import mqtt from 'mqtt';
import { config } from './config.js';
import { updateDeviceStatus, addHistoryRecord } from './database.js';

let mqttClient = null;
const eventListeners = new Set();

export function initMqtt(onResultCallback, onStatusCallback) {
  console.log(`🔌 Connecting to MQTT Broker at ${config.mqttBrokerUrl}...`);
  
  mqttClient = mqtt.connect(config.mqttBrokerUrl, {
    clientId: 'thm_backend_' + Math.random().toString(16).substring(2, 8),
    clean: true,
    reconnectPeriod: 3000,
  });

  mqttClient.on('connect', () => {
    console.log('✅ Connected to MQTT Broker!');
    
    // Subscribe to topics
    const statusTopic = `devices/${config.deviceId}/status`;
    const resultTopic = `devices/${config.deviceId}/result`;
    
    mqttClient.subscribe([statusTopic, resultTopic], (err) => {
      if (err) {
        console.error('❌ MQTT Subscription Error:', err.message);
      } else {
        console.log(`📡 Subscribed to MQTT Topics:\n  - ${statusTopic}\n  - ${resultTopic}`);
      }
    });
  });

  mqttClient.on('message', async (topic, payload) => {
    try {
      const messageStr = payload.toString();
      let data = {};
      try {
        data = JSON.parse(messageStr);
      } catch {
        data = { raw: messageStr };
      }

      console.log(`📩 MQTT Message Received [${topic}]:`, data);

      if (topic.endsWith('/status')) {
        // Heartbeat status from ESP32
        const updatedDev = await updateDeviceStatus(config.deviceId, {
          status: 'ONLINE',
          battery_level: data.battery !== undefined ? data.battery : 95,
          signal_strength: data.rssi !== undefined ? data.rssi : -64,
          firmware_version: data.firmware || 'v1.0.4-IR'
        });

        if (onStatusCallback) onStatusCallback(updatedDev);
        notifyListeners('status', updatedDev);
      } 
      else if (topic.endsWith('/result')) {
        // Test Result from ESP32
        console.log('🌴 Test Result Received from ESP32:', data);
        
        const record = await addHistoryRecord({
          device_code: data.device_id || config.deviceId,
          tree_code: config.treeId,
          check_type: data.check_type || 'MANUAL',
          result: data.result || (data.detected ? 'UNHEALTHY' : 'HEALTHY'),
          detected: Boolean(data.detected),
          detection_time: data.detection_time !== undefined ? parseFloat(data.detection_time) : (data.detected ? 7.4 : 15.0),
          started_at: data.started_at || new Date(Date.now() - 15000).toISOString(),
          notes: data.notes || (data.detected ? `IR Triggered at ${data.detection_time}s` : 'Full 15s window completed clean.')
        });

        await updateDeviceStatus(config.deviceId, {
          status: 'ONLINE',
          last_tree_status: record.result
        });

        if (onResultCallback) onResultCallback(record);
        notifyListeners('result', record);
      }
    } catch (err) {
      console.error('Error handling MQTT message:', err);
    }
  });

  mqttClient.on('error', (err) => {
    console.warn('⚠️ MQTT Error:', err.message);
  });

  mqttClient.on('offline', () => {
    console.warn('⚠️ MQTT Client is offline');
  });

  return mqttClient;
}

export function sendCheckNowCommand(checkType = 'MANUAL') {
  if (!mqttClient || !mqttClient.connected) {
    console.warn('⚠️ MQTT client not connected. Command will be queued by broker or virtual device.');
  }

  const topic = `devices/${config.deviceId}/command`;
  const payload = JSON.stringify({
    action: 'START_TEST',
    device_id: config.deviceId,
    check_type: checkType,
    timestamp: new Date().toISOString()
  });

  console.log(`📤 Publishing MQTT Command to [${topic}]:`, payload);
  mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error('Failed to publish MQTT command:', err.message);
    } else {
      console.log('✅ START_TEST command published to MQTT broker successfully!');
    }
  });

  notifyListeners('command_sent', { topic, checkType, timestamp: new Date().toISOString() });
}

export function subscribeEvents(listener) {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

function notifyListeners(eventType, payload) {
  for (const listener of eventListeners) {
    try {
      listener(eventType, payload);
    } catch (e) {
      console.error('Error in event listener:', e);
    }
  }
}
