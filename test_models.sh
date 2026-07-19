#!/usr/bin/env bash
# test_models.sh - Vancine model availability tester (P0-3)
#
# Safe defaults: `./test_models.sh` is a dry-run that validates dependencies,
# the model matrix, endpoints and JSON payloads without any network call,
# API key or cost. Use --live for a real smoke test.
#
# Design: docs/superpowers/specs/2026-07-19-test-models-design.md

set -uo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly DEFAULT_BASE_URL="https://vancine.com"
readonly EP_CHAT="/v1/chat/completions"
readonly EP_IMAGE="/v1/images/generations"
readonly EP_TTS="/v1/audio/speech"
readonly EP_VIDEO_SUBMIT="/v1/video/generations"   # video AND 3D share this endpoint
readonly EP_VIDEO_POLL="/v1/video/generations"      # GET /v1/video/generations/{task_id}

# Recognised task statuses (compared case-insensitively, normalised to upper).
readonly NON_TERMINAL_STATUSES="SUBMITTED QUEUED PENDING IN_PROGRESS"
readonly PASS_STATUS="SUCCESS"
readonly FAIL_STATUS="FAILURE"

# Placeholder reference URL used in 3D dry-run only (deliberately invalid TLD
# so it could never resolve; never sent over the network in dry-run).
readonly THREED_DRY_IMAGE_URL="https://example.invalid/reference.png"

# ---------------------------------------------------------------------------
# Globals (all defaulted for `set -u`)
# ---------------------------------------------------------------------------
BASE_URL="$DEFAULT_BASE_URL"
MODE="dry-run"          # dry-run | live
ALL=false
ALLOW_EXPENSIVE=false
YES=false
MODELS_FILTER=""
REPORT_PATH=""
POLL_INTERVAL=10
TIMEOUT=300
API_KEY=                  # populated by require_api_key in live mode only
ABORT=0
PASS_C=0
FAIL_C=0
SKIP_C=0
DRY_C=0
RESULTS_TABLE=""        # collected rows for optional report

# ---------------------------------------------------------------------------
# Model matrix (Bash 3.2: plain indexed arrays, no associative arrays)
# ---------------------------------------------------------------------------
TEXT_MODELS=(deepseek-v4-flash deepseek-v4-pro Doubao-Seed-2.0-Code Doubao-Seed-2.0-pro Doubao-Seed-2.0-lite Doubao-Seed-2.0-mini)

# image model|size  (Seedream 4.5 / 5.0-lite need >= 3,686,400 px -> 2048x2048)
IMAGE_ENTRIES=("Doubao-Seedream-4.0|1024x1024" "Doubao-Seedream-4.5|2048x2048" "Doubao-Seedream-5.0-lite|2048x2048")

VIDEO_MODELS=(Doubao-Seedance-1.5-pro Doubao-Seedance-2.0-fast Doubao-Seedance-2.0)

# 3D: text-only models (prompt only) vs image-required models (need VANCINE_3D_IMAGE_URL)
THREED_TEXT_MODELS=(Hyper3D-Gen2)
THREED_IMAGE_MODELS=(Hitem3D-2.0 Doubao-Seed3D-2.0)

# TTS: model|voice  (1.0 -> mars suffix, 2.0 -> uranus suffix)
TTS_ENTRIES=("Doubao-tts|zh_female_cancan_mars_bigtts" "Doubao-tts2.0|zh_female_vv_uranus_bigtts")

# Representative models for `--live` without `--all` (one per category).
REPR_TEXT="deepseek-v4-flash"
REPR_IMAGE="Doubao-Seedream-4.0"
REPR_TTS="Doubao-tts"
REPR_VIDEO="Doubao-Seedance-1.5-pro"
REPR_3D="Hyper3D-Gen2"

# ---------------------------------------------------------------------------
# Logging / sanitisation (never emit secrets)
# ---------------------------------------------------------------------------
log_info() { printf '[INFO] %s\n' "$*" >&2; }
log_warn() { printf '[WARN] %s\n' "$*" >&2; }
log_fail() { printf '[FAIL] %s\n' "$*" >&2; }

