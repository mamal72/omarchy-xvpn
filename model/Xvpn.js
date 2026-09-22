.pragma library

var GLYPH_BOLT = String.fromCodePoint(0xF04C5)
var GLYPH_PIN = String.fromCodePoint(0xF034E)
var ipInfoMaxBytes = 16384

function clean(raw) {
  return String(raw || "").replace(/\x1b\[[0-9;]*m/g, "").trim()
}

function parseStatus(raw, exitCode) {
  var text = clean(raw)
  var lower = text.toLowerCase()
  var connected = /\bconnected\b/.test(lower) && !/\bdisconnected\b|not connected/.test(lower)
  var location = field(text, ["location", "server", "connected to"])
  var protocol = field(text, ["protocol"])
  return {
    available: exitCode === 0 || (exitCode !== 127 && !/not installed|not found|no such file/i.test(text)),
    daemonRunning: !/daemon process not running|failed to find running daemon/i.test(text),
    connected: connected,
    location: location,
    protocol: protocol,
    message: text
  }
}

function field(text, names) {
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    for (var j = 0; j < names.length; j++) {
      var escaped = names[j].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      var match = lines[i].match(new RegExp("^\\s*" + escaped + "\\s*:?\\s*(.+)$", "i"))
      if (match && match[1].trim() !== "") return match[1].trim()
    }
  }
  return ""
}

function parseLocations(raw) {
  var text = clean(raw)
  var rows = []
  var seen = {}
  var lines = text.split("\n")
  for (var i = 0; i < lines.length; i++) {
    var rawLine = lines[i]
    var tree = rawLine.match(/^([\s│]*)(?:├──|└──)\s*(.+?)\s*·+\s*([a-f0-9]{7})\s*$/i)
    var id = ""
    var label = ""
    var depth = 0

    if (tree) {
      label = tree[2].trim()
      id = tree[3]
      depth = Math.floor(tree[1].replace(/[^│ ]/g, "").length / 4)
    } else {
      var line = rawLine.replace(/^\s*[>*✓✔•-]\s*/, "").trim()
      if (line === "" || /^(location|id|name|available|selected|current)[\s:]/i.test(line)) continue
      if (/^[-=]+$/.test(line) || /error:|usage:|flags:/i.test(line)) continue
      var columns = line.split(/\s{2,}|\t+/).map(function(value) { return value.trim() }).filter(Boolean)
      id = columns.length > 1 && /^[a-z0-9_-]+$/i.test(columns[0]) ? columns.shift() : line
      label = columns.length > 0 ? columns.join(" · ") : line
    }
    var key = id.toLowerCase()
    if (!seen[key]) {
      rows.push({ key: id, label: label, depth: depth, search: (id + " " + label).toLowerCase() })
      seen[key] = true
    }
  }
  return rows
}

function filteredLocations(locations, query) {
  var needle = String(query || "").trim().toLowerCase()
  if (needle === "") return locations || []
  var tokens = needle.split(/\s+/)
  return (locations || []).filter(function(row) {
    var haystack = String(row.search || row.label || "").toLowerCase()
    for (var i = 0; i < tokens.length; i++) {
      if (haystack.indexOf(tokens[i]) === -1 && !fuzzySubsequence(haystack, tokens[i])) return false
    }
    return true
  })
}

function fuzzySubsequence(haystack, needle) {
  if (needle.length < 2) return false
  var cursor = 0
  for (var i = 0; i < haystack.length && cursor < needle.length; i++) {
    if (haystack[i] === needle[cursor]) cursor++
  }
  return cursor === needle.length
}

