#!/usr/bin/env bash
# Vancine one-time production access installer.
#
# Usage: install-production-access.sh /absolute/path/to/deploy-public-key.pub
#
# Creates the dedicated vancine-deploy account (no docker group, no password
# auth), installs root-owned copies of the gateway and orchestrator under
# /usr/local/sbin, writes authorized_keys with a forced-command prefix, and
# installs a single narrow sudoers rule. Refuses to overwrite a different
# installed script or key unless --update-reviewed-script is supplied.

set -Eeuo pipefail

umask 077

PREFIX="${VANCINE_INSTALL_PREFIX:-}"
SBIN_DIR="${PREFIX:+$PREFIX/sbin}"
[ -n "$SBIN_DIR" ] || SBIN_DIR="/usr/local/sbin"
ETC_DIR="${PREFIX:+$PREFIX/etc}"
[ -n "$ETC_DIR" ] || ETC_DIR="/etc"
SUDOERS_DIR="$ETC_DIR/sudoers.d"

DEPLOY_USER="vancine-deploy"
# When PREFIX is empty the home must be exactly /home/vancine-deploy (the
# previous ${PREFIX:+...} form produced "/vancine-deploy"). Compute explicitly.
if [ -n "$PREFIX" ]; then
  DEPLOY_HOME="$PREFIX/home/$DEPLOY_USER"
  DEPLOY_STATE_DIR="$PREFIX/var/lib/vancine-deploy"
else
  DEPLOY_HOME="/home/$DEPLOY_USER"
  DEPLOY_STATE_DIR="/var/lib/vancine-deploy"
fi
# Allow an explicit override (mirrors the orchestrator) so tests can redirect
# the state dir while still exercising the real empty-PREFIX home computation.
[ -n "${VANCINE_DEPLOY_STATE_DIR:-}" ] && DEPLOY_STATE_DIR="$VANCINE_DEPLOY_STATE_DIR"
SSH_DIR="$DEPLOY_HOME/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

GATEWAY_SRC="$(cd "$(dirname "$0")" && pwd)/ssh-command-gateway.sh"
ORCHESTRATOR_SRC="$(cd "$(dirname "$0")" && pwd)/production-deploy.sh"
GATEWAY_DST="$SBIN_DIR/vancine-deploy-gateway"
ORCHESTRATOR_DST="$SBIN_DIR/vancine-production-deploy"

FORCED_PREFIX='no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding,command="/usr/local/sbin/vancine-deploy-gateway"'
SUDOERS_RULE="vancine-deploy ALL=(root) NOPASSWD: /usr/local/sbin/vancine-production-deploy *"

# Portable path/permission inspection helpers.
#
# GNU/Linux stat and BSD/macOS stat disagree on flags and on what -f means:
#   - GNU: stat -c '%a' /path  -> mode; stat -f prints *filesystem* info with exit 0
#   - BSD:  stat -f '%Lp' /path -> mode; stat -c is an illegal-option error
#
# A macOS-first fallback (stat -f ... || stat -c ...) appears to work on BSD but
# SILENTLY breaks on GNU, because stat -f succeeds there: the perms variable ends
# up holding filesystem metadata while execution continues as if we had a valid
# mode. That class of bug is exactly what bit the original installer on Ubuntu.
#
# The robust order is GNU-first: try stat -c, and only if it does not produce a
# 1-/2-/3-digit octal token fall back to stat -f. Any format anomaly fails closed.

# get_mode <path>: prints the octal file mode (e.g. "750", "640", "600").
# Prints nothing on failure so callers fail closed when the result is empty.
get_mode () {
  local path="$1" raw=""
  # GNU stat -c works on Linux; BSD stat -f works on macOS. Try GNU first
  # because on Linux stat -f returns 0 but prints filesystem info (the bug).
  if raw=$(stat -c '%a' "$path" 2>/dev/null); then
    if [[ "$raw" =~ ^[0-7]{3,4}$ ]]; then
      while [ "${#raw}" -lt 4 ]; do raw="0$raw"; done
      printf '%s' "$raw"
      return 0
    fi
  fi
  # BSD fallback.
  if raw=$(stat -f '%Lp' "$path" 2>/dev/null); then
    if [[ "$raw" =~ ^[0-7]{3,4}$ ]]; then
      while [ "${#raw}" -lt 4 ]; do raw="0$raw"; done
      printf '%s' "$raw"
      return 0
    fi
  fi
  return 1
}