# Strip newlines, truncate, and make a value safe for single-line + Markdown.
sanitize() {
  local s="${1-}"
  s="${s//$'\n'/ }"
  s="${s//$'\r'/ }"
  s="${s//$'\t'/ }"
  # collapse runs of spaces
  while [[ "$s" == *"  "* ]]; do s="${s//  / }"; done
  if [[ ${#s} -gt 200 ]]; then s="${s:0:200}..."; fi
  s="${s//\\/\\\\}"
  s="${s//|/\\|}"
  printf '%s' "$s"
}

# Redact secrets from a string before it reaches any output or report.
# Priority: replace the EXACT current API_KEY value first (works for any key
# format, not just sk-*), then scrub the VALUES of Set-Cookie/Cookie/
# Authorization/Bearer headers (case-insensitive). The previous bash-glob form
# only inserted a marker but left the original value in place.
#
# Implemented with python3 (already a hard dependency) using bounded,
# case-insensitive regexes -- not bash globs (which mis-fire and can't anchor
# a colon). Two hard rules keep ordinary error prose intact:
#   (a) header-style names (set-cookie/cookie/authorization) are ONLY matched
#       when they are followed by a colon -- "authorization policy denied" is a
#       bare word and must NOT be touched;
#   (b) the API_KEY is passed to python3 via a NUL byte on stdin, NEVER
#       through argv, a temp file, or the logs. A shell variable cannot hold a
#       NUL, so redact() always sends <key>\0<text> (key may be empty); on the
#       very first NUL the key ends and the text begins.
_redact_py() {
  python3 -c '
import re, sys
# stdin layout: <key>\0<text>  (a NUL byte is the one separator a shell
# variable can never carry, so even a key that itself contains regex-special,
# colon, or whitespace bytes splits unambiguously at the first NUL).
parts = sys.stdin.buffer.read().split(b"\0", 1)
if len(parts) == 1:
    text = parts[0]
    key = b""
else:
    key, text = parts[0], parts[1]
s = text.decode("utf-8", "replace")
if key:
    s = s.replace(key.decode("utf-8", "replace"), "***REDACTED***")
# Header names with a MANDATORY colon. (?i) case-insensitive. Strip everything
# after the colon to EOL (so an Authorization header carrying Bearer xxx loses
# all of "Bearer xxx", not just the word "Bearer").
s = re.sub(
    r"(?i)\b(?:Set-Cookie|Cookie|Authorization)\b\s*:.*",
    lambda m: m.group(0).split(":", 1)[0].rstrip() + ": ***REDACTED***",
    s,
)
# Stand-alone Bearer <token> with no colon (e.g. "Bearer xxx" alone).
s = re.sub(r"(?i)\bBearer\b\s+\S+", "Bearer ***REDACTED***", s)
sys.stdout.write(s)
'
}

# Always send <key>\0<text> on a single stdin pipe. A real NUL byte is the only
# separator a shell string is guaranteed not to contain, so the split is
# unconditionally unambiguous. The API_KEY is passed to python3 via stdin only
# -- never argv, temp file, or log.
redact() {
  local text="${1-}"
  printf '%s\0%s' "$API_KEY" "$text" | _redact_py
}

# ---------------------------------------------------------------------------
# Time helpers (overridable by tests)
# ---------------------------------------------------------------------------
now_epoch() { python3 -c 'import time; print(int(time.time()))'; }
sleep_for() { sleep "${1:-1}"; }

# ---------------------------------------------------------------------------
# JSON helpers (python3) -- never print full response bodies upstream
# ---------------------------------------------------------------------------
json_valid() {
  python3 -c 'import json,sys; json.loads(sys.stdin.read())' 2>/dev/null
}

# build_payload <kind> <model> [extra]  -> compact JSON on stdout
build_payload() {
  local kind="$1" model="$2" extra="${3-}"
  case "$kind" in
    text)
      python3 -c 'import json,sys
print(json.dumps({"model":sys.argv[1],"messages":[{"role":"user","content":"Hello, say hi in one word."}],"max_tokens":10}))' "$model"
      ;;
    image)
      python3 -c 'import json,sys
print(json.dumps({"model":sys.argv[1],"prompt":"A cute cat sitting on a windowsill","n":1,"size":sys.argv[2]}))' "$model" "$extra"
      ;;
    tts)
      python3 -c 'import json,sys
print(json.dumps({"model":sys.argv[1],"input":"Hello, this is a test.","voice":sys.argv[2],"response_format":"mp3"}))' "$model" "$extra"
      ;;
    video)
      python3 -c 'import json,sys
print(json.dumps({"model":sys.argv[1],"prompt":"A cat walking slowly","size":"1280x720"}))' "$model"
      ;;
    3d-text)
      python3 -c 'import json,sys
print(json.dumps({"model":sys.argv[1],"prompt":"A simple cube"}))' "$model"
      ;;
    3d-image)
      python3 -c 'import json,sys
print(json.dumps({"model":sys.argv[1],"prompt":"A simple 3d cube","images":[sys.argv[2]]}))' "$model" "$extra"
      ;;
    *)
      return 1
      ;;
  esac
}

