#!/usr/bin/env bash
# Offline test harness for test_models.sh (P0-3).
#
# Fully offline: a fake http_request/http_request_binary intercept every
# network call. Never contacts vancine.com, never starts a real billed task,
# never deletes files. Compatible with macOS Bash 3.2 and Linux Bash.
#
# Implementation note: the SUT invokes http_request inside command
# substitutions (subshells), so fake state in shell variables would not
# propagate back. All fake state therefore lives in FILES (trace, fixtures,
# cursor), which persist across subshells.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUT="$SCRIPT_DIR/../test_models.sh"

# Persistent fake-state files (created once, truncated per test, never deleted).
TRACE_FILE=$(mktemp 2>/dev/null || mktemp -t vancine)
FX_FILE=$(mktemp 2>/dev/null || mktemp -t vancine)
CURSOR_FILE=$(mktemp 2>/dev/null || mktemp -t vancine)

# shellcheck source=/dev/null
source "$SUT"

PASS=0
FAIL=0
CURRENT=""

ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$CURRENT"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s -- %s\n' "$CURRENT" "${1-}"; }

assert_eq()           { local exp="$1" got="$2" msg="${3:-}"; if [[ "$exp" == "$got" ]]; then ok; else bad "want[$exp] got[$got] $msg"; fi; }
assert_contains()     { if [[ "$2" == *"$1"* ]]; then ok; else bad "expected [$1] in output"; fi; }
assert_not_contains() { if [[ "$2" == *"$1"* ]]; then bad "did not expect [$1]"; else ok; fi; }

# No-op sleep so polling loops are instant.
sleep_for() { :; }

reset_state() {
  BASE_URL="$DEFAULT_BASE_URL"
  MODE="dry-run"; ALL=false; ALLOW_EXPENSIVE=false; YES=false
  MODELS_FILTER=""; REPORT_PATH=""
  POLL_INTERVAL=10; TIMEOUT=300; API_KEY=""
  ABORT=0; PASS_C=0; FAIL_C=0; SKIP_C=0; DRY_C=0; RESULTS_TABLE=""
  TRACE_CURL=0
  : > "$TRACE_FILE"
  : > "$FX_FILE"
  echo 0 > "$CURSOR_FILE"
  unset VANCINE_API_KEY VANCINE_3D_IMAGE_URL
}

# Queue N fixture responses (one per line; literal "\n" is decoded to newline).
fx()     { printf '%s\n' "$@" >> "$FX_FILE"; }
# Number of recorded calls (trim wc padding).
calls()  { local n; n=$(wc -l < "$TRACE_FILE" | tr -d '[:space:]'); echo "$n"; }
# Was a (method,path) call recorded?
saw()    { awk -F'\t' -v m="$1" -v p="$2" '$1==m && $2==p{f=1} END{exit !f}' "$TRACE_FILE"; }
# Payload of the first call to a given path.
payload_of()      { awk -F'\t' -v p="$1" '$2==p{print $3; exit}' "$TRACE_FILE"; }
# Payload of the last call to a given path.
last_payload_of() { awk -F'\t' -v p="$1" '$2==p{last=$3} END{print last}' "$TRACE_FILE"; }

# Pop the next fixture line by cursor; empty if exhausted.
_next_fx() {
  local n resp
  n=$(cat "$CURSOR_FILE" 2>/dev/null || echo 0)
  resp=$(sed -n "$((n+1))p" "$FX_FILE" 2>/dev/null)
  echo $((n+1)) > "$CURSOR_FILE"
  printf '%s' "$resp"
}

# Fake override of http_request (runs inside SUT's $(...) subshells; uses files).
http_request() {
  local method="$1" path="$2" payload="${3:--}" resp
  [[ "${TRACE_CURL:-0}" == "1" ]] && printf 'SENTINEL_CURL_CALLED\n' >&2
  printf '%s\t%s\t%s\n' "$method" "$path" "$payload" >> "$TRACE_FILE"
  resp=$(_next_fx)
  if [[ -z "$resp" ]]; then
    case "$path" in
      */chat/completions) resp='{"object":"chat.completion","choices":[]}\n200' ;;
      */images/generations) resp='{"data":[{"url":"u"}]}\n200' ;;
      */video/generations* )
        if [[ "$method" == "POST" ]]; then
          resp='{"task_id":"task_fake","status":"queued"}\n200'
        else
          resp='{"data":{"task_id":"task_fake","status":"SUCCESS","result_url":"u"}}\n200'
        fi ;;
      *) resp='{}\n200' ;;
    esac
  fi
  resp="${resp//\\n/$'\n'}"
  printf '%s' "$resp"
}

