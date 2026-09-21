# Security policy

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting feature for this repository. Include the affected version, impact, reproduction steps, and any suggested mitigation.

Never include X-VPN credentials, session data, or an unredacted public IP address in a report.

## External CLI boundary

The X-VPN Linux CLI must be installed, updated, and repaired independently by the user. The plugin links to the official Linux CLI guide and detects CLI availability; it does not download or execute installers, accept installer sources, or request elevated privileges. Connection and account actions use the existing X-VPN CLI.
