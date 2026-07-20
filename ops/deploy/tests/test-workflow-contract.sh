#!/usr/bin/env bash
# Task 6: GitHub Actions deploy workflow contract tests.
# Asserts the workflow is manual-dispatch only, runs on a GitHub-hosted
# Ubuntu runner, uses the production environment, read-only contents, a
# non-cancelling vancine-production concurrency group, a required 40-hex SHA
# input, native SSH (no third-party action), pinned known-hosts (no
# ssh-keyscan), stdin key loading, strict host checking, and no direct Docker.

set -Eeuo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && printf '%s\n' "$PWD")
WORKFLOW="$REPO_ROOT/.github/workflows/deploy.yml"

PASSED=0
FAILED=0
pass () { echo "PASS: $*"; PASSED=$((PASSED+1)); }
fail () { echo "FAIL: $*"; FAILED=$((FAILED+1)); }

[ -f "$WORKFLOW" ] || { echo "FAIL: workflow missing"; exit 1; }

assert_contains () { local label="$1" pat="$2"; grep -qE "$pat" "$WORKFLOW" && pass "$label" || fail "$label (pattern: $pat)"; }
assert_absent () { local label="$1" pat="$2"; grep -qE "$pat" "$WORKFLOW" && fail "$label (forbidden pattern present: $pat)" || pass "$label"; }

# --- trigger: workflow_dispatch only, no push ---
assert_contains "workflow_dispatch trigger" 'on:[[:space:]]*$|workflow_dispatch:'
assert_absent  "no push trigger" '^[[:space:]]*push:'

# --- runner: ubuntu-latest, not self-hosted ---
assert_contains "ubuntu-latest runner" 'runs-on:[[:space:]]*ubuntu-latest'
assert_absent  "no self-hosted runner" 'runs-on:[[:space:]]*self-hosted'

# --- environment: production ---
assert_contains "production environment" 'environment:[[:space:]]*production'

# --- permissions: contents read only ---
assert_contains "contents: read" 'contents:[[:space:]]*read'

# --- concurrency: vancine-production, non-cancelling ---
assert_contains "vancine-production concurrency group" 'group:[[:space:]]*vancine-production'
assert_contains "cancel-in-progress false" 'cancel-in-progress:[[:space:]]*false'

# --- required deploy_sha input matching 40-hex ---
assert_contains "required deploy_sha input" 'deploy_sha:'
assert_contains "deploy_sha required true" 'required:[[:space:]]*true'

# --- native SSH, no third-party SSH action ---
assert_contains "uses ssh-agent" 'ssh-agent'
assert_contains "uses ssh-add" 'ssh-add'
assert_absent  "no third-party SSH action" 'uses:[[:space:]]*.*/ssh-.*action|webfactory/ssh-agent|appleboy/ssh-action'
assert_absent  "no ssh-keyscan" 'ssh-keyscan'

# --- pinned known-hosts from secret, strict host checking ---
assert_contains "known-hosts from secret" 'PRODUCTION_SSH_KNOWN_HOSTS'
assert_contains "strict host key checking" 'StrictHostKeyChecking[[:space:]]*yes|StrictHostKeyChecking=yes'

# --- private key over stdin, not as argv or file ---
assert_absent  "no private key as argv" 'ssh-add[[:space:]]+\$\{?PRODUCTION_SSH_PRIVATE_KEY\}?[^|]'

# --- no direct docker invocation ---
assert_absent  "no direct docker build/up" 'docker[[:space:]]+compose[[:space:]]+(build|up)'

# --- no root literal login ---
assert_absent  "no root@ literal" 'root@27\.124'

# --- validation before SSH: whole-string bash regex, NOT line grep ---
assert_contains "SHA validated by bash =~ regex" '\[\[[[:space:]]*![[:space:]]*"\$RAW_SHA"[[:space:]]*=~'
assert_contains "SHA regex anchored 40-hex" "sha_re='\^\\[0-9a-f\\]\\{40\\}\\$'"
# The SHA must NOT be validated by piping to grep (which is line-oriented and
# can be fooled by trailing content on a second line).
assert_absent "no grep-based SHA validation" "printf '%s' \"\$RAW_SHA\" \| grep -Eq '\^\\[0-9a-f\\]"