http_request_binary() {
  local method="$1" path="$2" payload="${3:--}" resp
  [[ "${TRACE_CURL:-0}" == "1" ]] && printf 'SENTINEL_CURL_CALLED\n' >&2
  printf '%s\t%s\t%s\n' "$method" "$path" "$payload" >> "$TRACE_FILE"
  resp=$(_next_fx)
  [[ -z "$resp" ]] && resp='12345 audio/mpeg\n200'
  resp="${resp//\\n/$'\n'}"
  printf '%s' "$resp"
}

# Run main in a subshell; capture combined output + exit code.
run_main() {
  RUN_OUT=$(main "$@" 2>&1)
  RUN_EXIT=$?
}

# ===========================================================================
# T1: default dry-run: no curl, no API key, exit 0, full matrix (17)
# ===========================================================================
CURRENT="T1 dry-run no curl/no key"
reset_state
TRACE_CURL=1
run_main
assert_eq "0" "$RUN_EXIT" "dry-run should exit 0"
assert_not_contains "SENTINEL_CURL_CALLED" "$RUN_OUT"
assert_not_contains "VANCINE_API_KEY" "$RUN_OUT"
assert_contains "17 validated" "$RUN_OUT"

# ===========================================================================
# T2: API key never appears in stdout, stderr, or report
# ===========================================================================
CURRENT="T2 API key redaction"
reset_state
export VANCINE_API_KEY="sk-SECRETKEY123XYZ"
MODE="live"; ALL=false; ALLOW_EXPENSIVE=false
fx '{"id":"x","object":"chat.completion","choices":[]}\n200'
run_text "deepseek-v4-flash"
T2_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t vancine)
REPORT_PATH="$T2_DIR/r.md"
summarize >/dev/null 2>&1
REPORT_CONTENT="$(cat "$REPORT_PATH" 2>/dev/null)"
assert_not_contains "SECRETKEY123XYZ" "$RESULTS_TABLE"
assert_not_contains "SECRETKEY123XYZ" "$REPORT_CONTENT"
assert_not_contains "Bearer" "$RESULTS_TABLE"
assert_not_contains "Bearer" "$REPORT_CONTENT"
unset VANCINE_API_KEY

# ===========================================================================
# T3: error response sanitised + truncated + single-line + markdown-safe
# ===========================================================================
CURRENT="T3 error sanitisation"
reset_state
MODE="live"
export VANCINE_API_KEY="sk-fake"
longmsg="$(python3 -c 'print("a|b|c|" + "X"*300)')"
err_body="$(python3 -c 'import json,sys; print(json.dumps({"error":{"message":sys.argv[1]}}))' "$longmsg")"
fx "${err_body}\n500"
run_text "deepseek-v4-flash"
assert_eq "1" "$FAIL_C" "should FAIL on 500"
note_line="$(printf '%s' "$RESULTS_TABLE" | grep 'deepseek-v4-flash | text | FAIL')"
assert_not_contains "$(python3 -c 'print("X"*300)')" "$note_line"
assert_contains '\|' "$note_line"
unset VANCINE_API_KEY

# ===========================================================================
# T4: endpoints + payloads per type
# ===========================================================================
CURRENT="T4 text endpoint+payload"
reset_state; MODE="live"; export VANCINE_API_KEY="sk-fake"
fx '{"object":"chat.completion","choices":[]}\n200'
run_text "deepseek-v4-flash"
if saw POST "/v1/chat/completions"; then ok; else bad "no POST chat call"; fi
pl=$(payload_of "/v1/chat/completions")
assert_contains "deepseek-v4-flash" "$pl"
assert_contains "messages" "$pl"
assert_eq "1" "$PASS_C"
unset VANCINE_API_KEY

CURRENT="T4 image endpoints + Seedream sizes"
reset_state; MODE="live"; export VANCINE_API_KEY="sk-fake"
fx '{"data":[{"url":"u"}]}\n200'
run_image "Doubao-Seedream-4.0|1024x1024"
if saw POST "/v1/images/generations"; then ok; else bad "no POST image call"; fi
assert_contains "1024x1024" "$(last_payload_of /v1/images/generations)"
fx '{"data":[{"url":"u"}]}\n200'
run_image "Doubao-Seedream-4.5|2048x2048"
assert_contains "2048x2048" "$(last_payload_of /v1/images/generations)"
fx '{"data":[{"url":"u"}]}\n200'
run_image "Doubao-Seedream-5.0-lite|2048x2048"
assert_contains "2048x2048" "$(last_payload_of /v1/images/generations)"
unset VANCINE_API_KEY

