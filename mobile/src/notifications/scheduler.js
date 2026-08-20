import * as Notifications from 'expo-notifications';
import { todayIso } from '../lib/shared';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const REMINDER_HOUR = 8;

function atLocal8am(dateStr, dayOffset = 0) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + dayOffset);
  d.setHours(REMINDER_HOUR, 0, 0, 0);
  return d;
}

async function upsertReminder(db, key, title, body, when) {
  if (when.getTime() <= Date.now()) return;
  const whenIso = when.toISOString();
  const existing = await db.getFirstAsync('SELECT * FROM scheduled_notifications WHERE record_key = ?', key);
  if (existing && existing.trigger_at === whenIso) return; // unchanged since last reconcile

  if (existing && existing.expo_notification_id) {
    await Notifications.cancelScheduledNotificationAsync(existing.expo_notification_id).catch(() => {});
  }
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
  await db.runAsync(
    `INSERT INTO scheduled_notifications (record_key, expo_notification_id, trigger_at) VALUES (?, ?, ?)
     ON CONFLICT(record_key) DO UPDATE SET expo_notification_id = excluded.expo_notification_id, trigger_at = excluded.trigger_at`,
    key, notificationId, whenIso
  );
}

async function pruneStale(db, prefix, activeKeys) {
  const rows = await db.getAllAsync('SELECT record_key, expo_notification_id FROM scheduled_notifications WHERE record_key LIKE ?', prefix + '%');
  for (const row of rows) {
    if (!activeKeys.has(row.record_key)) {
      if (row.expo_notification_id) await Notifications.cancelScheduledNotificationAsync(row.expo_notification_id).catch(() => {});
      await db.runAsync('DELETE FROM scheduled_notifications WHERE record_key = ?', row.record_key);
    }
  }
}

/* Reconciles local reminders against whatever's currently synced to SQLite —
   called after every sync pull (src/sync/SyncProvider.js), entirely offline,
   no server involvement. Cancels/reschedules on a due-date change, removes
   the reminder once a task completes or a record disappears (deleted or
   filtered out by the WHERE clauses below). */
export async function rescheduleReminders(db) {
  const today = todayIso();

  const tasks = await db.getAllAsync(
    "SELECT id, title, due_date FROM tasks WHERE deleted_at IS NULL AND status != 'Completed' AND due_date IS NOT NULL AND due_date >= ?", today
  );
  const taskKeys = new Set();
  for (const t of tasks) {
    const key = `tasks:${t.id}:due_date`;
    taskKeys.add(key);
    await upsertReminder(db, key, 'Task due today', t.title || 'A task is due today.', atLocal8am(t.due_date));
  }
  await pruneStale(db, 'tasks:', taskKeys);

  const health = await db.getAllAsync(
    'SELECT id, tag_id, next_check_date FROM health_records WHERE deleted_at IS NULL AND next_check_date IS NOT NULL AND next_check_date >= ?', today
  );
  const healthKeys = new Set();
  for (const h of health) {
    const key = `health_records:${h.id}:next_check_date`;
    healthKeys.add(key);
    await upsertReminder(db, key, 'Health check-up due', `${h.tag_id || 'An animal'}'s next check-up is today.`, atLocal8am(h.next_check_date));
  }
  await pruneStale(db, 'health_records:', healthKeys);

  const breeding = await db.getAllAsync(
    'SELECT id, tag_id, expected_birth_date FROM breeding_records WHERE deleted_at IS NULL AND expected_birth_date IS NOT NULL AND (birth_date IS NULL OR birth_date = \'\') AND expected_birth_date >= ?', today
  );
  const breedingKeys = new Set();
  for (const b of breeding) {
    const beforeKey = `breeding_records:${b.id}:expected_birth_date:before`;
    const ofKey = `breeding_records:${b.id}:expected_birth_date:of`;
    breedingKeys.add(beforeKey);
    breedingKeys.add(ofKey);
    await upsertReminder(db, beforeKey, 'Birth expected tomorrow', `${b.tag_id || 'An animal'} is expected to give birth tomorrow.`, atLocal8am(b.expected_birth_date, -1));
    await upsertReminder(db, ofKey, 'Birth expected today', `${b.tag_id || 'An animal'} is expected to give birth today.`, atLocal8am(b.expected_birth_date, 0));
  }
  await pruneStale(db, 'breeding_records:', breedingKeys);
}