function countryCode(name) {
  var entries = ("Albania:AL|Andorra:AD|Argentina:AR|Armenia:AM|Australia:AU|Austria:AT|Azerbaijan:AZ|Bangladesh:BD|Belarus:BY|Belgium:BE|Bhutan:BT|Bolivia:BO|Bosnia and Herzegovina:BA|Brazil:BR|Brunei:BN|Bulgaria:BG|Cambodia:KH|Canada:CA|Chile:CL|Colombia:CO|Croatia:HR|Cyprus:CY|Czech Republic:CZ|Denmark:DK|Ecuador:EC|Egypt:EG|Estonia:EE|Finland:FI|France:FR|Germany:DE|Ghana:GH|Greece:GR|Guatemala:GT|Hong Kong:HK|Hungary:HU|Iceland:IS|India:IN|Indonesia:ID|Iraq:IQ|Ireland:IE|Isle of Man:IM|Israel:IL|Italy:IT|Japan:JP|Jersey:JE|Kazakhstan:KZ|Kenya:KE|Laos:LA|Latvia:LV|Liechtenstein:LI|Lithuania:LT|Luxembourg:LU|Macau:MO|Malaysia:MY|Malta:MT|Mexico:MX|Moldova:MD|Monaco:MC|Mongolia:MN|Montenegro:ME|Morocco:MA|Myanmar:MM|Nepal:NP|Netherlands:NL|New Zealand:NZ|Nigeria:NG|North Macedonia:MK|Norway:NO|Oman:OM|Pakistan:PK|Peru:PE|Philippines:PH|Poland:PL|Portugal:PT|Puerto Rico:PR|Qatar:QA|Romania:RO|Russia:RU|San Marino:SM|Saudi Arabia:SA|Serbia:RS|Singapore:SG|Slovakia:SK|Slovenia:SI|South Africa:ZA|South Korea:KR|Spain:ES|Sri Lanka:LK|Sweden:SE|Switzerland:CH|Taiwan:TW|Thailand:TH|Turkey:TR|UAE:AE|Ukraine:UA|United Kingdom:GB|United States:US|Vietnam:VN").split("|")
  var wanted = String(name || "").toLowerCase()
  for (var i = 0; i < entries.length; i++) {
    var pair = entries[i].split(":")
    if (pair[0].toLowerCase() === wanted) return pair[1]
  }
  return ""
}

function flagEmoji(code) {
  var value = String(code || "").toUpperCase()
  if (!/^[A-Z]{2}$/.test(value)) return ""
  return String.fromCodePoint(0x1F1E6 + value.charCodeAt(0) - 65, 0x1F1E6 + value.charCodeAt(1) - 65)
}

function countryRows(locations) {
  var rows = []
  for (var i = 0; i < (locations || []).length; i++) {
    var row = locations[i]
    if (row.depth !== 0 || /Everest Line/i.test(row.label)) continue
    if (row.label === "The Fastest Server") {
      rows.push({ key: row.key, label: row.label, depth: 0, flag: GLYPH_BOLT, sourceIndex: i,
        expandable: false, search: "fastest server auto quick" })
      continue
    }
    var code = countryCode(row.label)
    rows.push({ key: row.key, label: row.label, depth: 0, countryCode: code, flag: flagEmoji(code), sourceIndex: i,
      expandable: true, search: (row.label + " " + code).toLowerCase() })
  }
  return rows
}

function parseProtocols(raw) {
  var protocols = []
  var lines = clean(raw).split("\n")
  for (var i = 0; i < lines.length; i++) {
    var value = lines[i].trim()
    if (/^[A-Z]+(?:-\d+)?$/.test(value) && protocols.indexOf(value) === -1) protocols.push(value)
  }
  return protocols
}

function serverVariant(label) {
  return /-(?:\d+|\*)$/.test(String(label || ""))
}

function countryLocations(locations, country) {
  if (!country) return []
  var start = country.sourceIndex
  var rows = []
  for (var i = start + 1; i < locations.length && locations[i].depth > 0; i++) {
    var row = locations[i]
    if (serverVariant(row.label)) {
      rows.push({ key: row.key, label: row.label, depth: 1, flag: "",
        kind: "server", search: row.label.toLowerCase() })
      continue
    }
    var hasMeaningfulChild = false
    for (var j = i + 1; j < locations.length && locations[j].depth > row.depth; j++) {
      if (!serverVariant(locations[j].label)) { hasMeaningfulChild = true; break }
    }
    if (!hasMeaningfulChild) rows.push({ key: row.key, label: row.label, depth: 1, flag: "",
      kind: "city", search: row.label.toLowerCase() })
  }
  if (rows.length === 0) rows.push({ key: country.key, label: "Anywhere in " + country.label, depth: 1,
    flag: "", kind: "city", search: country.search })
  return rows
}