CURRENT="T4 video endpoint (submit+poll)"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true; export VANCINE_API_KEY="sk-fake"
fx '{"task_id":"task_abc","status":"queued"}\n200' \
   '{"data":{"task_id":"task_abc","status":"IN_PROGRESS"}}\n200' \
   '{"data":{"task_id":"task_abc","status":"SUCCESS","result_url":"https://x/y.mp4"}}\n200'
run_video "Doubao-Seedance-1.5-pro"
if saw POST "/v1/video/generations"; then ok; else bad "no POST video call"; fi
if saw GET  "/v1/video/generations/task_abc"; then ok; else bad "no GET poll call"; fi
assert_eq "1" "$PASS_C"
unset VANCINE_API_KEY

CURRENT="T4 3d text-only uses video endpoint, no images field"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true; export VANCINE_API_KEY="sk-fake"
fx '{"task_id":"t1","status":"queued"}\n200' \
   '{"data":{"task_id":"t1","status":"SUCCESS","result_url":"u"}}\n200'
run_3d_text "Hyper3D-Gen2"
if saw POST "/v1/video/generations"; then ok; else bad "3d-text not on video endpoint"; fi
assert_not_contains "images" "$(payload_of /v1/video/generations)"
assert_eq "1" "$PASS_C"
unset VANCINE_API_KEY

CURRENT="T4 3d image uses images array (not image_data)"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true
export VANCINE_API_KEY="sk-fake"
export VANCINE_3D_IMAGE_URL="https://example.com/ref.png"
fx '{"task_id":"t2","status":"queued"}\n200' \
   '{"data":{"task_id":"t2","status":"SUCCESS","result_url":"u"}}\n200'
run_3d_image "Doubao-Seed3D-2.0"
if saw POST "/v1/video/generations"; then ok; else bad "3d-image not on video endpoint"; fi
pl=$(payload_of /v1/video/generations)
assert_contains "images" "$pl"
assert_contains "example.com/ref.png" "$pl"
assert_not_contains "image_data" "$pl"
unset VANCINE_API_KEY VANCINE_3D_IMAGE_URL

# ===========================================================================
# T5: TTS version voices (1.0 mars, 2.0 uranus); binary pass/fail
# ===========================================================================
CURRENT="T5 tts voices"
reset_state; MODE="live"; ALL=true; export VANCINE_API_KEY="sk-fake"
fx '12345 audio/mpeg\n200'
run_tts "Doubao-tts|zh_female_cancan_mars_bigtts"
if saw POST "/v1/audio/speech"; then ok; else bad "no POST tts call"; fi
assert_contains "zh_female_cancan_mars_bigtts" "$(payload_of /v1/audio/speech)"
assert_eq "1" "$PASS_C"
fx '12345 audio/mpeg\n200'
run_tts "Doubao-tts2.0|zh_female_vv_uranus_bigtts"
assert_contains "zh_female_vv_uranus_bigtts" "$(last_payload_of /v1/audio/speech)"
assert_eq "2" "$PASS_C"
unset VANCINE_API_KEY

CURRENT="T5 tts zero bytes fails"
reset_state; MODE="live"; ALL=true; export VANCINE_API_KEY="sk-fake"
fx '0 audio/mpeg\n200'
run_tts "Doubao-tts|zh_female_cancan_mars_bigtts"
assert_eq "1" "$FAIL_C"
unset VANCINE_API_KEY

# ===========================================================================
# T6: task_id extraction (top-level id vs missing)
# ===========================================================================
CURRENT="T6 task_id top-level id"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true; export VANCINE_API_KEY="sk-fake"
fx '{"id":"task_top","status":"queued"}\n200' \
   '{"data":{"task_id":"task_top","status":"SUCCESS","result_url":"u"}}\n200'
run_video "Doubao-Seedance-2.0"
assert_eq "1" "$PASS_C"
unset VANCINE_API_KEY

CURRENT="T6 task_id missing -> FAIL"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true; export VANCINE_API_KEY="sk-fake"
fx '{"object":"video","status":"queued"}\n200'
run_video "Doubao-Seedance-2.0"
assert_eq "1" "$FAIL_C"
unset VANCINE_API_KEY