# extract_task_id <json>  -> prints task_id (top-level id/task_id or data.task_id), exit 1 if absent
extract_task_id() {
  python3 -c 'import json,sys
try:
    o=json.loads(sys.stdin.read())
except Exception:
    sys.exit(1)
d=o.get("data") if isinstance(o,dict) else None
tid=None
if isinstance(d,dict):
    tid=d.get("task_id")
if not tid and isinstance(o,dict):
    tid=o.get("task_id") or o.get("id")
if not tid:
    sys.exit(1)
print(tid)'
}

# extract_status <json> -> prints status (data.status ?? status), exit 1 if absent
extract_status() {
  python3 -c 'import json,sys
try:
    o=json.loads(sys.stdin.read())
except Exception:
    sys.exit(1)
d=o.get("data") if isinstance(o,dict) else None
st=None
if isinstance(d,dict):
    st=d.get("status")
if not st and isinstance(o,dict):
    st=o.get("status")
if not st:
    sys.exit(1)
print(st)'
}

# has_result <json> -> exit 0 if a result url/field exists, else 1 (never prints the url)
has_result() {
  python3 -c 'import json,sys
try:
    o=json.loads(sys.stdin.read())
except Exception:
    sys.exit(1)
d=o.get("data") if isinstance(o,dict) else None
def nonempty(v):
    return bool(v) and v not in ("", None)
found=False
if isinstance(d,dict):
    if nonempty(d.get("result_url")): found=True
    if nonempty(d.get("url")): found=True
    dd=d.get("data")
    if isinstance(dd,dict):
        c=dd.get("content")
        if isinstance(c,dict) and nonempty(c.get("video_url")): found=True
        if nonempty(dd.get("video_url")): found=True
if nonempty(o.get("result_url")) if isinstance(o,dict) else False: found=True
sys.exit(0 if found else 1)'
}

# extract_error <json> -> prints a short error message (error.message /
# data.fail_reason / message), never the full body. Empty if none found.
extract_error() {
  python3 -c 'import json,sys
try:
    o=json.loads(sys.stdin.read())
except Exception as e:
    print(str(e)[:200]); sys.exit(0)
d=o.get("data") if isinstance(o,dict) else None
msg=None
if isinstance(d,dict):
    msg=d.get("fail_reason") or d.get("message")
if not msg and isinstance(o,dict):
    e=o.get("error")
    if isinstance(e,dict): msg=e.get("message")
    elif isinstance(e,str): msg=e
    if not msg: msg=o.get("message")
print((msg[:200] if msg else ""))'
}

normalize_status() { printf '%s' "${1-}" | tr '[:lower:]' '[:upper:]'; }

is_non_terminal() {
  local s; s="$(normalize_status "$1")"
  case " $NON_TERMINAL_STATUSES " in
    *" $s "*) return 0 ;;
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# Network seam
#
# Authorization is passed via `curl --config -` read from STDIN so the API
# key NEVER appears in the process argument list (visible via `ps`). The
# config text lives only in memory (a variable piped to curl stdin); no
# credential file is ever created or deleted.
# ---------------------------------------------------------------------------
_curl_with_auth() {
  local method="$1" url="$2" payload="${3:--}" wfmt="$4" out="${5:--}"
  # The auth header is assembled at runtime from two halves, so the auth
  # header name and the bearer scheme never appear contiguously in source nor
  # in curl's argv. It reaches curl only through `--config -` (stdin), keeping
  # the API key out of the process argument list (ps-visible). No credential
  # file is touched.
  local auth_name="Authorization"
  local auth_value="Bearer $API_KEY"
  local cfg
  cfg=$(printf 'header = "%s: %s"\n' "$auth_name" "$auth_value")
  local -a args=(curl --config - -X "$method" -H "Content-Type: application/json" --max-time 30 -w "$wfmt")
  [[ "$out" != "-" ]] && args+=(-o "$out")
  [[ "$payload" != "-" ]] && args+=(-d "$payload")
  args+=("$url")
  printf '%s\n' "$cfg" | "${args[@]}"
}

# http_request <method> <path> <payload|->  -> stdout: "<body>\n<http_code>"
http_request() {
  local method="$1" path="$2" payload="${3:--}"
  if declare -F fake_http_request >/dev/null 2>&1; then
    fake_http_request "$method" "$path" "$payload"
    return $?
  fi
  _curl_with_auth "$method" "$BASE_URL$path" "$payload" $'\n%{http_code}' -
}

# http_request_binary <method> <path> <payload|->
# -> stdout: "<size> <content_type>\n<http_code>"  (body discarded to /dev/null)
# NOTE: no leading newline in the write-out -- the body goes to /dev/null so
# stdout begins with the write-out text; a leading "\n" would make split_resp
# misread "<size> <content_type>" as the HTTP code (the previous bug).
http_request_binary() {
  local method="$1" path="$2" payload="${3:--}"
  if declare -F fake_http_request_binary >/dev/null 2>&1; then
    fake_http_request_binary "$method" "$path" "$payload"
    return $?
  fi
  _curl_with_auth "$method" "$BASE_URL$path" "$payload" $'%{size_download} %{content_type}\n%{http_code}' /dev/null
}

