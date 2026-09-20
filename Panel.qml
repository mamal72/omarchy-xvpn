import QtQuick
import QtQuick.Controls
import QtQuick.Effects
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "model/Xvpn.js" as Xvpn

Panel {
  id: root
  moduleName: "xvpn"
  ipcTarget: "xvpn"
  manageIpc: false

  property var state: Xvpn.parseStatus("", 127)
  property var locations: []
  property var protocols: []
  property var expandedCountries: ({})
  property string query: ""
  property var ipInfo: ({ loaded: false, ok: false })
  property string actionStatus: ""
  property string pendingLocationKey: ""
  property string lastError: ""
  property var account: ({ loaded: false, loggedIn: false, account: "", subscription: "", status: "", message: "" })
  property int selectedIndex: 0
  readonly property var visibleRows: Xvpn.accordionRows(locations, expandedCountries, query)
  readonly property bool installed: state.available
  readonly property bool connected: state.connected
  readonly property bool busy: actionProcess.running
  readonly property real locationSideInset: Style.space(10)
  readonly property real locationActionWidth: Style.space(130)
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property color connectedColor: "#34c759"
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property string statusTitle: !installed ? "X-VPN is not installed"
    : (!state.daemonRunning ? "X-VPN needs setup" : (connected ? "Protected" : "Not connected"))
  readonly property string statusMeta: actionStatus !== "" ? actionStatus
    : (lastError !== "" ? lastError
      : (connected && state.location !== "" ? state.location : "X-VPN Linux CLI"))
  readonly property string heroMeta: statusMeta + (state.protocol !== "" ? " · " + state.protocol : "")
  readonly property string installerPath: {
    var value = String(Qt.resolvedUrl("bin/install-xvpn"))
    return decodeURIComponent(value.replace(/^file:\/\//, ""))
  }

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  function refresh(force) {
    if (!statusProcess.running && !actionProcess.running) statusProcess.running = true
    if ((force === true || locations.length === 0) && installed && state.daemonRunning && !locationsProcess.running)
      locationsProcess.running = true
    if ((force === true || protocols.length === 0) && installed && state.daemonRunning && !protocolsProcess.running)
      protocolsProcess.running = true
    if (force === true && !ipInfoProcess.running) ipInfoProcess.running = true
    if (installed && (force === true || !account.loaded) && !accountProcess.running) accountProcess.running = true
  }

  function quickToggle() {
    if (!installed) { runInstaller(); return }
    runAction(connected ? ["xvpn", "disconnect"] : ["xvpn", "connect", "--fastest"],
      connected ? "Disconnecting…" : "Finding the fastest server…")
  }

  function connectTo(row) {
    if (!row || busy) return
    pendingLocationKey = String(row.key)
    runAction(["xvpn", "connect", String(row.key)], "Connecting to " + row.label + "…")
  }

  function xvpnCommand(args) {
    return ["sh", "-c",
      'exec 2>&1; exec flock -w 20 "${XDG_RUNTIME_DIR:-/tmp}/omarchy-xvpn-cli.lock" xvpn "$@"',
      "xvpn"].concat(args || [])
  }

  function runAction(command, label) {
    if (actionProcess.running) return
    lastError = ""
    actionStatus = label
    actionProcess.command = xvpnCommand(command.length > 0 && command[0] === "xvpn" ? command.slice(1) : command)
    actionProcess.running = true
  }

  function runInstaller() {
    if (!bar) return
    var source = String(setting("installerSource", "https://app.xvpncdn.com/4dzfjmwrjw/cli_install.sh"))
    var command = Xvpn.shellQuote(installerPath) + " " + Xvpn.shellQuote(source)
    bar.run("omarchy-launch-floating-terminal-with-presentation " + Util.shellQuote(command))
    close()
  }

  function runLogin() {
    if (!bar) return
    bar.run("omarchy-launch-floating-terminal-with-presentation " + Util.shellQuote("xvpn login"))
    close()
  }

  function moveSelection(delta) {
    if (visibleRows.length === 0) return
    selectedIndex = Math.max(0, Math.min(visibleRows.length - 1, selectedIndex + delta))
    scrollSelectedIntoView()
  }

  function scrollSelectedIntoView() {
    Qt.callLater(function() {
      var item = rowsRepeater.itemAt(root.selectedIndex)
      if (!item) return
      var point = item.mapToItem(panelFlick.contentItem, 0, 0)
      var top = point.y
      var bottom = top + item.height
      var margin = Style.space(8)
      if (top < panelFlick.contentY + margin) panelFlick.contentY = Math.max(0, top - margin)
      else if (bottom > panelFlick.contentY + panelFlick.height - margin)
        panelFlick.contentY = Math.min(panelFlick.contentHeight - panelFlick.height, bottom + margin - panelFlick.height)
    })
  }

  function activateRow(row) {
    if (!row) return
    if (row.kind === "country" && row.expandable !== false) toggleCountry(row)
    else connectTo(row)
  }

  function locationNameMatches(label) {
    var current = String(state.location || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    var candidate = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    return current !== "" && candidate !== ""
      && (current === candidate || current.indexOf(candidate) !== -1 || candidate.indexOf(current) !== -1)
  }

  function rowIsConnected(row) {
    if (!connected || !row) return false
    if (locationNameMatches(row.label)) return true
    if (row.kind !== "country" || row.expandable === false) return false
    var children = Xvpn.countryLocations(locations, row)
    for (var i = 0; i < children.length; i++) if (locationNameMatches(children[i].label)) return true
    return false
  }

  function expandCountry(row) {
    if (!row || row.expandable === false) return
    var next = Object.assign({}, expandedCountries)
    next[row.key] = true
    expandedCountries = next
  }

  function collapseCountry(row) {
    if (!row) return
    var key = row.kind === "country" ? row.key : row.parentKey
    var parentIndex = 0
    for (var i = 0; i < visibleRows.length; i++) {
      if (visibleRows[i].kind === "country" && visibleRows[i].key === key) {
        parentIndex = i
        break
      }
    }
    var next = Object.assign({}, expandedCountries)
    delete next[key]
    expandedCountries = next
    selectedIndex = parentIndex
  }

  function toggleCountry(row) {
    if (!row || row.expandable === false) return
    if (row.expanded) collapseCountry(row)
    else expandCountry(row)
  }

  function setProtocol(value) {
    if (!value || String(value).toUpperCase() === String(state.protocol || "").toUpperCase()) return
    runAction(["xvpn", "protocol", "--set", String(value)], "Switching protocol to " + value + "…")
  }

  onVisibleRowsChanged: selectedIndex = Math.max(0, Math.min(selectedIndex, visibleRows.length - 1))
  onOpenedChanged: if (opened) {
    query = ""
    selectedIndex = 0
    refresh(true)
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  IpcHandler {
    target: "xvpn"
    function open(): void { root.open() }
    function close(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): string { root.refresh(true); return "ok" }
    function status(): string { return root.statusTitle }
    function connect(location: string): string {
      if (location === "") root.quickToggle()
      else root.runAction(["xvpn", "connect", location], "Connecting…")
      return "ok"
    }
    function disconnect(): string { root.runAction(["xvpn", "disconnect"], "Disconnecting…"); return "ok" }
    function install(): string { root.runInstaller(); return "ok" }
    function login(): string { root.runLogin(); return "ok" }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: ""
    iconComponent: Component {
      XvpnBrandMark { statusAware: true; connected: root.connected }
    }
    dimmed: !root.connected
    active: root.connected
    tooltipText: root.connected
      ? "X-VPN: " + (root.state.location || "Connected")
      : "X-VPN: " + root.statusTitle
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.RightButton) root.quickToggle()
      else if (buttonCode === Qt.MiddleButton) root.refresh(true)
      else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(420))
    contentHeight: panel.fittedContentHeight(content.implicitHeight, Style.space(560))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      blocked: search.activeFocus || protocolPicker.popupOpen || accountPopup.opened || aboutPopup.opened
      onMoveRequested: function(dx, dy) {
        if (dy !== 0) root.moveSelection(dy)
        else if (dx > 0 && root.visibleRows.length > 0)
          root.expandCountry(root.visibleRows[root.selectedIndex])
        else if (dx < 0 && root.visibleRows.length > 0)
          root.collapseCountry(root.visibleRows[root.selectedIndex])
      }
      onActivateRequested: if (root.visibleRows.length > 0) root.activateRow(root.visibleRows[root.selectedIndex])
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text) {
        if (text === "/") search.forceActiveFocus()
        else if (text === "r" || text === "R") root.refresh(true)
        else if (text === "d" || text === "D") root.runAction(["xvpn", "disconnect"], "Disconnecting…")
      }

      Flickable {
        id: panelFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: content.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        Column {
          id: content
          width: parent.width
          spacing: Style.space(12)

          RowLayout {
            width: parent.width
            spacing: Style.space(8)

            XvpnBrandMark { Layout.preferredWidth: Style.space(30); Layout.preferredHeight: Style.space(30) }
            Text {
              text: "X-VPN"
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              font.bold: true
            }
            Item { Layout.fillWidth: true }
            PanelActionButton {
              id: aboutButton
              size: Style.space(36)
              fontSize: Style.font.title
              bordered: true
              iconText: "󰋼"
              tooltipText: "About"
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: {
                accountPopup.close()
                aboutPopup.opened ? aboutPopup.close() : aboutPopup.open()
              }
            }
            PanelActionButton {
              id: accountButton
              size: Style.space(36)
              fontSize: Style.font.title
              bordered: true
              iconText: "󰀄"
              tooltipText: root.account.loggedIn ? "Account" : "Log in"
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: {
                aboutPopup.close()
                accountPopup.opened ? accountPopup.close() : accountPopup.open()
              }
            }

            Popup {
              id: aboutPopup
              x: aboutButton.x + aboutButton.width - width
              y: aboutButton.y + aboutButton.height + Style.space(4)
              width: Style.space(320)
              padding: Style.space(12)
              modal: false
              focus: true
              closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
              onClosed: if (root.opened) Qt.callLater(function() { keyCatcher.forceActiveFocus() })
              background: BorderSurface {
                color: Color.background
                borderSpec: Border.flat(root.dim, 1)
                radius: Style.cornerRadius
              }
              contentItem: Column {
                spacing: Style.space(10)
                Text {
                  width: parent.width
                  text: "About X-VPN for Omarchy"
                  color: root.foreground; font.family: root.fontFamily
                  font.pixelSize: Style.font.body; font.bold: true
                }
                Text {
                  width: parent.width
                  text: "A native Omarchy bar plugin for the official X-VPN Linux CLI."
                  color: root.foreground; font.family: root.fontFamily
                  font.pixelSize: Style.font.caption; wrapMode: Text.WordWrap
                }
                Text {
                  width: parent.width
                  text: "Created and maintained by Mohamad Jahani. Independent community project; not affiliated with X-VPN."
                  color: root.dim; font.family: root.fontFamily
                  font.pixelSize: Style.font.caption; wrapMode: Text.WordWrap
                }
                Button {
                  width: parent.width
                  bordered: true
                  text: "GitHub Repository  ↗"
                  tooltipText: "https://github.com/mamal72/omarchy-xvpn"
                  onClicked: Quickshell.execDetached(["xdg-open", "https://github.com/mamal72/omarchy-xvpn"])
                }
                PanelSeparator { width: parent.width; foreground: root.foreground }
                Text {
                  width: parent.width; text: "Support my work"
                  color: root.foreground; font.family: root.fontFamily
                  font.pixelSize: Style.font.caption; font.bold: true
                }
                Button {
                  width: parent.width
                  bordered: true
                  text: "Buy Me a Coffee  ↗"
                  tooltipText: "https://buymeacoffee.com/mamal72"
                  onClicked: Quickshell.execDetached(["xdg-open", "https://buymeacoffee.com/mamal72"])
                }
                RowLayout {
                  width: parent.width
                  spacing: Style.space(8)
                  Button {
                    Layout.fillWidth: true; bordered: true; text: "X · @mamal72"
                    tooltipText: "https://x.com/mamal72"
                    onClicked: Quickshell.execDetached(["xdg-open", "https://x.com/mamal72"])
                  }
                  Button {
                    Layout.fillWidth: true; bordered: true; text: "GitHub · @mamal72"
                    tooltipText: "https://github.com/mamal72"
                    onClicked: Quickshell.execDetached(["xdg-open", "https://github.com/mamal72"])
                  }
                }
                Text {
                  width: parent.width
                  text: "Version 1.0.0 · MIT License"
                  color: root.dim; font.family: root.fontFamily
                  font.pixelSize: Style.font.caption; horizontalAlignment: Text.AlignHCenter
                }
              }
            }

            Popup {
              id: accountPopup
              x: accountButton.x + accountButton.width - width
              y: accountButton.y + accountButton.height + Style.space(4)
              width: Style.space(300)
              padding: Style.space(12)
              modal: false
              focus: true
              closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
              onClosed: if (root.opened) Qt.callLater(function() { keyCatcher.forceActiveFocus() })
              background: BorderSurface {
                color: Color.background
                borderSpec: Border.flat(root.dim, 1)
                radius: Style.cornerRadius
              }
              contentItem: Column {
                spacing: Style.space(8)
                Text {
                  width: parent.width
                  text: root.account.loggedIn ? root.account.account : "X-VPN account"
                  color: root.foreground; font.family: root.fontFamily
                  font.pixelSize: Style.font.body; font.bold: true; elide: Text.ElideRight
                }
                Text {
                  visible: root.account.loggedIn
                  width: parent.width
                  text: root.account.subscription || "Subscription unavailable"
                  color: root.dim; font.family: root.fontFamily
                  font.pixelSize: Style.font.caption; wrapMode: Text.WordWrap
                }
                PanelSeparator { visible: root.account.loggedIn; width: parent.width; foreground: root.foreground }
                Text {
                  visible: root.account.loggedIn && root.account.status !== ""
                  width: parent.width
                  text: root.account.status
                  color: root.dim; font.family: root.fontFamily
                  font.pixelSize: Style.font.caption; wrapMode: Text.WordWrap
                }
                Button {
                  width: parent.width
                  text: root.account.loggedIn ? "Logout" : "Log in"
                  enabled: root.account.loaded && !root.busy
                  onClicked: {
                    accountPopup.close()
                    if (root.account.loggedIn) root.runAction(["xvpn", "logout"], "Logging out…")
                    else root.runLogin()
                  }
                }
              }
            }
          }

          RowLayout {
            width: parent.width
            spacing: Style.space(8)
            ColumnLayout {
              Layout.fillWidth: true
              spacing: Style.space(2)
              Text {
                Layout.fillWidth: true
                text: root.statusTitle
                color: root.foreground; font.family: root.fontFamily
                font.pixelSize: Style.font.title; font.bold: true; elide: Text.ElideRight
              }
              Text {
                Layout.fillWidth: true
                text: root.heroMeta.toUpperCase()
                color: root.dim; font.family: root.fontFamily
                font.pixelSize: Style.font.caption; font.bold: true; font.letterSpacing: 1.2
                elide: Text.ElideRight
              }
            }
            Button {
              Layout.preferredWidth: Style.space(104)
              Layout.preferredHeight: Style.space(30)
              text: root.busy && root.actionStatus.indexOf("Disconnect") === 0 ? "Disconnecting…"
                : (root.busy && (root.pendingLocationKey !== "" || root.actionStatus.indexOf("Finding") === 0)
                  ? "Connecting…" : (root.connected ? "Disconnect" : "Connect"))
              enabled: !root.busy
              selected: true
              bordered: true
              foreground: root.foreground
              accent: Color.accent
              fontSize: Style.font.caption
              horizontalPadding: Style.space(8)
              verticalPadding: Style.space(2)
              Layout.alignment: Qt.AlignVCenter
              onClicked: root.quickToggle()
            }
          }

          Column {
            width: parent.width
            spacing: 0
            XvpnInfoRow {
              label: "IP"
              value: !root.ipInfo.loaded ? "Loading…"
                : (root.ipInfo.ok ? String(root.ipInfo.flag || "") + "  " + String(root.ipInfo.ip || "") : "Unavailable")
            }
            PanelSeparator { width: parent.width; foreground: root.foreground }
            XvpnInfoRow {
              label: "Location"
              value: !root.ipInfo.loaded ? "Loading…"
                : (root.ipInfo.ok ? [root.ipInfo.city, root.ipInfo.region, root.ipInfo.country].filter(Boolean).join(", ") : "Unavailable")
            }
            PanelSeparator { width: parent.width; foreground: root.foreground }
            XvpnInfoRow {
              label: "Network"
              value: !root.ipInfo.loaded ? "Loading…"
                : (root.ipInfo.ok ? [root.ipInfo.isp || root.ipInfo.org, root.ipInfo.asn].filter(Boolean).join(" · ") : "Unavailable")
            }
            PanelSeparator { width: parent.width; foreground: root.foreground }
            XvpnInfoRow {
              label: "VPN"
              value: root.connected
                ? ([root.state.location, root.state.protocol].filter(Boolean).join(" · ") || "Connected")
                : "Not connected"
            }
          }

          Column {
            visible: !root.installed || !root.state.daemonRunning
            width: parent.width
            spacing: Style.space(8)

            Text {
              width: parent.width
              text: root.installed
                ? "The CLI is present, but its daemon is not running. Run setup again to repair the installation."
                : "Install X-VPN using the configured official HTTPS source or a reviewed local script."
              wrapMode: Text.WordWrap
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }
            Button {
              width: parent.width
              text: root.installed ? "Repair X-VPN in Terminal" : "Install X-VPN in Terminal"
              onClicked: root.runInstaller()
            }
          }

          Column {
            visible: root.installed && root.state.daemonRunning
            width: parent.width
            spacing: Style.space(8)

            RowLayout {
              width: parent.width
              spacing: Style.space(8)

              TextField {
                id: search
                Layout.fillWidth: true
                Layout.preferredHeight: Style.spacing.controlHeight
                placeholderText: "Search"
                text: root.query
                onTextChanged: root.query = text
                Keys.priority: Keys.BeforeItem
                Keys.onPressed: function(event) {
                  if (event.key === Qt.Key_Down) {
                    root.moveSelection(1); event.accepted = true
                  } else if (event.key === Qt.Key_Up) {
                    root.moveSelection(-1); event.accepted = true
                  } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                    if (root.visibleRows.length > 0) root.activateRow(root.visibleRows[root.selectedIndex])
                    event.accepted = true
                  } else if (event.key === Qt.Key_Right && root.visibleRows.length > 0
                      && root.visibleRows[root.selectedIndex].expandable !== false) {
                    root.expandCountry(root.visibleRows[root.selectedIndex]); event.accepted = true
                  } else if (event.key === Qt.Key_Left && root.visibleRows.length > 0) {
                    root.collapseCountry(root.visibleRows[root.selectedIndex]); event.accepted = true
                  } else if (event.key === Qt.Key_Escape) {
                    if (text !== "") text = ""
                    else { focus = false; keyCatcher.forceActiveFocus() }
                    event.accepted = true
                  }
                }
              }

              Dropdown {
                id: protocolPicker
                Layout.preferredWidth: root.locationActionWidth
                Layout.preferredHeight: Style.spacing.controlHeight
                rowHeight: Style.spacing.controlHeight
                showLabel: false
                label: "Protocol"
                value: String(root.state.protocol || "AUTO").toUpperCase()
                options: root.protocols
                foreground: root.foreground
                fontFamily: root.fontFamily
                onChanged: function(value) { root.setProtocol(value) }
              }
            }

            Repeater {
              id: rowsRepeater
              model: root.visibleRows
              Rectangle {
                id: locationRow
                required property var modelData
                required property int index
                readonly property bool connecting: root.busy
                  && root.pendingLocationKey === String(modelData.key)
                readonly property bool current: root.rowIsConnected(modelData)
                readonly property bool hovered: rowHover.hovered
                width: parent.width
                height: Style.space(42)
                radius: Style.cornerRadius
                color: current ? Style.selectedFillFor(root.foreground, Color.accent)
                  : (connecting || index === root.selectedIndex
                    ? Style.selectedFillFor(root.foreground, Color.accent) : "transparent")
                border.width: current ? 1 : 0
                border.color: Color.accent
                HoverHandler { id: rowHover }
                RowLayout {
                  anchors.fill: parent
                  anchors.leftMargin: root.locationSideInset
                  anchors.rightMargin: root.locationSideInset
                  Text {
                    text: modelData.flag || (modelData.kind === "country" ? Xvpn.GLYPH_PIN : "")
                    color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.body
                    Layout.preferredWidth: Style.space(24)
                    horizontalAlignment: Text.AlignHCenter
                  }
                  Item {
                    Layout.preferredWidth: Style.space(20)
                    Layout.fillHeight: true
                    Rectangle {
                      visible: locationRow.current
                      anchors.centerIn: parent
                      width: Style.space(7); height: width; radius: width / 2
                      color: Color.accent
                    }
                  }
                  Text {
                    text: modelData.label
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: modelData.kind === "country"
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                  }
                  Item {
                    Layout.preferredWidth: Style.space(94)
                    Layout.fillHeight: true
                    Button {
                      anchors.centerIn: parent
                      width: Style.space(78)
                      height: Style.space(30)
                      visible: !locationRow.current && (locationRow.hovered || locationRow.connecting)
                      text: locationRow.connecting ? "Connecting…" : "Connect"
                      enabled: !root.busy && !locationRow.connecting
                      selected: true
                      bordered: true
                      foreground: root.foreground
                      accent: Color.accent
                      fontSize: Style.font.caption
                      horizontalPadding: Style.space(8)
                      verticalPadding: Style.space(2)
                      onClicked: root.connectTo(modelData)
                    }
                  }
                  Item {
                    Layout.preferredWidth: Style.space(28)
                    Layout.fillHeight: true
                    PanelActionButton {
                      anchors.fill: parent
                      visible: !locationRow.connecting && modelData.kind === "country" && modelData.expandable !== false
                      enabled: !root.busy
                      iconText: modelData.expanded ? "⌄" : "›"
                      tooltipText: (modelData.expanded ? "Hide" : "Show") + " cities in " + modelData.label
                      foreground: root.foreground
                      fontFamily: root.fontFamily
                      onClicked: root.toggleCountry(modelData)
                    }
                  }
                }
                MouseArea {
                  anchors.left: parent.left; anchors.top: parent.top; anchors.bottom: parent.bottom
                  anchors.right: parent.right
                  anchors.rightMargin: root.locationActionWidth + root.locationSideInset
                  enabled: !root.busy
                  hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                  onEntered: root.selectedIndex = index
                  onClicked: root.activateRow(modelData)
                }
              }
            }

            Text {
              visible: !root.locationsProcessRunning && root.visibleRows.length === 0
              width: parent.width
              text: root.query === "" ? "No countries returned by X-VPN." : "No fuzzy matches."
              horizontalAlignment: Text.AlignHCenter
              color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.body
            }
          }
        }
      }
    }
  }

  readonly property bool locationsProcessRunning: locationsProcess.running

  Process {
    id: statusProcess
    command: root.xvpnCommand(["status"])
    stdout: StdioCollector { id: statusOutput; waitForEnd: true }
    onExited: function(code) {
      var output = String(statusOutput.text || "")
      if (code === 0 || /not\s+(installed|found)|daemon/i.test(output))
        root.state = Xvpn.parseStatus(output, code)
    }
  }

  Process {
    id: protocolsProcess
    command: root.xvpnCommand(["protocol", "--get"])
    stdout: StdioCollector { id: protocolsOutput; waitForEnd: true }
    onExited: function(code) {
      if (code === 0) root.protocols = Xvpn.parseProtocols(protocolsOutput.text)
    }
  }

  Process {
    id: accountProcess
    command: root.xvpnCommand(["account"])
    stdout: StdioCollector { id: accountOutput; waitForEnd: true }
    onExited: function(code) {
      var parsed = Xvpn.parseAccount(accountOutput.text, code)
      if (parsed.definitive) root.account = parsed
    }
  }

  Process {
    id: locationsProcess
    command: root.xvpnCommand(["location"])
    stdout: StdioCollector { id: locationsOutput; waitForEnd: true }
    onExited: function(code) {
      if (code === 0) root.locations = Xvpn.parseLocations(locationsOutput.text)
    }
  }

  Process {
    id: ipInfoProcess
    command: ["curl", "--fail", "--silent", "--show-error", "--max-time", "8", "https://ipwho.is/"]
    stdout: StdioCollector { id: ipOutput; waitForEnd: true }
    onExited: function(code) {
      if (code === 0) root.ipInfo = Xvpn.parseIpInfo(ipOutput.text)
      else root.ipInfo = ({ loaded: true, ok: false, error: "IP information unavailable" })
    }
  }

  Process {
    id: actionProcess
    stdout: StdioCollector { id: actionOutput; waitForEnd: true }
    stderr: StdioCollector { id: actionError; waitForEnd: true }
    onExited: function(code) {
      root.actionStatus = ""
      root.pendingLocationKey = ""
      if (code !== 0) root.lastError = Xvpn.clean(actionError.text || actionOutput.text) || "X-VPN command failed."
      root.ipInfo = ({ loaded: false, ok: false })
      settleTimer.restart()
    }
  }

  Timer { id: settleTimer; interval: 1200; onTriggered: root.refresh(true) }
  Timer {
    interval: Math.max(5, Number(root.setting("refreshIntervalSec", 10))) * 1000
    repeat: true; running: true; triggeredOnStart: true
    onTriggered: root.refresh(false)
  }

  component XvpnInfoRow: Item {
    property string label: ""
    property string value: ""
    width: parent ? parent.width : 0
    height: Style.space(34)

    RowLayout {
      anchors.fill: parent
      anchors.leftMargin: Style.space(8)
      anchors.rightMargin: Style.space(8)
      spacing: Style.space(10)
      Text {
        text: parent.parent.label
        color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption; font.bold: true
        Layout.preferredWidth: Style.space(70)
      }
      Text {
        text: parent.parent.value
        color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.body
        Layout.fillWidth: true; elide: Text.ElideRight
      }
    }
  }


  component XvpnBrandMark: Item {
    property bool statusAware: false
    property bool connected: false
    implicitWidth: Style.bar.iconCanvas
    implicitHeight: Style.bar.iconCanvas

    Image {
      id: brandImage
      anchors.fill: parent
      source: Qt.resolvedUrl("assets/xvpn-logo-transparent.png")
      fillMode: Image.PreserveAspectFit
      smooth: true
      mipmap: true
      layer.enabled: statusAware
      layer.effect: MultiEffect {
        saturation: connected ? 0.0 : -1.0
        colorization: connected ? 1.0 : 0.0
        colorizationColor: root.connectedColor
        brightness: connected ? 0.0 : -0.12
      }
    }
  }
}
