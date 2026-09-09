import QtQuick
import Quickshell
import Quickshell.Io

// Shared store for MirrorMarch plugin state.
// Watches ~/.local/state/omarchy/mirrormarch.json for live updates from daemon.
Item {
  id: store

  visible: false
  width: 0
  height: 0

  readonly property string home: Quickshell.env("HOME")
  readonly property string stateDir: home + "/.local/state/omarchy"
  readonly property string statePath: stateDir + "/mirrormarch.json"
  readonly property string binPath: String(Qt.resolvedUrl("bin/mirrormarch")).replace(/^file:\/\//, "")

  property bool running: false
  property string mode: "mirror"
  property string output: "DP-1"
  property string resolution: "1920x1080"
  property int fps: 0
  property int viewersCount: 0
  property string localUrl: "http://localhost:4000"
  property string renderUrl: ""
  property string lastUser: ""
  property bool loaded: false

  function _load(raw) {
    if (!raw || raw.trim() === "") {
      store.running = false
      store.loaded = true
      return
    }
    try {
      var data = JSON.parse(raw)
      store.running = !!data.running
      store.mode = String(data.mode || "mirror")
      store.output = String(data.output || "DP-1")
      store.resolution = String(data.resolution || "1920x1080")
      store.fps = Number(data.fps || 0)
      store.viewersCount = Number(data.viewersCount || 0)
      store.localUrl = String(data.localUrl || "http://localhost:4000")
      store.renderUrl = String(data.renderUrl || "")
      store.lastUser = String(data.lastUser || "")
      store.loaded = true
    } catch (e) {
      console.warn("michael.mirrormarch: state parse error:", e)
    }
  }

  Process {
    id: cmdProc
    command: []
    running: false
  }

  function start(mode, fps, quality, renderUrl) {
    var cmd = [store.binPath, "start"]
    if (mode) { cmd.push("--mode"); cmd.push(mode) }
    if (fps) { cmd.push("--fps"); cmd.push(String(fps)) }
    if (quality) { cmd.push("--quality"); cmd.push(String(quality)) }
    if (renderUrl) { cmd.push("--render-url"); cmd.push(renderUrl) }
    cmdProc.command = cmd
    cmdProc.running = true
  }

  function stop() {
    cmdProc.command = [store.binPath, "stop"]
    cmdProc.running = true
  }

  function toggle(mode, fps, quality, renderUrl) {
    if (store.running) {
      store.stop()
    } else {
      store.start(mode, fps, quality, renderUrl)
    }
  }

  Process {
    id: openProc
    command: []
    running: false
  }

  function openBrowser(url) {
    openProc.command = ["xdg-open", url]
    openProc.running = true
  }

  FileView {
    id: stateFile
    path: store.statePath
    watchChanges: true
    printErrors: false

    onFileChanged: reload()
    onLoaded: store._load(text())
    onLoadFailed: store._load("")
  }

  Component.onCompleted: {
    Qt.callLater(function () { stateFile.reload() })
  }
}