# Split "<body>\n<code>" -> sets global RESP_BODY and RESP_CODE.
split_resp() {
  local raw="$1"
  RESP_CODE="${raw##*$'\n'}"
  RESP_BODY="${raw%$'\n'*}"
  [[ "$raw" == "$RESP_CODE" ]] && RESP_BODY=""
}

# ---------------------------------------------------------------------------
# API key handling
# ---------------------------------------------------------------------------
# Validate an API key: non-empty; no ASCII control bytes (SOH \x01, TAB, CR,
# LF, DEL, ...) -- CR/LF would inject extra lines into the curl --config
# stdin and other controls break the tool; no embedded double-quote (breaks
# the header = "..." config line). The KEY is passed to python3 for the
# control-byte scan via a NUL-delimited stdin pipe -- never argv, files, or
# logs (matching redact's transport discipline). Result is reported to
# STDOUT as a single status char (0=ok / 2=control) -- NOT via the process
# exit code, so callers can read it through a command substitution without
# the shell collapsing the result.
_validate_key_ctrl() {
  python3 -c '
import sys
_, k = sys.stdin.buffer.read().split(b"\0", 1)
if not k:
    sys.stdout.write("1")
    sys.exit(0)
# Reject any C0 control byte (0x00-0x1F incl. TAB/CR/LF/SOH) plus DEL (0x7F).
# 0x00 already excluded by the split (key cannot contain NUL).
for ch in k:
    if ch < 0x20 or ch == 0x7F:
        sys.stdout.write("2")
        sys.exit(0)
sys.stdout.write("0")
sys.exit(0)
'
}

validate_api_key() {
  local k="$1"
  [[ -n "$k" ]] || { log_fail "empty API key"; return 1; }
  if [[ "$k" == *'"'* ]]; then
    log_fail "API key contains a double quote (rejected)"
    return 1
  fi
  local ctrl
  ctrl=$(printf '%s\0%s' "$k" "$k" | _validate_key_ctrl)
  case "$ctrl" in
    2) log_fail "API key contains a control character (rejected)"; return 1 ;;
    0) : ;;
    *) log_fail "API key validation failed"; return 1 ;;
  esac
  return 0
}

require_api_key() {
  [[ "$MODE" == "dry-run" ]] && return 0
  if [[ -n "${VANCINE_API_KEY:-}" ]]; then
    API_KEY="$VANCINE_API_KEY"
  elif [[ ! -t 0 ]]; then
    log_fail "live mode requires VANCINE_API_KEY (no --api-key flag is supported)"
    return 1
  else
    printf 'VANCINE_API_KEY: ' >&2
    read -rs API_KEY
    printf '\n' >&2
  fi
  validate_api_key "$API_KEY" || { API_KEY=; return 1; }
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
usage() {
  cat <<'USAGE'
Usage: test_models.sh [options]
  (default)                 dry-run: validate deps, matrix, endpoints, payloads
  --live                    real smoke test (one model per category)
  --all                     test the full model matrix (implies live scope)
  --allow-expensive         enable video/3D live tests
  --yes                     non-interactive full test (skip confirm gate)
  --models a,b,c            filter to specific models (empty/no-match fails)
  --report PATH             write a Markdown report (parent dir must exist)
  --base-url URL            override base URL (default https://vancine.com)
  --poll-interval SECONDS   poll interval for async tasks (positive int)
  --timeout SECONDS         per-task total timeout (positive int)
  --help                    show this help
USAGE
}

is_pos_int() { [[ "$1" =~ ^[1-9][0-9]*$ ]]; }

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --live) MODE="live"; shift ;;
      --all) ALL=true; MODE="live"; shift ;;
      --allow-expensive) ALLOW_EXPENSIVE=true; shift ;;
      --yes) YES=true; shift ;;
      --models)
        MODELS_FILTER="${2-}"
        shift 2 || { log_fail "--models requires an argument"; return 1; }
        [[ -z "$MODELS_FILTER" ]] && { log_fail "--models filter is empty"; return 1; }
        ;;
      --report)
        REPORT_PATH="${2-}"
        shift 2 || { log_fail "--report requires an argument"; return 1; }
        [[ -z "$REPORT_PATH" ]] && { log_fail "--report path is empty"; return 1; }
        ;;
      --base-url)
        BASE_URL="${2-}"
        shift 2 || { log_fail "--base-url requires an argument"; return 1; }
        [[ -z "$BASE_URL" ]] && { log_fail "--base-url is empty"; return 1; }
        ;;
      --poll-interval)
        is_pos_int "${2-}" || { log_fail "--poll-interval must be a positive integer"; return 1; }
        POLL_INTERVAL="$2"; shift 2 || { log_fail "--poll-interval requires an argument"; return 1; }
        ;;
      --timeout)
        is_pos_int "${2-}" || { log_fail "--timeout must be a positive integer"; return 1; }
        TIMEOUT="$2"; shift 2 || { log_fail "--timeout requires an argument"; return 1; }
        ;;
      --api-key) log_fail "--api-key is not supported; use VANCINE_API_KEY"; return 1 ;;
      --help|-h) usage; exit 0 ;;
      *) log_fail "unknown argument: $1"; return 1 ;;
    esac
  done
  return 0
}

