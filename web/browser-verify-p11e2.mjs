/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/**
 * P11-E2 browser verification — driven by the `agent-browser` CLI that ships
 * with this acceptance environment (no Playwright dependency).
 *
 * Exit codes (kept distinct so failure classes are never conflated):
 *   0  all six positive checks passed
 *   1  BUSINESS GATE FAILURE — the app under test has a real problem the gate
 *      is meant to catch (missing caption, wrong title, aborted API request,
 *      HTTP error, console/page error, failed key interaction), or a negative
 *      probe correctly and precisely detected its target.
 *   2  ENVIRONMENT DEPENDENCY ERROR — agent-browser CLI unavailable BEFORE any
 *      session was created. An environment issue, never a business failure.
 *   3  VERIFIER-INVALID / CRASH — the verifier could not perform a reliable
 *      check: setup/navigation/capture failure, an isolated negative probe was
 *      not isolated, session cleanup (close/query/residue) failed after a
 *      session was created, or an unexpected exception. Never printed as a
 *      probe success.
 *
 * Hard gates introduced in Pass 6:
 *   - captureOk: console + pageerror + network capture must ALL succeed before
 *     captureOk=true. res.ok requires captureOk=true and never ignores
 *     res.failures. The caption self-test passes ONLY when the sole failure is
 *     the missing caption (no capture/setup/navigation/other errors).
 *   - session cleanup: close result is checked; a failed `session list` query
 *     is NOT treated as "no session"; residue after 4s is a failure; if a
 *     session was created this run and close/query/residue fails, the final
 *     exit becomes 3. If agent-browser is missing before any session exists,
 *     exit stays 2.
 *   - Document abort: the capture window is cleared before the target
 *     navigation, so ANY Document request with missing/null/0 status inside it
 *     fails (no silent superseded-navigation pass on resourceType alone).
 *   - abort probe: must precisely match BASE origin + pathname /api/pricing +
 *     resourceType XHR|Fetch + no status, with all other gates normal and NO
 *     unrelated abort; the unroute result is checked.
 *   - post-click stability: after reaching /pricing, waitForNetworkIdle is
 *     called and a timeout fails; capture happens afterwards. Every wait /
 *     screenshot / clear / unroute result is handled or marked non-gating.
 *
 * Hard gates introduced in Pass 7:
 *   - core 429: /api/status, /api/home_page_content, /api/pricing, /api/notice
 *     and /api/setup are NOT in the anonymous allowlist. A 429 on any of them
 *     is rate-limit contamination => exit 3, never exit 0, and their
 *     console.error counterparts are never swallowed. Only the established
 *     auth/self/acquisition allowlist remains.
 *   - capture schema: netData.requests, consoleData.messages and
 *     errorsData.errors must all be arrays; a missing field or wrong type
 *     => captureOk false => exit 3 (malformed payloads are never coerced
 *     into successful empty logs).
 *   - structured observations: waitForText / waitForNetworkIdle / title /
 *     dark-state report { observationOk, ... }; an observation the verifier
 *     could not make (eval never produced a valid boolean, log never
 *     queried) is a verifier problem (exit 3), never misread as
 *     "result false".
 *   - abort probe: r.failures must contain EXACTLY one entry per target
 *     /api/pricing XHR|Fetch abort; any network-idle timeout, title/text/
 *     dark/console/pageerror or unrelated network error => exit 3, never
 *     "probe PASSED".
 *   - fixed screenshot path: anchored to this script (import.meta.url), so
 *     shots land in <repo>/docs/release-screenshots from any cwd.
 *
 * Hard gates introduced in Pass 8:
 *   - empty capture: after the capture window is cleared, the capture MUST
 *     contain the target route's Document (BASE origin, exact pathname,
 *     resourceType Document, success status) and every request record must
 *     pass the per-record schema; otherwise captureOk=false => exit 3.
 *   - console dedup: a "Failed to load resource" console message is removed
 *     ONLY when the same-URL network record was analyzed into an equivalent
 *     failure (aborted / HTTP error) or exactly matches the anonymous
 *     allowlist; a 2xx record never justifies dedup (the console error must
 *     stand and fail the gate).
 *   - mechanical observations: ANY agent-browser command failure or invalid
 *     payload during waitForText / waitForElementVisible / waitForNetworkIdle
 *     yields observationOk=false (exit 3); a previously-valid observation is
 *     never used to downgrade subsequent consecutive failures to business
 *     false/timeout.
 *   - non-gating shots dir: mkdirSync runs inside the controlled flow after
 *     the CLI availability check; directory or screenshot failure is a
 *     non-gating note and never alters the business exit code (missing CLI
 *     still returns exit 2 first).
 *   - no fixed waits: the interaction uses checked agent-browser commands and
 *     element-state polling only; click failures are recorded as
 *     "failed then retried" notes.
 *
 * Verification-only simulation hooks (env vars, no CLI surface):
 *   P11E2_FORCE_CAPTURE_FAIL=1   force capture failure  -> expect exit 3
 *   P11E2_FORCE_CLEANUP_FAIL=1   force cleanup failure  -> expect exit 3
 *   P11E2_FORCE_TEXT_EVAL_FAIL=1 force text eval to never yield a boolean
 *                                (observationOk=false)  -> expect exit 3
 *   P11E2_FORCE_BAD_CAPTURE=1    force malformed capture payloads (missing
 *                                fields / wrong types)  -> expect exit 3
 *   P11E2_FORCE_EMPTY_CAPTURE=1  force an empty legal capture (no requests)
 *                                -> expect exit 3, never 0/1
 *   P11E2_FORCE_TEXT_EVAL_FAIL_AFTER_FIRST=1  first observation valid false,
 *                                then all subsequent evals fail -> exit 3
 *
 * Usage:
 *   node browser-verify-p11e2.mjs                # six positive checks
 *   node browser-verify-p11e2.mjs --self-test    # precise missing-caption probe
 *   node browser-verify-p11e2.mjs --self-test-abort  # API-abort probe
 */
import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const pExecFile = promisify(execFile)

