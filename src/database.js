import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

let supabase = null;
let isSupabaseConnected = false;

if (config.supabaseUrl && config.supabaseKey) {
  try {
    supabase = createClient(config.supabaseUrl, config.supabaseKey);
    isSupabaseConnected = true;
    console.log('⚡ Supabase Client initialized successfully.');
  } catch (err) {
    console.warn('⚠️ Supabase initialization error, using local database mode:', err.message);
  }
} else {
  console.log('ℹ️ No Supabase credentials provided. Operating in Local Persistence mode.');
}

const LOCAL_DB_PATH = path.resolve('local_db.json');

// Clean initial data structure without fake pre-seeded data
const initialData = {
  customer: {
    customer_code: 'CUST-001',
    name: 'Coconut Farmer',
    email: 'demo@treehealth.com'
  },
  tree: {
    tree_code: 'TREE-001',
    name: 'Coconut Palm #1',
    species: 'King Coconut (Cocos nucifera)',
    location: 'East Plot - Sector 4'
  },
  device: {
    device_code: 'THM-0001',
    status: 'OFFLINE',
    last_seen: null,
    firmware_version: 'v1.0.4',
    battery_level: null,
    signal_strength: null,
    last_tree_status: 'DISCONNECTED',
    last_check_time: null
  },
  schedules: [
    { id: '1', time: '08:00', enabled: true },
    { id: '2', time: '10:00', enabled: true },
    { id: '3', time: '12:00', enabled: true },
    { id: '4', time: '14:00', enabled: true },
    { id: '5', time: '16:00', enabled: true },
    { id: '6', time: '18:00', enabled: true }
  ],
  check_history: []
};

function readLocalDb() {
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return initialData;
  }
}

function writeLocalDb(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing local DB:', err.message);
  }
}

export async function getDevice(deviceCode = 'THM-0001') {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('device_code', deviceCode)
        .maybeSingle();
      if (!error && data) return data;
    } catch (e) {
      console.warn('Supabase getDevice fallback to local:', e.message);
    }
  }
  const db = readLocalDb();
  return db.device;
}

export async function updateDeviceStatus(deviceCode, updateFields) {
  const db = readLocalDb();
  db.device = {
    ...db.device,
    ...updateFields,
    last_seen: new Date().toISOString()
  };
  writeLocalDb(db);

  if (supabase) {
    try {
      await supabase
        .from('devices')
        .update({ ...updateFields, last_seen: new Date().toISOString() })
        .eq('device_code', deviceCode);
    } catch (e) {
      console.warn('Supabase updateDeviceStatus error:', e.message);
    }
  }

  return db.device;
}

export async function addHistoryRecord(record) {
  const db = readLocalDb();
  const newRecord = {
    id: 'hist-' + Date.now(),
    device_code: record.device_code || 'THM-0001',
    tree_code: record.tree_code || 'TREE-001',
    check_type: record.check_type || 'MANUAL',
    result: record.result,
    detected: Boolean(record.detected),
    detection_time: record.detection_time !== undefined ? parseFloat(record.detection_time) : (record.detected ? 7.4 : 15.0),
    started_at: record.started_at || new Date().toISOString(),
    completed_at: new Date().toISOString(),
    notes: record.notes || (record.detected ? `Vibration anomaly detected at ${record.detection_time}s` : 'Clean scan completion')
  };

  db.check_history.unshift(newRecord);
  db.device.last_tree_status = record.result;
  db.device.last_check_time = newRecord.completed_at;
  writeLocalDb(db);

  if (supabase) {
    try {
      await supabase.from('check_history').insert([{
        device_code: newRecord.device_code,
        tree_code: newRecord.tree_code,
        check_type: newRecord.check_type,
        result: newRecord.result,
        detected: newRecord.detected,
        detection_time: newRecord.detection_time,
        started_at: newRecord.started_at,
        completed_at: newRecord.completed_at,
        notes: newRecord.notes
      }]);
    } catch (e) {
      console.warn('Supabase addHistoryRecord error:', e.message);
    }
  }

  return newRecord;
}

export async function getHistory(filterDays = null) {
  const db = readLocalDb();
  let list = db.check_history || [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('check_history')
        .select('*')
        .order('completed_at', { ascending: false });
      if (!error && data) list = data;
    } catch (e) {
      console.warn('Supabase getHistory fallback:', e.message);
    }
  }

  if (filterDays && Array.isArray(list)) {
    const cutoff = new Date(Date.now() - filterDays * 86400000);
    list = list.filter(item => new Date(item.completed_at) >= cutoff);
  }

  return list || [];
}

export async function getSchedules() {
  const db = readLocalDb();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('schedules')
        .select('*');
      if (!error && data && data.length > 0) return data;
    } catch (e) {
      console.warn('Supabase getSchedules fallback:', e.message);
    }
  }
  return db.schedules;
}

export async function saveSchedules(scheduleList) {
  const db = readLocalDb();
  db.schedules = scheduleList;
  writeLocalDb(db);

  if (supabase) {
    try {
      const { data: dev } = await supabase.from('devices').select('id').eq('device_code', 'THM-0001').single();
      if (dev) {
        await supabase.from('schedules').delete().eq('device_id', dev.id);
        const rows = scheduleList.map(s => ({
          device_id: dev.id,
          time: s.time,
          enabled: s.enabled
        }));
        await supabase.from('schedules').insert(rows);
      }
    } catch (e) {
      console.warn('Supabase saveSchedules error:', e.message);
    }
  }
  return db.schedules;
}

export async function getDashboardSummary() {
  const db = readLocalDb();
  const device = await getDevice('THM-0001');
  const history = await getHistory();
  const schedules = await getSchedules();

  const latestCheck = history[0] || null;

  // Calculate real ESP32 online state (offline if no heartbeat within last 45 seconds)
  const lastSeenMs = device.last_seen ? new Date(device.last_seen).getTime() : 0;
  const isOnline = (Date.now() - lastSeenMs) < 45000;

  // Real Database connection status
  const isDbConnected = isSupabaseConnected || fs.existsSync(LOCAL_DB_PATH);

  return {
    customer: db.customer,
    tree: db.tree,
    database_connected: isDbConnected,
    device: {
      ...device,
      is_online: isOnline,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      last_tree_status: isOnline ? (latestCheck ? latestCheck.result : 'NOT_CHECKED') : 'DISCONNECTED'
    },
    latest_check: latestCheck,
    schedules: schedules,
    history_count: history.length,
    today_checks_completed: history.filter(h => {
      const d = new Date(h.completed_at);
      const today = new Date();
      return d.getDate() === today.getDate() &&
             d.getMonth() === today.getMonth() &&
             d.getFullYear() === today.getFullYear();
    }).length
  };
}
