const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs.readFileSync(path.join(__dirname, "../model/Xvpn.js"), "utf8")
  .replace(/^\.pragma library\s*/, "")
const Xvpn = {}
vm.runInNewContext(source + "\nthis.exports = { clean, parseStatus, parseLocations, filteredLocations, countryRows, countryLocations, accordionRows, parseProtocols, parsePublicIp, parseIpInfo, parseAccount, accountCommand }", Xvpn)
const api = Xvpn.exports

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"))
const panel = fs.readFileSync(path.join(__dirname, "../Panel.qml"), "utf8")
const displayedVersion = panel.match(/readonly property string pluginVersion: "([^"]+)"/)
assert.ok(displayedVersion, "About version is missing")
assert.equal(displayedVersion[1], manifest.version, "About version differs from manifest.json")
assert.match(panel, /text: "Version " \+ root\.pluginVersion \+ " · MIT License"/)

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

const ipLimit = Xvpn.ipInfoMaxBytes
const ipJson = '{"success":true,"ip":"1.2.3.4"}'
assert.equal(api.parseIpInfo(ipJson.padEnd(ipLimit, " ")).ok, true)
// Verify oversized, otherwise-valid JSON never reaches JSON.parse.
const guarded = { JSON: { parse() { throw new Error("JSON.parse must not run") } } }
vm.runInNewContext(source + "\nthis.parseIpInfo = parseIpInfo", guarded)
assert.equal(guarded.parseIpInfo(ipJson.padEnd(ipLimit + 1, " ")).error, "IP information response too large")

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

// Exercise the panel's actual curl arguments against bounded local fixtures.
async function testIpResponseLimit() {
  const http = require("node:http")
  const command = vm.runInNewContext(panel.match(/id: ipInfoProcess\s+command: (\[[^\n]+\])/)[1], { Xvpn })
  const server = http.createServer((req, res) => {
    const oversized = req.url !== "/normal" && req.url !== "/boundary"
    const body = ipJson.padEnd(oversized ? ipLimit * 4 : req.url === "/boundary" ? ipLimit : ipJson.length, " ")
    if (req.url === "/chunked") {
      res.setHeader("Transfer-Encoding", "chunked")
    } else if (req.url === "/unknown") {
      res.useChunkedEncodingByDefault = false
    } else {
      res.setHeader("Content-Length", Buffer.byteLength(body))
    }
    res.write(body.slice(0, 512))
    res.end(body.slice(512))
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  try {
    for (const route of ["normal", "boundary", "declared", "chunked", "unknown"]) {
      const args = Array.from(command.slice(1, -1)).concat(["--noproxy", "*", `http://127.0.0.1:${server.address().port}/${route}`])
      const result = await new Promise((resolve, reject) => {
        cp.execFile(command[0], args, { maxBuffer: ipLimit * 8 }, (error, stdout, stderr) => {
          if (error && typeof error.code !== "number") {
            reject(error)
            return
          }
          resolve({ code: error ? error.code : 0, stdout, stderr })
        })
      })
      const oversized = !["normal", "boundary"].includes(route)
      assert.equal(result.code, oversized ? 63 : 0, `${route}: ${result.stderr}`)
      assert.ok(Buffer.byteLength(result.stdout) <= ipLimit, `${route}: output exceeded cap`)
      if (!oversized) {
        assert.equal(api.parseIpInfo(result.stdout).ok, true)
      }
    }
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

// The guard must bound both CLI streams before Quickshell can collect them.
async function testCliGuard() {
  const guard = path.join(__dirname, "../scripts/xvpn-guard.py")
  assert.match(panel, /return \["python3", guard\]\.concat\(args \|\| \[\]\)/)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xvpn-guard-test-"))
  try {
    fs.writeFileSync(path.join(dir, "xvpn"), `#!/usr/bin/env node
if (process.env.MODE === "large") process.stderr.write("x".repeat(20000))
else if (process.env.MODE === "hang") setInterval(() => {}, 1000)
else process.stdout.write("Status: Disconnected\\n")
`, { mode: 0o755 })
    const env = { ...process.env, PATH: dir + path.delimiter + process.env.PATH, XDG_RUNTIME_DIR: dir }
    const normal = cp.spawnSync("python3", [guard, "status"], { env, encoding: "utf8", timeout: 5000 })
    assert.equal(normal.status, 0, normal.stderr)
    assert.equal(normal.stdout, "Status: Disconnected\n")
    const large = cp.spawnSync("python3", [guard, "status"], {
      env: { ...env, MODE: "large" }, encoding: "utf8", timeout: 5000
    })
    assert.equal(large.status, 70, large.stderr)
    assert.equal(large.stdout, "X-VPN command output exceeded the limit\n")
    const quickDeadline = `import runpy, sys; g = runpy.run_path(sys.argv[1]); g["main"].__globals__["LIMITS"]["status"] = (16384, 1); sys.exit(g["main"](["status"]))`
    const hang = cp.spawnSync("python3", ["-c", quickDeadline, guard], {
      env: { ...env, MODE: "hang" }, encoding: "utf8", timeout: 5000
    })
    assert.equal(hang.status, 124, hang.stderr)
    assert.equal(hang.stdout, "X-VPN command timed out\n")
    assert.equal(cp.spawnSync("flock", ["-n", path.join(dir, "omarchy-xvpn-cli.lock"), "true"]).status, 0,
      "timed-out CLI still holds the lock")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// A new server choice must be able to stop the CLI holding the shared lock.
async function testConnectCancellation() {
  const guard = path.join(__dirname, "../scripts/xvpn-guard.py")
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xvpn-cancel-test-"))
  const lock = path.join(dir, "omarchy-xvpn-cli.lock")
  try {
    fs.writeFileSync(path.join(dir, "xvpn"),
      '#!/usr/bin/env node\nprocess.stdout.write("READY\\n")\nsetInterval(() => {}, 1000)\n', { mode: 0o755 })
    const child = cp.spawn("python3", [guard, "connect", "fake"], {
      env: { ...process.env, PATH: dir + path.delimiter + process.env.PATH, XDG_RUNTIME_DIR: dir },
      stdio: ["ignore", "pipe", "pipe"]
    })
    await new Promise((resolve, reject) => {
      const started = Date.now()
      const check = () => {
        if (child.exitCode !== null) return reject(new Error("CLI exited before cancellation"))
        if (cp.spawnSync("flock", ["-n", lock, "true"]).status === 1) return resolve()
        if (Date.now() - started > 3000) return reject(new Error("CLI did not start"))
        setTimeout(check, 25)
      }
      check()
    })
    child.kill("SIGTERM")
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL")
        reject(new Error("CLI did not stop"))
      }, 3000)
      child.once("exit", () => {
        clearTimeout(timeout)
        resolve()
      })
    })
    assert.equal(cp.spawnSync("flock", ["-n", lock, "true"]).status, 0,
      "cancelled CLI still holds the lock")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

testIpResponseLimit().then(testCliGuard).then(testConnectCancellation)
  .then(() => console.log("xvpn model, response limit, and cancellation tests passed"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
