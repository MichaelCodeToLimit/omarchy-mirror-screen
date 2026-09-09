import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// MirrorMarch - Display mirroring and second-screen extension for iPad
// with Supabase authentication and Render hosting.
BarWidget {
  id: root
  moduleName: "michael.mirrormarch"

  // ------------------------------------------------------------- settings

  readonly property string defaultMode: String(setting("mode", "mirror"))
  readonly property int defaultFps: Math.max(15, Math.min(60, Number(setting("fps", 30))))
  readonly property int defaultQuality: Math.max(40, Math.min(95, Number(setting("quality", 65))))
  readonly property string defaultRenderUrl: String(setting("renderUrl", "https://mirrormarch.onrender.com"))

  property string selectedMode: defaultMode
  property int selectedFps: defaultFps
  property int selectedQuality: defaultQuality

  // --------------------------------------------------------------- palette

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.55)
  readonly property color faint: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.22)
  readonly property color accent: bar ? bar.urgent : Color.accent
  readonly property color success: "#10b981"
  readonly property color warning: "#f59e0b"
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  readonly property string displayGlyph: "󰐱"
  readonly property string monitorGlyph: "󰍹"
  readonly property string remoteGlyph: "󰢹"

  // Sizing for bar slot
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // ------------------------------------------------------------ state

  property bool popupOpen: false
  readonly property bool opened: popupOpen

  MirrorStore {
    id: store
  }

  // ------------------------------------------------------------- bar label

  readonly property string barLabel: {
    var glyph = root.selectedMode === "remote-desktop" ? remoteGlyph : (root.selectedMode === "extend" ? displayGlyph : monitorGlyph)
    if (!store.running) return glyph + " " + (root.selectedMode === "remote-desktop" ? "Remote" : (root.selectedMode === "extend" ? "Extend" : "Mirror"))
    if (store.viewersCount > 0) return glyph + " " + store.fps + " FPS"
    return glyph + " " + (root.selectedMode === "remote-desktop" ? "Remote" : "Ready")
  }

  readonly property string tooltipInfo: {
    var modeName = root.selectedMode === "remote-desktop" ? "Remote Desktop" : (root.selectedMode === "extend" ? "Extend Display" : "Screen Mirror")
    if (!store.running) return "MirrorMarch (" + modeName + "): Stopped (click to start)"
    if (store.viewersCount > 0) return "MirrorMarch (" + modeName + "): Streaming to " + store.viewersCount + " device(s) (" + store.fps + " FPS)"
    return "MirrorMarch (" + modeName + "): Ready (" + (store.renderUrl || store.localUrl) + ")"
  }

  function open() {
    popupOpen = true
    Qt.callLater(function () { keyCatcher.forceActiveFocus() })
  }

  function close() {
    popupOpen = false
  }

  function toggle() {
    if (popupOpen) close()
    else open()
  }

  // IPC target for Hyprland keybindings or CLI control
  IpcHandler {
    target: "mirrormarch"

    function toggle(): void {
      store.toggle(root.selectedMode, root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
    }
    function start(): void {
      store.start(root.selectedMode, root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
    }
    function stop(): void {
      store.stop()
    }
    function mirror(): void {
      root.selectedMode = "mirror"
      if (store.running) store.start("mirror", root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
    }
    function extend(): void {
      root.selectedMode = "extend"
      if (store.running) store.start("extend", root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
    }
    function remote(): void {
      root.selectedMode = "remote-desktop"
      if (store.running) store.start("remote-desktop", root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
    }
    function openPanel(): void { root.open() }
    function closePanel(): void { root.close() }
  }

  // Process for copying URL to clipboard
  Process {
    id: clipProc
    command: []
    running: false
  }

  function copyToClipboard(text) {
    clipProc.command = ["wl-copy", text]
    clipProc.running = true
  }

  // ------------------------------------------------------------- bar button

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.barLabel
    labelVisible: true
    active: root.popupOpen || store.running
    tooltipText: root.tooltipInfo

    onPressed: function (b) {
      if (b === Qt.RightButton) {
        // Quick right-click toggle without opening popup
        store.toggle(root.selectedMode, root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
      } else {
        root.toggle()
      }
    }
  }

  // ---------------------------------------------------------------- panel

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.popupOpen
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(340))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent

      onCloseRequested: root.close()
      onActivateRequested: store.toggle(root.selectedMode, root.selectedFps, root.selectedQuality, root.defaultRenderUrl)

      onTextKey: function (text) {
        var key = String(text || "").toLowerCase()
        if (key === "q" || key === "escape") root.close()
        else if (key === " " || key === "s") store.toggle(root.selectedMode, root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
        else if (key === "m") {
          root.selectedMode = "mirror"
          if (store.running) store.start("mirror", root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
        }
        else if (key === "e") {
          root.selectedMode = "extend"
          if (store.running) store.start("extend", root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
        }
        else if (key === "r") {
          root.selectedMode = "remote-desktop"
          if (store.running) store.start("remote-desktop", root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
        }
        else if (key === "o") store.openBrowser(store.renderUrl || store.localUrl)
      }

      Column {
        id: content
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        spacing: Style.space(12)

        // ------------------------------------------------------------ header

        Item {
          width: parent.width
          height: Math.max(headerLeft.implicitHeight, headerRight.implicitHeight)

          Row {
            id: headerLeft
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(8)

            Text {
              text: root.displayGlyph
              color: store.running ? (store.viewersCount > 0 ? root.success : root.warning) : root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
            }

            Column {
              Text {
                text: "MirrorMarch"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.title
                font.bold: true
              }
              Text {
                text: "iPad Display & Stream"
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }
            }
          }

          // Status Badge
          Rectangle {
            id: headerRight
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            height: Style.space(22)
            width: statusRow.implicitWidth + Style.space(14)
            radius: Style.cornerRadius
            color: store.running 
              ? (store.viewersCount > 0 ? Qt.rgba(0.06, 0.72, 0.50, 0.15) : Qt.rgba(0.96, 0.62, 0.04, 0.15))
              : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)

            Row {
              id: statusRow
              anchors.centerIn: parent
              spacing: Style.space(6)

              Rectangle {
                width: Style.space(6)
                height: width
                radius: width / 2
                anchors.verticalCenter: parent.verticalCenter
                color: store.running 
                  ? (store.viewersCount > 0 ? root.success : root.warning)
                  : root.dim
              }

              Text {
                text: store.running ? (store.viewersCount > 0 ? "STREAMING" : "READY") : "OFFLINE"
                color: store.running 
                  ? (store.viewersCount > 0 ? root.success : root.warning)
                  : root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
              }
            }
          }
        }

        PanelSeparator { width: parent.width }

        // ------------------------------------------------------------ main toggle

        Button {
          width: parent.width
          height: Style.space(42)
          text: store.running ? "⏹  Stop Streaming" : "▶  Start Mirroring"
          accent: !store.running
          selected: store.running
          fontSize: Style.font.body
          fontFamily: root.fontFamily
          onClicked: store.toggle(root.selectedMode, root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
        }

        // ------------------------------------------------------------ mode selection

        Column {
          width: parent.width
          spacing: Style.space(6)

          Text {
            text: "DISPLAY MODE"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
          }

          Row {
            width: parent.width
            spacing: Style.space(6)

            Button {
              width: (parent.width - Style.space(12)) / 3
              height: Style.space(32)
              text: "󰍹 Mirror"
              selected: root.selectedMode === "mirror"
              fontFamily: root.fontFamily
              fontSize: Style.font.bodySmall
              onClicked: {
                root.selectedMode = "mirror"
                if (store.running) store.start("mirror", root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
              }
            }

            Button {
              width: (parent.width - Style.space(12)) / 3
              height: Style.space(32)
              text: "󰐱 Extend"
              selected: root.selectedMode === "extend"
              fontFamily: root.fontFamily
              fontSize: Style.font.bodySmall
              onClicked: {
                root.selectedMode = "extend"
                if (store.running) store.start("extend", root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
              }
            }

            Button {
              width: (parent.width - Style.space(12)) / 3
              height: Style.space(32)
              text: "󰢹 Remote"
              selected: root.selectedMode === "remote-desktop"
              fontFamily: root.fontFamily
              fontSize: Style.font.bodySmall
              onClicked: {
                root.selectedMode = "remote-desktop"
                if (store.running) store.start("remote-desktop", root.selectedFps, root.selectedQuality, root.defaultRenderUrl)
              }
            }
          }
        }

        // ------------------------------------------------------------ connect info

        Rectangle {
          width: parent.width
          height: connectCol.implicitHeight + Style.space(16)
          radius: Style.cornerRadius
          color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.06)
          border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
          border.width: 1
          visible: store.running

          Column {
            id: connectCol
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: Style.space(8)
            spacing: Style.space(6)

            Text {
              text: "IPAD CONNECTION URL"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
            }

            Text {
              text: store.renderUrl || store.localUrl
              color: root.foreground
              font.family: Style.font.family
              font.pixelSize: Style.font.bodySmall
              elide: Text.ElideMiddle
              width: parent.width
            }

            Row {
              spacing: Style.space(8)

              Button {
                height: Style.space(26)
                text: "Open Web Viewer"
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                onClicked: store.openBrowser(store.renderUrl || store.localUrl)
              }

              Button {
                height: Style.space(26)
                text: "Copy Link"
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                onClicked: root.copyToClipboard(store.renderUrl || store.localUrl)
              }
            }
          }
        }

        // ------------------------------------------------------------ stats info

        Rectangle {
          width: parent.width
          height: statsRow.implicitHeight + Style.space(16)
          radius: Style.cornerRadius
          color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.06)
          border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
          border.width: 1
          visible: store.running && store.viewersCount > 0

          Row {
            id: statsRow
            anchors.centerIn: parent
            spacing: Style.space(16)

            Column {
              Text { text: "FPS"; color: root.dim; font.pixelSize: Style.font.caption; font.bold: true }
              Text { text: String(store.fps); color: root.success; font.bold: true; font.pixelSize: Style.font.title }
            }

            Column {
              Text { text: "OUTPUT"; color: root.dim; font.pixelSize: Style.font.caption; font.bold: true }
              Text { text: store.output; color: root.foreground; font.pixelSize: Style.font.body }
            }

            Column {
              Text { text: "RESOLUTION"; color: root.dim; font.pixelSize: Style.font.caption; font.bold: true }
              Text { text: store.resolution; color: root.foreground; font.pixelSize: Style.font.body }
            }
          }
        }

        // ------------------------------------------------------------ footer hints

        Row {
          width: parent.width
          spacing: Style.space(10)

          Text {
            text: "Space: Toggle • M: Mirror • E: Extend • R: Remote • Q: Close"
            color: root.faint
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
        }
      }
    }
  }
}