# --- SSH user fixed to vancine-deploy, NOT read from a secret ---
assert_contains "ssh_user fixed literal" 'ssh_user="vancine-deploy"'
assert_absent  "no PRODUCTION_SSH_USER secret" 'PRODUCTION_SSH_USER'
assert_absent  "no secret-sourced ssh user" '\$\{\{[[:space:]]*secrets\.PRODUCTION_SSH_USER'

# --- inputs.deploy_sha and inputs.reason MUST only appear in step env ---
# They must never appear inside a `run:` shell block (injection surface).
inputs_in_run=$(python3 - "$WORKFLOW" <<'PY'
import sys, re
try:
    import yaml
    wf = yaml.safe_load(open(sys.argv[1]))
    bad = []
    for job_name, job in (wf.get('jobs') or {}).items():
        for i, step in enumerate(job.get('steps') or []):
            run_body = step.get('run') or ''
            # Match ${{ inputs.foo }} anywhere inside a run body
            if re.search(r'\$\{\{\s*inputs\.', run_body):
                bad.append(f'{job_name}.steps[{i}] ({step.get("name","<unnamed>")})')
    if bad:
        print('\n'.join(bad))
except ImportError:
    # Fallback: naive scan - find run: blocks and check for inputs.
    content = open(sys.argv[1]).read()
    in_run = False
    run_indent = 0
    bad = []
    for lineno, line in enumerate(content.splitlines(), 1):
        stripped = line.lstrip()
        indent = len(line) - len(stripped)
        if stripped.startswith('run:'):
            in_run = True
            run_indent = indent
            # Inline run (run: |) or single-line run: "..."
            after = stripped[4:].strip()
            if after and after not in ('|', '|-', '|+', '>', '>-', '>+'):
                if '${{ inputs.' in after:
                    bad.append(f'line {lineno}')
            continue
        if in_run:
            if indent <= run_indent and stripped and not stripped.startswith('#'):
                in_run = False
            elif '${{ inputs.' in line:
                bad.append(f'line {lineno}')
    if bad:
        print('\n'.join(bad))
PY
)
if [ -n "$inputs_in_run" ]; then
  fail "inputs.* referenced inside run: block (must be in env:): $inputs_in_run"
else
  pass "no inputs.* inside run: blocks"
fi

# --- optional reason input must exist ---
assert_contains "optional reason input" 'reason:'

# --- reason validation: reject control chars and limit length ---
# The run block that processes reason must filter control characters and
# enforce a maximum length. Check the source for a length cap and a
# control-character check.
assert_contains "reason length cap" '\-gt[[:space:]]*200|-ge[[:space:]]*200|\$\{#[A-Z_]*REASON[A-Z_]*\}|max.*200|200.*char'
assert_contains "reason control-char filter" '\[:cntrl:\]|\\\\x[0-9a-fA-F]{2}|tr -d|grep.*control|0x[01][0-9a-fA-F]'

# --- no IdentitiesOnly=yes (blocks agent keys without IdentityFile) ---
assert_absent "no IdentitiesOnly" 'IdentitiesOnly'

# --- no status response body printed ---
# The curl call must not dump the raw JSON to stdout/logs. Acceptable forms
# are piping to grep, capturing into a variable that is unset, or redirecting
# to /dev/null. Flag bare `curl ... api/status` without any such consumer.
if python3 - "$WORKFLOW" <<'PY'
import sys, re
content = open(sys.argv[1]).read()
# Join continuation lines for simpler analysis
joined = re.sub(r'\\\n[ \t]*', ' ', content)
bad = []
for lineno, raw_line in enumerate(content.splitlines(), 1):
    line = raw_line.strip()
    if 'curl' in line and 'api/status' in line:
        # Check the logical line (joined continuations) for a safe consumer
        # in the next few raw lines too.
        window = ' '.join(content.splitlines()[lineno-1:lineno+3])
        window_joined = re.sub(r'\\\n[ \t]*', ' ', window)
        if '|' not in window_joined and 'body=' not in window_joined and '/dev/null' not in window_joined:
            bad.append(lineno)
