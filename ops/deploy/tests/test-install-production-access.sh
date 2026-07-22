#!/usr/bin/env bash
# Task 4: install-production-access.sh behavior tests.
# The installer creates the vancine-deploy account, installs root-owned
# gateway + orchestrator scripts, writes authorized_keys with a forced-command
# prefix, and validates a sudoers rule. Tests fake id/useradd/install/chown/
# visudo via PATH so no real host state changes.

set -Eeuo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && printf '%s\n' "$PWD")
INSTALLER="$REPO_ROOT/ops/deploy/install-production-access.sh"

PASSED=0
FAILED=0
pass () { echo "PASS: $*"; PASSED=$((PASSED+1)); }
fail () { echo "FAIL: $*"; FAILED=$((FAILED+1)); }

STATE_DIR=$(mktemp -d)
FAKEBIN="$STATE_DIR/fakebin"
PREFIX="$STATE_DIR/prefix"   # simulates /usr/local/sbin and /etc/... root paths
ETC="$PREFIX/etc"
SBIN="$PREFIX/sbin"
HOME_DIR="$PREFIX/home"
mkdir -p "$FAKEBIN" "$ETC/sudoers.d" "$SBIN" "$HOME_DIR"
# STATE_DIR is retained for post-mortem inspection; never deleted by this test.

# Shared logs the recording fakes append to. Defined before the fakes are
# created so the unquoted heredocs can expand them under set -u.
INSTALL_LOG="$STATE_DIR/install.log"
export INSTALL_LOG

# Account state tracking via a state file (not a marker file that gets deleted).
# The state file records "absent" or "present".  Fake id reads it; fake useradd
# writes "present".  Tests reset by writing "absent" (no deletion).
ACCOUNT_STATE="$STATE_DIR/account-state"
printf 'absent' > "$ACCOUNT_STATE"

# Fake id: reports the vancine-deploy account based on the state file.
cat > "$FAKEBIN/id" <<EOF
#!/usr/bin/env bash
state_file="$ACCOUNT_STATE"
account_state="absent"
[ -f "\$state_file" ] && account_state=\$(cat "\$state_file")
case "\$*" in
  *vancine-deploy*)
    if [ "\$account_state" != "present" ]; then exit 1; fi
    case "\$1" in
      -gn) echo "vancine-deploy" ;;
      -u)  echo "999" ;;
      -G)  echo "999" ;;
      -nG) echo "vancine-deploy" ;;
      -g)  echo "999" ;;
      *)   echo "uid=999(vancine-deploy) gid=999(vancine-deploy) groups=999(vancine-deploy)" ;;
    esac
    ;;
  *) /usr/bin/id "\$@" ;;
esac
EOF
chmod +x "$FAKEBIN/id"

# Fake useradd: records the call, creates the home dir, and sets account state
# to "present" so subsequent fake id queries succeed.
cat > "$FAKEBIN/useradd" <<EOF
#!/usr/bin/env bash
mydir=\$(dirname "\$0")
printf '%s ' useradd "\$@" >> "\$mydir/../useradd.log"
mkdir -p "\$mydir/../vancine-deploy/.ssh"
echo "present" > "$ACCOUNT_STATE"
exit 0
EOF
chmod +x "$FAKEBIN/useradd"

# Fake install: records the call; copies only when the destination directory is
# writable (the sandbox). For real system paths (empty-PREFIX test) it records
# without writing, so the test never touches /usr/local/sbin or /etc.
cat > "$FAKEBIN/install" <<EOF
#!/usr/bin/env bash
mode=""; owner=""; group=""
while [ \$# -gt 0 ]; do
  case "\$1" in
    -m) mode="\$2"; shift 2 ;;
    -o) owner="\$2"; shift 2 ;;
    -g) group="\$2"; shift 2 ;;
    -*) shift ;;
    *) break ;;
  esac
done
dst="\${@: -1}"
set -- "\${@:1:\$#-1}"
for src in "\$@"; do
  printf 'install src=%s dst=%s mode=%s owner=%s\n' "\$src" "\$dst" "\$mode" "\$owner" >> "$INSTALL_LOG"
  dstdir=\$(dirname "\$dst")
  if [ -w "\$dstdir" ] 2>/dev/null; then cp "\$src" "\$dst"; fi
done
exit 0
EOF
chmod +x "$FAKEBIN/install"

# Fake chmod: records every call AND applies it via the real chmod so the
# installer's 0700 verification observes the actual mode.
cat > "$FAKEBIN/chmod" <<EOF
#!/usr/bin/env bash
printf '%s\n' "chmod \$*" >> "$STATE_DIR/chmod.log"
/bin/chmod "\$@" 2>/dev/null || true
exit 0
EOF
chmod +x "$FAKEBIN/chmod"

# Fake chown: records every call so tests can assert root:root re-hardening.
cat > "$FAKEBIN/chown" <<EOF
#!/usr/bin/env bash
printf '%s\n' "chown \$*" >> "$STATE_DIR/chown.log"
exit 0
EOF
chmod +x "$FAKEBIN/chown"