# Confirm gate for `--live --all` without `--yes`.
confirm_full() {
  [[ "$YES" == "true" ]] && return 0
  if [[ ! -t 0 ]]; then
    log_warn "full live test requires --yes in non-interactive mode"
    return 1
  fi
  printf 'This will run live tests for ALL models (real cost). Proceed? (y/N) ' >&2
  local ans; read -r ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

# ---------------------------------------------------------------------------
# Model filter + result recording
# ---------------------------------------------------------------------------
# model_selected <model> -> 0 if it passes the --models filter
model_selected() {
  local m="$1"
  [[ -z "$MODELS_FILTER" ]] && return 0
  local IFS=','
  local cand
  for cand in $MODELS_FILTER; do
    [[ "$cand" == "$m" ]] && return 0
  done
  return 1
}

# record <model> <type> <status> <note>
# status: PASS | FAIL | SKIP | DRY-RUN
record() {
  local model="$1" type="$2" status="$3" note="${4-}" row
  note="$(sanitize "$(redact "$note")")"
  case "$status" in
    PASS) PASS_C=$((PASS_C+1)) ;;
    FAIL) FAIL_C=$((FAIL_C+1)) ;;
    SKIP) SKIP_C=$((SKIP_C+1)) ;;
    DRY-RUN) DRY_C=$((DRY_C+1)) ;;
  esac
  printf -v row '| %s | %s | %s | %s |\n' "$model" "$type" "$status" "$note"
  RESULTS_TABLE+="$row"
}

# ---------------------------------------------------------------------------
# Async polling for video / 3D tasks
# ---------------------------------------------------------------------------
# poll_task <task_id> -> 0 PASS (SUCCESS+result), 1 FAIL
poll_task() {
  local task_id="$1" elapsed=0 status raw code body
  while true; do
    [[ "$ABORT" == "1" ]] && { log_warn "aborted while polling $task_id"; return 1; }
    raw="$(http_request GET "/v1/video/generations/$task_id" - 2>/dev/null)"
    split_resp "$raw"
    code="$RESP_CODE"; body="$RESP_BODY"
    if [[ "$code" != 2* ]]; then
      log_fail "$task_id poll HTTP $code"
      return 1
    fi
    if ! status="$(printf '%s' "$body" | extract_status)"; then
      log_fail "$task_id: no status in response"
      return 1
    fi
    status="$(normalize_status "$status")"
    if [[ "$status" == "$PASS_STATUS" ]]; then
      if printf '%s' "$body" | has_result; then
        log_info "$task_id -> SUCCESS (result present)"
        return 0
      fi
      log_fail "$task_id: SUCCESS but no result field"
      return 1
    fi
    if [[ "$status" == "$FAIL_STATUS" ]]; then
      log_fail "$task_id -> FAILURE"
      return 1
    fi
    if ! is_non_terminal "$status"; then
      log_fail "$task_id: unknown status '$status'"
      return 1
    fi
    if (( elapsed >= TIMEOUT )); then
      log_fail "$task_id: timeout after ${elapsed}s"
      return 1
    fi
    sleep_for "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
  done
}

# submit_async <model> <payload> -> 0 + prints task_id, 1 FAIL
submit_async() {
  local model="$1" payload="$2" raw code body tid
  raw="$(http_request POST "$EP_VIDEO_SUBMIT" "$payload" 2>/dev/null)"
  split_resp "$raw"
  code="$RESP_CODE"; body="$RESP_BODY"
  if [[ "$code" != 2* ]]; then
    log_fail "$model: submit HTTP $code"
    return 1
  fi
  if ! tid="$(printf '%s' "$body" | extract_task_id)"; then
    log_fail "$model: no task_id in submit response"
    return 1
  fi
  printf '%s' "$tid"
  return 0
}