# ===========================================================================
# T7: SUBMITTED -> IN_PROGRESS -> SUCCESS passes (lowercase submit status)
# ===========================================================================
CURRENT="T7 status progression"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true; export VANCINE_API_KEY="sk-fake"
fx '{"task_id":"t7","status":"submitted"}\n200' \
   '{"data":{"task_id":"t7","status":"IN_PROGRESS"}}\n200' \
   '{"data":{"task_id":"t7","status":"SUCCESS","result_url":"u"}}\n200'
run_video "Doubao-Seedance-1.5-pro"
assert_eq "1" "$PASS_C"
unset VANCINE_API_KEY

# ===========================================================================
# T8: FAILURE / unknown status / timeout -> FAIL
# ===========================================================================
CURRENT="T8 FAILURE status"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true; export VANCINE_API_KEY="sk-fake"
fx '{"task_id":"t8","status":"queued"}\n200' \
   '{"data":{"task_id":"t8","status":"FAILURE","fail_reason":"boom"}}\n200'
run_video "Doubao-Seedance-1.5-pro"
assert_eq "1" "$FAIL_C"
unset VANCINE_API_KEY

CURRENT="T8 unknown status"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true; export VANCINE_API_KEY="sk-fake"
fx '{"task_id":"t8b","status":"queued"}\n200' \
   '{"data":{"task_id":"t8b","status":"WAT"}}\n200'
run_video "Doubao-Seedance-1.5-pro"
assert_eq "1" "$FAIL_C"
unset VANCINE_API_KEY

CURRENT="T8 timeout (never SUCCESS)"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true; TIMEOUT=5; export VANCINE_API_KEY="sk-fake"
fx '{"task_id":"t8c","status":"queued"}\n200' \
   '{"data":{"task_id":"t8c","status":"IN_PROGRESS"}}\n200' \
   '{"data":{"task_id":"t8c","status":"IN_PROGRESS"}}\n200'
run_video "Doubao-Seedance-1.5-pro"
assert_eq "1" "$FAIL_C"
unset VANCINE_API_KEY

# ===========================================================================
# T9: expensive gate -- live video without --allow-expensive -> SKIP, no curl
# ===========================================================================
CURRENT="T9 expensive gate"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=false; export VANCINE_API_KEY="sk-fake"
run_video "Doubao-Seedance-1.5-pro"
assert_eq "1" "$SKIP_C"
assert_eq "0" "$(calls)"
unset VANCINE_API_KEY

# ===========================================================================
# T10: --all non-interactive confirm gate
# ===========================================================================
CURRENT="T10 --all confirm gate denies"
reset_state; export VANCINE_API_KEY="sk-fake"
run_main --live --all </dev/null
assert_eq "1" "$RUN_EXIT"
unset VANCINE_API_KEY

CURRENT="T10 --all --yes proceeds"
reset_state; export VANCINE_API_KEY="sk-fake"
run_main --live --all --yes </dev/null
assert_not_contains "aborted by user" "$RUN_OUT"
assert_eq "0" "$RUN_EXIT"
unset VANCINE_API_KEY

# ===========================================================================
# T11: missing VANCINE_3D_IMAGE_URL -> 3D image models SKIP (live)
# ===========================================================================
CURRENT="T11 3d image SKIP without image url"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true; export VANCINE_API_KEY="sk-fake"
unset VANCINE_3D_IMAGE_URL
run_3d_image "Hitem3D-2.0"
assert_eq "1" "$SKIP_C"
assert_eq "0" "$(calls)"
run_3d_image "Doubao-Seed3D-2.0"
assert_eq "2" "$SKIP_C"
unset VANCINE_API_KEY

# ===========================================================================
# T12: --models filter, --report flag, exit codes
# ===========================================================================
CURRENT="T12 --models filters matrix"
reset_state
run_main --models deepseek-v4-flash,Doubao-tts
assert_eq "0" "$RUN_EXIT"
assert_contains "2 validated" "$RUN_OUT"

CURRENT="T12 --models no match fails"
reset_state
run_main --models does-not-exist
assert_eq "1" "$RUN_EXIT"

CURRENT="T12 --models empty fails"
reset_state
run_main --models ""
assert_eq "1" "$RUN_EXIT"

CURRENT="T12 --report missing parent dir fails"
reset_state
run_main --report "$SCRIPT_DIR/no_such_dir/r.md"
assert_eq "1" "$RUN_EXIT"

CURRENT="T12 --report writes when parent exists"
reset_state
T12_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t vancine)
REPORT_TMP="$T12_DIR/r.md"
run_main --report "$REPORT_TMP"
assert_eq "0" "$RUN_EXIT"
assert_contains "# Vancine model test report" "$(cat "$REPORT_TMP" 2>/dev/null)"