const AB = 'agent-browser'
// Unique session name per invocation => guaranteed fresh state, no reliance on
// any previously-existing session, and no cross-run interference.
const SESSION = `p11e2-${Date.now()}-${process.pid}`
const BASE = 'http://127.0.0.1:3001'
const BASE_ORIGIN = new URL(BASE).origin
const EXPECTED_TITLE = 'Vancine'
// Screenshots are anchored to THIS script's location (import.meta.url), not
// the cwd, so they land in <repo>/docs/release-screenshots whether the
// verifier is run from the repo root (`node web/browser-verify-p11e2.mjs`) or
// from web/ (`node browser-verify-p11e2.mjs`) — never outside the repository.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SHOTS_DIR = path.resolve(SCRIPT_DIR, '..', 'docs', 'release-screenshots')

// Shots-dir creation is NON-GATING: it runs inside the controlled main()
// flow (after the agent-browser availability check, so a missing CLI still
// returns exit 2 first), and a failure is reported as a warning only — it
// must never crash the verifier or change the business exit code (screenshot
// commands themselves are non-gating notes).
function prepareShotsDir() {
  try {
    mkdirSync(SHOTS_DIR, { recursive: true })
  } catch (e) {
    console.warn(
      `non-gating: could not create screenshots directory ${SHOTS_DIR}: ` +
        `${e.message ?? e}`
    )
  }
}

const EXIT_OK = 0
const EXIT_GATE_FAIL = 1
const EXIT_ENV = 2
const EXIT_INVALID = 3

// Verification-only simulation hooks (see header). These exist solely to prove
// the capture-failure and cleanup-failure paths exit 3; they are not CLI flags.
const SIM_CAPTURE_FAIL = process.env.P11E2_FORCE_CAPTURE_FAIL === '1'
const SIM_CLEANUP_FAIL = process.env.P11E2_FORCE_CLEANUP_FAIL === '1'
const SIM_TEXT_EVAL_FAIL = process.env.P11E2_FORCE_TEXT_EVAL_FAIL === '1'
const SIM_BAD_CAPTURE = process.env.P11E2_FORCE_BAD_CAPTURE === '1'
const SIM_EMPTY_CAPTURE = process.env.P11E2_FORCE_EMPTY_CAPTURE === '1'
const SIM_TEXT_EVAL_FAIL_AFTER_FIRST =
  process.env.P11E2_FORCE_TEXT_EVAL_FAIL_AFTER_FIRST === '1'

// Set true once any --session command is attempted. agent-browser availability
// is verified in main() before the first ab() call, so reaching ab() means the
// CLI exists and a session is (or will be) alive and must be cleaned up.
let sessionCreated = false

// Exact anonymous-failure allowlist (auth/self/acquisition only). A failure is
// ignored ONLY when origin === BASE_ORIGIN AND the pathname is allowlisted AND
// the status is in that pathname's allowlist. Matching is strictly by origin +
// pathname + status (never by error text).
const ANON_ALLOWLIST = new Map([
  ['/api/user/auth/refresh', new Set([401, 429])],
  ['/api/user/self', new Set([401, 429])],
  ['/api/acquisition/touch', new Set([429])],
])

// Core anonymous endpoints whose 429 must NEVER be judged green. They are
// deliberately NOT in ANON_ALLOWLIST: a 429 on any of them during acceptance
// is rate-limit contamination => verifier-invalid (exit 3), never exit 0, and
// their console.error counterparts are never swallowed.
const CORE_RATE_LIMITED_ENDPOINTS = new Set([
  '/api/status',
  '/api/home_page_content',
  '/api/pricing',
  '/api/notice',
  '/api/setup',
])

function isExpectedAnonFailure(urlStr, status) {
  let u
  try {
    u = new URL(urlStr)
  } catch {
    return false
  }
  if (u.origin !== BASE_ORIGIN) {
    return false
  }
  const allowed = ANON_ALLOWLIST.get(u.pathname)
  return Boolean(allowed && allowed.has(status))
}

function isCoreRateLimitedEndpoint(urlStr) {
  try {
    const u = new URL(urlStr)
    return (
      u.origin === BASE_ORIGIN && CORE_RATE_LIMITED_ENDPOINTS.has(u.pathname)
    )
  } catch {
    return false
  }
}

// Failure-classification marker for a 429 on a core endpoint.
function isCoreRateLimitFailure(f) {
  return f.startsWith('rate-limit-contaminated')
}

// Per-record schema check for captured network requests. Every record must
// carry a non-empty url, a resourceType string and a numeric (or absent /
// aborted) status; anything else is a malformed payload => captureOk=false.
function validRequestRecord(r) {
  return (
    r !== null &&
    typeof r === 'object' &&
    typeof r.url === 'string' &&
    r.url.length > 0 &&
    typeof r.resourceType === 'string' &&
    (typeof r.status === 'number' ||
      r.status === undefined ||
      r.status === null)
  )
}