# get_group_name <user>: prints the user's primary group name.
get_group_name () {
  local user="$1" g=""
  if g=$(id -gn "$user" 2>/dev/null); then
    if [ -n "$g" ]; then printf '%s' "$g"; return 0; fi
  fi
  return 1
}

# get_owner <path>: prints the owning user name (e.g. "root").
# Returns 1 if the owner cannot be determined (caller must handle with `if !`).
get_owner () {
  local path="$1" raw=""
  if raw=$(stat -c '%U' "$path" 2>/dev/null); then
    if [ -n "$raw" ] && [[ "$raw" != *" "* ]]; then
      printf '%s' "$raw"
      return 0
    fi
  fi
  if raw=$(stat -f '%Su' "$path" 2>/dev/null); then
    if [ -n "$raw" ] && [[ "$raw" != *" "* ]]; then
      printf '%s' "$raw"
      return 0
    fi
  fi
  return 1
}

die () {
  printf 'INSTALL_FAILED: %s\n' "$*" >&2
  exit 1
}

require_root () {
  if [ "${VANCINE_INSTALL_TEST_MODE:-0}" = "1" ]; then return 0; fi
  [ "$(id -u)" -eq 0 ] || die "installer must be run as root"
}

require_tools () {
  # Verify every external tool the installer actually invokes is present, so a
  # partial environment fails fast with a clear message instead of mid-install.
  local missing=()
  local t
  for t in stat grep ssh-keygen id getent useradd mkdir chmod chown cmp install visudo mktemp mv; do
    command -v "$t" >/dev/null 2>&1 || missing+=("$t")
  done
  [ "${#missing[@]}" -eq 0 ] || die "missing required tools: ${missing[*]}"
}

prepare_state_dir () {
  # Create and verify the production state directory (root:root 0700) that the
  # orchestrator writes audit records to. Rejects symlinks; production mode
  # requires root ownership; test mode skips root ownership but still requires
  # non-symlink + 0700.
  local d="$DEPLOY_STATE_DIR"
  [ -L "$d" ] && die "state directory must not be a symlink: $d"
  if [ ! -d "$d" ]; then
    mkdir -p "$d" || die "failed to create state directory: $d"
  fi
  [ -d "$d" ] || die "state path is not a directory: $d"
  chmod 0700 "$d" || die "failed to chmod state directory 0700: $d"
  # Verify the mode even in test mode (tests run as non-root and cannot chown).
  # The root-owner chown + check is a production-only gate.
  if [ "${VANCINE_INSTALL_TEST_MODE:-0}" != "1" ]; then
    chown root:root "$d" || die "failed to chown state directory root:root: $d"
    local owner
    if ! owner=$(get_owner "$d"); then die "cannot determine state directory owner: $d"; fi
    if [ "$owner" != "root" ]; then die "state directory not root-owned: $d (owner=${owner:-unknown})"; fi
  fi
  local perms
  if ! perms=$(get_mode "$d"); then die "cannot determine state directory mode: $d"; fi
  if [ "$perms" != "0700" ]; then die "state directory mode is not 0700: $d (mode=${perms:-empty})"; fi
}

