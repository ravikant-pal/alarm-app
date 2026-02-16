import { useEffect, useState } from 'react';
import {
  cancelAlarm,
  loadAlarms,
  rearmTimeouts,
  scheduleAlarm,
} from './alarmService';
import './App.css';

function App() {
  const [alarms, setAlarms] = useState([]);
  const [timeInput, setTimeInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      const saved = await loadAlarms();
      setAlarms(saved);
      rearmTimeouts(saved);
    })();
  }, []);

  const handleAdd = async () => {
    if (!timeInput) {
      setStatus('⚠️ Please pick a time');
      return;
    }

    const [hours, minutes] = timeInput.split(':').map(Number);
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);

    const alarm = {
      id: 'alarm_' + Date.now(),
      label: labelInput || 'Alarm',
      timestamp: target.getTime(),
      timeString: timeInput,
    };

    try {
      await scheduleAlarm(alarm);
      setAlarms(await loadAlarms());
      setTimeInput('');
      setLabelInput('');
      setStatus(
        '✅ Alarm set for ' +
          target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    } catch (e) {
      setStatus('❌ ' + e.message);
    }
  };

  const handleCancel = async (id) => {
    await cancelAlarm(id);
    setAlarms(await loadAlarms());
    setStatus('🗑️ Alarm cancelled');
  };

  const isNative = !!window.NativeAlarm;
  const isTriggers =
    'showTrigger' in Notification.prototype && !!window.TimestampTrigger;
  const isTimeout = !isNative;

  // Detect mobile browser for the hint message
  const isMobileBrowser =
    /Android|iPhone|iPad/i.test(navigator.userAgent) && !isNative;

  return (
    <div className='container'>
      <h1>⏰ Alarm POC</h1>
      <p className='subtitle'>Hybrid: Native AlarmManager + SW Notifications</p>

      <div className='card'>
        <h2>Set Alarm</h2>
        <input
          type='time'
          value={timeInput}
          onChange={(e) => setTimeInput(e.target.value)}
          className='input'
        />
        <input
          type='text'
          placeholder='Label (optional)'
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          className='input'
        />
        <button onClick={handleAdd} className='btn-primary'>
          + Set Alarm
        </button>
        {status && <p className='status'>{status}</p>}
      </div>

      <div className='card'>
        <h2>Scheduled Alarms</h2>
        {alarms.length === 0 ? (
          <p className='empty'>No alarms set</p>
        ) : (
          alarms.map((alarm) => (
            <div key={alarm.id} className='alarm-row'>
              <div>
                <span className='alarm-time'>{alarm.timeString}</span>
                <span className='alarm-label'>{alarm.label}</span>
              </div>
              <button
                onClick={() => handleCancel(alarm.id)}
                className='btn-cancel'
              >
                Cancel
              </button>
            </div>
          ))
        )}
      </div>

      <div className='debug-card'>
        <h3>🔍 Bridge Status</h3>

        <p>
          Arm 1 — Native AlarmManager:{' '}
          <strong>
            {isNative ? '✅ Available' : '❌ Browser only (expected until TWA)'}
          </strong>
        </p>

        <p>
          Arm 2 — Notification Triggers:{' '}
          <strong>
            {isTriggers
              ? '✅ Available'
              : '❌ Not available (Origin Trial ended — Chrome never shipped to stable)'}
          </strong>
        </p>

        <p>
          Arm 3 — setTimeout + SW:{' '}
          <strong>
            {isTimeout ? '✅ Active' : '⏭️ Skipped (Arm 1 handles it)'}
          </strong>
        </p>

        {isMobileBrowser && (
          <p className='warn-note'>
            ⚠️ Mobile browser: keep the tab open for Arm 3 to fire.
            Notifications use Service Worker to work on Android Chrome.
          </p>
        )}
        {isTimeout && !isMobileBrowser && (
          <p className='warn-note'>
            ⚠️ Desktop: keep the tab open for Arm 3 to fire.
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