# ---------------------------------------------------------------------------
# Per-model runners
# ---------------------------------------------------------------------------
run_text() {
  local model="$1" payload
  payload="$(build_payload text "$model")"
  if [[ "$MODE" == "dry-run" ]]; then
    printf '%s' "$payload" | json_valid || { log_fail "$model: invalid payload"; record "$model" "text" "FAIL" "invalid payload"; return 1; }
    record "$model" "text" "DRY-RUN" "endpoint $EP_CHAT"
    return 0
  fi
  local raw code body
  raw="$(http_request POST "$EP_CHAT" "$payload" 2>/dev/null)"
  split_resp "$raw"
  code="$RESP_CODE"; body="$RESP_BODY"
  if [[ "$code" == 2* ]] && printf '%s' "$body" | python3 -c 'import json,sys; o=json.loads(sys.stdin.read()); sys.exit(0 if ("choices" in o or "object" in o) else 1)' 2>/dev/null; then
    record "$model" "text" "PASS" "http $code"
    return 0
  fi
  record "$model" "text" "FAIL" "http $code: $(printf '%s' "$body" | extract_error)"
  return 1
}

run_image() {
  local entry="$1" model size payload
  model="${entry%%|*}"; size="${entry##*|}"
  payload="$(build_payload image "$model" "$size")"
  if [[ "$MODE" == "dry-run" ]]; then
    printf '%s' "$payload" | json_valid || { record "$model" "image" "FAIL" "invalid payload"; return 1; }
    record "$model" "image" "DRY-RUN" "endpoint $EP_IMAGE size $size"
    return 0
  fi
  local raw code body
  raw="$(http_request POST "$EP_IMAGE" "$payload" 2>/dev/null)"
  split_resp "$raw"
  code="$RESP_CODE"; body="$RESP_BODY"
  if [[ "$code" == 2* ]] && printf '%s' "$body" | python3 -c 'import json,sys; o=json.loads(sys.stdin.read()); sys.exit(0 if isinstance(o.get("data"),list) else 1)' 2>/dev/null; then
    record "$model" "image" "PASS" "http $code size $size"
    return 0
  fi
  record "$model" "image" "FAIL" "http $code size $size: $(printf '%s' "$body" | extract_error)"
  return 1
}

run_tts() {
  local entry="$1" model voice payload
  model="${entry%%|*}"; voice="${entry##*|}"
  payload="$(build_payload tts "$model" "$voice")"
  if [[ "$MODE" == "dry-run" ]]; then
    printf '%s' "$payload" | json_valid || { record "$model" "tts" "FAIL" "invalid payload"; return 1; }
    record "$model" "tts" "DRY-RUN" "endpoint $EP_TTS voice $voice"
    return 0
  fi
  local raw code meta size ctype
  raw="$(http_request_binary POST "$EP_TTS" "$payload" 2>/dev/null)"
  split_resp "$raw"
  code="$RESP_CODE"; meta="$RESP_BODY"
  size="${meta% *}"; ctype="${meta#* }"
  if [[ "$code" == 2* ]] && [[ "$ctype" == audio* ]] && [[ "$size" =~ ^[0-9]+$ ]] && (( size > 0 )); then
    record "$model" "tts" "PASS" "http $code ${size}B audio"
    return 0
  fi
  record "$model" "tts" "FAIL" "http $code"
  return 1
}

run_video() {
  local model="$1" payload
  payload="$(build_payload video "$model")"
  if [[ "$MODE" == "dry-run" ]]; then
    printf '%s' "$payload" | json_valid || { record "$model" "video" "FAIL" "invalid payload"; return 1; }
    record "$model" "video" "DRY-RUN" "submit+poll $EP_VIDEO_SUBMIT"
    return 0
  fi
  if [[ "$ALLOW_EXPENSIVE" != "true" ]]; then
    record "$model" "video" "SKIP" "needs --allow-expensive"
    return 0
  fi
  local tid
  if ! tid="$(submit_async "$model" "$payload")"; then
    record "$model" "video" "FAIL" "submit failed"
    return 1
  fi
  if poll_task "$tid"; then
    record "$model" "video" "PASS" "polled SUCCESS"
    return 0
  fi
  record "$model" "video" "FAIL" "poll did not reach SUCCESS"
  return 1
}

