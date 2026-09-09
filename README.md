# MirrorMarch 󰐱

> Low-latency display mirroring & second-screen extension for iPad on [Omarchy](https://omarchy.org/) Linux, authenticated with **Supabase** and deployable to **Render**.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/MichaelCodeToLimit/omarchy-mirror-screen)

---

## 🌟 Overview

**MirrorMarch** turns your iPad, tablet, or browser into an interactive second display or mirror of your Omarchy Hyprland desktop:

- **🔐 Supabase Authentication**: Secure user login ensuring only authorized devices can stream your screen.
- **☁️ Render Ready**: Out-of-the-box support for deploying as a web service on Render with `render.yaml` and `Dockerfile`.
- **⚡ Ultra Low Latency**: 30–60 FPS display streaming over WebSockets with GPU-accelerated canvas decoding (`createImageBitmap`).
- **📱 Native iPad Touch & Gestures**:
  - Direct Touch: Tap to click, press-and-hold for right-click, drag to move.
  - Trackpad Mode: Smooth relative cursor navigation.
  - Virtual Keyboard: Tap to bring up the native iOS iPad on-screen keyboard to type into any Linux application.
  - Two-finger scrolling and zooming.
- **🖥️ Two Display Modes**:
  - **Mirror Mode**: Replicates your main monitor (`DP-1`) in real-time.
  - **Extend Mode**: Creates a dedicated virtual headless display (`HEADLESS-1`) matching your iPad's exact resolution, providing a true separate workspace.
- **🎨 Omarchy Bar Widget**: Status bar icon showing live status, FPS counter, connected clients badge, and a popup panel with mode switching and camera-scannable QR code.

---

## 🚀 Quick Start (Local Wi-Fi / Direct)

You can use MirrorMarch immediately on your local Wi-Fi or Tailscale network without waiting for cloud deployment:

```bash
# Start mirroring primary display
mirrormarch start --mode mirror

# Or extend to a virtual second display for iPad
mirrormarch start --mode extend

# Show iPad camera QR code
mirrormarch qrcode

# Open in local browser
mirrormarch open
```

Scan the QR code with your iPad camera or open `http://<your-pc-ip>:4000` in Safari.

---

## ☁️ Deploying to Render

### Option A: One-Click Deploy Button
Click the button below to deploy directly to Render:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/MichaelCodeToLimit/omarchy-mirror-screen)

### Option B: Manual Render Deployment
1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **Blueprint** (or **Web Service**).
3. Connect your repository: `MichaelCodeToLimit/omarchy-mirror-screen`.
4. Render will automatically detect `render.yaml`.
5. Set your Environment Variables:
   - `SUPABASE_URL`: Your Supabase project URL (e.g. `https://xxxx.supabase.co`)
   - `SUPABASE_ANON_KEY`: Your Supabase Anon Public Key
   - `AUTH_REQUIRED`: `true`
6. Click **Apply** or **Deploy**.
7. Render will provide your public URL (e.g., `https://omarchy-mirror-screen.onrender.com`).

### Connecting Omarchy to your Render URL
```bash
mirrormarch start --render-url https://omarchy-mirror-screen.onrender.com
```
Or enter your Render URL into the Omarchy Bar Widget settings panel.

---

## 🔐 Supabase Configuration

1. Create a project at [supabase.com](https://supabase.com).
2. Under **Authentication** → **Users**, click **Add User** (create user with Email & Password).
3. Under **Project Settings** → **API**, copy:
   - **Project URL**
   - **anon / public key**
4. Paste them into Render's Environment Variables, or enter them directly into the MirrorMarch login page settings on your iPad!

---

## 🎛️ Omarchy Bar Widget

The MirrorMarch bar widget appears automatically in your Omarchy status bar:

- **Dimmed Icon (`󰐱 Mirror`)**: Stopped.
- **Amber Icon (`󰐱 Ready`)**: Server online, waiting for iPad to connect.
- **Green Icon (`󰐱 30 FPS`)**: Active stream connected to iPad!

### Widget Controls:
- **Left-Click**: Opens the control panel.
- **Right-Click**: Fast one-click toggle (starts/stops mirroring).
- **In Panel**:
  - `Space` or `S`: Toggle streaming
  - `M`: Switch to Mirror mode
  - `E`: Switch to Extend (virtual headless monitor) mode
  - `O`: Open web viewer in browser
  - `Q` or `Esc`: Dismiss panel

---

## 💻 CLI Reference

```bash
mirrormarch start [--mode mirror|extend] [--fps 30] [--quality 65] [--render-url URL]
mirrormarch stop
mirrormarch toggle
mirrormarch status
mirrormarch open
mirrormarch qrcode
```

---

## 📜 License

MIT © Michael Davies