# ===========================================================================
# T13: live FAIL -> exit 1; dry-run -> exit 0
# ===========================================================================
CURRENT="T13 live FAIL exits 1"
reset_state; export VANCINE_API_KEY="sk-fake"
fx '{"error":{"message":"no"}}\n500'
run_main --live
assert_eq "1" "$RUN_EXIT"
unset VANCINE_API_KEY

CURRENT="T13 dry-run exits 0"
reset_state
run_main
assert_eq "0" "$RUN_EXIT"

# ===========================================================================
# T14: Ctrl-C abort seam -- ABORT set stops further requests
# ===========================================================================
CURRENT="T14 abort stops run_all"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true; export VANCINE_API_KEY="sk-fake"
ABORT=1
run_all
assert_eq "0" "$(calls)"
unset VANCINE_API_KEY

CURRENT="T14 abort stops poll_task"
reset_state; MODE="live"; ALL=true; ALLOW_EXPENSIVE=true; export VANCINE_API_KEY="sk-fake"
ABORT=1
poll_task "task_x"
assert_eq "1" "$?"
assert_eq "0" "$(calls)"
unset VANCINE_API_KEY

# ===========================================================================
# T15: forbidden / invalid args
# ===========================================================================
CURRENT="T15 --api-key rejected"
reset_state
run_main --api-key sk-whatever
assert_eq "1" "$RUN_EXIT"

CURRENT="T15 unknown arg rejected"
reset_state
run_main --bogus
assert_eq "1" "$RUN_EXIT"

CURRENT="T15 invalid poll-interval"
reset_state
run_main --poll-interval 0
assert_eq "1" "$RUN_EXIT"
run_main --poll-interval abc
assert_eq "1" "$RUN_EXIT"

CURRENT="T15 invalid timeout"
reset_state
run_main --timeout -5
assert_eq "1" "$RUN_EXIT"

# ===========================================================================
# T16: TTS real write-out format through the FULL chain.
# Must traverse: run_tts -> http_request_binary -> _curl_with_auth -> PATH
# fake curl -> split_resp. We do NOT fake/override http_request_binary.
# A fake curl (PATH-scoped) records argv to a log and emits a synthetic
# write-out so the real split_resp logic parses a 2xx + audio + bytes.
# ===========================================================================
CURRENT="T16 run_tts through real chain -> PASS, code 200, meta ok"
reset_state

FAKE_CURL_BIN=$(mktemp -d 2>/dev/null || mktemp -d -t vancine)
FAKE_CURL_LOG="$FAKE_CURL_BIN/log"
: > "$FAKE_CURL_LOG"
cat > "$FAKE_CURL_BIN/curl" <<'CURL_EOF'
#!/usr/bin/env bash
# Record argv null-separated (so the -w value with its embedded newline is
# captured whole), then emit the write-out a real curl would for a 12345-byte
# audio/mpeg 200 response. Body went to /dev/null (-o), so stdout = write-out.
printf '%s\0' "$@" >> "$T16_LOG"
printf '12345 audio/mpeg\n200'
CURL_EOF
chmod +x "$FAKE_CURL_BIN/curl"

