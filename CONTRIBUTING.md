# Contributing

Issues and focused pull requests are welcome.

Before submitting a change:

1. Keep X-VPN output parsing in `model/Xvpn.js` and UI/process orchestration in `Panel.qml`.
2. Add or update parser tests for every supported CLI output variation.
3. Run `node tests/xvpn.test.js` and `omarchy plugin validate .`.
4. Do not commit credentials, account details, public IP addresses, or unredacted screenshots.

For security-sensitive reports, follow [SECURITY.md](SECURITY.md).