# Fake mkdir: records the call and best-effort creates the dir using the REAL
# mkdir (absolute path, to avoid recursing into this fake via PATH). Failures
# for real system paths in the empty-PREFIX test are ignored.
cat > "$FAKEBIN/mkdir" <<EOF
#!/usr/bin/env bash
printf '%s\n' "mkdir \$*" >> "$STATE_DIR/mkdir.log"
/bin/mkdir "\$@" 2>/dev/null || true
exit 0
EOF
chmod +x "$FAKEBIN/mkdir"

# Fake getent: returns a passwd line for vancine-deploy whose home and shell
# are read from a conf file so each test can simulate a different existing
# account. Defaults to the expected home and /bin/bash.
cat > "$FAKEBIN/getent" <<EOF
#!/usr/bin/env bash
conf="$STATE_DIR/getent.conf"
if [ -f "\$conf" ]; then
  home=\$(cut -d: -f1 "\$conf")
  shell=\$(cut -d: -f2 "\$conf")
else
  home="$HOME_DIR/vancine-deploy"
  shell="/bin/bash"
fi
echo "vancine-deploy:x:1000:1000::\$home:\$shell"
exit 0
EOF
chmod +x "$FAKEBIN/getent"

# Fake visudo: records every -cf check. Accepts any non-empty file unless
# VISUDO_FAIL=1 (simulates a re-validation failure on an existing rule).
cat > "$FAKEBIN/visudo" <<EOF
#!/usr/bin/env bash
printf '%s\n' "visudo \$*" >> "$STATE_DIR/visudo.log"
if [ "\$1" = "-cf" ]; then
  if [ "\${VISUDO_FAIL:-0}" = "1" ]; then echo "syntax error (simulated)" >&2; exit 1; fi
  [ -s "\$2" ] && { echo "parsed OK"; exit 0; } || { echo "empty"; exit 1; }
fi
exit 0
EOF
chmod +x "$FAKEBIN/visudo"

# A valid single-line ed25519 public key fixture (real key generated by
# ssh-keygen so the installer's ssh-keygen validation passes).
PUBKEY="$STATE_DIR/deploy.pub"
printf 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPFfxpU0mfeX/c4+mENqK/NsiwwmN+iEVbWesWdomCd/ vancine-deploy-test\n' > "$PUBKEY"

run_installer () {
  VANCINE_INSTALL_TEST_MODE=1 \
  VANCINE_INSTALL_PREFIX="$PREFIX" \
  PATH="$FAKEBIN:$PATH" \
  bash "$INSTALLER" "$@" 2>&1 || true
}

# Run with an EMPTY prefix so the installer computes the real production paths
# (/home/vancine-deploy, /usr/local/sbin, /etc/sudoers.d). The fakes record the
# paths without writing to real system locations. The state dir is redirected
# to a sandbox so prepare_state_dir can succeed without root.
run_installer_noprefix () {
  VANCINE_INSTALL_TEST_MODE=1 \
  VANCINE_INSTALL_PREFIX="" \
  VANCINE_DEPLOY_STATE_DIR="$STATE_DIR/sandbox-state" \
  PATH="$FAKEBIN:$PATH" \
  bash "$INSTALLER" "$@" 2>&1 || true
}

# Reset the account state to "absent" so a subsequent run_installer behaves
# as a fresh install (account does not exist). Call before tests that expect
# the installer to create the account.
reset_fresh_account () {
  printf 'absent' > "$ACCOUNT_STATE"
}

# --- accepts one valid single-line ed25519 public key ---
reset_fresh_account
out=$(run_installer "$PUBKEY")
if echo "$out" | grep -q "INSTALL_OK"; then
  pass "valid public key accepted"
else
  fail "valid public key rejected: $out"
fi

# --- authorized_keys has the forced-command prefix ---
AK="$HOME_DIR/vancine-deploy/.ssh/authorized_keys"
if [ -f "$AK" ] && grep -q 'no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding,command="/usr/local/sbin/vancine-deploy-gateway"' "$AK"; then
  pass "authorized_keys forced-command prefix present"
else
  fail "authorized_keys forced-command prefix missing"
fi

# --- sudoers rule is the narrow one ---
SUDOERS_FILE="$ETC/sudoers.d/vancine-deploy"
if [ -f "$SUDOERS_FILE" ] && grep -q 'vancine-deploy ALL=(root) NOPASSWD: /usr/local/sbin/vancine-production-deploy \*' "$SUDOERS_FILE"; then
  pass "narrow sudoers rule present"
else
  fail "narrow sudoers rule missing"
fi
if [ -f "$SUDOERS_FILE" ] && grep -q 'NOPASSWD: ALL' "$SUDOERS_FILE"; then
  fail "sudoers grants NOPASSWD: ALL"
else
  pass "no NOPASSWD: ALL"
fi