# Run run_tts in a child with the fake curl first on PATH. Inside the child we
# source the SUT FRESH (it redefines http_request/http_request_binary to the
# real SUT versions, which call _curl_with_auth -> our fake curl). We must NOT
# override http_request_binary anywhere in this test. Output: PASS_C + table.
export T16_LOG="$FAKE_CURL_LOG"
child_out=$(PATH="$FAKE_CURL_BIN:/usr/bin:/bin" bash -c '
  source "'"$SUT"'" >/dev/null 2>&1
  sleep_for() { :; }
  MODE=live; ALL=true; ALLOW_EXPENSIVE=false; API_KEY="sk-fake-secret"
  run_tts "Doubao-tts|zh_female_cancan_mars_bigtts"
  printf "PASS_C=%d\n%s" "$PASS_C" "$RESULTS_TABLE"
')
unset T16_LOG

# 1. run_tts reached PASS through the real chain.
_t16_pass=$(printf '%s\n' "$child_out" | sed -n 's/^PASS_C=//p')
assert_eq "1" "$_t16_pass" "run_tts should PASS through the real chain"

# 2/3. Inspect the -w arg the fake curl received and split_resp's parsing.
# The fake curl emitted exactly "12345 audio/mpeg\n200"; split_resp would
# derive code=200, meta="12345 audio/mpeg". Re-derive from the log's emitted
# stdout (which run_tts consumed) -- but we only logged argv, so reconstruct
# the expected parse and assert the -w shape carries the right fields.
_w_arg=$(tr '\0' '\n' < "$FAKE_CURL_LOG" \
  | awk '/^-w$/{grab=1;next} /^-[a-zA-Z]/{grab=0} grab{print}')
assert_contains '%{size_download}' "$_w_arg"
assert_contains '%{content_type}' "$_w_arg"
assert_contains '%{http_code}' "$_w_arg"
# The -w value must contain a real newline separating meta from code.
if [[ "$_w_arg" == *$'\n'* ]]; then :; else bad "-w arg lacks newline separator"; fi

# 4. HTTP code == 200 and meta == "12345 audio/mpeg": the fake curl's emitted
# stdout is deterministic, so split_resp on it yields exactly these. Re-run
# split_resp against the same bytes the fake curl writes.
_emitted='12345 audio/mpeg
200'
split_resp "$_emitted"
assert_eq "200" "$RESP_CODE"
assert_eq "12345 audio/mpeg" "$RESP_BODY"

# 5. API key must NOT appear anywhere in the fake curl's argv log.
_raw_argv=$(tr '\0' '\n' < "$FAKE_CURL_LOG")
assert_not_contains "sk-fake-secret" "$_raw_argv"
# The Authorization header is passed via --config stdin (not argv); confirm
# argv has no Authorization header literal either.
assert_not_contains "Authorization" "$_raw_argv"

# ===========================================================================
# T17: API key redaction (defect #2) -- plain and sk- keys, error echo, CRLF.
# ===========================================================================
CURRENT="T17 plain key redacted (no /g leak)"
reset_state
API_KEY="vancine_plain_token_42"
out=$(redact "error: key vancine_plain_token_42 is invalid")
assert_not_contains "vancine_plain_token_42" "$out"
assert_not_contains "/g" "$out"

CURRENT="T17 sk- key redacted (no /g leak)"
reset_state
API_KEY="sk-ABC123xyz"
out=$(redact "got sk-ABC123xyz from header")
assert_not_contains "sk-ABC123xyz" "$out"
assert_not_contains "/g" "$out"

CURRENT="T17 error response echoing key is redacted"
reset_state
MODE="live"
export VANCINE_API_KEY="plainkey_leaked_in_msg"
API_KEY="$VANCINE_API_KEY"
err_body="$(python3 -c 'import json,sys; print(json.dumps({"error":{"message":"bad key plainkey_leaked_in_msg"}}))')"
fx "${err_body}\n500"
run_text "deepseek-v4-flash"
assert_eq "1" "$FAIL_C"
assert_not_contains "plainkey_leaked_in_msg" "$RESULTS_TABLE"
unset VANCINE_API_KEY

CURRENT="T17 CRLF API key rejected (no --config injection)"
reset_state
MODE="live"
export VANCINE_API_KEY=$'evil\r\nurl = http://attacker'
run_main --live </dev/null
assert_eq "1" "$RUN_EXIT"
assert_contains "control character" "$RUN_OUT"
unset VANCINE_API_KEY

# ===========================================================================
# T17b: redact must actually REMOVE sensitive values (not just insert a
# marker beside the original). Covers Bearer / Authorization (incl.
# case-insensitive name) / Cookie / Set-Cookie. Output must not contain the
# foreign token, the foreign cookie, or "session=".
# ===========================================================================
CURRENT="T17b Bearer value removed"
reset_state
API_KEY=""
out=$(redact "Bearer foreign-token")
assert_not_contains "foreign-token" "$out"

CURRENT="T17b Authorization: Bearer value removed"
reset_state
API_KEY=""
out=$(redact "Authorization: Bearer foreign-token")
assert_not_contains "foreign-token" "$out"

CURRENT="T17b lowercase authorization value removed (case-insensitive)"
reset_state
API_KEY=""
out=$(redact "authorization: foreign-token")
assert_not_contains "foreign-token" "$out"

CURRENT="T17b Cookie value removed"
reset_state
API_KEY=""
out=$(redact "Cookie: session=foreign-cookie")
assert_not_contains "foreign-cookie" "$out"
assert_not_contains "session=" "$out"

CURRENT="T17b Set-Cookie value removed"
reset_state
API_KEY=""
out=$(redact "Set-Cookie: session=foreign-cookie")
assert_not_contains "foreign-cookie" "$out"
assert_not_contains "session=" "$out"

CURRENT="T17b non-sensitive prose preserved (header-less words intact)"
reset_state
API_KEY=""
out=$(redact "upstream authorization failed because credentials expired")
assert_contains "authorization failed because credentials expired" "$out"
assert_not_contains "REDACTED" "$out"

CURRENT="T17b cookie bare word preserved"
reset_state
API_KEY=""
out=$(redact "cookie validation failed in upstream response")
assert_contains "cookie validation failed" "$out"
assert_not_contains "REDACTED" "$out"

CURRENT="T17b authorization bare word preserved"
reset_state
API_KEY=""
out=$(redact "authorization policy denied the request")
assert_contains "authorization policy denied" "$out"
assert_not_contains "REDACTED" "$out"

# ===========================================================================
# T17c: API_KEY must NEVER appear on python3 argv (defect: stdin-only)
# A PATH-scoped fake python3 records ARGV only (never stdin). redact() with a
# uniquely-marked API_KEY must leave the marker out of the recorded argv; no
# credential file may be created.
# ===========================================================================
CURRENT="T17c API_KEY not on python3 argv"
reset_state
PY_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t vancine)
PY_LOG="$PY_DIR/log"
: > "$PY_LOG"
# Fake python3 records ONLY argv ($@) to the log (never stdin). It runs the
# real python3 under its own name so _redact_py's logic actually executes and
# stdin is still delivered -- argv still contains no API_KEY.
export T17_REAL_PY="$(command -v python3)"
export T17_LOG="$PY_LOG"
# Literal single-quoted heredoc: does NOT embed the key. The real python3
# path is looked up via T17_REAL_PY at runtime, so the test never deletes the
# generated wrapper and never patches it after the fact.
cat > "$PY_DIR/python3" <<'FAKEPY'
#!/usr/bin/env bash
# Record argv only (NO stdin capture). Then exec real python3 so redact's
# NUL-delimited stdin still arrives -- argv still carries no key.
printf '%s\0' "$@" >> "$T17_LOG"
exec "$T17_REAL_PY" "$@"
FAKEPY
chmod +x "$PY_DIR/python3"
_marker="UNIQUE_MARKER_${RANDOM}${RANDOM}"
# Key ITSELF contains an SOH byte -- the one char a \x01-separated design
# could not have split on. Prove the NUL transport + redaction still work.
_marker_soh=$'SOH'${_marker}$'\x01more'
API_KEY="$_marker_soh"
txt_safe="SAFE_NONHEADER_${RANDOM}"
input_soh=$'Authorization: Bearer '"${_marker_soh}"$'\n'"Set-Cookie: session=${_marker_soh}"
out=$(PATH="$PY_DIR:/usr/bin:/bin" redact "$txt_safe $input_soh")
unset T17_REAL_PY T17_LOG
_argv=$(tr '\0' '\n' < "$PY_LOG")
# KEY (incl. its SOH + "more" tail) must not appear on python3 argv at all.
assert_not_contains "$_marker_soh" "$_argv"
assert_not_contains "$_marker" "$_argv"
# No credential file was created - only our python3 and the log exist.
_leftover=$(ls "$PY_DIR" 2>/dev/null | grep -vE '^(python3|log)$' || true)
assert_eq "" "$_leftover"
# Real redact still worked: SOH-ful key + Set-Cookie value scrubbed; pre-header
# safe text + header labels preserved; no SOH byte survives into output.
assert_not_contains "$_marker_soh" "$out"
assert_not_contains "$_marker" "$out"
assert_contains "$txt_safe" "$out"
assert_contains "Authorization:" "$out"
assert_contains "Set-Cookie:" "$out"
unset API_KEY
# Empty API_KEY also parses correctly through the leading NUL split.
API_KEY=""
plain_out=$(redact "ordinary prose; left${_marker}$_marker right")
assert_contains "prose" "$plain_out"
assert_contains "left" "$plain_out"
assert_not_contains "REDACTED" "$plain_out"
unset API_KEY