// The capture window is cleared before the target navigation, so the capture
// MUST contain the target page's Document: BASE origin, exact route pathname,
// resourceType Document, success status (200-399). Missing it means the
// window/session is unusable => verifier-invalid (exit 3).
function hasTargetDocument(rawRequests, route) {
  return rawRequests.some((r) => {
    if (r.resourceType !== 'Document') {
      return false
    }
    try {
      const u = new URL(r.url || '')
      return (
        u.origin === BASE_ORIGIN &&
        u.pathname === route &&
        typeof r.status === 'number' &&
        r.status >= 200 &&
        r.status < 400
      )
    } catch {
      return false
    }
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function hasNoStatus(req) {
  return req.status === undefined || req.status === null || req.status === 0
}

// The precise abort target for the API-abort probe: BASE origin, pathname
// /api/pricing, resourceType XHR or Fetch, and no status (aborted).
function isPricingAbortTarget(req) {
  try {
    const u = new URL(req.url || '')
    return (
      u.origin === BASE_ORIGIN &&
      u.pathname === '/api/pricing' &&
      (req.resourceType === 'XHR' || req.resourceType === 'Fetch') &&
      hasNoStatus(req)
    )
  } catch {
    return false
  }
}

// Run one agent-browser command in this run's session. Never throws; returns
// { ok, stdout, stderr } so every caller can check the result. Marks the
// session as created (agent-browser availability is verified before first use).
async function ab(args) {
  sessionCreated = true
  try {
    const { stdout, stderr } = await pExecFile(
      AB,
      ['--session', SESSION, ...args],
      {
        maxBuffer: 32 * 1024 * 1024,
        timeout: 30000,
      }
    )
    return { ok: true, stdout: stdout ?? '', stderr: stderr ?? '' }
  } catch (e) {
    return {
      ok: false,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? String(e.message ?? e),
    }
  }
}

// Run a --json command and parse its data payload. Throws on failure.
async function abJson(args) {
  const r = await ab([...args, '--json'])
  if (!r.ok) {
    throw new Error(`agent-browser ${args.join(' ')} failed: ${r.stderr}`)
  }
  const parsed = JSON.parse(r.stdout)
  if (!parsed || parsed.success === false) {
    throw new Error(
      `agent-browser ${args.join(' ')} returned error: ${parsed?.error}`
    )
  }
  return parsed.data
}

function parseEvalOut(stdout) {
  const s = (stdout ?? '').trim()
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

function urlMatchesOriginPath(actualUrl, expectedPathname) {
  try {
    const u = new URL(actualUrl)
    return u.origin === BASE_ORIGIN && u.pathname === expectedPathname
  } catch {
    return false
  }
}

async function currentUrl() {
  const r = await ab(['get', 'url'])
  return r.ok ? r.stdout.trim() : ''
}

async function agentBrowserAvailable() {
  try {
    const { stdout } = await pExecFile(AB, ['--version'], { timeout: 15000 })
    return /agent-browser/i.test(stdout)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Failure analysis. Every request/message is judged independently; there is NO
// global "an abort happened somewhere" flag that suppresses other failures.
// ---------------------------------------------------------------------------

function analyzeNetwork(requests) {
  const failures = []
  for (const r of requests) {
    const url = r.url || ''
    const type = r.resourceType || 'Other'
    if (hasNoStatus(r)) {
      // The capture window is cleared before the target navigation, so any
      // request with no status inside it is an abort and fails — INCLUDING a
      // Document. A superseded top-level navigation is not silently tolerated
      // on resourceType alone; it would need explicit request/frame/top-level
      // correlation, which we do not grant here.
      failures.push(`aborted ${type} request (no status): ${url}`)
      continue
    }
    const st = r.status
    if (st >= 400) {
      // A 429 on a core anonymous endpoint is rate-limit contamination: flag
      // it distinctly so the aggregate verdict returns exit 3 (never exit 0).
      if (st === 429 && isCoreRateLimitedEndpoint(url)) {
        failures.push(`rate-limit-contaminated: core endpoint 429: ${url}`)
        continue
      }
      if (isExpectedAnonFailure(url, st)) {
        continue
      }
      failures.push(`http ${st} ${type}: ${url}`)
    }
  }
  return failures
}

function analyzeConsole(messages, rawRequests) {
  const failures = []
  for (const m of messages) {
    if (m.type !== 'error') {
      continue
    }
    const text = m.text ?? ''
    // Browser resource-load failures are judged via the network log (which
    // carries resourceType + status). Deduplicate ONLY when the corresponding
    // network record has been confirmed analyzed (its URL appears in the
    // captured requests); otherwise the message stands as a failure. There is
    // no unconditional ignore.
    if (text.includes('Failed to load resource')) {
      if (resourceFailureAnalyzed(text, rawRequests)) {
        continue
      }
      failures.push(`console.error: ${text}`)
      continue
    }
    // Genuine JS/console errors — including core-endpoint fetch failures such
    // as "Failed to load home page content" / "Failed to load system config" —
    // always fail. They are never swallowed.
    failures.push(`console.error: ${text}`)
  }
  return failures
}

// Extract the failed resource URL from a "Failed to load resource" console
// message and report whether that resource justifies deduplication: the
// same-URL network record must have been analyzed into an equivalent failure
// (aborted / HTTP error) or must exactly match the established anonymous
// allowlist. A success record (2xx/3xx) never justifies dedup — with a 2xx in
// the network log and an explicit load failure in the console, the console
// error must stand and fail the gate. Without a matchable URL, correlation
// cannot be confirmed and the message must not be deduplicated.
function resourceFailureAnalyzed(text, rawRequests) {
  const match = text.match(/https?:\/\/[^\s)'"]+/)
  if (!match) {
    return false
  }
  const url = match[0]
  const records = rawRequests.filter((r) => r.url === url)
  if (records.length === 0) {
    return false
  }
  return records.some((r) => {
    if (hasNoStatus(r)) {
      return true // aborted => analyzeNetwork already produced a failure
    }
    const st = r.status
    if (st >= 400) {
      // Every >=400 status is either analyzed as a failure or exactly
      // allowlisted (anonymous auth/self/acquisition); the network log
      // carries the conclusion either way.
      return true
    }
    return false // success => console error must stand
  })
}

function analyzePageErrors(errors) {
  return errors.map(
    (e) => `pageerror: ${e?.message ?? e?.text ?? JSON.stringify(e)}`
  )
}

// ---------------------------------------------------------------------------
// Waiters / interaction helpers
// ---------------------------------------------------------------------------

// Structured text observation: { observationOk, found }. observationOk is true
// ONLY when every observation attempt was mechanically valid (every eval
// succeeded and returned a boolean). ANY agent-browser command failure or
// invalid payload makes observationOk=false (exit 3): a previously-valid
// observation is never used to downgrade subsequent consecutive failures to
// business "text not found".
async function waitForText(text, timeoutMs) {
  if (!text) {
    return { observationOk: true, found: true }
  }
  const expr = `!!document.body && document.body.innerText.includes(${JSON.stringify(text)})`
  const deadline = Date.now() + timeoutMs
  let attempts = 0
  let sawFailure = false
  while (Date.now() < deadline) {
    attempts++
    // Simulation hooks: fail every eval, or fail every eval AFTER the first
    // valid observation (first false, then queries fail => exit 3).
    if (
      SIM_TEXT_EVAL_FAIL ||
      (SIM_TEXT_EVAL_FAIL_AFTER_FIRST && attempts > 1)
    ) {
      sawFailure = true
      await sleep(250)
      continue
    }
    const r = await ab(['eval', expr])
    if (!r.ok) {
      sawFailure = true
    } else {
      const out = parseEvalOut(r.stdout)
      if (out === true) {
        return { observationOk: true, found: true }
      }
      if (out !== false) {
        // Non-boolean payload => the observation is mechanically invalid.
        sawFailure = true
      }
    }
    await sleep(250)
  }
  return { observationOk: !sawFailure, found: false }
}

// Bounded element-visibility poll driven by element state (no fixed sleep).
// Returns { observationOk, visible }. The strict mechanical rule applies: ANY
// eval failure or non-boolean payload => observationOk=false (exit 3).
async function waitForElementVisible(selector, timeoutMs) {
  const expr =
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)});` +
    'if(!el)return false;const r=el.getBoundingClientRect();' +
    'return r.width>0&&r.height>0})()'
  const deadline = Date.now() + timeoutMs
  let sawFailure = false
  while (Date.now() < deadline) {
    const r = await ab(['eval', expr])
    if (!r.ok) {
      sawFailure = true
    } else {
      const out = parseEvalOut(r.stdout)
      if (out === true) {
        return { observationOk: true, visible: true }
      }
      if (out !== false) {
        sawFailure = true
      }
    }
    await sleep(250)
  }
  return { observationOk: !sawFailure, visible: false }
}

async function waitForUrlPath(pathname, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const u = await currentUrl()
    if (urlMatchesOriginPath(u, pathname)) {
      return true
    }
    await sleep(200)
  }
  return false
}

// Structured idle observation: { observationOk, idle }. The strict mechanical
// rule applies: ANY failed network-log query or invalid payload =>
// observationOk=false (exit 3), never downgraded to a plain idle timeout.
async function waitForNetworkIdle(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastCount = -1
  let stableMs = 0
  let sawFailure = false
  while (Date.now() < deadline) {
    let count = null
    try {
      const d = await abJson(['network', 'requests'])
      if (d && Array.isArray(d.requests)) {
        count = d.requests.length
      } else {
        sawFailure = true // invalid payload
      }
    } catch {
      sawFailure = true // command failure
    }
    if (count !== null && count === lastCount) {
      stableMs += 250
      if (stableMs >= 750) {
        return { observationOk: true, idle: true }
      }
    } else {
      stableMs = 0
    }
    if (count !== null) {
      lastCount = count
    }
    await sleep(250)
  }
  return { observationOk: !sawFailure, idle: false }
}

function parseLuminance(color) {
  if (typeof color !== 'string') {
    return null
  }
  const lab = color.match(/lab\(\s*([\d.]+)/)
  if (lab) {
    return Number(lab[1])
  }
  const rgb = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (rgb) {
    return (Number(rgb[1]) + Number(rgb[2]) + Number(rgb[3])) / 3
  }
  return null
}

// ---------------------------------------------------------------------------
// One check. Every command's result is handled. Failures are split into:
//   - verifierProblems: setup / navigation / capture could not be performed
//     reliably (=> exit 3 in aggregate modes).
//   - failures: business problems with the app under test (=> exit 1).
// res.ok requires setupOk && navOk && captureOk && failures.length === 0 and
// never ignores res.failures.
// ---------------------------------------------------------------------------

async function runCheck(cfg) {
  const res = {
    name: cfg.name,
    route: cfg.route,
    setupOk: true,
    navOk: false,
    captureOk: false,
    title: '',
    titleOk: false,
    foundText: cfg.expectText ? false : true,
    textObservationOk: cfg.expectText ? false : true,
    darkOk: true,
    darkState: null,
    coreRateLimited: false,
    interactionOk: cfg.interact ? false : true,
    networkErrors: [],
    consoleErrors: [],
    pageErrors: [],
    rawRequests: [],
    failures: [],
    verifierProblems: [],
    notes: [],
    screenshot: path.join(SHOTS_DIR, `p11e2-${cfg.name}.png`),
    ok: false,
  }

  // 1. The BASE same-origin context page is opened ONCE per session by
  //    warmUpContext() before any check runs (and settled there), so opening
  //    the target below neither aborts in-flight context requests nor depends
  //    on any pre-existing session state. Keeping the context open for the whole
  //    session also halves the anonymous API request load per check, reducing
  //    per-IP rate-limit pressure under repeated runs.

  // 2. Write the locale on the established origin (before the target load).
  const loc = await ab([
    'eval',
    `localStorage.setItem("i18nextLng", ${JSON.stringify(cfg.locale)})`,
  ])
  if (!loc.ok) {
    res.setupOk = false
    res.verifierProblems.push(`set i18nextLng failed: ${loc.stderr.trim()}`)
    return res
  }

  // 3. Viewport.
  const vp = await ab(['set', 'viewport', String(cfg.vw), String(cfg.vh)])
  if (!vp.ok) {
    res.setupOk = false
    res.verifierProblems.push(`set viewport failed: ${vp.stderr.trim()}`)
    return res
  }

  // 4. Color scheme.
  const md = await ab(['set', 'media', cfg.dark ? 'dark' : 'light'])
  if (!md.ok) {
    res.setupOk = false
    res.verifierProblems.push(`set media failed: ${md.stderr.trim()}`)
    return res
  }

  // 5. Clear capture state so only the target navigation is judged. All four
  //    clears must succeed (they define the capture window).
  const clears = [
    await ab(['console', '--clear']),
    await ab(['errors', '--clear']),
    await ab(['network', 'requests', '--clear']),
    await ab(['cookies', 'clear']),
  ]
  if (clears.some((c) => !c.ok)) {
    res.setupOk = false
    res.verifierProblems.push('clear capture state failed')
    return res
  }

  // 6. Target navigation, verified by exact origin+pathname. After `open`,
  //    poll for the URL to actually reach the expected route (this absorbs the
  //    async-navigation race where `open` returns before the URL updates, and
  //    transient page-load hiccups). Retry the open up to 3 times.
  res.navOk = false
  let lastUrl = ''
  for (let attempt = 0; attempt < 3 && !res.navOk; attempt++) {
    const nav = await ab(['open', BASE + cfg.route])
    if (!nav.ok) {
      res.verifierProblems.push(`target open failed: ${nav.stderr.trim()}`)
      return res
    }
    res.navOk = await waitForUrlPath(cfg.route, 8000)
    lastUrl = await currentUrl()
  }
  if (!res.navOk) {
    res.verifierProblems.push(
      `navigation URL mismatch after retries (origin+pathname): ${lastUrl}`
    )
    return res
  }

  // 7. Target text (visible), title, then settle the target's own requests.
  //    All three are structured observations: an observation the verifier
  //    could not make is a verifier problem (exit 3), never "result false".
  const textObs = await waitForText(cfg.expectText, 10000)
  res.textObservationOk = textObs.observationOk
  res.foundText = textObs.found
  if (!textObs.observationOk) {
    res.setupOk = false
    res.verifierProblems.push(
      'could not observe target text (eval never produced a boolean): ' +
        JSON.stringify(cfg.expectText)
    )
    return res
  }
  if (!res.foundText) {
    res.failures.push(
      `target text not found: ${JSON.stringify(cfg.expectText)}`
    )
  }
  const t = await ab(['get', 'title'])
  if (!t.ok) {
    res.setupOk = false
    res.verifierProblems.push(`get title failed: ${t.stderr.trim()}`)
    return res
  }
  res.title = t.stdout.trim()
  res.titleOk = res.title === EXPECTED_TITLE
  if (!res.titleOk) {
    res.failures.push(`title mismatch: ${JSON.stringify(res.title)}`)
  }
  const idleObs = await waitForNetworkIdle(12000)
  if (!idleObs.observationOk) {
    res.setupOk = false
    res.verifierProblems.push(
      'could not query network log while waiting for idle (after target nav)'
    )
    return res
  }
  if (!idleObs.idle) {
    res.failures.push(
      'network did not settle after target navigation (timeout)'
    )
  }

  // 8. Real dark-state assertion (not just the colorScheme setting).
  if (cfg.assertDark) {
    const dexpr =
      "({darkClass:document.documentElement.classList.contains('dark')," +
      'bg:getComputedStyle(document.body).backgroundColor})'
    const dr = await ab(['eval', dexpr])
    const state = dr.ok ? parseEvalOut(dr.stdout) : null
    res.darkState = state
    if (
      !state ||
      typeof state !== 'object' ||
      !('darkClass' in state) ||
      !('bg' in state)
    ) {
      res.setupOk = false
      res.verifierProblems.push(
        'could not observe dark state (eval returned no valid object)'
      )
      return res
    }
    const lum = parseLuminance(state.bg)
    res.darkOk = state.darkClass === true && lum !== null && lum < 50
    if (!res.darkOk) {
      res.failures.push('dark mode not actually active')
    }
  }

  // 9. Screenshot — a reporting artifact, explicitly NON-gating.
  const shot = await ab(['screenshot', res.screenshot])
  if (!shot.ok) {
    res.notes.push(`screenshot failed (non-gating): ${shot.stderr.trim()}`)
  }

  // 10. Key interaction (marketplace): click a real link to /pricing using a
  //     NATIVE click (a real mouse event, more reliable for SPA router links
  //     than a synthetic element.click()), verify the URL by exact
  //     origin+pathname, then settle (timeout fails) before capture. Retry the
  //     click (up to 3 attempts) to absorb transient SPA-navigation timing
  //     flakes; after each attempt re-check the URL synchronously in case the
  //     click landed but the polling wait missed it, so we never click again
  //     once we've arrived.
  if (cfg.interact) {
    let reached = false
    let brokeOnInvisible = false
    for (let attempt = 0; attempt < 3 && !reached; attempt++) {
      // Bring the link into view; the scroll result is CHECKED (a failed
      // scroll makes the interaction unreliable => verifier problem).
      const sv = await ab(['scrollintoview', 'a[href="/pricing"]'])
      if (!sv.ok) {
        res.setupOk = false
        res.verifierProblems.push(`scrollintoview failed: ${sv.stderr.trim()}`)
        return res
      }
      // Wait for the link to be in the DOM (agent-browser wait), then for it
      // to be actually visible via a bounded element-state poll — no fixed
      // sleep — before the native click.
      const w = await ab(['wait', 'a[href="/pricing"]'])
      if (!w.ok) {
        res.setupOk = false
        res.verifierProblems.push(
          `agent-browser wait failed: ${w.stderr.trim()}`
        )
        return res
      }
      const vis = await waitForElementVisible('a[href="/pricing"]', 5000)
      if (!vis.observationOk) {
        res.setupOk = false
        res.verifierProblems.push(
          'could not observe link visibility (eval never produced a boolean)'
        )
        return res
      }
      if (!vis.visible) {
        brokeOnInvisible = true
        break
      }
      const click = await ab(['click', 'a[href="/pricing"]'])
      if (!click.ok) {
        // The click result is CHECKED: a failed click is recorded as a
        // "failed then retried" note and the attempt is retried (no fixed
        // backoff — the retry is immediate).
        res.notes.push(
          `interaction: click attempt ${attempt + 1} failed ` +
            `(${click.stderr.trim()}); retrying`
        )
        continue
      }
      reached = await waitForUrlPath('/pricing', 8000)
      if (!reached) {
        reached = urlMatchesOriginPath(await currentUrl(), '/pricing')
      }
      if (!reached) {
        res.notes.push(
          `interaction: click attempt ${attempt + 1} did not reach /pricing; retrying`
        )
      }
    }
    res.interactionOk = reached
    if (!res.interactionOk) {
      if (brokeOnInvisible) {
        res.failures.push(
          'interaction: a[href="/pricing"] never became visible'
        )
      } else {
        res.failures.push(
          'interaction: URL did not reach origin+pathname /pricing'
        )
      }
    } else {
      const iidle = await waitForNetworkIdle(12000)
      if (!iidle.observationOk) {
        res.setupOk = false
        res.verifierProblems.push(
          'could not query network log while waiting for idle (after interaction)'
        )
        return res
      }
      if (!iidle.idle) {
        res.interactionOk = false
        res.failures.push('network did not settle after interaction (timeout)')
      }
    }
  }

  // 11. Capture console / pageerror / network (full accumulated log, including
  //     any interaction requests). captureOk requires ALL THREE to succeed.
  if (SIM_CAPTURE_FAIL) {
    res.captureOk = false
    res.verifierProblems.push(
      'capture failed: simulated (P11E2_FORCE_CAPTURE_FAIL)'
    )
  } else {
    try {
      let netData
      let consoleData
      let errorsData
      if (SIM_BAD_CAPTURE) {
        // Simulation: malformed payloads (missing fields / wrong types) must
        // fail the strict schema check — never become successful empty logs.
        netData = { requests: 'not-an-array' }
        consoleData = {}
        errorsData = { errors: null }
      } else if (SIM_EMPTY_CAPTURE) {
        // Simulation: an EMPTY capture (legal empty arrays, but no requests).
        // The target Document is absent => captureOk=false => exit 3, never
        // exit 0/1.
        netData = { requests: [] }
        consoleData = { messages: [] }
        errorsData = { errors: [] }
      } else {
        netData = await abJson(['network', 'requests'])
        consoleData = await abJson(['console'])
        errorsData = await abJson(['errors'])
      }
      // Strict schema: any missing field or wrong type => captureOk=false.
      if (!netData || !Array.isArray(netData.requests)) {
        throw new Error('network payload missing or non-array "requests" field')
      }
      if (!consoleData || !Array.isArray(consoleData.messages)) {
        throw new Error('console payload missing or non-array "messages" field')
      }
      if (!errorsData || !Array.isArray(errorsData.errors)) {
        throw new Error('errors payload missing or non-array "errors" field')
      }
      // Per-record schema: every request must carry a non-empty url, a
      // resourceType and a numeric (or absent/aborted) status.
      if (!netData.requests.every(validRequestRecord)) {
        throw new Error('network payload contains invalid request records')
      }
      res.rawRequests = netData.requests
      // The capture window was cleared before the target navigation, so the
      // capture MUST contain the target page's Document with a success status.
      // A missing target Document means the window/session is unusable =>
      // captureOk=false => exit 3.
      if (!hasTargetDocument(res.rawRequests, cfg.route)) {
        throw new Error(
          `capture missing target Document (${cfg.route}) with success status`
        )
      }
      res.networkErrors = analyzeNetwork(res.rawRequests)
      res.consoleErrors = analyzeConsole(consoleData.messages, res.rawRequests)
      res.pageErrors = analyzePageErrors(errorsData.errors)
      res.captureOk = true
    } catch (e) {
      res.captureOk = false
      res.verifierProblems.push(`capture failed: ${e.message ?? e}`)
    }
  }
  res.failures.push(
    ...res.networkErrors,
    ...res.consoleErrors,
    ...res.pageErrors
  )
  // Core-endpoint 429 = rate-limit contamination, surfaced so the aggregate
  // verdict can return exit 3 (never exit 0).
  res.coreRateLimited = res.networkErrors.some(isCoreRateLimitFailure)

  // 12. Verdict. captureOk is mandatory and res.failures is never ignored.
  res.ok =
    res.setupOk &&
    res.navOk &&
    res.captureOk &&
    res.titleOk &&
    res.foundText &&
    res.darkOk &&
    res.interactionOk &&
    res.failures.length === 0
  return res
}

function printResult(r) {
  const tag = r.ok ? '✓' : '✗'
  const dark = r.darkState
    ? ` dark(class=${r.darkState.darkClass},bg=${r.darkState.bg})`
    : ''
  console.log(
    `${tag} ${r.name}: setupOk=${r.setupOk} navOk=${r.navOk} captureOk=${r.captureOk} ` +
      `title=${JSON.stringify(r.title)} titleOk=${r.titleOk} foundText=${r.foundText} ` +
      `darkOk=${r.darkOk}${dark} interactionOk=${r.interactionOk} ` +
      `coreRateLimited=${r.coreRateLimited} ` +
      `failures=${r.failures.length} verifierProblems=${r.verifierProblems.length} ` +
      `shot=${r.screenshot}`
  )
  for (const p of r.verifierProblems) {
    console.log(`     ! verifier: ${p}`)
  }
  for (const f of r.failures) {
    console.log(`     - ${f}`)
  }
  for (const n of r.notes) {
    console.log(`     ~ ${n}`)
  }
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

const SIX_CHECKS = [
  {
    name: 'desktop-home-en',
    route: '/',
    expectText: "China's frontier AI models",
    locale: 'en',
    vw: 1440,
    vh: 900,
    dark: false,
  },
  {
    name: 'desktop-home-zh',
    route: '/',
    expectText: '中国前沿 AI',
    locale: 'zhCN',
    vw: 1440,
    vh: 900,
    dark: false,
  },
  {
    name: 'desktop-home-fr',
    route: '/',
    expectText: "modèles d'IA",
    locale: 'fr',
    vw: 1440,
    vh: 900,
    dark: false,
  },
  {
    name: 'mobile-home-dark',
    route: '/',
    expectText: "China's frontier AI models",
    locale: 'en',
    vw: 390,
    vh: 844,
    dark: true,
    assertDark: true,
  },
  {
    name: 'pricing',
    route: '/pricing',
    expectText: 'Model Square',
    locale: 'en',
    vw: 1440,
    vh: 900,
    dark: false,
  },
  // The interaction check runs LAST: it performs a SPA navigation to /pricing,
  // so placing it at the end means a slow/in-flight navigation can never
  // cascade into a subsequent check's target navigation.
  {
    name: 'marketplace',
    route: '/',
    expectText: 'Live model marketplace',
    locale: 'en',
    vw: 1440,
    vh: 900,
    dark: false,
    interact: true,
  },
]

async function runPositiveChecks() {
  console.log(
    '=== P11-E2 browser verification (six positive checks, agent-browser) ==='
  )
  const results = []
  for (const cfg of SIX_CHECKS) {
    results.push(await runCheck(cfg))
  }
  for (const r of results) {
    printResult(r)
  }
  // 1. Verifier-mechanical problems (setup/nav/capture/observation) make the
  //    run unreliable => verifier-invalid (3).
  const verifierBroken = results.some(
    (r) => !r.setupOk || !r.navOk || !r.captureOk
  )
  if (verifierBroken) {
    console.log(
      `VERIFIER-INVALID: a check could not be performed reliably → exit ${EXIT_INVALID}`
    )
    return EXIT_INVALID
  }
  // 2. Core-endpoint 429 is rate-limit contamination => exit 3, NEVER exit 0.
  const rateLimited = results.some((r) => r.coreRateLimited)
  if (rateLimited) {
    console.log(
      `RATE-LIMIT-CONTAMINATED: a core endpoint returned 429 → exit ${EXIT_INVALID}`
    )
    return EXIT_INVALID
  }
  // 3. Business failures => gate failure (1).
  const businessFail = results.some((r) => r.failures.length > 0)
  if (businessFail) {
    console.log(`AT LEAST ONE CHECK FAILED → exit ${EXIT_GATE_FAIL}`)
    return EXIT_GATE_FAIL
  }
  console.log(`ALL SIX CHECKS PASSED → exit ${EXIT_OK}`)
  return EXIT_OK
}

// Precise missing-caption probe. Returns the intended business failure (exit 1)
// ONLY when capture/setup/navigation are all OK and the SOLE failure is the
// missing caption. Any other condition returns verifier-invalid (exit 3) and
// never prints a probe success.
async function runImpossibleCaptionProbe() {
  console.log('self-test: precise negative probe (impossible caption)')
  const r = await runCheck({
    name: 'self-test-negative',
    route: '/',
    expectText: '__VANCINE_IMPOSSIBLE_CAPTION_ZZZ__',
    locale: 'en',
    vw: 1440,
    vh: 900,
    dark: false,
  })
  printResult(r)

  const verifierOk = r.setupOk && r.navOk && r.captureOk
  if (!verifierOk) {
    console.error(
      `verifier-invalid (exit ${EXIT_INVALID}): probe could not be performed ` +
        `reliably (setupOk=${r.setupOk}, navOk=${r.navOk}, captureOk=${r.captureOk}). ` +
        `NOT a negative-probe success.`
    )
    return EXIT_INVALID
  }

  const soleCaptionFailure =
    r.textObservationOk === true &&
    r.foundText === false &&
    r.failures.length === 1 &&
    r.failures[0].startsWith('target text not found') &&
    r.titleOk &&
    r.darkOk &&
    r.interactionOk &&
    r.networkErrors.length === 0 &&
    r.consoleErrors.length === 0 &&
    r.pageErrors.length === 0

  if (soleCaptionFailure) {
    console.log(
      `self-test PASSED: gate correctly rejected the missing caption; the ONLY ` +
        `failure is foundText=false (no capture/setup/navigation/other errors) → exit ${EXIT_GATE_FAIL}`
    )
    return EXIT_GATE_FAIL
  }

  console.error(
    `verifier-invalid (exit ${EXIT_INVALID}): negative probe was not isolated to ` +
      `the caption (foundText=${r.foundText}, failures=${r.failures.length}). ` +
      `NOT a negative-probe success.`
  )
  return EXIT_INVALID
}

// API-abort probe. Installs an abort route on /api/pricing and asserts the
// verifier intercepts PRECISELY that abort (BASE origin, pathname /api/pricing,
// XHR|Fetch, no status), with every other gate normal and NO unrelated abort.
// Also asserts (synthetically) that a Document abort is reported and that an
// unrelated Image abort would not let the probe pass. The unroute result is
// checked.
async function runApiAbortProbe() {
  console.log('self-test-abort: API-abort negative probe')
  const route = await ab([
    'network',
    'route',
    `${BASE}/api/pricing*`,
    '--abort',
  ])
  if (!route.ok) {
    console.error(
      `verifier-invalid (exit ${EXIT_INVALID}): could not install abort route: ` +
        `${route.stderr.trim()}`
    )
    return EXIT_INVALID
  }

  const r = await runCheck({
    name: 'self-test-abort',
    route: '/',
    expectText: "China's frontier AI models",
    locale: 'en',
    vw: 1440,
    vh: 900,
    dark: false,
  })
  const unroute = await ab(['network', 'unroute'])
  const unrouteOk = unroute.ok
  printResult(r)

  const verifierOk = r.setupOk && r.navOk && r.captureOk
  const targetAborts = r.rawRequests.filter(isPricingAbortTarget)
  // Requirement 4: r.failures must contain EXACTLY one entry per target abort,
  // and every entry must correspond to a target /api/pricing XHR|Fetch abort.
  // Any network-idle timeout, title/text/dark/console/pageerror failure or
  // unrelated network error would add a different entry and fail this.
  const expectedAbortMessages = targetAborts.map(
    (a) => `aborted ${a.resourceType} request (no status): ${a.url}`
  )
  const failuresExactlyTargetAborts =
    targetAborts.length >= 1 &&
    r.failures.length === expectedAbortMessages.length &&
    expectedAbortMessages.every((m) => r.failures.includes(m))
  // Any other no-status request (Document, Image, Script, another API, ...) is
  // an unrelated abort and must prevent the probe from passing.
  const unrelatedAborts = r.rawRequests.filter(
    (req) => hasNoStatus(req) && !isPricingAbortTarget(req)
  )
  const otherGatesNormal =
    r.titleOk &&
    r.foundText &&
    r.darkOk &&
    r.interactionOk &&
    r.consoleErrors.length === 0 &&
    r.pageErrors.length === 0

  if (
    verifierOk &&
    otherGatesNormal &&
    failuresExactlyTargetAborts &&
    unrelatedAborts.length === 0 &&
    unrouteOk
  ) {
    console.log(
      `abort probe PASSED: failures match EXACTLY the /api/pricing XHR/Fetch ` +
        `abort(s) (${targetAborts.length}); no unrelated abort; no idle/title/` +
        `text/dark/console/pageerror failure → exit ${EXIT_GATE_FAIL}`
    )
    for (const a of targetAborts) {
      console.log(`     abort reported: ${a.resourceType} ${a.url} (no status)`)
    }
    return EXIT_GATE_FAIL
  }

  console.error(
    `verifier-invalid (exit ${EXIT_INVALID}): API-abort probe not clean. ` +
      `verifierOk=${verifierOk} otherGatesNormal=${otherGatesNormal} ` +
      `targetAborts=${targetAborts.length} failures=${r.failures.length} ` +
      `failuresExactlyTargetAborts=${failuresExactlyTargetAborts} ` +
      `unrelatedAborts=${unrelatedAborts.length} unrouteOk=${unrouteOk}. ` +
      `NOT a probe success.`
  )
  return EXIT_INVALID
}

// ---------------------------------------------------------------------------
// Synthetic (no-session) classification invariants
// ---------------------------------------------------------------------------

// Prove the failure-classification rules can never misclassify, using pure
// function calls (no browser session): a Document abort is reported (never
// silently passed), an unrelated Image abort stays flagged next to a target
// abort, and a 429 on a core endpoint (/api/pricing, /api/status) is
// rate-limit contamination, never success.
function runSyntheticInvariants() {
  const docAbortCaught =
    analyzeNetwork([{ url: `${BASE}/`, resourceType: 'Document', status: 0 }])
      .length > 0
  const unrelatedImageCaught =
    [
      { url: `${BASE}/api/pricing`, resourceType: 'XHR', status: 0 },
      { url: 'https://ext.example/x.png', resourceType: 'Image', status: 0 },
    ].filter((req) => hasNoStatus(req) && !isPricingAbortTarget(req)).length ===
    1
  const core429NotSuccess =
    analyzeNetwork([
      { url: `${BASE}/api/pricing`, resourceType: 'XHR', status: 429 },
    ]).some(isCoreRateLimitFailure) &&
    analyzeNetwork([
      { url: `${BASE}/api/status`, resourceType: 'Fetch', status: 429 },
    ]).some(isCoreRateLimitFailure)
  // Synthetic proof D: same-URL 2xx + "Failed to load resource" console error
  // is NOT deduplicated — the console error must stand and fail the gate.
  const twoHundredConsoleKept =
    analyzeConsole(
      [{ type: 'error', text: `Failed to load resource: ${BASE}/img.png` }],
      [{ url: `${BASE}/img.png`, resourceType: 'Image', status: 200 }]
    ).length === 1
  // Synthetic proof E: same-URL real network failure (abort) + console message
  // IS deduplicated (the network log already carries the failure).
  const abortConsoleDeduped =
    analyzeConsole(
      [{ type: 'error', text: `Failed to load resource: ${BASE}/img.png` }],
      [{ url: `${BASE}/img.png`, resourceType: 'Image', status: 0 }]
    ).length === 0
  return {
    ok:
      docAbortCaught &&
      unrelatedImageCaught &&
      core429NotSuccess &&
      twoHundredConsoleKept &&
      abortConsoleDeduped,
    docAbortCaught,
    unrelatedImageCaught,
    core429NotSuccess,
    twoHundredConsoleKept,
    abortConsoleDeduped,
  }
}

// ---------------------------------------------------------------------------
// Session lifecycle + entrypoint
// ---------------------------------------------------------------------------

// Close the session and verify it is gone. A failed close, a failed session
// list query, or residue after 4s all make the cleanup fail. Returns
// { ok, closeOk, queryOk, residueGone }.
async function closeSession() {
  const closeRes = await ab(['close'])
  const closeOk = closeRes.ok

  let queryOk = false
  let residueGone = false
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    try {
      const { stdout } = await pExecFile(AB, ['session', 'list'], {
        timeout: 10000,
      })
      queryOk = true
      const names = stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      if (!names.includes(SESSION)) {
        residueGone = true
        break
      }
    } catch {
      // A failed session-list query is NOT "no session" — treat as not-gone.
      queryOk = false
    }
    await sleep(200)
  }

  if (SIM_CLEANUP_FAIL) {
    return { ok: false, closeOk, queryOk, residueGone, simulated: true }
  }
  return {
    ok: closeOk && queryOk && residueGone,
    closeOk,
    queryOk,
    residueGone,
  }
}

// Open the BASE same-origin context page ONCE for this session and settle it,
// establishing the origin (for localStorage) before any check navigates. This
// is the single "navigate to a BASE same-origin page first" step; each check
// then writes i18nextLng and opens its target. Returns true on success.
async function warmUpContext() {
  const ctx = await ab(['open', `${BASE}/`])
  if (!ctx.ok) {
    console.error(
      `verifier-invalid (exit ${EXIT_INVALID}): context open failed: ` +
        `${ctx.stderr.trim()}. The service may be down. NOT a business result.`
    )
    return false
  }
  const idle = await waitForNetworkIdle(12000)
  if (!idle.observationOk) {
    console.error(
      `verifier-invalid (exit ${EXIT_INVALID}): could not query the network ` +
        `log while waiting for the context page to settle. NOT a business result.`
    )
    return false
  }
  if (!idle.idle) {
    console.error(
      `verifier-invalid (exit ${EXIT_INVALID}): context page did not settle ` +
        `(waitForNetworkIdle timeout). NOT a business result.`
    )
    return false
  }
  return true
}

async function main() {
  if (!(await agentBrowserAvailable())) {
    console.error(
      `ENVIRONMENT DEPENDENCY ERROR (exit ${EXIT_ENV}): the 'agent-browser' CLI ` +
        `is required but unavailable, and no session was created. This is an ` +
        `environment issue, not a business-gate failure.`
    )
    return EXIT_ENV
  }
  // Non-gating: ensure the screenshots directory exists (failure is only a
  // warning; it never changes the business exit code). Runs AFTER the
  // availability check so a missing CLI still returns exit 2 first.
  prepareShotsDir()
  console.log(`session: ${SESSION}`)
  // Classification invariants run before any session exists; a failure means
  // the verifier itself is broken (exit 3), not a business result.
  const invariants = runSyntheticInvariants()
  if (!invariants.ok) {
    console.error(
      `verifier-invalid (exit ${EXIT_INVALID}): synthetic classification ` +
        `invariants failed (docAbortCaught=${invariants.docAbortCaught}, ` +
        `unrelatedImageCaught=${invariants.unrelatedImageCaught}, ` +
        `core429NotSuccess=${invariants.core429NotSuccess}, ` +
        `twoHundredConsoleKept=${invariants.twoHundredConsoleKept}, ` +
        `abortConsoleDeduped=${invariants.abortConsoleDeduped}). ` +
        `NOT a business result.`
    )
    return EXIT_INVALID
  }
  if (!(await warmUpContext())) {
    return EXIT_INVALID
  }
  if (process.argv.includes('--self-test')) {
    return runImpossibleCaptionProbe()
  }
  if (process.argv.includes('--self-test-abort')) {
    return runApiAbortProbe()
  }
  return runPositiveChecks()
}

let exitCode
try {
  exitCode = await main()
} catch (e) {
  console.error(
    `VERIFIER CRASH (exit ${EXIT_INVALID}): ${e?.stack ?? e}. ` +
      `This is NOT a negative-probe success.`
  )
  exitCode = EXIT_INVALID
} finally {
  // Session cleanup is a hard gate. If a session was created this run and
  // close/query/residue fails, the final exit becomes verifier-invalid (3).
  if (sessionCreated) {
    const cleanup = await closeSession()
    if (!cleanup.ok) {
      console.error(
        `verifier-invalid: session cleanup failed (close=${cleanup.closeOk} ` +
          `query=${cleanup.queryOk} residueGone=${cleanup.residueGone}` +
          `${cleanup.simulated ? ', simulated' : ''}) → exit ${EXIT_INVALID}`
      )
      exitCode = EXIT_INVALID
    }
  }
}
process.exitCode = exitCode
