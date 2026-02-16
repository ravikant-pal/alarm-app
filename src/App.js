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

  // Load saved alarms on mount + re-arm setTimeout for any pending alarms
  useEffect(() => {
    (async () => {
      const saved = await loadAlarms();
      setAlarms(saved);
      rearmTimeouts(saved); // Re-arm Arm 3 after page refresh
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

    // If time already passed today, schedule for tomorrow
    if (target.getTime() <= Date.now()) {
      target.setDate(target.getDate() + 1);
    }

    const alarm = {
      id: 'alarm_' + Date.now(),
      label: labelInput || 'Alarm',
      timestamp: target.getTime(),
      timeString: timeInput,
    };

    try {
      await scheduleAlarm(alarm);
      const updated = await loadAlarms();
      setAlarms(updated);
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
    const updated = await loadAlarms();
    setAlarms(updated);
    setStatus('🗑️ Alarm cancelled');
  };

  const hasNative = !!window.NativeAlarm;
  const hasTriggers =
    'showTrigger' in Notification.prototype && !!window.TimestampTrigger;
  const hasTimeout = !hasNative; // Arm 3 is only active in browser (no native)

  return (
    <div className='container'>
      <h1>⏰ Alarm POC</h1>
      <p className='subtitle'>
        Hybrid: Native AlarmManager + Notification Triggers + setTimeout
      </p>

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
            {hasNative ? '✅ Available' : '❌ Browser only (expected)'}
          </strong>
        </p>
        <p>
          Arm 2 — Notification Triggers:{' '}
          <strong>
            {hasTriggers
              ? '✅ Available (Chrome Android)'
              : '❌ Not supported on desktop'}
          </strong>
        </p>
        <p>
          Arm 3 — setTimeout Fallback:{' '}
          <strong>
            {hasTimeout
              ? '✅ Active (browser dev mode)'
              : '⏭️ Skipped (native available)'}
          </strong>
        </p>
        {hasTimeout && (
          <p className='warn-note'>⚠️ Arm 3 requires tab to stay open</p>
        )}
      </div>
    </div>
  );
}

export default App;