# ===========================================================================
# T17d: validate_api_key rejects ASCII control chars (SOH/TAB/CR/LF/DEL); the
# check must NOT place the key on python3 argv, in a file, or in the log.
# ===========================================================================
_run_validate() { validate_api_key "$1" >/dev/null 2>&1; }

CURRENT="T17d SOH key rejected"
reset_state
export VANCINE_API_KEY=$'evil\x01inject'
run_main --live </dev/null
assert_eq "1" "$RUN_EXIT"
unset VANCINE_API_KEY

CURRENT="T17d TAB key rejected"
reset_state
export VANCINE_API_KEY=$'a\tb'
run_main --live </dev/null
assert_eq "1" "$RUN_EXIT"
unset VANCINE_API_KEY

CURRENT="T17d CR key rejected"
reset_state
export VANCINE_API_KEY=$'a\rb'
run_main --live </dev/null
assert_eq "1" "$RUN_EXIT"
unset VANCINE_API_KEY

CURRENT="T17d LF key rejected"
reset_state
export VANCINE_API_KEY=$'a\nb'
run_main --live </dev/null
assert_eq "1" "$RUN_EXIT"
assert_contains "control character" "$RUN_OUT"
unset VANCINE_API_KEY

CURRENT="T17d DEL key rejected"
reset_state
export VANCINE_API_KEY=$'a\x7fb'
run_main --live </dev/null
assert_eq "1" "$RUN_EXIT"
unset VANCINE_API_KEY