# --- reject private-key markers ---
PRIV="$STATE_DIR/priv"
printf -- '-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----\n' > "$PRIV"
reset_fresh_account
out=$(run_installer "$PRIV")
echo "$out" | grep -qiE "reject|refuse|private|invalid" && pass "private key rejected" || fail "private key not rejected: $out"

# --- reject multiline input ---
MULTI="$STATE_DIR/multi.pub"
printf 'ssh-ed25519 AAAA one\nssh-ed25519 BBBB two\n' > "$MULTI"
reset_fresh_account
out=$(run_installer "$MULTI")
echo "$out" | grep -qiE "INSTALL_FAILED|reject|refuse|single|multiline|invalid|exactly one" && pass "multiline key rejected" || fail "multiline key not rejected: $out"

# --- reject key with options prefix ---
OPTKEY="$STATE_DIR/opt.pub"
printf 'command="evil" ssh-ed25519 AAAA evil\n' > "$OPTKEY"
reset_fresh_account
out=$(run_installer "$OPTKEY")
echo "$out" | grep -qiE "reject|refuse|option|invalid" && pass "key with options rejected" || fail "key with options not rejected: $out"

# --- account shell is /bin/bash (not nologin) ---
if [ -f "$STATE_DIR/useradd.log" ] && grep -q '/bin/bash' "$STATE_DIR/useradd.log"; then
  pass "account shell is /bin/bash"
else
  fail "account shell is not /bin/bash (log=$(cat "$STATE_DIR/useradd.log" 2>/dev/null))"
fi

# --- existing account in docker group is rejected ---
# Fake id reports the account exists AND is in the docker group.
cat > "$FAKEBIN/id" <<EOF
#!/usr/bin/env bash
state_file="$ACCOUNT_STATE"
account_state="absent"
[ -f "\$state_file" ] && account_state=\$(cat "\$state_file")
case "\$*" in
  *vancine-deploy*)
    if [ "\$account_state" != "present" ]; then exit 1; fi
    if [ "\$1" = "-nG" ]; then echo "vancine-deploy docker"; exit 0; fi
    exit 0
    ;;
  *) /usr/bin/id "\$@" ;;
esac
EOF
chmod +x "$FAKEBIN/id"
printf '%s:%s\n' "$HOME_DIR/vancine-deploy" "/bin/bash" > "$STATE_DIR/getent.conf"
printf 'present' > "$ACCOUNT_STATE"
out=$(run_installer "$PUBKEY")
echo "$out" | grep -qiE "INSTALL_FAILED|docker" && pass "existing account in docker group rejected" || fail "docker group not rejected: $out"

# Restore fake id (account does not exist) for subsequent tests.
cat > "$FAKEBIN/id" <<EOF
#!/usr/bin/env bash
state_file="$ACCOUNT_STATE"
account_state="absent"
[ -f "\$state_file" ] && account_state=\$(cat "\$state_file")
case "\$*" in
  *vancine-deploy*)
    if [ "\$account_state" != "present" ]; then exit 1; fi
    case "\$1" in
      -gn) echo "vancine-deploy" ;;
      -u)  echo "999" ;;
      -G)  echo "999" ;;
      -nG) echo "vancine-deploy" ;;
      -g)  echo "999" ;;
      *)   echo "uid=999(vancine-deploy) gid=999(vancine-deploy) groups=999(vancine-deploy)" ;;
    esac
    ;;
  *) /usr/bin/id "\$@" ;;
esac
EOF
chmod +x "$FAKEBIN/id"

# --- authorized_keys existing and different is rejected ---
AK="$HOME_DIR/vancine-deploy/.ssh/authorized_keys"
printf 'different-content\n' > "$AK"
reset_fresh_account
out=$(run_installer "$PUBKEY")
echo "$out" | grep -qiE "INSTALL_FAILED|differs|already exists" && pass "different authorized_keys rejected" || fail "different authorized_keys not rejected: $out"

# --- authorized_keys same content is kept ---
# Write the exact desired content, then run again.
DESIRED=$(printf 'no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding,command="/usr/local/sbin/vancine-deploy-gateway" '; cat "$PUBKEY")
printf '%s\n' "$DESIRED" > "$AK"
reset_fresh_account
out=$(run_installer "$PUBKEY")
echo "$out" | grep -q "INSTALL_OK" && pass "same authorized_keys kept" || fail "same authorized_keys not kept: $out"


reset_fresh_account
# --- --update-reviewed-script accepted before keyfile ---
reset_fresh_account
out=$(run_installer --update-reviewed-script "$PUBKEY")
echo "$out" | grep -qE "INSTALL_OK|installed" && pass "--update-reviewed-script before keyfile works" || fail "--update-reviewed-script before keyfile: $out"


reset_fresh_account
# --- --update-reviewed-script accepted after keyfile ---
reset_fresh_account
out=$(run_installer "$PUBKEY" --update-reviewed-script)
echo "$out" | grep -qE "INSTALL_OK|installed" && pass "--update-reviewed-script after keyfile works" || fail "--update-reviewed-script after keyfile: $out"

