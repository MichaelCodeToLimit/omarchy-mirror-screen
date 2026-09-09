(() => {
  // DOM Elements
  const authView = document.getElementById('auth-view');
  const viewerView = document.getElementById('viewer-view');
  const loginForm = document.getElementById('login-form');
  const inputEmail = document.getElementById('input-email');
  const inputPassword = document.getElementById('input-password');
  const authAlert = document.getElementById('auth-alert');
  const btnLogin = document.getElementById('btn-login');
  const btnQuickConnect = document.getElementById('btn-quick-connect');
  const btnToggleConfig = document.getElementById('btn-toggle-config');
  const configDrawer = document.getElementById('supabase-config-drawer');
  const cfgSupabaseUrl = document.getElementById('cfg-supabase-url');
  const cfgSupabaseAnon = document.getElementById('cfg-supabase-anon');
  const btnSaveConfig = document.getElementById('btn-save-config');

  const canvas = document.getElementById('display-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const displayOverlay = document.getElementById('display-overlay');
  const overlayTitle = document.getElementById('overlay-status-title');
  const overlayDesc = document.getElementById('overlay-status-desc');
  const hudBar = document.getElementById('hud-bar');
  const hudDot = document.getElementById('hud-dot');
  const hudStats = document.getElementById('hud-stats');
  const btnModeToggle = document.getElementById('btn-mode-toggle');
  const modeText = document.getElementById('mode-text');
  const btnKeyboard = document.getElementById('btn-keyboard-toggle');
  const virtualInput = document.getElementById('virtual-keyboard-input');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const iconFsEnter = document.getElementById('icon-fs-enter');
  const iconFsExit = document.getElementById('icon-fs-exit');
  const btnLogout = document.getElementById('btn-logout');

  // App State
  let supabase = null;
  let serverConfig = null;
  let ws = null;
  let authToken = null;
  let hostConnected = false;
  let touchMode = 'direct'; // 'direct' or 'trackpad'
  let streamMeta = { width: 1920, height: 1080, mode: 'mirror' };
  
  // Stats
  let fps = 0;
  let framesThisSecond = 0;
  let lastFpsTime = performance.now();
  let latencyMs = 0;
  let pingTimer = null;
  let hudHideTimeout = null;

  // Trackpad / touch gesture tracking
  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoved = false;
  let isPointerDown = false;
  let longPressTimer = null;

  // Initialize
  async function init() {
    try {
      const res = await fetch('/api/config');
      serverConfig = await res.json();
    } catch (e) {
      console.warn('Could not load server config:', e);
      serverConfig = { authRequired: false };
    }

    // Load custom Supabase credentials from localStorage or server config
    const savedUrl = localStorage.getItem('mm_supabase_url') || serverConfig.supabaseUrl || '';
    const savedAnon = localStorage.getItem('mm_supabase_anon') || serverConfig.supabaseAnonKey || '';
    
    cfgSupabaseUrl.value = savedUrl;
    cfgSupabaseAnon.value = savedAnon;

    initSupabaseClient(savedUrl, savedAnon);

    // Check for existing session
    if (supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('[MirrorMarch] Found existing session for', session.user.email);
          authToken = session.access_token;
          startViewer();
          return;
        }
      } catch (e) {
        console.warn('Session check error:', e);
      }
    }

    if (!serverConfig.authRequired) {
      btnQuickConnect.classList.remove('hidden');
    }
  }

  function initSupabaseClient(url, key) {
    if (url && key && window.supabase) {
      try {
        supabase = window.supabase.createClient(url, key);
        console.log('[MirrorMarch] Supabase client initialized');
      } catch (e) {
        console.error('Failed to init Supabase:', e);
      }
    }
  }

  function showAlert(message, type = 'error') {
    authAlert.textContent = message;
    authAlert.className = `alert alert-${type}`;
    authAlert.classList.remove('hidden');
  }

  function hideAlert() {
    authAlert.classList.add('hidden');
  }

  // Toggle Config Drawer
  btnToggleConfig.addEventListener('click', () => {
    configDrawer.classList.toggle('hidden');
  });

  btnSaveConfig.addEventListener('click', () => {
    const url = cfgSupabaseUrl.value.trim();
    const key = cfgSupabaseAnon.value.trim();
    if (!url || !key) {
      showAlert('Please enter both Supabase URL and Anon Key');
      return;
    }
    localStorage.setItem('mm_supabase_url', url);
    localStorage.setItem('mm_supabase_anon', key);
    initSupabaseClient(url, key);
    showAlert('Supabase settings saved!', 'info');
    configDrawer.classList.add('hidden');
  });

  // Login Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email = inputEmail.value.trim();
    const password = inputPassword.value;

    if (!supabase) {
      // If Supabase credentials are missing, warn the user
      const url = cfgSupabaseUrl.value.trim();
      const key = cfgSupabaseAnon.value.trim();
      if (!url || !key) {
        showAlert('Supabase not configured. Click "Supabase Project Settings" below to enter credentials.');
        configDrawer.classList.remove('hidden');
        return;
      }
      initSupabaseClient(url, key);
    }

    btnLogin.disabled = true;
    btnLogin.querySelector('.btn-text').textContent = 'Authenticating...';

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        showAlert(error.message);
        btnLogin.disabled = false;
        btnLogin.querySelector('.btn-text').textContent = 'Connect to Display';
        return;
      }

      authToken = data.session.access_token;
      startViewer();
    } catch (err) {
      showAlert(err.message || 'Login failed');
      btnLogin.disabled = false;
      btnLogin.querySelector('.btn-text').textContent = 'Connect to Display';
    }
  });

  // Quick Connect / Bypass Auth
  btnQuickConnect.addEventListener('click', () => {
    authToken = 'guest-token';
    startViewer();
  });

  // Switch to Viewer View & connect WebSocket
  function startViewer() {
    authView.classList.add('hidden');
    viewerView.classList.remove('hidden');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    connectWebSocket();
    startHudTimer();
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
  }

  // WebSocket Connection
  function connectWebSocket() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${location.host}/ws/viewer${authToken ? '?token=' + encodeURIComponent(authToken) : ''}`;

    overlayTitle.textContent = 'Connecting to Omarchy...';
    overlayDesc.textContent = 'Establishing WebSocket connection';
    displayOverlay.classList.remove('hidden');

    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[MirrorMarch] Connected to relay server');
      if (authToken) {
        ws.send(JSON.stringify({ type: 'auth', token: authToken }));
      }
      startPing();
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          handleControlMessage(msg);
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      } else {
        // Binary frame (JPEG image)
        handleFrame(event.data);
      }
    };

    ws.onclose = (event) => {
      console.log('[MirrorMarch] WebSocket closed:', event.code, event.reason);
      hostConnected = false;
      hudDot.className = 'status-dot';
      stopPing();

      if (event.code === 4001) {
        // Unauthorized
        alert('Authentication expired. Please sign in again.');
        logout();
        return;
      }

      overlayTitle.textContent = 'Disconnected';
      overlayDesc.textContent = 'Reconnecting in 2 seconds...';
      displayOverlay.classList.remove('hidden');
      setTimeout(() => {
        if (!authView.classList.contains('hidden')) return;
        connectWebSocket();
      }, 2000);
    };

    ws.onerror = (err) => {
      console.error('[MirrorMarch] WebSocket error:', err);
    };
  }

  function handleControlMessage(msg) {
    if (msg.type === 'ready' || msg.type === 'host_connected') {
      hostConnected = true;
      hudDot.className = 'status-dot connected';
      displayOverlay.classList.add('hidden');
      if (msg.meta) {
        streamMeta = { ...streamMeta, ...msg.meta };
      }
    } else if (msg.type === 'host_disconnected') {
      hostConnected = false;
      hudDot.className = 'status-dot';
      overlayTitle.textContent = 'Omarchy PC Offline';
      overlayDesc.textContent = 'Start MirrorMarch on your Linux desktop to resume';
      displayOverlay.classList.remove('hidden');
    } else if (msg.type === 'meta') {
      streamMeta = { ...streamMeta, ...msg.meta };
    } else if (msg.type === 'pong') {
      latencyMs = Math.round(performance.now() - msg.time);
      updateStats();
    } else if (msg.type === 'auth_required') {
      logout();
    }
  }

  async function handleFrame(arrayBuffer) {
    try {
      const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
      const imageBitmap = await createImageBitmap(blob);

      // Render frame smoothly
      renderFrame(imageBitmap);

      // Calculate FPS
      framesThisSecond++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        fps = framesThisSecond;
        framesThisSecond = 0;
        lastFpsTime = now;
        updateStats();
      }

      if (!hostConnected) {
        hostConnected = true;
        hudDot.className = 'status-dot connected';
        displayOverlay.classList.add('hidden');
      }
    } catch (e) {
      console.warn('Frame render error:', e);
    }
  }

  function renderFrame(bitmap) {
    const cWidth = canvas.width;
    const cHeight = canvas.height;
    const bWidth = bitmap.width;
    const bHeight = bitmap.height;

    // Aspect ratio letterboxing
    const scale = Math.min(cWidth / bWidth, cHeight / bHeight);
    const renderW = bWidth * scale;
    const renderH = bHeight * scale;
    const offsetX = (cWidth - renderW) / 2;
    const offsetY = (cHeight - renderH) / 2;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cWidth, cHeight);
    ctx.drawImage(bitmap, offsetX, offsetY, renderW, renderH);

    // Save image bounds for touch coordinate translation
    canvas._imageBounds = {
      offsetX: offsetX / window.devicePixelRatio,
      offsetY: offsetY / window.devicePixelRatio,
      renderW: renderW / window.devicePixelRatio,
      renderH: renderH / window.devicePixelRatio,
      nativeW: bWidth,
      nativeH: bHeight
    };
  }

  function updateStats() {
    hudStats.textContent = `${fps} FPS • ${latencyMs}ms`;
  }

  function startPing() {
    stopPing();
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', time: performance.now() }));
      }
    }, 2000);
  }

  function stopPing() {
    if (pingTimer) clearInterval(pingTimer);
  }

  // =========================================================================
  // TOUCH & INPUT HANDLING
  // =========================================================================

  function getNormalizedCoordinates(clientX, clientY) {
    const bounds = canvas._imageBounds;
    if (!bounds || bounds.renderW === 0 || bounds.renderH === 0) return null;

    const relX = clientX - bounds.offsetX;
    const relY = clientY - bounds.offsetY;

    if (relX < 0 || relX > bounds.renderW || relY < 0 || relY > bounds.renderH) {
      return null;
    }

    return {
      x: relX / bounds.renderW,
      y: relY / bounds.renderH
    };
  }

  function sendInput(data) {
    if (ws && ws.readyState === WebSocket.OPEN && hostConnected) {
      ws.send(JSON.stringify({ type: 'input', ...data }));
    }
  }

  // Pointer / Touch Events
  canvas.addEventListener('pointerdown', (e) => {
    isPointerDown = true;
    touchStartTime = performance.now();
    touchStartX = e.clientX;
    touchStartY = e.clientY;
    touchMoved = false;

    showHudTemporarily();

    if (touchMode === 'direct') {
      const coords = getNormalizedCoordinates(e.clientX, e.clientY);
      if (coords) {
        sendInput({ action: 'move', x: coords.x, y: coords.y });
        
        // Long press for right-click
        longPressTimer = setTimeout(() => {
          if (!touchMoved && isPointerDown) {
            sendInput({ action: 'click', button: 'right', x: coords.x, y: coords.y });
            longPressTimer = null;
          }
        }, 450);
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isPointerDown) return;

    const dist = Math.hypot(e.clientX - touchStartX, e.clientY - touchStartY);
    if (dist > 8) {
      touchMoved = true;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    if (touchMode === 'direct') {
      const coords = getNormalizedCoordinates(e.clientX, e.clientY);
      if (coords) {
        sendInput({ action: 'move', x: coords.x, y: coords.y });
      }
    } else {
      // Trackpad mode: relative movement
      const dx = (e.clientX - touchStartX) / window.innerWidth;
      const dy = (e.clientY - touchStartY) / window.innerHeight;
      sendInput({ action: 'rel_move', dx: dx * 2.0, dy: dy * 2.0 });
      touchStartX = e.clientX;
      touchStartY = e.clientY;
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    isPointerDown = false;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    const duration = performance.now() - touchStartTime;

    if (!touchMoved && duration < 350) {
      // Normal Left Click
      if (touchMode === 'direct') {
        const coords = getNormalizedCoordinates(e.clientX, e.clientY);
        if (coords) {
          sendInput({ action: 'click', button: 'left', x: coords.x, y: coords.y });
        }
      } else {
        sendInput({ action: 'click', button: 'left' });
      }
    }
  });

  // Two-finger gestures / Wheel
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    sendInput({ action: 'scroll', dx: e.deltaX, dy: e.deltaY });
  }, { passive: false });

  // Virtual Keyboard Input for iPad
  btnKeyboard.addEventListener('click', (e) => {
    e.stopPropagation();
    virtualInput.focus();
  });

  virtualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
      sendInput({ action: 'key_press', key: e.key });
    }
  });

  virtualInput.addEventListener('input', (e) => {
    if (e.data) {
      sendInput({ action: 'type_text', text: e.data });
    }
    virtualInput.value = '';
  });

  // Mode Toggle (Direct Touch vs Trackpad)
  btnModeToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    touchMode = touchMode === 'direct' ? 'trackpad' : 'direct';
    modeText.textContent = touchMode === 'direct' ? 'Direct Touch' : 'Trackpad';
  });

  // Fullscreen Toggle
  btnFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      iconFsEnter.classList.add('hidden');
      iconFsExit.classList.remove('hidden');
    } else {
      document.exitFullscreen().catch(() => {});
      iconFsEnter.classList.remove('hidden');
      iconFsExit.classList.add('hidden');
    }
  });

  // Logout
  btnLogout.addEventListener('click', (e) => {
    e.stopPropagation();
    logout();
  });

  async function logout() {
    if (supabase) {
      try { await supabase.auth.signOut(); } catch (e) {}
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    authToken = null;
    viewerView.classList.add('hidden');
    authView.classList.remove('hidden');
    btnLogin.disabled = false;
    btnLogin.querySelector('.btn-text').textContent = 'Connect to Display';
  }

  // HUD Auto-hide
  function startHudTimer() {
    clearTimeout(hudHideTimeout);
    hudHideTimeout = setTimeout(() => {
      hudBar.classList.add('hud-hidden');
    }, 3500);
  }

  function showHudTemporarily() {
    hudBar.classList.remove('hud-hidden');
    startHudTimer();
  }

  document.addEventListener('mousemove', showHudTemporarily);
  document.addEventListener('touchstart', showHudTemporarily, { passive: true });

  init();
})();
