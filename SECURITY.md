# Security policy

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting feature for this repository. Include the affected version, impact, reproduction steps, and any suggested mitigation.

Never include X-VPN credentials, session data, or an unredacted public IP address in a report.

## Installer boundary

The installation helper accepts only the pinned official X-VPN HTTPS installer URL or an absolute local path. It displays the complete script and requires interactive confirmation before execution. Review vendor scripts independently before granting elevated access.