function accordionRows(locations, expandedCountries, query) {
  var countries = countryRows(locations)
  var expanded = expandedCountries || {}
  var needle = String(query || "").trim()
  var rows = []
  for (var i = 0; i < countries.length; i++) {
    var country = countries[i]
    var cities = country.expandable === false ? [] : countryLocations(locations, country)
    var countryMatches = filteredLocations([country], needle).length > 0
    var matchingCities = needle === "" ? cities : filteredLocations(cities, needle)
    if (needle !== "" && !countryMatches && matchingCities.length === 0) continue
    var isExpanded = country.expandable !== false && (expanded[country.key] === true || (needle !== "" && matchingCities.length > 0))
    rows.push({
      key: country.key, label: country.label, flag: country.flag, search: country.search,
      kind: "country", expandable: country.expandable, expanded: isExpanded, sourceIndex: country.sourceIndex
    })
    if (!isExpanded) continue
    var shownCities = needle !== "" && !countryMatches ? matchingCities : cities
    for (var j = 0; j < shownCities.length; j++) {
      rows.push({
        key: shownCities[j].key, label: shownCities[j].label, flag: country.flag,
        search: shownCities[j].search, kind: shownCities[j].kind || "city", expandable: false,
        expanded: false, parentKey: country.key, parentLabel: country.label
      })
    }
  }
  return rows
}

function parseIpInfo(raw) {
  var text = String(raw || "")
  // curl caps transport bytes; also bound decoded input before JSON parsing.
  if (text.length > ipInfoMaxBytes)
    return { loaded: true, ok: false, error: "IP information response too large" }
  try {
    var data = JSON.parse(text)
    if (data.success === false || !data.ip) return { loaded: true, ok: false, error: String(data.message || "IP information unavailable") }
    var connection = data.connection || {}
    return {
      loaded: true, ok: true, ip: String(data.ip || ""), city: String(data.city || ""),
      region: String(data.region || ""), country: String(data.country || ""), countryCode: String(data.country_code || ""),
      flag: flagEmoji(data.country_code), isp: String(connection.isp || ""), org: String(connection.org || ""),
      asn: connection.asn ? "AS" + connection.asn : ""
    }
  } catch (error) {
    return { loaded: true, ok: false, error: "Invalid IP information response" }
  }
}

function parsePublicIp(raw) {
  var text = clean(raw)
  if (text.length > 45) return ""
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
    var octets = text.split(".")
    for (var i = 0; i < octets.length; i++) if (parseInt(octets[i], 10) > 255) return ""
    return text
  }
  if (/^[0-9a-fA-F:]+$/.test(text) && text.indexOf(":") !== -1 && !/:::/.test(text)) return text.toLowerCase()
  return ""
}

function parseAccount(raw, exitCode) {
  var text = clean(raw)
  var account = field(text, ["account", "email"])
  var subscription = field(text, ["subscription"])
  var status = field(text, ["status"])
  var signedOut = /not (?:logged|signed)[ -]?in|please (?:log[ -]?in|sign[ -]?in)|(?:login|authentication) required|not logged on|no (?:active )?account|not login/i.test(text)
  return {
    loaded: true,
    loggedIn: exitCode === 0 && account !== "" && !signedOut,
    definitive: (exitCode === 0 && account !== "") || signedOut,
    signedOut: signedOut,
    account: account,
    subscription: subscription,
    status: status,
    message: text
  }
}

// Only fixed account actions are allowed; credentials stay in the interactive terminal.
function accountCommand(action) {
  if (action !== "login" && action !== "logout") throw new Error("Unsupported account action")
  return 'flock -w 20 "${XDG_RUNTIME_DIR:-/tmp}/omarchy-xvpn-cli.lock" xvpn ' + action
    + '; result=$?; if [ "$result" -ne 0 ]; then printf "\\nX-VPN account action failed (exit %s). Please try again.\\n" "$result"; fi; '
    + 'omarchy-shell xvpn refresh'
}