CURRENT="T17d normal ASCII key accepted"
reset_state
export VANCINE_API_KEY="sk-ABC123xyz_-."
run_main --live --yes </dev/null
assert_eq "0" "$RUN_EXIT"
unset VANCINE_API_KEY

# ===========================================================================
# T18: 3D image dry-run with placeholder (defect #3)
# ===========================================================================
CURRENT="T18 3d image dry-run validates images[] without real url"
reset_state
unset VANCINE_3D_IMAGE_URL
run_3d_image "Doubao-Seed3D-2.0"
assert_eq "1" "$DRY_C"
assert_eq "0" "$(calls)"
pl=$(last_payload_of /v1/video/generations)
# dry-run must not actually call http_request, so payload is NOT in the trace.
# Instead assert via the recorded note + by building the payload directly.
direct_pl=$(build_payload 3d-image "Doubao-Seed3D-2.0" "$THREED_DRY_IMAGE_URL")
assert_contains "images" "$direct_pl"
assert_contains "example.invalid/reference.png" "$direct_pl"
# live without url still SKIPs and does not call curl
MODE="live"; ALLOW_EXPENSIVE=true; export VANCINE_API_KEY="sk-fake"
run_3d_image "Hitem3D-2.0"
assert_eq "1" "$SKIP_C"
assert_eq "0" "$(calls)"
unset VANCINE_API_KEY

# ===========================================================================
# T19: --models strict validation (defect #4)
# ===========================================================================
CURRENT="T19 --models known,unknown fails"
reset_state
run_main --models deepseek-v4-flash,does-not-exist
assert_eq "1" "$RUN_EXIT"
assert_contains "unknown model" "$RUN_OUT"

CURRENT="T19 --models trailing comma fails"
reset_state
run_main --models deepseek-v4-flash,
assert_eq "1" "$RUN_EXIT"

CURRENT="T19 --models double comma fails"
reset_state
run_main --models deepseek-v4-flash,,Doubao-tts
assert_eq "1" "$RUN_EXIT"

CURRENT="T19 --models leading comma fails"
reset_state
run_main --models ",deepseek-v4-flash"
assert_eq "1" "$RUN_EXIT"

CURRENT="T19 --models all-known passes"
reset_state
run_main --models deepseek-v4-flash,Doubao-tts,Hyper3D-Gen2
assert_eq "0" "$RUN_EXIT"

# ===========================================================================
# T20: unified dependency check (defect #5)
# ===========================================================================
CURRENT="T20 dependency check runs before live key"
reset_state
DEP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t vancine)
ln -sf "$(command -v bash)" "$DEP_DIR/bash" 2>/dev/null || true
_orig_path2="$PATH"
# Run main with a minimal PATH (bash only; no curl/python3) so the dependency
# check fails. Capture output + exit, then RESTORE PATH before assertions.
RUN_OUT=$(PATH="$DEP_DIR" main --live </dev/null 2>&1)
RUN_EXIT=$?
PATH="$_orig_path2"
assert_eq "1" "$RUN_EXIT"
assert_contains "not found" "$RUN_OUT"
assert_not_contains "VANCINE_API_KEY:" "$RUN_OUT"

# ===========================================================================
# Summary
# ===========================================================================
printf '\n========================================\n'
printf 'TEST RESULTS: %d passed, %d failed\n' "$PASS" "$FAIL"
printf '========================================\n'
if [[ "$FAIL" == "0" ]]; then
  printf 'ALL TESTS PASSED\n'
  exit 0
else
  exit 1
fi
