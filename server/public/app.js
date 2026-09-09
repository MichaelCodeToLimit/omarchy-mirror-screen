(() => {
  // DOM Elements
  const authView = document.getElementById('auth-view');
  const viewerView = document.getElementById('viewer-view');
  const loginForm = document.getElementById('login-form');
  const inputEmail = document.getElementById('input-email');
  const inputPassword = document.getElementById('input-password');
  const authAlert = document.getElementById('auth-alert');
  const btnLogin = document.getElementById('btn-login');
  const btnLoginText = document.getElementById('btn-login-text');
  const brandSubtitle = document.getElementById('brand-subtitle');
  const tabSignin = document.getElementById('tab-signin');
  const tabSignup = document.getElementById('tab-signup');
  const btnToggleAuth = document.getElementById('btn-toggle-auth');

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

  // Remote Desktop UI Elements
  const remoteToolbar = document.getElementById('remote-toolbar');
  const tbPullHandle = document.getElementById('tb-pull-handle');
  const btnMouseRight = document.getElementById('btn-mouse-right');
  const btnDragMode = document.getElementById('btn-drag-mode');
  const btnPaste = document.getElementById('btn-paste-clipboard');
  const btnQualityToggle = document.getElementById('btn-quality-toggle');
  const qualityText = document.getElementById('quality-text');
  const hudModeBadge = document.getElementById('hud-mode-badge');
  const rippleLayer = document.getElementById('touch-ripple-layer');

  // App State
  let supabase = null;
  let serverConfig = null;
  let ws = null;
  let authToken = null;
  let authMode = 'signin'; // 'signin' or 'signup'
  let hostConnected = false;
  let touchMode = 'direct'; // 'direct' or 'trackpad'
  let streamMeta = { width: 1920, height: 1080, mode: 'remote-desktop' };
  let activeModifiers = new Set();
  let dragModeEnabled = false;
  let currentQualityPreset = 'balanced';
  let wakeLock = null;
  
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

    const url = serverConfig.supabaseUrl || '';
    const key = serverConfig.supabaseAnonKey || '';
    initSupabaseClient(url, key);

    // Check for existing session
    try {
      const savedToken = localStorage.getItem('mirrormarch_token');
      if (savedToken) {
        authToken = savedToken;
        startViewer();
        return;
      }
    } catch (e) {}

    if (supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('[MirrorMarch] Found existing session for', session.user.email);
          authToken = session.access_token;
          try { localStorage.setItem('mirrormarch_token', authToken); } catch (e) {}
          startViewer();
          return;
        }
      } catch (e) {
        console.warn('Session check error:', e);
      }
    }
  }

  function initSupabaseClient(url, key) {
    if (url && key && window.supabase) {
      try {
        supabase = window.supabase.createClient(url, key);
        console.log('[MirrorMarch] Supabase client initialized with server config');
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

  function normalizeEmail(input) {
    const trimmed = (input || '').trim();
    if (trimmed.includes('@')) {
      return trimmed;
    }
    const sanitized = trimmed.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    return `${sanitized || 'user'}@mirrormarch.local`;
  }

  // Switch between Sign In and Create Account
  function switchAuthMode(mode) {
    authMode = mode;
    hideAlert();

    if (mode === 'signup') {
      tabSignup.classList.add('active');
      tabSignin.classList.remove('active');
      brandSubtitle.textContent = 'Create an account to access your display';
      btnLoginText.textContent = 'Create Account & Connect';
      btnToggleAuth.innerHTML = 'Already have an account? <span class="link-highlight">Sign In</span>';
    } else {
      tabSignin.classList.add('active');
      tabSignup.classList.remove('active');
      brandSubtitle.textContent = 'Sign in to connect your display';
      btnLoginText.textContent = 'Connect to Display';
      btnToggleAuth.innerHTML = 'Don\'t have an account? <span class="link-highlight">Create one</span>';
    }
  }

  tabSignin.addEventListener('click', () => switchAuthMode('signin'));
  tabSignup.addEventListener('click', () => switchAuthMode('signup'));
  btnToggleAuth.addEventListener('click', () => {
    switchAuthMode(authMode === 'signin' ? 'signup' : 'signin');
  });

  // Form Submit: Sign In or Sign Up (100% in software - zero email confirmation required)
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const rawInput = inputEmail.value.trim();
    const email = normalizeEmail(rawInput);
    const password = inputPassword.value;

    if (!supabase) {
      showAlert('Connecting to authentication server, please wait...');
      return;
    }

    btnLogin.disabled = true;
    btnLoginText.textContent = authMode === 'signup' ? 'Creating Account...' : 'Authenticating...';

    if (authMode === 'signup') {
      // Create Account (Sign Up)
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email,
          password: password
        });

        if (error) {
          // If already registered, seamlessly sign in with the password
          if (error.message.toLowerCase().includes('already registered')) {
            const loginRes = await supabase.auth.signInWithPassword({ email, password });
            if (loginRes.data?.session) {
              authToken = loginRes.data.session.access_token;
              try { localStorage.setItem('mirrormarch_token', authToken); } catch (e) {}
              startViewer();
              return;
            } else {
              showAlert(loginRes.error?.message || error.message);
              btnLogin.disabled = false;
              btnLoginText.textContent = 'Create Account & Connect';
              return;
            }
          }
          showAlert(error.message);
          btnLogin.disabled = false;
          btnLoginText.textContent = 'Create Account & Connect';
          return;
        }

        if (data.session) {
          // Instant software sign in
          authToken = data.session.access_token;
          try { localStorage.setItem('mirrormarch_token', authToken); } catch (e) {}
          startViewer();
        } else if (data.user) {
          // Attempt immediate password sign in to bypass email verification
          const loginRes = await supabase.auth.signInWithPassword({ email, password });
          if (loginRes.data?.session) {
            authToken = loginRes.data.session.access_token;
            try { localStorage.setItem('mirrormarch_token', authToken); } catch (e) {}
            startViewer();
          } else {
            // Software user id fallback token
            authToken = data.user.id || 'usr_' + Date.now();
            try { localStorage.setItem('mirrormarch_token', authToken); } catch (e) {}
            startViewer();
          }
        }
      } catch (err) {
        showAlert(err.message || 'Registration failed');
        btnLogin.disabled = false;
        btnLoginText.textContent = 'Create Account & Connect';
      }
    } else {
      // Sign In mode
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email,
          password: password
        });

        if (error) {
          // If account doesn't exist yet, seamlessly create it
          if (error.message.toLowerCase().includes('invalid login credentials') || error.message.toLowerCase().includes('not found')) {
            const signupRes = await supabase.auth.signUp({ email, password });
            if (signupRes.data?.session) {
              authToken = signupRes.data.session.access_token;
              try { localStorage.setItem('mirrormarch_token', authToken); } catch (e) {}
              startViewer();
              return;
            }
          }
          showAlert(error.message);
          btnLogin.disabled = false;
          btnLoginText.textContent = 'Connect to Display';
          return;
        }

        if (data?.session) {
          authToken = data.session.access_token;
          try { localStorage.setItem('mirrormarch_token', authToken); } catch (e) {}
          startViewer();
        }
      } catch (err) {
        showAlert(err.message || 'Login failed');
        btnLogin.disabled = false;
        btnLoginText.textContent = 'Connect to Display';
      }
    }
  });

  // Switch to Viewer View & connect WebSocket
  async function startViewer() {
    authView.classList.add('hidden');
    viewerView.classList.remove('hidden');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setupRemoteToolbar();
    await requestWakeLock();
    connectWebSocket();
    startHudTimer();
    updateModeBadge();
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
    if (msg.type === 'ready') {
      hostConnected = !!msg.hostConnected;
      if (hostConnected) {
        hudDot.className = 'status-dot connected';
        displayOverlay.classList.add('hidden');
      } else {
        hudDot.className = 'status-dot';
        overlayTitle.textContent = 'Waiting for Omarchy PC...';
        overlayDesc.textContent = 'Click "▶ Start Mirroring" in the Omarchy top bar (󰐱) to begin streaming';
        displayOverlay.classList.remove('hidden');
      }
      if (msg.meta) {
        streamMeta = { ...streamMeta, ...msg.meta };
        updateModeBadge();
      }
    } else if (msg.type === 'host_connected') {
      hostConnected = true;
      hudDot.className = 'status-dot connected';
      displayOverlay.classList.add('hidden');
      if (msg.meta) {
        streamMeta = { ...streamMeta, ...msg.meta };
        updateModeBadge();
      }
    } else if (msg.type === 'host_disconnected') {
      hostConnected = false;
      hudDot.className = 'status-dot';
      overlayTitle.textContent = 'Omarchy PC Offline';
      overlayDesc.textContent = 'Click "▶ Start Mirroring" in the Omarchy top bar (󰐱) to resume';
      displayOverlay.classList.remove('hidden');
    } else if (msg.type === 'meta') {
      streamMeta = { ...streamMeta, ...msg.meta };
      updateModeBadge();
    } else if (msg.type === 'pong') {
      latencyMs = Math.round(performance.now() - msg.time);
      updateStats();
    } else if (msg.type === 'auth_required') {
      logout();
    }
  }

  function updateModeBadge() {
    if (!hudModeBadge) return;
    const mode = streamMeta?.mode || 'remote-desktop';
    if (mode === 'remote-desktop') {
      hudModeBadge.textContent = 'Remote';
      hudModeBadge.style.color = '#38bdf8';
      hudModeBadge.style.borderColor = 'rgba(56, 189, 248, 0.3)';
    } else if (mode === 'extend') {
      hudModeBadge.textContent = 'Extend';
      hudModeBadge.style.color = '#a855f7';
      hudModeBadge.style.borderColor = 'rgba(168, 85, 247, 0.3)';
    } else {
      hudModeBadge.textContent = 'Mirror';
      hudModeBadge.style.color = '#34d399';
      hudModeBadge.style.borderColor = 'rgba(52, 211, 153, 0.3)';
    }
  }

  async function handleFrame(arrayBuffer) {
    try {
      const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
      const imageBitmap = await createImageBitmap(blob);

      renderFrame(imageBitmap);

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

    const scale = Math.min(cWidth / bWidth, cHeight / bHeight);
    const renderW = bWidth * scale;
    const renderH = bHeight * scale;
    const offsetX = (cWidth - renderW) / 2;
    const offsetY = (cHeight - renderH) / 2;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cWidth, cHeight);
    ctx.drawImage(bitmap, offsetX, offsetY, renderW, renderH);

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

  // Visual Touch Ripple Feedback
  function createTouchRipple(clientX, clientY) {
    if (!rippleLayer) return;
    const ripple = document.createElement('div');
    ripple.className = 'touch-ripple';
    ripple.style.left = `${clientX - 18}px`;
    ripple.style.top = `${clientY - 18}px`;
    rippleLayer.appendChild(ripple);
    setTimeout(() => {
      ripple.remove();
    }, 450);
  }

  // Keep screen awake (Wake Lock API)
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch (err) {
        console.warn('[MirrorMarch] Wake Lock error:', err);
      }
    }
  }

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && !viewerView.classList.contains('hidden')) {
      await requestWakeLock();
    }
  });

  // Pointer / Touch Events
  canvas.addEventListener('pointerdown', (e) => {
    isPointerDown = true;
    touchStartTime = performance.now();
    touchStartX = e.clientX;
    touchStartY = e.clientY;
    touchMoved = false;

    showHudTemporarily();
    createTouchRipple(e.clientX, e.clientY);

    const coords = getNormalizedCoordinates(e.clientX, e.clientY);

    if (dragModeEnabled) {
      if (coords) {
        sendInput({ action: 'mouse_down', button: 'left', x: coords.x, y: coords.y });
      }
      return;
    }

    if (touchMode === 'direct') {
      if (coords) {
        sendInput({ action: 'move', x: coords.x, y: coords.y });
        
        longPressTimer = setTimeout(() => {
          if (!touchMoved && isPointerDown) {
            sendInput({ action: 'click', button: 'right', x: coords.x, y: coords.y });
            createTouchRipple(e.clientX, e.clientY);
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

    if (touchMode === 'direct' || dragModeEnabled) {
      const coords = getNormalizedCoordinates(e.clientX, e.clientY);
      if (coords) {
        sendInput({ action: 'move', x: coords.x, y: coords.y });
      }
    } else {
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

    const coords = getNormalizedCoordinates(e.clientX, e.clientY);

    if (dragModeEnabled) {
      if (coords) {
        sendInput({ action: 'mouse_up', button: 'left', x: coords.x, y: coords.y });
      }
      return;
    }

    const duration = performance.now() - touchStartTime;

    if (!touchMoved && duration < 350) {
      if (touchMode === 'direct') {
        if (coords) {
          sendInput({ action: 'click', button: 'left', x: coords.x, y: coords.y });
        }
      } else {
        sendInput({ action: 'click', button: 'left' });
      }
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    sendInput({ action: 'scroll', dx: e.deltaX, dy: e.deltaY });
  }, { passive: false });

  // Remote Desktop Toolbar Wiring
  let toolbarInitialized = false;
  function setupRemoteToolbar() {
    if (toolbarInitialized || !remoteToolbar) return;
    toolbarInitialized = true;

    // Pull handle minimize toggle
    if (tbPullHandle) {
      tbPullHandle.addEventListener('click', (e) => {
        e.stopPropagation();
        remoteToolbar.classList.toggle('minimized');
      });
    }

    // Modifier buttons latching
    const modButtons = remoteToolbar.querySelectorAll('.tb-btn-mod');
    modButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mod = btn.getAttribute('data-mod');
        if (activeModifiers.has(mod)) {
          activeModifiers.delete(mod);
          btn.classList.remove('active');
        } else {
          activeModifiers.add(mod);
          btn.classList.add('active');
        }
      });
    });

    function clearModifiers() {
      activeModifiers.clear();
      modButtons.forEach(b => b.classList.remove('active'));
    }

    // Quick Action shortcuts
    const actionButtons = remoteToolbar.querySelectorAll('[data-shortcut]');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const shortcut = btn.getAttribute('data-shortcut');
        if (shortcut === 'launcher') {
          // Omarchy Menu: Super + Space
          sendInput({ action: 'key_combination', modifiers: ['super'], key: 'space' });
        } else if (shortcut === 'terminal') {
          // Terminal: Super + Return
          sendInput({ action: 'key_combination', modifiers: ['super'], key: 'Return' });
        } else if (shortcut === 'close') {
          // Close Window: Super + W
          sendInput({ action: 'key_combination', modifiers: ['super'], key: 'w' });
        }
      });
    });

    // Special Keys (Tab, Escape)
    const keyButtons = remoteToolbar.querySelectorAll('[data-key]');
    keyButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-key');
        if (activeModifiers.size > 0) {
          sendInput({
            action: 'key_combination',
            modifiers: Array.from(activeModifiers),
            key: key
          });
          clearModifiers();
        } else {
          sendInput({ action: 'key_press', key: key });
        }
      });
    });

    // Right Click Button
    if (btnMouseRight) {
      btnMouseRight.addEventListener('click', (e) => {
        e.stopPropagation();
        sendInput({ action: 'click', button: 'right' });
        createTouchRipple(window.innerWidth / 2, window.innerHeight / 2);
      });
    }

    // Drag Mode Toggle Button
    if (btnDragMode) {
      btnDragMode.addEventListener('click', (e) => {
        e.stopPropagation();
        dragModeEnabled = !dragModeEnabled;
        btnDragMode.classList.toggle('active', dragModeEnabled);
        btnDragMode.textContent = dragModeEnabled ? 'Drag Mode: ON' : 'Drag Mode: OFF';
      });
    }

    // Paste text button
    if (btnPaste) {
      btnPaste.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            if (text) {
              sendInput({ action: 'type_text', text });
              return;
            }
          }
        } catch (err) {}
        const text = prompt('Enter text to type on Omarchy PC:');
        if (text) {
          sendInput({ action: 'type_text', text });
        }
      });
    }

    // Stream Performance / Quality preset switcher
    if (btnQualityToggle) {
      const presets = [
        { name: 'balanced', label: 'Balanced', quality: 65, fps: 30 },
        { name: 'hq', label: 'HQ', quality: 85, fps: 20 },
        { name: 'speed', label: 'Speed', quality: 45, fps: 40 }
      ];
      let presetIndex = 0;

      btnQualityToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        presetIndex = (presetIndex + 1) % presets.length;
        const p = presets[presetIndex];
        currentQualityPreset = p.name;
        if (qualityText) qualityText.textContent = p.label;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'tune',
            quality: p.quality,
            fps: p.fps
          }));
        }
      });
    }
  }

  btnKeyboard.addEventListener('click', (e) => {
    e.stopPropagation();
    virtualInput.focus();
  });

  virtualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
      if (activeModifiers.size > 0) {
        sendInput({
          action: 'key_combination',
          modifiers: Array.from(activeModifiers),
          key: e.key
        });
        activeModifiers.clear();
        document.querySelectorAll('.tb-btn-mod').forEach(b => b.classList.remove('active'));
      } else {
        sendInput({ action: 'key_press', key: e.key });
      }
    }
  });

  virtualInput.addEventListener('input', (e) => {
    if (e.data) {
      sendInput({ action: 'type_text', text: e.data });
    }
    virtualInput.value = '';
  });

  btnModeToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    touchMode = touchMode === 'direct' ? 'trackpad' : 'direct';
    modeText.textContent = touchMode === 'direct' ? 'Direct Touch' : 'Trackpad';
  });

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
    btnLoginText.textContent = 'Connect to Display';
  }

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
