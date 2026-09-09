const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocket } = require('../server/node_modules/ws');

// Command line arguments
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}
function hasArg(flag) {
  return args.includes(flag);
}

const MODE = getArg('--mode', 'mirror'); // 'mirror' or 'extend'
const TARGET_FPS = parseInt(getArg('--fps', '30'), 10);
const QUALITY = parseInt(getArg('--quality', '65'), 10);
const RENDER_URL = getArg('--render-url', process.env.MIRRORMARCH_RENDER_URL || 'https://mirrormarch.onrender.com');
const VIRTUAL_RES = getArg('--virtual-res', '2048x1536'); // iPad Retina default
let TARGET_OUTPUT = getArg('--output', '');

const HOME = os.homedir();
const STATE_DIR = path.join(HOME, '.local/state/omarchy');
const STATE_FILE = path.join(STATE_DIR, 'mirrormarch.json');
const PID_FILE = path.join(STATE_DIR, 'mirrormarch.pid');

let localIp = '127.0.0.1';
try {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (!net.address.startsWith('100.')) { // prefer local LAN over tailscale
          localIp = net.address;
          break;
        } else if (localIp === '127.0.0.1') {
          localIp = net.address;
        }
      }
    }
  }
} catch (e) {}

let inputInjector = null;
let captureTimer = null;
let isCapturing = false;
let isShuttingDown = false;
let wsRelay = null;
let viewersCount = 0;
let lastUser = null;
let framesSent = 0;
let lastFpsCheck = Date.now();
let actualFps = 0;
let localServerProc = null;

// Ensure state dir
fs.mkdirSync(STATE_DIR, { recursive: true });

function writeState(running = true) {
  const state = {
    running,
    pid: process.pid,
    mode: MODE,
    output: TARGET_OUTPUT,
    resolution: MODE === 'extend' ? VIRTUAL_RES : '1920x1080',
    fps: actualFps,
    targetFps: TARGET_FPS,
    quality: QUALITY,
    port: PORT,
    localUrl: `http://${localIp}:${PORT}`,
    renderUrl: RENDER_URL || '',
    viewersCount,
    lastUser,
    updatedAt: Date.now()
  };
  const tmpFile = STATE_FILE + '.tmp';
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
    fs.renameSync(tmpFile, STATE_FILE);
  } catch (e) {}
}

// Find primary display if not specified
if (!TARGET_OUTPUT) {
  try {
    const rawMonitors = execSync('hyprctl monitors -j').toString();
    const monitors = JSON.parse(rawMonitors);
    if (monitors && monitors.length > 0) {
      const focused = monitors.find(m => m.focused) || monitors[0];
      TARGET_OUTPUT = focused.name;
    } else {
      TARGET_OUTPUT = 'DP-1';
    }
  } catch (e) {
    TARGET_OUTPUT = 'DP-1';
  }
}

// Setup Virtual Output if in 'extend' mode
if (MODE === 'extend') {
  console.log(`[MirrorMarch] Creating virtual headless display (${VIRTUAL_RES})...`);
  TARGET_OUTPUT = 'HEADLESS-1';
  try {
    execSync('hyprctl output create headless HEADLESS-1');
    // Position to the right of primary monitor at 1920x0
    execSync(`hyprctl keyword monitor "HEADLESS-1,${VIRTUAL_RES}@60,1920x0,1"`);
    console.log('[MirrorMarch] Virtual output HEADLESS-1 created');
  } catch (e) {
    console.warn('[MirrorMarch] Headless output creation note:', e.message);
  }
}

// Start Input Injector helper
function startInputInjector() {
  const injectorPath = path.join(__dirname, 'input_injector.py');
  inputInjector = spawn('python3', [injectorPath], {
    stdio: ['pipe', 'inherit', 'inherit']
  });
  inputInjector.on('exit', (code) => {
    if (!isShuttingDown) {
      console.warn('[MirrorMarch] Input injector exited with code', code);
    }
  });
}
startInputInjector();

// Start Local Server if requested or if no external Render URL
function ensureLocalServer() {
  const serverPath = path.join(__dirname, '../server/server.js');
  localServerProc = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit'
  });
  localServerProc.on('exit', (code) => {
    if (!isShuttingDown) console.warn('[MirrorMarch] Local server exited with code', code);
  });
}
ensureLocalServer();