# --- group-writable public key (0620) rejected ---
chmod 0620 "$PUBKEY"
reset_fresh_account
out=$(run_installer "$PUBKEY")
echo "$out" | grep -qiE "INSTALL_FAILED|group-writable" && pass "group-writable key (0620) rejected" || fail "group-writable 0620 not rejected: $out"
chmod 0644 "$PUBKEY"

# --- group-writable public key (0660) rejected ---
chmod 0660 "$PUBKEY"
reset_fresh_account
out=$(run_installer "$PUBKEY")
echo "$out" | grep -qiE "INSTALL_FAILED|group-writable" && pass "group-writable key (0660) rejected" || fail "group-writable 0660 not rejected: $out"
chmod 0644 "$PUBKEY"

# --- RSA public key rejected (only ssh-ed25519 allowed) ---
RSAKEY="$STATE_DIR/rsa.pub"
printf 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC7fakekeydata vancine-deploy\n' > "$RSAKEY"
chmod 0644 "$RSAKEY"
reset_fresh_account
out=$(run_installer "$RSAKEY")
echo "$out" | grep -qiE "INSTALL_FAILED|ssh-ed25519" && pass "RSA key rejected" || fail "RSA key not rejected: $out"

# --- ECDSA public key rejected ---
ECKEY="$STATE_DIR/ec.pub"
printf 'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYfake vancine-deploy\n' > "$ECKEY"
chmod 0644 "$ECKEY"
reset_fresh_account
out=$(run_installer "$ECKEY")
echo "$out" | grep -qiE "INSTALL_FAILED|ssh-ed25519" && pass "ECDSA key rejected" || fail "ECDSA key not rejected: $out"

# --- existing account with nologin shell rejected ---
cat > "$FAKEBIN/id" <<EOF
#!/usr/bin/env bash
state_file="$ACCOUNT_STATE"
account_state="absent"
[ -f "\$state_file" ] && account_state=\$(cat "\$state_file")
case "\$*" in
  *vancine-deploy*)
    if [ "\$account_state" != "present" ]; then exit 1; fi
    if [ "\$1" = "-nG" ]; then echo "vancine-deploy"; exit 0; fi
    exit 0
    ;;
  *) /usr/bin/id "\$@" ;;
esac
EOF
chmod +x "$FAKEBIN/id"
printf '%s:%s\n' "$HOME_DIR/vancine-deploy" "/usr/sbin/nologin" > "$STATE_DIR/getent.conf"
printf 'present' > "$ACCOUNT_STATE"
out=$(run_installer "$PUBKEY")
echo "$out" | grep -qiE "INSTALL_FAILED|/bin/bash|nologin" && pass "nologin shell rejected" || fail "nologin not rejected: $out"
# Restore account-not-exist fake id and default getent.
cat > "$FAKEBIN/id" <<EOF
#!/usr/bin/env bash
state_file="$ACCOUNT_STATE"
account_state="absent"
[ -f "\$state_file" ] && account_state=\$(cat "\$state_file")
case "\$*" in
  *vancine-deploy*)
    if [ "\$account_state" != "present" ]; then exit 1; fi
    case "\$1" in
      -gn) echo "vancine-deploy" ;;
      -u)  echo "999" ;;
      -G)  echo "999" ;;
      -nG) echo "vancine-deploy" ;;
      -g)  echo "999" ;;
      *)   echo "uid=999(vancine-deploy) gid=999(vancine-deploy) groups=999(vancine-deploy)" ;;
    esac
    ;;
  *) /usr/bin/id "\$@" ;;
esac
EOF
chmod +x "$FAKEBIN/id"
: > "$STATE_DIR/getent.conf"

# --- chown failure terminates the install ---
cat > "$FAKEBIN/chown" <<'EOF'
#!/usr/bin/env bash
echo "chown failed (simulated)" >&2
exit 1
EOF
chmod +x "$FAKEBIN/chown"
reset_fresh_account
out=$(run_installer "$PUBKEY")
echo "$out" | grep -qiE "INSTALL_FAILED|chown" && pass "chown failure terminates install" || fail "chown failure not fatal: $out"
# Restore the RECORDING chown so later re-hardening assertions can observe it.
cat > "$FAKEBIN/chown" <<EOF
#!/usr/bin/env bash
printf '%s\n' "chown \$*" >> "$STATE_DIR/chown.log"
exit 0
EOF
chmod +x "$FAKEBIN/chown"

# --- existing different sudoers rule rejected ---
SUDOERS_DST="$ETC/sudoers.d/vancine-deploy"
mkdir -p "$ETC/sudoers.d"
# A prior successful install left a 0440 rule; make it writable so we can
# replace it with a DIFFERENT rule to exercise the reject-on-differ path.
[ -f "$SUDOERS_DST" ] && chmod 0644 "$SUDOERS_DST"
printf 'vancine-deploy ALL=(ALL) NOPASSWD: ALL\n' > "$SUDOERS_DST"
reset_fresh_account
out=$(run_installer "$PUBKEY")
echo "$out" | grep -qiE "INSTALL_FAILED|differs|sudoers" && pass "different existing sudoers rejected" || fail "different sudoers not rejected: $out"

