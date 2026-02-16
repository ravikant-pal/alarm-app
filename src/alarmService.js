// alarmService.js
// Hybrid alarm scheduler — 3 arms, no backend required.
//
//  Arm 1 — Native AlarmManager  (Android WebView via Kotlin bridge, guaranteed)
//  Arm 2 — Notification Triggers (Chrome Android, survives tab close)
//  Arm 3 — setTimeout            (desktop Chrome dev fallback, tab must stay open)

const DB_NAME = 'AlarmDB';
const DB_VERSION = 1;
const STORE = 'alarms';

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAlarms() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ─── Permission helper ────────────────────────────────────────────────────────

async function ensureNotificationPermission() {
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// ─── Arm 1: Native AlarmManager bridge (guaranteed, Android only) ─────────────

function scheduleNative(alarm) {
  if (!window.NativeAlarm) return false;
  try {
    window.NativeAlarm.scheduleAlarm(alarm.id, alarm.timestamp, alarm.label);
    console.log('[AlarmService] Arm 1 (Native) scheduled:', alarm.id);
    return true;
  } catch (e) {
    console.warn('[AlarmService] Arm 1 error:', e);
    return false;
  }
}

function cancelNative(id) {
  if (!window.NativeAlarm) return;
  try {
    window.NativeAlarm.cancelAlarm(id);
    console.log('[AlarmService] Arm 1 cancelled:', id);
  } catch (e) {
    console.warn('[AlarmService] Arm 1 cancel error:', e);
  }
}

// ─── Arm 2: Notification Triggers API (Chrome Android) ───────────────────────
// NOTE: TimestampTrigger is accessible via the chrome flag on desktop, but
// does NOT actually fire on desktop Chrome — only on Chrome Android.

async function scheduleWebTrigger(alarm) {
  if (!('showTrigger' in Notification.prototype) || !window.TimestampTrigger) {
    console.warn(
      '[AlarmService] Arm 2: Notification Triggers API not supported'
    );
    return false;
  }

  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    console.warn('[AlarmService] Arm 2: No service worker registration found');
    return false;
  }

  const trigger = new window.TimestampTrigger(alarm.timestamp);

  await reg.showNotification(alarm.label, {
    tag: alarm.id,
    body: 'Alarm: ' + alarm.label,
    icon: '/logo192.png',
    badge: '/logo192.png',
    showTrigger: trigger,
    renotify: false,
    requireInteraction: true,
    data: { alarmId: alarm.id },
  });

  console.log(
    '[AlarmService] Arm 2 (Notification Trigger) scheduled:',
    alarm.id
  );
  return true;
}

async function cancelWebTrigger(id) {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const pending = await reg.getNotifications({
    tag: id,
    includeTriggered: true,
  });
  pending.forEach((n) => n.close());
  console.log(
    '[AlarmService] Arm 2 cancelled:',
    id,
    '(' + pending.length + ' removed)'
  );
}

// ─── Arm 3: setTimeout fallback (desktop browser dev only) ───────────────────
// TimestampTrigger does NOT fire on desktop Chrome even with the flag enabled.
// This arm fires a Notification directly so you can test the full flow locally.
// Limitation: the tab must remain open. Auto-skipped when native bridge exists.

const _timeouts = new Map(); // alarmId → timeoutHandle

function scheduleTimeout(alarm) {
  if (window.NativeAlarm) return false; // native available, skip this arm

  const delay = alarm.timestamp - Date.now();
  if (delay <= 0) {
    console.warn('[AlarmService] Arm 3: timestamp already passed, skipping');
    return false;
  }

  const handle = setTimeout(() => {
    _timeouts.delete(alarm.id);
    _fireDesktopNotification(alarm);
  }, delay);

  _timeouts.set(alarm.id, handle);
  console.log(
    '[AlarmService] Arm 3 (setTimeout) armed: fires in ' +
      Math.round(delay / 1000) +
      's'
  );
  return true;
}

function cancelTimeout(id) {
  if (_timeouts.has(id)) {
    clearTimeout(_timeouts.get(id));
    _timeouts.delete(id);
    console.log('[AlarmService] Arm 3 cancelled:', id);
  }
}

function _fireDesktopNotification(alarm) {
  if (Notification.permission !== 'granted') return;
  const n = new Notification('⏰ ' + alarm.label, {
    body: 'Your alarm is ringing',
    icon: '/logo192.png',
    tag: alarm.id,
    requireInteraction: true,
  });
  n.onclick = () => {
    n.close();
    window.focus();
  };
  console.log('[AlarmService] Arm 3 fired notification for:', alarm.id);
}

/**
 * Re-arm Arm 3 setTimeout after a page refresh.
 * Call once on app mount with the full saved alarms list from IndexedDB.
 */
export function rearmTimeouts(alarms) {
  if (window.NativeAlarm) return; // not needed when native is available
  const future = alarms.filter((a) => a.timeoutOk && a.timestamp > Date.now());
  future.forEach((alarm) => scheduleTimeout(alarm));
  if (future.length > 0) {
    console.log(
      '[AlarmService] Re-armed ' + future.length + ' alarm(s) after page reload'
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Schedule an alarm across all available arms.
 */
export async function scheduleAlarm(alarm) {
  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    throw new Error(
      'Notification permission denied. Please allow notifications to use alarms.'
    );
  }

  const nativeOk = scheduleNative(alarm);
  const webOk = await scheduleWebTrigger(alarm);
  const timeoutOk = scheduleTimeout(alarm);

  if (!nativeOk && !webOk && !timeoutOk) {
    throw new Error(
      'No alarm arm is available. Make sure notifications are allowed.'
    );
  }

  await dbPut({ ...alarm, nativeOk, webOk, timeoutOk });
  console.log('[AlarmService] Saved:', alarm.id, {
    nativeOk,
    webOk,
    timeoutOk,
  });
}

/**
 * Cancel a scheduled alarm across all arms.
 */
export async function cancelAlarm(id) {
  cancelNative(id);
  await cancelWebTrigger(id);
  cancelTimeout(id);
  await dbDelete(id);
  console.log('[AlarmService] Deleted:', id);
}