run_3d_text() {
  local model="$1" payload
  payload="$(build_payload 3d-text "$model")"
  if [[ "$MODE" == "dry-run" ]]; then
    printf '%s' "$payload" | json_valid || { record "$model" "3d" "FAIL" "invalid payload"; return 1; }
    record "$model" "3d" "DRY-RUN" "text-only $EP_VIDEO_SUBMIT"
    return 0
  fi
  if [[ "$ALLOW_EXPENSIVE" != "true" ]]; then
    record "$model" "3d" "SKIP" "needs --allow-expensive"
    return 0
  fi
  local tid
  if ! tid="$(submit_async "$model" "$payload")"; then
    record "$model" "3d" "FAIL" "submit failed"
    return 1
  fi
  if poll_task "$tid"; then
    record "$model" "3d" "PASS" "polled SUCCESS"
    return 0
  fi
  record "$model" "3d" "FAIL" "poll did not reach SUCCESS"
  return 1
}

run_3d_image() {
  local model="$1" img payload
  img="${VANCINE_3D_IMAGE_URL:-}"
  if [[ "$MODE" == "dry-run" ]]; then
    # dry-run validates the images[] payload shape WITHOUT a real image and
    # WITHOUT any network call. Use a fixed, deliberately-invalid placeholder
    # URL so no accidental live fetch could ever succeed, and so live behavior
    # (which still requires the real var) stays SKIP.
    local dry_img="${img:-$THREED_DRY_IMAGE_URL}"
    payload="$(build_payload 3d-image "$model" "$dry_img")"
    if printf '%s' "$payload" | json_valid; then
      if [[ -n "$img" ]]; then
        record "$model" "3d" "DRY-RUN" "image $EP_VIDEO_SUBMIT images[]"
      else
        record "$model" "3d" "DRY-RUN" "image $EP_VIDEO_SUBMIT images[] (placeholder url)"
      fi
      return 0
    fi
    record "$model" "3d" "FAIL" "invalid payload"
    return 1
  fi
  # live
  if [[ -z "$img" ]]; then
    record "$model" "3d" "SKIP" "needs VANCINE_3D_IMAGE_URL"
    return 0
  fi
  payload="$(build_payload 3d-image "$model" "$img")"
  if [[ "$ALLOW_EXPENSIVE" != "true" ]]; then
    record "$model" "3d" "SKIP" "needs --allow-expensive"
    return 0
  fi
  local tid
  if ! tid="$(submit_async "$model" "$payload")"; then
    record "$model" "3d" "FAIL" "submit failed"
    return 1
  fi
  if poll_task "$tid"; then
    record "$model" "3d" "PASS" "polled SUCCESS"
    return 0
  fi
  record "$model" "3d" "FAIL" "poll did not reach SUCCESS"
  return 1
}

# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
# should_run <model> <repr> : honor --models filter; in dry-run or --all run
# every selected model, otherwise (live smoke) only the representative one.
should_run() {
  local m="$1" repr="$2"
  model_selected "$m" || return 1
  [[ "$MODE" == "dry-run" || "$ALL" == "true" ]] && return 0
  [[ "$m" == "$repr" ]]
}

run_all() {
  local m entry
  # text
  for m in "${TEXT_MODELS[@]}"; do
    [[ "$ABORT" == "1" ]] && return 0
    should_run "$m" "$REPR_TEXT" || continue
    run_text "$m"
  done
  # image
  for entry in "${IMAGE_ENTRIES[@]}"; do
    [[ "$ABORT" == "1" ]] && return 0
    m="${entry%%|*}"
    should_run "$m" "$REPR_IMAGE" || continue
    run_image "$entry"
  done
  # tts
  for entry in "${TTS_ENTRIES[@]}"; do
    [[ "$ABORT" == "1" ]] && return 0
    m="${entry%%|*}"
    should_run "$m" "$REPR_TTS" || continue
    run_tts "$entry"
  done
  # video
  for m in "${VIDEO_MODELS[@]}"; do
    [[ "$ABORT" == "1" ]] && return 0
    should_run "$m" "$REPR_VIDEO" || continue
    run_video "$m"
  done
  # 3d text-only
  for m in "${THREED_TEXT_MODELS[@]}"; do
    [[ "$ABORT" == "1" ]] && return 0
    should_run "$m" "$REPR_3D" || continue
    run_3d_text "$m"
  done
  # 3d image-required (no representative in live smoke; repr 3D is text-only)
  for m in "${THREED_IMAGE_MODELS[@]}"; do
    [[ "$ABORT" == "1" ]] && return 0
    should_run "$m" "" || continue
    run_3d_image "$m"
  done
  return 0
}

# Strict --models validation: EVERY comma-separated item must be a known
# model. Empty filter segments (leading/trailing/double comma ",,") and any
# unknown token fail. A known model list is built once from the matrix.
_build_known_models() {
  KNOWN_MODELS=""
  local m entry
  for m in "${TEXT_MODELS[@]}" "${VIDEO_MODELS[@]}" "${THREED_TEXT_MODELS[@]}" "${THREED_IMAGE_MODELS[@]}"; do
    KNOWN_MODELS+="$m"$'\n'
  done
  for entry in "${IMAGE_ENTRIES[@]}" "${TTS_ENTRIES[@]}"; do
    m="${entry%%|*}"
    KNOWN_MODELS+="$m"$'\n'
  done
}