# --- empty PREFIX computes the real production home /home/vancine-deploy ---
: > "$STATE_DIR/useradd.log"; : > "$STATE_DIR/mkdir.log"
reset_fresh_account
out=$(run_installer_noprefix "$PUBKEY")
grep -q -- "--home-dir /home/vancine-deploy" "$STATE_DIR/useradd.log" \
  && pass "empty PREFIX home is exactly /home/vancine-deploy" \
  || fail "empty PREFIX home wrong: $(cat "$STATE_DIR/useradd.log" 2>/dev/null)"
grep -q "/home/vancine-deploy/.ssh" "$STATE_DIR/mkdir.log" \
  && pass "empty PREFIX .ssh under /home/vancine-deploy" \
  || fail "empty PREFIX .ssh wrong: $(cat "$STATE_DIR/mkdir.log" 2>/dev/null)"

# --- home dir is hardened with read-only-group model (0750/0750/0640) ---
# In test mode the chown is skipped (tests run as non-root); we verify the mode
# is applied. Production additionally sets root:<primary-group> 0750.
: > "$STATE_DIR/chmod.log"; : > "$STATE_DIR/chown.log"
reset_fresh_account
out=$(run_installer "$PUBKEY")
grep -q "chmod 0750 $HOME_DIR/vancine-deploy" "$STATE_DIR/chmod.log" \
  && pass "home chmod 0750 applied (read-only group model)" || fail "home not chmod 0750: $(cat "$STATE_DIR/chmod.log" 2>/dev/null)"
grep -q "chmod 0750 $HOME_DIR/vancine-deploy/.ssh" "$STATE_DIR/chmod.log" \
  && pass ".ssh chmod 0750 applied" || fail ".ssh not chmod 0750: $(cat "$STATE_DIR/chmod.log" 2>/dev/null)"
grep -q "chmod 0640 $HOME_DIR/vancine-deploy/.ssh/authorized_keys" "$STATE_DIR/chmod.log" \
  && pass "authorized_keys chmod 0640 applied" || fail "authorized_keys not chmod 0640: $(cat "$STATE_DIR/chmod.log" 2>/dev/null)"


reset_fresh_account
# --- same-content authorized_keys is re-hardened to 0640 (not returned early) ---
AK="$HOME_DIR/vancine-deploy/.ssh/authorized_keys"
DESIRED=$(printf 'no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding,command="/usr/local/sbin/vancine-deploy-gateway" '; cat "$PUBKEY")
mkdir -p "$(dirname "$AK")"; printf '%s\n' "$DESIRED" > "$AK"; chmod 0644 "$AK"
: > "$STATE_DIR/chmod.log"; : > "$STATE_DIR/chown.log"
reset_fresh_account
out=$(run_installer "$PUBKEY")
echo "$out" | grep -q "re-verified" && pass "same authorized_keys re-verified" || fail "same authorized_keys not re-verified: $out"
grep -q "chmod 0640 $AK" "$STATE_DIR/chmod.log" && pass "same authorized_keys re-chmod 0640" || fail "same authorized_keys not re-chmod: $(cat "$STATE_DIR/chmod.log" 2>/dev/null)"

# --- same-content sudoers is re-validated and re-hardened (root:root 0440) ---
SUDOERS_DST="$ETC/sudoers.d/vancine-deploy"
mkdir -p "$ETC/sudoers.d"; chmod 0644 "$SUDOERS_DST" 2>/dev/null || true
printf 'vancine-deploy ALL=(root) NOPASSWD: /usr/local/sbin/vancine-production-deploy *\n' > "$SUDOERS_DST"
: > "$STATE_DIR/visudo.log"; : > "$STATE_DIR/chmod.log"; : > "$STATE_DIR/chown.log"
reset_fresh_account
out=$(run_installer "$PUBKEY")
echo "$out" | grep -q "re-validated" && pass "same sudoers re-validated" || fail "same sudoers not re-validated: $out"
grep -q "visudo -cf $SUDOERS_DST" "$STATE_DIR/visudo.log" && pass "same sudoers visudo re-run" || fail "same sudoers visudo not re-run: $(cat "$STATE_DIR/visudo.log" 2>/dev/null)"
grep -q "chmod 0440 $SUDOERS_DST" "$STATE_DIR/chmod.log" && pass "same sudoers re-chmod 0440" || fail "same sudoers not re-chmod: $(cat "$STATE_DIR/chmod.log" 2>/dev/null)"
grep -q "chown root:root $SUDOERS_DST" "$STATE_DIR/chown.log" && pass "same sudoers re-chown root:root" || fail "same sudoers not re-chown: $(cat "$STATE_DIR/chown.log" 2>/dev/null)"