validate_pubkey_path () {
  local keyfile="$1"
  case "$keyfile" in
    /*) : ;;
    *) die "public key path must be absolute: $keyfile" ;;
  esac
  # Reject symlinks in every mode: a symlink could be swapped to point at a
  # different file between validation and use.
  [ -L "$keyfile" ] && die "public key file must not be a symlink: $keyfile"
  [ -f "$keyfile" ] || die "public key file not found: $keyfile"
  # Production mode: the key file must be owned by root so an unprivileged
  # user cannot replace it. Test mode supplies its own non-root fixture and
  # deliberately skips ONLY this ownership check (symlink and write-bit checks
  # still apply, so the production safety logic is not weakened).
  if [ "${VANCINE_INSTALL_TEST_MODE:-0}" != "1" ]; then
    local owner
    if ! owner=$(get_owner "$keyfile"); then die "cannot determine public key owner: $keyfile"; fi
    [ "$owner" = "root" ] || \
      die "public key file must be owned by root in production: $keyfile (owner=${owner:-unknown})"
  fi
  # Safe ownership: reject if EITHER the group OR world write bit is set.
  local perms group_perm world_perm
  if ! perms=$(get_mode "$keyfile"); then die "cannot determine public key mode: $keyfile"; fi
  group_perm="${perms: -2:1}"
  world_perm="${perms: -1}"
  case "$group_perm" in
    [2367]) die "public key file is group-writable: $keyfile (mode $perms)" ;;
  esac
  case "$world_perm" in
    [2367]) die "public key file is world-writable: $keyfile (mode $perms)" ;;
  esac
}

validate_pubkey_content () {
  local keyfile="$1"
  # Reject private-key material outright.
  if grep -qE -- '-----BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY-----' "$keyfile"; then
    die "refusing private key material: $keyfile"
  fi
  # Exactly one non-empty, non-comment line.
  local nlines
  nlines=$(grep -cvE '^[[:space:]]*(#|$)' "$keyfile" || true)
  [ "$nlines" -eq 1 ] || die "expected exactly one public key line, got $nlines"
  # ONLY ssh-ed25519 is accepted. RSA, ECDSA, and SK keys are rejected, as is
  # any leading options prefix.
  local line
  line=$(grep -vE '^[[:space:]]*(#|$)' "$keyfile")
  case "$line" in
    ssh-ed25519\ *) : ;;
    *) die "public key must be a single ssh-ed25519 key with no options prefix: $keyfile" ;;
  esac
  # ssh-keygen MUST be present and MUST validate the key successfully.
  command -v ssh-keygen >/dev/null 2>&1 || die "ssh-keygen is required but not found"
  ssh-keygen -lf "$keyfile" >/dev/null 2>&1 || die "ssh-keygen validation failed for: $keyfile"
}

ensure_account () {
  # Per-user primary group name (e.g. "vancine-deploy"). The deploy user must be
  # able to read its forced-command authorized_keys, so we locate it explicitly.
  local deploy_primary_group=""

  if id "$DEPLOY_USER" >/dev/null 2>&1; then
    echo "account $DEPLOY_USER already exists"
    # Locate the primary group via the portable helper.
    if ! deploy_primary_group=$(get_group_name "$DEPLOY_USER"); then deploy_primary_group=""; fi
    # Verify the existing account is safe: not in the docker group, shell is
    # exactly /bin/bash, and home matches the expected path.
    if id -nG "$DEPLOY_USER" 2>/dev/null | grep -qw docker; then
      die "account $DEPLOY_USER is in the docker group (must be removed)"
    fi
    local current_shell current_home
    current_shell=$(getent passwd "$DEPLOY_USER" 2>/dev/null | cut -d: -f7 || true)
    current_home=$(getent passwd "$DEPLOY_USER" 2>/dev/null | cut -d: -f6 || true)
    [ "$current_shell" = "/bin/bash" ] || \
      die "account $DEPLOY_USER shell must be /bin/bash (got ${current_shell:-<empty>}; nologin is not accepted)"
    [ "$current_home" = "$DEPLOY_HOME" ] || \
      die "account $DEPLOY_USER home must be $DEPLOY_HOME (got ${current_home:-<empty>})"
  else
    # useradd --system creates a matching primary group (e.g. vancine-deploy).
    useradd --system --create-home --home-dir "$DEPLOY_HOME" --shell /bin/bash "$DEPLOY_USER"
    echo "created account $DEPLOY_USER (shell=/bin/bash)"
    if ! deploy_primary_group=$(get_group_name "$DEPLOY_USER"); then deploy_primary_group=""; fi
  fi

  if [ -z "$deploy_primary_group" ]; then
    die "could not determine primary group for $DEPLOY_USER (required for read-only authorized_keys)"
  fi

  # Permission model: the deploy user must READ its forced-command
  # authorized_keys, but MUST NOT modify it. root:root 0700 (home/.) /
  # 0600 (authorized_keys) would make authorized_keys unreadable to the deploy
  # user, breaking SSH public-key auth. Instead we use root:<primary-group>
  # with group-read (and NO group-write):
  #   home   root:<group> 0750   -> deploy user can traverse into .ssh
  #   .ssh   root:<group> 0750   -> deploy user can list/read
  #   auth   root:<group> 0640   -> deploy user can read, cannot modify
  #   state  root:root    0700   -> untouched (deploy never accesses it)
  mkdir -p "$SSH_DIR"
  chmod 0750 "$DEPLOY_HOME" || die "failed to chmod $DEPLOY_HOME 0750"
  chmod 0750 "$SSH_DIR" || die "failed to chmod $SSH_DIR 0750"
  # Production-only: chown to root:<group> and verify ownership. Tests run as
  # non-root and cannot chown, so they verify only the mode.
  if [ "${VANCINE_INSTALL_TEST_MODE:-0}" != "1" ]; then
    chown "root:$deploy_primary_group" "$DEPLOY_HOME" || die "failed to chown $DEPLOY_HOME root:$deploy_primary_group"
    chown "root:$deploy_primary_group" "$SSH_DIR" || die "failed to chown $SSH_DIR root:$deploy_primary_group"
    local home_owner ssh_owner
    if ! home_owner=$(get_owner "$DEPLOY_HOME"); then die "cannot verify $DEPLOY_HOME owner"; fi
    if ! ssh_owner=$(get_owner "$SSH_DIR"); then die "cannot verify $SSH_DIR owner"; fi
    if [ "$home_owner" != "root" ]; then die "$DEPLOY_HOME owner $home_owner != root"; fi
    if [ "$ssh_owner" != "root" ]; then die "$SSH_DIR owner $ssh_owner != root"; fi
  fi
  local home_mode ssh_mode
  if ! home_mode=$(get_mode "$DEPLOY_HOME"); then die "cannot verify $DEPLOY_HOME mode"; fi
  if ! ssh_mode=$(get_mode "$SSH_DIR"); then die "cannot verify $SSH_DIR mode"; fi
  if [ "$home_mode" != "0750" ]; then die "$DEPLOY_HOME mode $home_mode != 0750"; fi
  if [ "$ssh_mode" != "0750" ]; then die "$SSH_DIR mode $ssh_mode != 0750"; fi
}

install_script () {
  local src="$1" dst="$2" label="$3"
  if [ -f "$dst" ]; then
    if ! cmp -s "$src" "$dst"; then
      if [ "${VANCINE_INSTALL_UPDATE_REVIEWED:-0}" != "1" ]; then
        die "refusing to overwrite different installed $label at $dst (pass --update-reviewed-script after review)"
      fi
    fi
  fi
  install -m 0755 -o root -g root "$src" "$dst"
  echo "installed $label -> $dst"
}

write_authorized_keys () {
  local keyfile="$1"
  # Resolve the deploy user's primary group for group-readable permissions.
  local deploy_primary_group=""
  if ! deploy_primary_group=$(get_group_name "$DEPLOY_USER"); then deploy_primary_group=""; fi
  if [ -z "$deploy_primary_group" ]; then
    die "could not determine primary group for $DEPLOY_USER when writing authorized_keys"
  fi

  local desired
  desired=$(printf '%s ' "$FORCED_PREFIX"; cat "$keyfile")
  local ak_mode ak_owner
  if [ -f "$AUTH_KEYS" ]; then
    local existing
    existing=$(cat "$AUTH_KEYS")
    if [ "$existing" = "$desired" ]; then
      chmod 0640 "$AUTH_KEYS" || die "failed to chmod $AUTH_KEYS 0640"
      if [ "${VANCINE_INSTALL_TEST_MODE:-0}" != "1" ]; then
        chown "root:$deploy_primary_group" "$AUTH_KEYS" || die "failed to chown $AUTH_KEYS root:$deploy_primary_group"
        local ak_owner
        if ! ak_owner=$(get_owner "$AUTH_KEYS"); then die "cannot verify authorized_keys owner"; fi
        if [ "$ak_owner" != "root" ]; then die "authorized_keys owner $ak_owner != root"; fi
      fi
      local ak_mode
      if ! ak_mode=$(get_mode "$AUTH_KEYS"); then die "cannot verify authorized_keys mode"; fi
      if [ "$ak_mode" != "0640" ]; then die "authorized_keys mode $ak_mode != 0640"; fi
      echo "authorized_keys content unchanged; mode re-verified (0640)"
      return 0
    fi
    die "authorized_keys already exists and differs from desired content (manual review required)"
  fi
  printf '%s\n' "$desired" > "$AUTH_KEYS"
  chmod 0640 "$AUTH_KEYS" || die "failed to chmod $AUTH_KEYS 0640"
  if [ "${VANCINE_INSTALL_TEST_MODE:-0}" != "1" ]; then
    chown "root:$deploy_primary_group" "$AUTH_KEYS" || die "failed to chown $AUTH_KEYS root:$deploy_primary_group"
    local ak_owner
    if ! ak_owner=$(get_owner "$AUTH_KEYS"); then die "cannot verify authorized_keys owner"; fi
    if [ "$ak_owner" != "root" ]; then die "authorized_keys owner $ak_owner != root"; fi
  fi
  local ak_mode
  if ! ak_mode=$(get_mode "$AUTH_KEYS"); then die "cannot verify authorized_keys mode"; fi
  if [ "$ak_mode" != "0640" ]; then die "authorized_keys mode $ak_mode != 0640"; fi
  echo "wrote $AUTH_KEYS (0640)"
}

install_sudoers () {
  local dst="$SUDOERS_DIR/$DEPLOY_USER"
  mkdir -p "$SUDOERS_DIR"
  # If already installed and byte-identical, do NOT return early: re-run
  # visudo to confirm the syntax is still valid and re-tighten owner/mode so a
  # previously-loosened or corrupted file is re-hardened.
  if [ -f "$dst" ] && [ "$(cat "$dst" 2>/dev/null)" = "$SUDOERS_RULE" ]; then
    visudo -cf "$dst" >/dev/null 2>&1 || \
      die "existing sudoers rule failed re-validation (manual review required): $dst"
    chmod 0440 "$dst" || die "failed to chmod $dst"
    chown root:root "$dst" || die "failed to chown $dst to root:root"
    echo "sudoers rule unchanged; re-validated and re-verified (root:root 0440)"
    return 0
  fi
  # A different existing rule is never overwritten automatically.
  if [ -f "$dst" ]; then
    die "sudoers rule already exists and differs from desired (manual review required): $dst"
  fi
  # Create the candidate on the SAME filesystem as the destination so the
  # final mv is an atomic rename. A failed candidate is retained for audit.
  local tmp
  tmp=$(mktemp "$SUDOERS_DIR/.vancine-deploy.XXXXXX")
  printf '%s\n' "$SUDOERS_RULE" > "$tmp"
  if ! visudo -cf "$tmp" >/dev/null 2>&1; then
    die "sudoers rule failed validation (candidate retained: $tmp)"
  fi
  chmod 0440 "$tmp" || die "failed to chmod sudoers candidate"
  chown root:root "$tmp" || die "failed to chown sudoers candidate to root:root"
  mv -f "$tmp" "$dst" || die "failed to atomically install sudoers rule"
  echo "installed sudoers rule -> $dst"
}

# ---- main ----
# --update-reviewed-script may appear before or after the keyfile path.
keyfile=""
update_reviewed=0
while [ $# -gt 0 ]; do
  case "$1" in
    --update-reviewed-script) update_reviewed=1; shift ;;
    --) shift; break ;;
    -*) die "unknown option: $1" ;;
    *)
      [ -z "$keyfile" ] || die "unexpected extra argument: $1"
      keyfile="$1"; shift ;;
  esac
done
[ -n "$keyfile" ] || die "usage: $0 [--update-reviewed-script] /absolute/path/to/deploy-public-key.pub [--update-reviewed-script]"
[ "$update_reviewed" = "1" ] && export VANCINE_INSTALL_UPDATE_REVIEWED=1

require_root
require_tools
prepare_state_dir
validate_pubkey_path "$keyfile"
validate_pubkey_content "$keyfile"
ensure_account
install_script "$GATEWAY_SRC" "$GATEWAY_DST" "gateway"
install_script "$ORCHESTRATOR_SRC" "$ORCHESTRATOR_DST" "orchestrator"
write_authorized_keys "$keyfile"
install_sudoers

echo "INSTALL_OK"
