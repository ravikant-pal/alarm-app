# Guaranteed Alarm POC — Step-by-Step Setup

## CRA + Bubblewrap TWA + No Backend Services

### How it works

```
User sets alarm (React UI)
        │
        ├─ window.NativeAlarm.scheduleAlarm()  ──► Android AlarmManager.setExactAndAllowWhileIdle()
        │                                              ✅ Fires in Doze mode
        │                                              ✅ Survives app closure
        │
        └─ Notification Triggers API           ──► TimestampTrigger (Chrome-level)
                                                      ✅ Browser fallback
                                                      ✅ No backend needed

Both use the SAME notification tag → Android deduplicates → user sees ONE notification
```

---

## Part 1 — CRA Web App Setup

### Step 1: Create the CRA app

```bash
npx create-react-app alarm-app
cd alarm-app
```

### Step 2: Copy web source files

Copy these files from the POC into `src/`:

- `App.js`
- `App.css`
- `alarmService.js`
- `service-worker-custom.js` → copy to `public/service-worker-custom.js`

### Step 3: Register the custom service worker

In `src/index.js`, add after the ReactDOM.render call:

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker-custom.js').then((reg) => {
    console.log('Custom SW registered:', reg.scope);
  });
}
```

### Step 4: Test in browser first

```bash
npm start
```

Open `http://localhost:3000` in Chrome on Android or desktop Chrome.

- Set an alarm a few minutes ahead
- The "Bridge Status" panel shows which arms are available
- If Notification Triggers API is supported, you'll see a scheduled notification

---

## Part 2 — Android (Bubblewrap) Setup

### Step 1: Install Bubblewrap CLI

```bash
npm install -g @bubblewrap/cli
```

### Step 2: Initialize TWA project

```bash
mkdir my-twa && cd my-twa
bubblewrap init --manifest https://YOUR_DOMAIN/.well-known/assetlinks.json
```

Follow the prompts. This generates a full Android Studio project.

### Step 3: Open in Android Studio

```bash
bubblewrap open
# OR: open Android Studio → Open → select the generated folder
```

### Step 4: Add the Kotlin files

Copy these files into `app/src/main/java/YOUR_PACKAGE/`:

- `AlarmBridge.kt` — update package name at top
- `AlarmReceiver.kt` — update package name at top
- `MainActivityWebView.kt` — update package name + `APP_URL` constant

### Step 5: Update AndroidManifest.xml

Merge the permissions and receiver declarations from `AndroidManifest.xml`
into your Bubblewrap-generated manifest.

**Critical permissions to add:**

```xml
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

### Step 6: Set the correct APP_URL

In `MainActivityWebView.kt`, update:

```kotlin
// Local dev (Android emulator):
private val APP_URL = "http://10.0.2.2:3000"

// Production:
private val APP_URL = "https://yourdomain.com"
```

### Step 7: Make MainActivityWebView your launcher

In `AndroidManifest.xml`, ensure `MainActivityWebView` has the LAUNCHER intent filter
(remove it from the original Bubblewrap LauncherActivity if present).

### Step 8: Build and run

```bash
# Via Android Studio: Run → Run 'app'
# OR via Bubblewrap:
bubblewrap build
bubblewrap install
```

### Step 9: Grant alarm permission on Android 12+

On first launch, the app will open the system screen asking for
"Allow setting alarms and reminders". Grant it.

---

## Part 3 — Testing the Full Hybrid Flow

1. Run `npm start` in your CRA project (or deploy to a server)
2. Run the Android app on a physical device or emulator
3. Set an alarm 2 minutes ahead
4. Check the "Bridge Status" panel:
   - `Native AlarmManager: ✅ Available` — native bridge is working
   - `Notification Triggers: ✅ Available` — web fallback also armed
5. Lock the screen and wait
6. Both arms fire → Android deduplicates by notification tag → ONE notification appears

---

## Part 4 — Using This for Cron Jobs (Future Step)

Once the alarm POC works, you can use the same bridge for cron-style scheduling:

```js
// In alarmService.js, add a cron scheduler:
export async function scheduleCron(id, cronExpression, label) {
  const nextRun = getNextCronTimestamp(cronExpression); // use cronstrue or cron-parser
  await scheduleAlarm({ id, label, timestamp: nextRun, timeString: '...' });
}
```

And in `AlarmReceiver.kt`, after showing the notification, re-register the next occurrence:

```kotlin
// After showing the notification in AlarmReceiver:
val prefs = context.getSharedPreferences("crons", Context.MODE_PRIVATE)
val cronExpr = prefs.getString("cron_$alarmId", null)
if (cronExpr != null) {
    val nextTimestamp = CronParser.getNextTimestamp(cronExpr)
    AlarmBridge(context).scheduleAlarm(alarmId, nextTimestamp, alarmLabel)
}
```

---

## Quick File Reference

| File                       | Location       | Purpose                             |
| -------------------------- | -------------- | ----------------------------------- |
| `App.js`                   | `src/`         | React UI                            |
| `App.css`                  | `src/`         | Styles                              |
| `alarmService.js`          | `src/`         | Hybrid alarm scheduler              |
| `service-worker-custom.js` | `public/`      | SW notification handler             |
| `AlarmBridge.kt`           | `android/.../` | Native bridge (JS interface)        |
| `AlarmReceiver.kt`         | `android/.../` | BroadcastReceiver for alarm fire    |
| `MainActivityWebView.kt`   | `android/.../` | WebView activity (registers bridge) |
| `AndroidManifest.xml`      | `android/.../` | Permissions + receiver declarations |

---

## Common Issues

**"Native AlarmManager: ❌ Not Available"**
→ You're testing in a regular browser, not the Android WebView. That's fine — web fallback still works.

**Notification permission denied**
→ `alarmService.js` calls `Notification.requestPermission()` automatically. Make sure you don't block it.

**Alarm doesn't fire on locked screen**
→ Check battery optimization: Settings → Apps → YOUR_APP → Battery → Unrestricted

**Android 12+ permission screen doesn't open**
→ `canScheduleExactAlarms()` check is in `MainActivityWebView.onCreate()`. Verify the Activity is running.

**Duplicate notifications**
→ The native `AlarmReceiver` uses `alarmId.hashCode()` as notification ID. The web notification uses `tag: alarmId`. These need to match — which they do by default in this POC.