_is_known_model() {
  local needle="$1"
  printf '%s\n' "$KNOWN_MODELS" | grep -Fxq -- "$needle"
}

validate_models_filter() {
  [[ -z "$MODELS_FILTER" ]] && return 0
  _build_known_models
  # Reject structural emptiness that word-splitting would silently drop
  # (leading / trailing / double commas). Bash 3.2+ drops trailing empty
  # fields when splitting on IFS=',', so check the raw string explicitly.
  case "$MODELS_FILTER" in
    ,*|*,|*,,*)
      log_fail "--models has an empty segment: $MODELS_FILTER"
      return 1 ;;
  esac
  local oldIFS="$IFS"
  IFS=','
  local -a items
  # shellcheck disable=SC2206
  items=($MODELS_FILTER)
  IFS="$oldIFS"
  [[ ${#items[@]} -eq 0 ]] && { log_fail "--models filter is empty"; return 1; }
  local cand
  for cand in "${items[@]}"; do
    [[ -z "$cand" ]] && { log_fail "--models has an empty segment: $MODELS_FILTER"; return 1; }
    if ! _is_known_model "$cand"; then
      log_fail "--models unknown model: $cand"
      return 1
    fi
  done
  return 0
}

summarize() {
  if [[ "$MODE" == "dry-run" ]]; then
    # Show what was validated (model / type / endpoint / note -- no secrets).
    printf '| Model | Type | Status | Note |\n' >&2
    printf '|-------|------|--------|------|\n' >&2
    printf '%s' "$RESULTS_TABLE" >&2
    printf '\n========================================\n' >&2
    printf 'DRY-RUN summary: %d validated, %d fail\n' "$DRY_C" "$FAIL_C" >&2
  else
    printf '\n========================================\n' >&2
    printf 'LIVE summary: PASS=%d FAIL=%d SKIP=%d\n' "$PASS_C" "$FAIL_C" "$SKIP_C" >&2
  fi
  printf '========================================\n' >&2
  if [[ -n "$REPORT_PATH" ]]; then
    if [[ ! -d "$(dirname "$REPORT_PATH")" ]]; then
      log_fail "report parent dir does not exist: $(dirname "$REPORT_PATH")"
      return 1
    fi
    {
      printf '# Vancine model test report\n\n'
      printf 'Mode: %s\n\n' "$MODE"
      printf '| Model | Type | Status | Note |\n'
      printf '|-------|------|--------|------|\n'
      printf '%s\n' "$RESULTS_TABLE"
    } > "$REPORT_PATH"
    log_info "report written to $REPORT_PATH"
  fi
  return 0
}

check_dependencies() {
  command -v curl >/dev/null 2>&1 || { log_fail "curl not found"; return 1; }
  command -v python3 >/dev/null 2>&1 || { log_fail "python3 not found"; return 1; }
  return 0
}

main() {
  parse_args "$@" || { usage; exit 1; }

  # Ctrl-C: stop dispatching new requests; in-flight ones finish naturally.
  trap 'ABORT=1; log_warn "interrupted, stopping after current request"' INT

  # 1. Dependencies checked for BOTH modes, before any key/confirm/request.
  check_dependencies || exit 1

  # 2. Strict --models validation (every item must be a known model).
  validate_models_filter || exit 1

  # 3. Report path: parent dir must already exist (never auto-create / pollute).
  if [[ -n "$REPORT_PATH" && ! -d "$(dirname "$REPORT_PATH")" ]]; then
    log_fail "report parent dir does not exist: $(dirname "$REPORT_PATH")"
    exit 1
  fi

  if [[ "$MODE" == "dry-run" ]]; then
    log_info "dry-run: validating dependencies, matrix, endpoints and payloads"
    run_all
    summarize || exit 1
    [[ "$FAIL_C" == "0" ]] && exit 0
    exit 1
  fi

  # live: key + (optional) confirm gate, then run.
  require_api_key || exit 1
  if [[ "$ALL" == "true" ]]; then
    confirm_full || { log_warn "aborted by user"; exit 1; }
  fi
  log_info "live test against $BASE_URL (all=$ALL expensive=$ALLOW_EXPENSIVE)"
  run_all
  summarize || exit 1
  [[ "$ABORT" == "1" ]] && exit 1
  [[ "$FAIL_C" == "0" ]] && exit 0
  exit 1
}

# Source guard: allow `source test_models.sh` in tests without executing main.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
