import cron from 'node-cron';
import { getSchedules } from './database.js';
import { sendCheckNowCommand } from './mqttService.js';

let lastTriggeredMinute = '';

export function initScheduler() {
  console.log('⏰ Initializing Automated Monitoring Scheduler Service...');

  // Run every minute at 00 seconds
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${currentHours}:${currentMinutes}`;

      if (timeStr === lastTriggeredMinute) return;

      const schedules = await getSchedules();
      const matched = schedules.find(s => s.enabled && s.time === timeStr);

      if (matched) {
        lastTriggeredMinute = timeStr;
        console.log(`⏰ Automated Scheduled Check Triggered at ${timeStr} for device THM-0001!`);
        sendCheckNowCommand('SCHEDULED');
      }
    } catch (err) {
      console.error('Error in automated scheduler cron:', err.message);
    }
  });
}