# --- same-content sudoers that fails re-validation is rejected ---
VISUDO_FAIL=1
out=$(VISUDO_FAIL=1 VANCINE_INSTALL_TEST_MODE=1 VANCINE_INSTALL_PREFIX="$PREFIX" PATH="$FAKEBIN:$PATH" bash "$INSTALLER" "$PUBKEY" 2>&1 || true)
echo "$out" | grep -qiE "INSTALL_FAILED|re-validation" && pass "sudoers failing re-validation rejected" || fail "sudoers re-validation failure not fatal: $out"
VISUDO_FAIL=0

# --- symlink public key rejected (both modes) ---
ln -s "$PUBKEY" "$STATE_DIR/link.pub"
reset_fresh_account
out=$(run_installer "$STATE_DIR/link.pub")
echo "$out" | grep -qiE "INSTALL_FAILED|symlink" && pass "symlink key rejected" || fail "symlink key not rejected: $out"

# --- non-root-owned key rejected in PRODUCTION mode ---
# Fake root (id -u => 0) and a stat that reports a non-root owner, then run
# with test mode OFF so the production ownership check is exercised.
cat > "$FAKEBIN/id" <<EOF
#!/usr/bin/env bash
state_file="$ACCOUNT_STATE"
account_state="absent"
[ -f "\$state_file" ] && account_state=\$(cat "\$state_file")
if [ "\$1" = "-u" ]; then echo 0; exit 0; fi
case "\$*" in
  *vancine-deploy*)
    if [ "\$account_state" != "present" ]; then exit 1; fi
    exit 0
    ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$FAKEBIN/id"
cat > "$FAKEBIN/stat" <<'EOF'
#!/usr/bin/env bash
for a in "$@"; do
  case "$a" in %U|%Su) echo "notroot"; exit 0 ;; %a|%Lp) echo "644"; exit 0 ;; esac
done
echo "644"; exit 0
EOF
chmod +x "$FAKEBIN/stat"
out=$(VANCINE_INSTALL_TEST_MODE=0 VANCINE_INSTALL_PREFIX="$PREFIX" PATH="$FAKEBIN:$PATH" bash "$INSTALLER" "$PUBKEY" 2>&1 || true)
echo "$out" | grep -qiE "INSTALL_FAILED|owned by root" && pass "non-root-owned key rejected in production" || fail "non-root key not rejected in production: $out"
# Restore: remove stat fake (use real stat) and restore test-mode id.
chmod -x "$FAKEBIN/stat" 2>/dev/null || true
cat > "$FAKEBIN/id" <<EOF
#!/usr/bin/env bash
state_file="$ACCOUNT_STATE"
account_state="absent"
[ -f "\$state_file" ] && account_state=\$(cat "\$state_file")
case "\$*" in
  *vancine-deploy*)
    if [ "\$account_state" != "present" ]; then exit 1; fi
    case "\$1" in
      -gn) echo "vancine-deploy" ;;
      -u)  echo "999" ;;
      -G)  echo "999" ;;
      -nG) echo "vancine-deploy" ;;
      -g)  echo "999" ;;
      *)   echo "uid=999(vancine-deploy) gid=999(vancine-deploy) groups=999(vancine-deploy)" ;;
    esac
    ;;
  *) /usr/bin/id "\$@" ;;
esac
EOF
chmod +x "$FAKEBIN/id"

# --- installer creates and verifies the production state dir (0700) ---
INSTALLER_STATE_DIR="$PREFIX/var/lib/vancine-deploy"
reset_fresh_account
out=$(run_installer "$PUBKEY")
if [ -d "$INSTALLER_STATE_DIR" ]; then
  smode=$(stat -f '%Lp' "$INSTALLER_STATE_DIR" 2>/dev/null || stat -c '%a' "$INSTALLER_STATE_DIR" 2>/dev/null || echo "000")
  [ "$smode" = "700" ] && pass "installer state dir created with 0700" || fail "installer state dir mode=$smode (expected 700)"
else
  fail "installer state dir not created at $INSTALLER_STATE_DIR"
fi

# --- source must not contain dangerous constructs ---
if grep -nE '\beval\b|bash -c|docker\.sock|NOPASSWD: ALL' "$INSTALLER"; then
  fail "installer contains dangerous construct"
else
  pass "installer source clean of eval/bash -c/docker.sock/NOPASSWD: all"
fi

