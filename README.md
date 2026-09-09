# MirrorMarch 󰐱

> Low-latency display mirroring & second-screen extension for iPad on [Omarchy](https://omarchy.org/) Linux, authenticated with **Supabase** and deployable to **Render**.

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

Scan the QR code with your iPad camera or open `http://<your-ip>:4000` in Safari.

---

## ☁️ Deploying to Render

To access your display from anywhere via Render:

### 1. Push to GitHub
Create a GitHub repository for your `mirrormarch` server or fork the project:
```bash
cd ~/.config/omarchy/plugins/michael.mirrormarch
git init
git add .
git commit -m "feat: MirrorMarch display streaming"
git remote add origin git@github.com:YOUR_USERNAME/mirrormarch.git
git push -u origin main
```

### 2. Deploy on Render
1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **Blueprint** (or **Web Service**).
3. Connect your repository. Render will automatically detect `server/render.yaml`.
4. Configure Environment Variables:
   - `SUPABASE_URL`: Your Supabase project URL (e.g. `https://xxxx.supabase.co`)
   - `SUPABASE_ANON_KEY`: Your Supabase Anon Public Key
   - `AUTH_REQUIRED`: `true`
5. Click **Apply** or **Deploy**.
6. Render will generate your live URL (e.g., `https://mirrormarch.onrender.com`).

### 3. Connect Omarchy to your Render URL
In Omarchy, configure your Render URL:
```bash
mirrormarch start --render-url https://mirrormarch.onrender.com
```
Or set it in the Omarchy Bar Widget settings panel!

---

## 🔐 Supabase Configuration

1. Create a project at [supabase.com](https://supabase.com).
2. Under **Authentication** → **Users**, click **Add User** (Create User with Email & Password).
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

## 📄 Architecture

```
┌─────────────────┐       WebSocket Frame Stream       ┌──────────────────┐
│  Omarchy Host   │ ─────────────────────────────────> │   Render Server  │
│  (Hyprland PC)  │ <───────────────────────────────── │ (Relay & Static) │
└─────────────────┘       Touch & Keystroke Input      └──────────────────┘
   ▲                                                             ▲
   │ /dev/uinput & grim                                          │ Supabase JWT Auth
   │                                                             ▼
┌──────────────────┐                                   ┌──────────────────┐
│  Omarchy Shell   │                                   │   iPad Client    │
│    Bar Widget    │                                   │  (Safari PWA)    │
└──────────────────┘                                   └──────────────────┘
```

---

## 📜 License

MIT © Michael Davies
