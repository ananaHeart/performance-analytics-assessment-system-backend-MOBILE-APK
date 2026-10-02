const { execFileSync } = require('child_process');

/**
 * A physical Android device reaches the local backend (localhost:8080, see
 * src/config/api.ts) only through `adb reverse tcp:8080 tcp:8080`. That
 * mapping is lost every time the device reconnects (cable unplugged, adb
 * server restarted, phone rebooted), and forgetting to redo it manually
 * produces a generic "TypeError: Network request failed" with no hint that
 * the real cause is a missing port forward. Re-running this on every
 * `npm start` / `npm run android` makes the forward self-healing instead of
 * something a developer has to remember.
 */
const BACKEND_PORT = 8080;

const listDeviceSerials = () => {
  let output;
  try {
    output = execFileSync('adb', ['devices'], { encoding: 'utf8' });
  } catch (error) {
    console.warn('[adb-reverse] adb is not available; skipping backend port forward.', error.message);
    return [];
  }

  return output
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(line => line.endsWith('\tdevice'))
    .map(line => line.split('\t')[0])
    .filter(serial => !serial.startsWith('emulator-'));
};

const serials = listDeviceSerials();
if (serials.length === 0) {
  console.log('[adb-reverse] No physical Android device attached; nothing to forward.');
  process.exit(0);
}

for (const serial of serials) {
  try {
    execFileSync('adb', ['-s', serial, 'reverse', `tcp:${BACKEND_PORT}`, `tcp:${BACKEND_PORT}`]);
    console.log(`[adb-reverse] Forwarded tcp:${BACKEND_PORT} to device ${serial}.`);
  } catch (error) {
    console.warn(`[adb-reverse] Could not forward tcp:${BACKEND_PORT} to ${serial}.`, error.message);
  }
}