// Connect to Relay (Local or Render)
function connectToRelay() {
  const wsTarget = RENDER_URL 
    ? (RENDER_URL.replace(/^http/, 'ws') + '/ws/host')
    : `ws://127.0.0.1:${PORT}/ws/host`;

  console.log(`[MirrorMarch] Connecting daemon to relay: ${wsTarget}`);
  wsRelay = new WebSocket(wsTarget);

  wsRelay.on('open', () => {
    console.log('[MirrorMarch] Connected to WebSocket relay');
    wsRelay.send(JSON.stringify({
      type: 'meta',
      meta: {
        mode: MODE,
        output: TARGET_OUTPUT,
        resolution: MODE === 'extend' ? VIRTUAL_RES : '1920x1080',
        fps: TARGET_FPS,
        quality: QUALITY
      }
    }));
  });

  wsRelay.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'init') {
        viewersCount = msg.viewersCount || 0;
        writeState(true);
      } else if (msg.type === 'viewer_joined') {
        viewersCount = msg.count;
        lastUser = msg.user || lastUser;
        console.log(`[MirrorMarch] Viewer joined (${msg.user || 'viewer'}). Total: ${viewersCount}`);
        writeState(true);
        if (captureTimer) clearTimeout(captureTimer);
        captureFrame();
      } else if (msg.type === 'viewer_left') {
        viewersCount = msg.count;
        console.log(`[MirrorMarch] Viewer left. Total: ${viewersCount}`);
        writeState(true);
      } else if (msg.type === 'input') {
        // Feed input event to input_injector
        if (inputInjector && inputInjector.stdin.writable) {
          inputInjector.stdin.write(JSON.stringify(msg) + '\n');
        }
      }
    } catch (e) {}
  });

  wsRelay.on('close', () => {
    console.log('[MirrorMarch] Relay connection closed. Retrying in 2s...');
    if (!isShuttingDown) {
      setTimeout(connectToRelay, 2000);
    }
  });

  wsRelay.on('error', (err) => {
    console.error('[MirrorMarch] Relay connection error:', err.message);
  });
}

// Connect after giving the local server 500ms to bind
setTimeout(connectToRelay, 500);

// Capture Loop using grim
function captureFrame() {
  if (isShuttingDown) return;

  // If no viewers are connected, capture at a slow idle rate (1 frame per 2 sec)
  const delay = (viewersCount > 0) ? Math.max(16, Math.floor(1000 / TARGET_FPS)) : 2000;

  if (viewersCount === 0 && !wsRelay) {
    captureTimer = setTimeout(captureFrame, delay);
    return;
  }

  isCapturing = true;
  const grim = spawn('grim', ['-o', TARGET_OUTPUT, '-t', 'jpeg', '-q', String(QUALITY), '-']);
  const chunks = [];

  grim.stdout.on('data', (d) => chunks.push(d));
  grim.on('close', (code) => {
    isCapturing = false;
    if (code === 0 && wsRelay && wsRelay.readyState === WebSocket.OPEN) {
      const frameBuffer = Buffer.concat(chunks);
      wsRelay.send(frameBuffer, { binary: true });
      framesSent++;

      const now = Date.now();
      if (now - lastFpsCheck >= 1000) {
        actualFps = framesSent;
        framesSent = 0;
        lastFpsCheck = now;
        writeState(true);
      }
    }
    if (!isShuttingDown) {
      captureTimer = setTimeout(captureFrame, delay);
    }
  });

  grim.on('error', (err) => {
    isCapturing = false;
    if (!isShuttingDown) {
      captureTimer = setTimeout(captureFrame, 1000);
    }
  });
}

// Start capture
captureTimer = setTimeout(captureFrame, 1000);

// Clean exit
function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n[MirrorMarch] Stopping daemon...');

  clearTimeout(captureTimer);

  if (wsRelay) {
    try { wsRelay.close(); } catch (e) {}
  }

  if (inputInjector) {
    try { inputInjector.kill(); } catch (e) {}
  }

  if (localServerProc) {
    try { localServerProc.kill(); } catch (e) {}
  }

  if (MODE === 'extend') {
    try {
      console.log('[MirrorMarch] Removing virtual headless display HEADLESS-1...');
      execSync('hyprctl output remove HEADLESS-1');
    } catch (e) {}
  }

  writeState(false);
  try { fs.unlinkSync(PID_FILE); } catch (e) {}
  process.exit(0);
}

process.on("SIGINT", () => { console.log("[MirrorMarch] Received SIGINT"); cleanup(); });
process.on("SIGTERM", () => { console.log("[MirrorMarch] Received SIGTERM"); cleanup(); });
process.on("SIGHUP", () => { console.log("[MirrorMarch] Received SIGHUP"); cleanup(); });

fs.writeFileSync(PID_FILE, String(process.pid));
writeState(true);

console.log('=========================================');
console.log(`  MirrorMarch Daemon Active (PID ${process.pid})`);
console.log(`  Mode: ${MODE.toUpperCase()} (Output: ${TARGET_OUTPUT})`);
console.log(`  Local Web: http://${localIp}:${PORT}`);
if (RENDER_URL) console.log(`  Render Web: ${RENDER_URL}`);
console.log('=========================================');

process.on('uncaughtException', (err) => {
  console.error('[MirrorMarch] Uncaught Exception:', err);
  cleanup();
});
process.on('unhandledRejection', (reason) => {
  console.error('[MirrorMarch] Unhandled Rejection:', reason);
});
