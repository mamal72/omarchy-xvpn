# Architecture

`Panel.qml` is the Omarchy entry point. It owns X-VPN processes, polling, IPC, and the native panel. `model/Xvpn.js` contains pure parsers, filters, validation, and quoting helpers. `bin/install-xvpn` is the only installation boundary; it accepts the official HTTPS URL or a local file and requires confirmation in a terminal.

## CLI boundary

All connection state comes from `xvpn status`. Locations come from `xvpn location`. Mutations use `xvpn connect`, `xvpn connect --fastest`, and `xvpn disconnect`. Output parsing strips ANSI escapes and matches named fields rather than fixed line positions.

## Future routing boundary

Public geo-list direct routing is deliberately out of scope for the first release. When added, it should be a separate helper with these responsibilities:

1. Fetch, authenticate where possible, cache, and atomically update geo lists.
2. Compile lists into the host routing/firewall representation.
3. Apply and roll back policy independently of X-VPN connection state.
4. Expose a small status/action contract to the panel.

The X-VPN parser must not know about route sources, and routing code must not parse X-VPN presentation text. This keeps provider CLI changes from risking firewall state.
