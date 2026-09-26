# Architecture

`Panel.qml` is the Omarchy entry point. It owns X-VPN processes, polling, IPC, and the native panel. `model/Xvpn.js` contains pure parsers, filters, validation, and account-command construction. The X-VPN CLI is an external prerequisite. The panel links to the official setup guide and refreshes CLI availability; installation, updates, and repair remain outside the plugin.

## CLI boundary

All connection state comes from `xvpn status`. Locations come from `xvpn location`. Mutations use `xvpn connect`, `xvpn connect --fastest`, and `xvpn disconnect`. The panel keeps only the latest requested action. A new location interrupts an in-progress CLI connection, then disconnects before connecting to the replacement. `scripts/xvpn-guard.py` holds the CLI lock, combines stdout and stderr, and caps output before QML collects it. Its command-specific deadlines stop stalled CLI processes and cancellation terminates the CLI process group. A successful connect response is checked against a fresh status query before the UI settles. Output parsing strips ANSI escapes and matches named fields rather than fixed line positions. Login and logout run in an interactive terminal under the same CLI lock as background queries. Both request a refresh when finished, and regular polling also refreshes account state.

## Future routing boundary

Public geo-list direct routing is deliberately out of scope for the first release. When added, it should be a separate helper with these responsibilities:

1. Fetch, authenticate where possible, cache, and atomically update geo lists.
2. Compile lists into the host routing/firewall representation.
3. Apply and roll back policy independently of X-VPN connection state.
4. Expose a small status/action contract to the panel.

The X-VPN parser must not know about route sources, and routing code must not parse X-VPN presentation text. This keeps provider CLI changes from risking firewall state.