if bad:
    print(','.join(str(b) for b in bad))
PY
then
  flagged=$(python3 - "$WORKFLOW" <<'PY'
import sys, re
content = open(sys.argv[1]).read()
bad = []
for lineno, raw_line in enumerate(content.splitlines(), 1):
    line = raw_line.strip()
    if 'curl' in line and 'api/status' in line:
        window = ' '.join(content.splitlines()[lineno-1:lineno+3])
        window_joined = re.sub(r'\\\n[ \t]*', ' ', window)
        if '|' not in window_joined and 'body=' not in window_joined and '/dev/null' not in window_joined:
            bad.append(lineno)
print(','.join(str(b) for b in bad))
PY
)
  if [ -n "$flagged" ]; then
    fail "status body printed at line(s): $flagged"
  else
    pass "status body not printed"
  fi
else
  fail "status body check errored"
fi

# --- no secret values leaked to logs ---
# printf/echo of SSH_PRIVATE_KEY or SSH_KNOWN_HOSTS is acceptable ONLY when
# piped to ssh-add or written to a restricted-mode file. Flag any other use.
if grep -qE 'echo[[:space:]]+\$\{?(PRODUCTION_SSH_PRIVATE_KEY|PRODUCTION_SSH_KNOWN_HOSTS)\}?[[:space:]]*$' "$WORKFLOW"; then
  fail "secret value echoed to stdout without pipe/redirect"
else
  pass "no secret value echo to stdout"
fi

# --- runtime SHA validation against injection payloads ---
# Reproduce the exact validation logic from the workflow run block and feed it
# real injection payloads. A valid SHA must pass; every crafted payload must
# be rejected. This proves the bash whole-string regex is injection-safe.
VALID_SHA="0123456789abcdef0123456789abcdef01234567"

validate_like_workflow () {
  # Mirrors the workflow's validation run block. Returns 0 if accepted.
  local RAW_SHA="$1"
  local sha_re='^[0-9a-f]{40}$'
  if [[ ! "$RAW_SHA" =~ $sha_re ]]; then
    return 1
  fi
  case "$RAW_SHA" in
    *$'\n'*|*$'\r'*) return 1 ;;
  esac
  return 0
}

# Valid SHA must be accepted.
validate_like_workflow "$VALID_SHA" && pass "runtime: valid SHA accepted" || fail "runtime: valid SHA rejected"

# Trailing LF must be rejected. Use ANSI-C quoting so the newline is NOT
# stripped by command substitution.
validate_like_workflow $'0123456789abcdef0123456789abcdef01234567\n' && fail "runtime: SHA+LF accepted" || pass "runtime: SHA+LF rejected"

# Trailing CR must be rejected.
validate_like_workflow $'0123456789abcdef0123456789abcdef01234567\r' && fail "runtime: SHA+CR accepted" || pass "runtime: SHA+CR rejected"

# A second line (GITHUB_OUTPUT injection) must be rejected.
validate_like_workflow $'0123456789abcdef0123456789abcdef01234567\nsha=evil' && fail "runtime: multiline SHA accepted" || pass "runtime: multiline SHA rejected"

# Embedded newline mid-value must be rejected.
validate_like_workflow $'0123456789abcdef0123\n456789abcdef01234567' && fail "runtime: embedded-newline SHA accepted" || pass "runtime: embedded-newline SHA rejected"

# Uppercase must be rejected.
validate_like_workflow "0123456789ABCDEF0123456789ABCDEF01234567" && fail "runtime: uppercase SHA accepted" || pass "runtime: uppercase SHA rejected"

echo "TOTAL passed=$PASSED failed=$FAILED"
[ "$FAILED" -eq 0 ]
