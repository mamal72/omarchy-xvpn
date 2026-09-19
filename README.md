[![CI](https://github.com/mamal72/omarchy-xvpn/actions/workflows/ci.yml/badge.svg)](https://github.com/mamal72/omarchy-xvpn/actions/workflows/ci.yml)

# 🔐 X-VPN for Omarchy

A native [Omarchy](https://omarchy.org) bar plugin for the official X-VPN Linux CLI.

## 📸 Preview

![X-VPN panel preview](preview.png)

## ℹ️ About

X-VPN for Omarchy brings the official X-VPN Linux CLI into a compact, keyboard-friendly bar panel. It keeps connection controls, account state, server selection, protocol choice, and public exit-IP verification in one native Omarchy surface.

This is an independent community plugin. It is not affiliated with or endorsed by X-VPN.

## ✨ Features

- Connect, disconnect, and switch locations without leaving the bar
- Country accordions with flattened city and server choices
- Fastest Server pinned above the country list
- Fuzzy location search and complete keyboard navigation
- Protocol selection using the options reported by X-VPN
- Automatic public IP, location, network, and VPN details
- Login, logout, and account status from the X-VPN CLI
- Theme-aware connected-location highlighting and bar state
- Guided installation from X-VPN's official script or a reviewed local copy
- IPC actions for shortcuts and automation

Geo-list direct routing is intentionally out of scope for this release. Its planned boundary is documented in [ARCHITECTURE.md](ARCHITECTURE.md).

## 📋 Requirements

- Omarchy with shell plugin support
- `curl`
- The X-VPN Linux CLI and a supported X-VPN account

X-VPN's [Linux documentation](https://xvpn.io/download/vpn-linux) currently states that Linux CLI access requires Premium.

## 📦 Installation

```bash
omarchy plugin add https://github.com/mamal72/omarchy-xvpn.git --enable
```

If the CLI is unavailable, open the panel and select **Install X-VPN in Terminal**. The helper downloads only the official HTTPS installer, prints it for review, and asks for confirmation before running it. The vendor script may request `sudo` access.

To use a local installer instead, set `installerSource` in the plugin settings to an absolute path or `file://` URL:

```text
/home/you/Downloads/cli_install.sh
file:///home/you/Downloads/cli_install.sh
```

Arbitrary remote installer URLs are rejected.

## 🔄 Update

```bash
omarchy plugin update xvpn
```

## 🗑️ Remove

```bash
omarchy plugin remove xvpn
```

## 🖱️ Usage

| Input | Action |
| --- | --- |
| Left click | Open or close the panel |
| Right click | Connect to the fastest server or disconnect |
| Middle click | Refresh X-VPN and public IP details |
| `/` | Focus search |
| `Up` / `Down` or `J` / `K` | Select a location |
| `Enter` | Expand/collapse a country or connect to a leaf location |
| `Right` / `Left` | Expand/collapse the selected country |
| `D` | Disconnect |
| `R` | Refresh |

Every location row also exposes a **Connect** button on hover.

IPC examples:

```bash
omarchy-shell xvpn status
omarchy-shell xvpn connect "United States"
omarchy-shell xvpn disconnect
omarchy-shell xvpn refresh
omarchy-shell xvpn login
```

## 🔒 Privacy and security

When the panel opens or the connection changes, it requests public IP metadata from [`ipwho.is`](https://ipwho.is). This sends your public IP to that service; no X-VPN credentials are included. IP data is kept only in memory.

Omarchy plugins run unsandboxed. Review this repository before enabling it. This plugin never stores account credentials, installs silently, or pipes a remote response directly into a shell. See [SECURITY.md](SECURITY.md) for reporting guidance.

X-VPN and its logo are trademarks of their respective owner.

## 🛠️ Development

```bash
node tests/xvpn.test.js
bash -n bin/install-xvpn
omarchy plugin validate .
```

Keep CLI parsing side-effect free in `model/Xvpn.js`, and add fixtures whenever X-VPN output changes. See [ARCHITECTURE.md](ARCHITECTURE.md) for the component boundaries.

GitHub Actions runs the model tests, validates the manifest and installer, lints the shell helper, and parses the QML entry point. Pushing a version tag such as `v1.0.0` publishes a GitHub release after every check passes; the tag must match the version in `manifest.json`.

## ☕ Support my work

If this plugin is useful to you, you can [Buy Me a Coffee](https://buymeacoffee.com/mamal72).

## 📄 License

[MIT](LICENSE)