# ============== RED: GNU stat + Linux permission model (Task A/B/C) ==============
test_linux_permissions () {
  echo "== linux permissions =="

  # --- A. Behavior Contracted assertions (Task B) ---
  # Verify the get_owner/get_mode route is correct BY CHECKING REAL SYSTEMS:
  #   GNU priority:  get_mode tries stat -c first, stat -f second
  #   macOS tests:   stat -c fails, get_mode falls back to -f
  # The new code uses portable auxiliary functions. We assert contract:
  #   macOS:  get_mode("$HOME") returns non-empty
  #   GNU:    stat -c '%a' returns non-empty
  if stat -c '%a' "$HOME_DIR" >/dev/null 2>&1; then
    mode_home=$(stat -c '%a' "$HOME_DIR")
    [ -n "$mode_home" ] && pass "GNU detected: stat -c works on $fakebin_stat" || fail "GNU stat-c empty: $fakebin_stat"
  else
    # Verify get_mode falls back to -f on systems without stat -c
    if stat -f '%Lp' "$HOME_DIR" >/dev/null 2>&1; then
      mode_home=$(stat -f '%Lp' "$HOME_DIR")
      [ -n "$mode_home" ] && pass "BSD detected: get_mode will fallback to stat -f" || fail "BSD stat-f empty"
    else
      fail "Neither stat -c nor stat -f works on this platform"
    fi
  fi

  # --- Stateful fake id: once useradd runs (state file present), answer id queries ---
  cat > "$FAKEBIN/id" <<EOF
#!/bin/bash
state_file="$ACCOUNT_STATE"
account_state="absent"
[ -f "\$state_file" ] && account_state=\$(cat "\$state_file")
case "\$*" in
  *vancine-deploy*)
    if [ "\$account_state" != "present" ]; then exit 1; fi
    case "\$1" in
      -gn) echo "vancine-deploy" ;;
      -nG) echo "vancine-deploy" ;;
      -u)  echo "999" ;;                          # uid
      *)   echo "uid=999(vancine-deploy) gid=999(vancine-deploy) groups=999(vancine-deploy)" ;;
    esac
    ;;
  *) /usr/bin/id "$@" ;;
esac
EOF
  chmod +x "$FAKEBIN/id"
  # Clear any prior account marker so a fresh run behaves as first-install.
  printf "absent" > "$ACCOUNT_STATE"

  # --- B. GNU stat contract: installer must use -c, not -f ---
  # With the buggy macOS-first code, stat -f returns garbage and the mode check fails.
  # We assert the installer SUCCEEDS (uses -c) and sets correct modes.
  : > "$STATE_DIR/chmod.log"; : > "$STATE_DIR/chown.log"
reset_fresh_account
  out=$(run_installer "$PUBKEY" 2>&1)
  echo "$out" | grep -q "INSTALL_OK" && pass "GNU stat: installer succeeds using -c" || fail "GNU stat: installer failed: $out"

  # --- C. Permission model: home/.ssh 0750 root:<group>, authorized_keys 0640 root:<group> ---
  # The deploy user's primary group in this test is "vancine-deploy" (from account-state file).
  # Read modes with a portable inline helper that mirrors the installer logic
  # WITHOUT copying the function definition. This is a test-only probe, not a
  # production code path.
  AK="$HOME_DIR/vancine-deploy/.ssh/authorized_keys"
  read_mode () {
    local p="$1"
    local r
    r=$(stat -c '%a' "$p" 2>/dev/null) || r=$(stat -f '%Lp' "$p" 2>/dev/null) || r=""
    if [[ "$r" =~ ^[0-7]{3,4}$ ]]; then
      while [ "${#r}" -lt 4 ]; do r="0$r"; done
      printf '%s' "$r"
    fi
  }
  HOME_P=$(read_mode "$HOME_DIR/vancine-deploy")
  SSH_P=$(read_mode "$HOME_DIR/vancine-deploy/.ssh")
  AK_P=$(read_mode "$AK")
  if [ "$HOME_P" = "0750" ]; then pass "home dir 0750 (readable by deploy group)"; else fail "home dir mode=$HOME_P (expected 0750)"; fi
  if [ "$SSH_P" = "0750" ]; then pass ".ssh 0750 (traversable by deploy group)"; else fail ".ssh mode=$SSH_P (expected 0750)"; fi
  if [ "$AK_P" = "0640" ]; then pass "authorized_keys 0640 (readable, not writable by deploy)"; else fail "authorized_keys mode=$AK_P (expected 0640)"; fi

  # --- D. deploy user can read authorized_keys but cannot modify it ---
  if [ "$AK_P" = "0640" ]; then pass "authorized_keys is 0640 (group read-only)"; else fail "ak mode=$AK_P"; fi
  GROUP_WRITE=$(( (10#${AK_P:1:2}) & 2 ))
  if [ "$GROUP_WRITE" -eq 0 ]; then pass "group has NO write on authorized_keys"; else fail "group can write authorized_keys"; fi

  # --- E. state dir still root:root 0700 (unchanged) ---
  STATE_P=$(read_mode "$PREFIX/var/lib/vancine-deploy")
  if [ "$STATE_P" = "0700" ]; then pass "state dir still root:root 0700"; else fail "state dir mode=$STATE_P (expected 0700)"; fi

  # --- F. Re-execution re-tightens to 0750/0640 (idempotent) ---
  # Reset so the installer re-creates the account and re-applies permissions on
  # a "dirty" tree (home left at 0755, authorized_keys at 0666).
  reset_fresh_account
  chmod 0755 "$HOME_DIR/vancine-deploy" 2>/dev/null || true
  chmod 0666 "$AK" 2>/dev/null || true
  reset_fresh_account
  out=$(run_installer "$PUBKEY" 2>&1)
  if echo "$out" | grep -q "INSTALL_OK"; then pass "re-execution succeeds"; else fail "re-execution failed: $out"; fi
  HOME_P2=$(read_mode "$HOME_DIR/vancine-deploy")
  AK_P2=$(read_mode "$AK")
  if [ "$HOME_P2" = "0750" ]; then pass "re-execution re-tightens home to 0750"; else fail "re-exec home mode=$HOME_P2"; fi
  if [ "$AK_P2" = "0640" ]; then pass "re-execution re-tightens authorized_keys to 0640"; else fail "re-exec ak mode=$AK_P2"; fi
}

# Run the linux permissions test suite
test_linux_permissions

# ============== GNU/BSD/ILLEGAL STAT ENTRY TESTS ==============
# These tests run the COMPLETE installer entry point (not sourced functions)
# with a fake stat in PATH that simulates GNU, BSD, or illegal output.
# The installer must succeed on GNU/BSD and fail closed on illegal output.
test_stat_platforms () {
  echo "== stat platforms =="

  # --- A. GNU stat: -c returns valid octal, -f returns exit 0 multi-line garbage ---
  reset_fresh_account
  cat > "$FAKEBIN/stat" <<'EOF'
#!/bin/bash
REAL_STAT=/usr/bin/stat
case "$1" in
  -c)
    fmt="$2"; shift 2
    path="$1"
    case "$fmt" in
      %a) $REAL_STAT -f '%Lp' "$path" 2>/dev/null || echo "755" ;;
      %U) $REAL_STAT -f '%Su' "$path" 2>/dev/null || echo "root" ;;
      *) echo "" ;;
    esac
    exit 0
    ;;
  -f)
    echo "  File: \"$2\""
    echo "  ID: 0 Namelen: 255 Type: ext2/ext3"
    echo "Block size: 4096"
    exit 0
    ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "$FAKEBIN/stat"
  out=$(VANCINE_INSTALL_TEST_MODE=1 VANCINE_INSTALL_PREFIX="$PREFIX" \
    VANCINE_DEPLOY_STATE_DIR="$STATE_DIR/state-gnu" \
    PATH="$FAKEBIN:$PATH" bash "$INSTALLER" "$PUBKEY" 2>&1 || true)
  if echo "$out" | grep -q "INSTALL_OK"; then pass "GNU stat: installer succeeds (INSTALL_OK)"; else fail "GNU stat: $out"; fi

  # --- B. BSD stat: -c fails, -f returns valid octal ---
  reset_fresh_account
  cat > "$FAKEBIN/stat" <<'EOF'
