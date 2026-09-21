const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs.readFileSync(path.join(__dirname, "../model/Xvpn.js"), "utf8")
  .replace(/^\.pragma library\s*/, "")
const Xvpn = {}
vm.runInNewContext(source + "\nthis.exports = { clean, parseStatus, parseLocations, filteredLocations, countryRows, countryLocations, accordionRows, parseProtocols, parsePublicIp, parseIpInfo, parseAccount, accountCommand }", Xvpn)
const api = Xvpn.exports

assert.deepEqual({ ...api.parseStatus("Status: Connected\nLocation: NL - Amsterdam\nProtocol: Everest", 0) }, {
  available: true, daemonRunning: true, connected: true,
  location: "NL - Amsterdam", protocol: "Everest",
  message: "Status: Connected\nLocation: NL - Amsterdam\nProtocol: Everest"
})
assert.equal(api.parseStatus("ERROR: failed to find running daemon: daemon process not running", 1).daemonRunning, false)
assert.equal(api.parseStatus("", 127).available, false)
assert.equal(api.parseStatus("flock: failed to execute xvpn: No such file or directory", 69).available, false)
assert.equal(api.parseStatus("X-VPN is not installed", 1).available, false)
assert.equal(api.parseStatus("ERROR: failed to find running daemon: daemon process not running", 1).available, true)
assert.equal(api.parseStatus("Status: Disconnected", 0).connected, false)
assert.equal(JSON.stringify(api.parseLocations("ID  Name\n1  Netherlands\n2  United States")), JSON.stringify([
  { key: "1", label: "Netherlands", depth: 0, search: "1 netherlands" },
  { key: "2", label: "United States", depth: 0, search: "2 united states" }
]))
assert.equal(JSON.stringify(api.parseLocations(`
Current selected location: The Fastest Server
==================================================
Location                                Code
├── United States ····················· b093442
│   ├── California ···················· 9cfc9bc
│   │   └── Los Angeles ··············· 013fa8f
└── Netherlands ······················· 1749f60
`)), JSON.stringify([
  { key: "b093442", label: "United States", depth: 0, search: "b093442 united states" },
  { key: "9cfc9bc", label: "California", depth: 1, search: "9cfc9bc california" },
  { key: "013fa8f", label: "Los Angeles", depth: 2, search: "013fa8f los angeles" },
  { key: "1749f60", label: "Netherlands", depth: 0, search: "1749f60 netherlands" }
]))
assert.equal(api.filteredLocations(api.parseLocations("nl  Netherlands\nus  United States"), "state")[0].key, "us")
assert.equal(api.filteredLocations([{ label: "United States", search: "united states us" }], "us").length, 1)
assert.equal(api.filteredLocations([{ label: "Netherlands", search: "netherlands nl" }], "ntherland").length, 1)
assert.equal(api.parsePublicIp("1.2.3.4\n"), "1.2.3.4")
assert.equal(api.parsePublicIp("999.2.3.4"), "")
assert.deepEqual({ ...api.parseAccount("Account: user@example.com\nSubscription: Yearly premium\nStatus: Active", 0) }, {
  loaded: true,
  loggedIn: true,
  definitive: true,
  signedOut: false,
  account: "user@example.com",
  subscription: "Yearly premium",
  status: "Active",
  message: "Account: user@example.com\nSubscription: Yearly premium\nStatus: Active"
})
assert.equal(api.parseAccount("Please log in first", 1).loggedIn, false)
const hierarchy = api.parseLocations("├── United States ··· b093442\n│   ├── California ··· 9cfc9bc\n│   │   ├── Los Angeles ··· 013fa8f\n│   │   │   └── Los Angeles-104 ··· a0e0db6\n├── France ··· a115491\n│   └── Paris ··· e03a791")
assert.equal(api.countryRows(hierarchy)[0].flag, "🇺🇸")
assert.equal(api.countryLocations(hierarchy, api.countryRows(hierarchy)[0])[0].label, "Los Angeles")
assert.equal(api.countryLocations(hierarchy, api.countryRows(hierarchy)[0])[1].label, "Los Angeles-104")
assert.equal(api.countryLocations(hierarchy, api.countryRows(hierarchy)[0])[1].kind, "server")
assert.equal(api.accordionRows(hierarchy, { b093442: true }, "")[1].flag, "🇺🇸")
assert.deepEqual(Array.from(api.accordionRows(hierarchy, { b093442: true }, "").map(row => row.kind + ":" + row.label)), [
  "country:United States", "city:Los Angeles", "server:Los Angeles-104", "country:France"
])
assert.deepEqual(Array.from(api.accordionRows(hierarchy, {}, "paris").map(row => row.kind + ":" + row.label)), [
  "country:France", "city:Paris"
])
assert.deepEqual(Array.from(api.parseProtocols("Current selected protocol: Auto\nAUTO\n  - automatic\nUDP\n  - fast\nTLS-3\n  - stable")), ["AUTO", "UDP", "TLS-3"])
assert.deepEqual({ ...api.parseIpInfo('{"success":true,"ip":"1.2.3.4","type":"IPv4","country":"Netherlands","country_code":"NL","region":"North Holland","city":"Amsterdam","connection":{"asn":123,"org":"Example","isp":"Example ISP"},"timezone":{"id":"Europe/Amsterdam"}}') }, {
  loaded: true, ok: true, ip: "1.2.3.4", city: "Amsterdam", region: "North Holland", country: "Netherlands",
  countryCode: "NL", flag: "🇳🇱", isp: "Example ISP", org: "Example", asn: "AS123"
})

// Account-state failures must not be mistaken for a confirmed logout.
for (const text of ["Please login first", "You are not logged in", "Login required", "\x1b[0;31mERROR:\x1b[0m Please login to your premium account first. Use `xvpn login`."]) {
  assert.equal(api.parseAccount(text, 1).definitive, true)
  assert.equal(api.parseAccount(text, 1).signedOut, true)
}
assert.equal(api.parseAccount("temporary daemon error", 1).definitive, false)
assert.throws(() => api.accountCommand("logout; touch /tmp/unexpected"), /Unsupported/)

// Exercise the actual terminal command with interactive CLI stubs, including failures.
const os = require("node:os")
const cp = require("node:child_process")
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "xvpn-account-test-"))
try {
  fs.writeFileSync(path.join(temp, "xvpn"), '#!/bin/sh\nread -r answer\nprintf "%s:%s\\n" "$1" "$answer" >> "$TRACE"\nexit "$CLI_EXIT"\n', { mode: 0o755 })
  fs.writeFileSync(path.join(temp, "omarchy-shell"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TRACE"\n', { mode: 0o755 })
  for (const action of ["login", "logout"]) {
    for (const code of [0, 1]) {
      const trace = path.join(temp, "trace")
      fs.writeFileSync(trace, "")
      const result = cp.spawnSync("sh", ["-c", api.accountCommand(action)], {
        input: "confirmation\n", encoding: "utf8",
        env: { ...process.env, PATH: temp + path.delimiter + process.env.PATH,
          XDG_RUNTIME_DIR: temp, TRACE: trace, CLI_EXIT: String(code) }
      })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(fs.readFileSync(trace, "utf8"), action + ":confirmation\nxvpn refresh\n")
      assert.equal(result.stdout.includes("account action failed"), code !== 0)
    }
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

console.log("xvpn model tests passed")