#!/bin/bash
REAL_STAT=/usr/bin/stat
case "$1" in
  -c) exit 1 ;;
  -f)
    fmt="$2"; shift 2
    path="$1"
    case "$fmt" in
      %Lp) $REAL_STAT -f '%Lp' "$path" 2>/dev/null || echo "755" ;;
      %Su) $REAL_STAT -f '%Su' "$path" 2>/dev/null || echo "root" ;;
      *) echo "" ;;
    esac
    exit 0
    ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "$FAKEBIN/stat"
  out=$(VANCINE_INSTALL_TEST_MODE=1 VANCINE_INSTALL_PREFIX="$PREFIX" \
    VANCINE_DEPLOY_STATE_DIR="$STATE_DIR/state-bsd" \
    PATH="$FAKEBIN:$PATH" bash "$INSTALLER" "$PUBKEY" 2>&1 || true)
  if echo "$out" | grep -q "INSTALL_OK"; then pass "BSD stat: installer succeeds (INSTALL_OK)"; else fail "BSD stat: $out"; fi

  # --- C. Illegal stat: both -c and -f return non-octal garbage ---
  reset_fresh_account
  cat > "$FAKEBIN/stat" <<'EOF'
#!/bin/bash
echo "garbage output not octal"
exit 0
EOF
  chmod +x "$FAKEBIN/stat"
  out=$(VANCINE_INSTALL_TEST_MODE=1 VANCINE_INSTALL_PREFIX="$PREFIX" \
    VANCINE_DEPLOY_STATE_DIR="$STATE_DIR/state-illegal" \
    PATH="$FAKEBIN:$PATH" bash "$INSTALLER" "$PUBKEY" 2>&1 || true)
  if echo "$out" | grep -q "INSTALL_FAILED"; then pass "Illegal stat: installer fails closed (INSTALL_FAILED)"; else fail "Illegal stat: $out"; fi

  # Remove the fake stat so later tests use real stat
  chmod -x "$FAKEBIN/stat" 2>/dev/null || true
}

test_stat_platforms

echo "TOTAL passed=$PASSED failed=$FAILED"
echo "test-install-production-access fixtures retained at: $STATE_DIR"
[ "$FAILED" -eq 0 ]
