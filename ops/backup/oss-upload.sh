#!/usr/bin/env bash

set -Eeuo pipefail

umask 077

backup_kind=${1:-}
archive_path=${2:-}
checksum_path=${3:-}

case "$backup_kind" in
  daily|weekly|predeploy|manual)
    ;;
  *)
    printf 'Usage: %s {daily|weekly|predeploy|manual} ARCHIVE_PATH CHECKSUM_PATH\n' "$0" >&2
    exit 64
    ;;
esac

if [ -z "$archive_path" ] || [ -z "$checksum_path" ]; then
  printf 'Usage: %s {daily|weekly|predeploy|manual} ARCHIVE_PATH CHECKSUM_PATH\n' "$0" >&2
  exit 64
fi

oss_env_file=${VANCINE_OSS_BACKUP_ENV_FILE:-/etc/vancine/oss-backup.env}
if [ -f "$oss_env_file" ]; then
  # shellcheck disable=SC1090
  . "$oss_env_file"
fi

if [ "${VANCINE_OSS_BACKUP_ENABLED:-0}" != "1" ]; then
  printf 'OSS backup upload skipped: VANCINE_OSS_BACKUP_ENABLED is not 1\n'
  exit 0
fi

for required_var in \
  VANCINE_OSS_BUCKET \
  VANCINE_OSS_PREFIX \
  VANCINE_OSS_REGION \
  VANCINE_OSS_ENDPOINT \
  VANCINE_OSSUTIL_CONFIG_FILE \
  VANCINE_AGE_RECIPIENT; do
  if [ -z "${!required_var:-}" ]; then
    printf 'Missing required OSS backup setting: %s\n' "$required_var" >&2
    exit 64
  fi
done

if [ ! -f "$archive_path" ]; then
  printf 'Backup archive does not exist: %s\n' "$archive_path" >&2
  exit 66
fi
if [ ! -f "$checksum_path" ]; then
  printf 'Backup checksum does not exist: %s\n' "$checksum_path" >&2
  exit 66
fi
if [ ! -f "$VANCINE_OSSUTIL_CONFIG_FILE" ]; then
  printf 'OSS config file does not exist: %s\n' "$VANCINE_OSSUTIL_CONFIG_FILE" >&2
  exit 66
fi

backup_root=${BACKUP_ROOT:-/opt/vancine-platform/backups}
checkpoint_dir=${VANCINE_OSS_CHECKPOINT_DIR:-$backup_root/.oss-checkpoints}
verify_root=${VANCINE_OSS_VERIFY_ROOT:-$backup_root/.oss-verify}
install -d -m 700 "$checkpoint_dir" "$verify_root/$backup_kind"

archive_dir=$(dirname "$archive_path")
archive_base=$(basename "$archive_path")
encrypted_path=$archive_path.age
encrypted_partial=$encrypted_path.partial
encrypted_checksum_path=$encrypted_path.sha256
encrypted_checksum_partial=$encrypted_checksum_path.partial
manifest_path=$archive_path.oss-manifest.json
manifest_partial=$manifest_path.partial

for reserved_path in \
  "$encrypted_path" "$encrypted_partial" \
  "$encrypted_checksum_path" "$encrypted_checksum_partial" \
  "$manifest_path" "$manifest_partial"; do
  if [ -e "$reserved_path" ]; then
    printf 'Refusing to overwrite existing OSS backup artifact: %s\n' "$reserved_path" >&2
    exit 73
  fi
done

age -r "$VANCINE_AGE_RECIPIENT" -o "$encrypted_partial" "$archive_path"
chmod 600 "$encrypted_partial"
mv "$encrypted_partial" "$encrypted_path"
chmod 600 "$encrypted_path"

(
  cd "$archive_dir"
  sha256sum "$(basename "$encrypted_path")" > "$(basename "$encrypted_checksum_partial")"
  mv "$(basename "$encrypted_checksum_partial")" "$(basename "$encrypted_checksum_path")"
  chmod 600 "$(basename "$encrypted_checksum_path")"
  sha256sum -c "$(basename "$encrypted_checksum_path")"
)

plain_sha256=$(awk '{ print $1 }' "$checksum_path")
encrypted_sha256=$(awk '{ print $1 }' "$encrypted_checksum_path")
archive_bytes=$(wc -c < "$archive_path")
encrypted_bytes=$(wc -c < "$encrypted_path")
uploaded_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
host_name=$(hostname)

backup_kind="$backup_kind" \
archive_base="$archive_base" \
archive_bytes="$archive_bytes" \
plain_sha256="$plain_sha256" \
encrypted_bytes="$encrypted_bytes" \
encrypted_sha256="$encrypted_sha256" \
uploaded_at="$uploaded_at" \
host_name="$host_name" \
python3 - "$manifest_partial" <<'PYMANIFEST'
import json
import os
import sys
manifest = {
    'backup_kind': os.environ['backup_kind'],
    'archive_file': os.environ['archive_base'],
    'archive_bytes': int(os.environ['archive_bytes']),
    'archive_sha256': os.environ['plain_sha256'],
    'encrypted_file': os.environ['archive_base'] + '.age',
    'encrypted_bytes': int(os.environ['encrypted_bytes']),
    'encrypted_sha256': os.environ['encrypted_sha256'],
    'uploaded_at': os.environ['uploaded_at'],
    'hostname': os.environ['host_name'],
    'encryption': 'age',
}
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, sort_keys=True, indent=2)
    f.write('\n')
PYMANIFEST
chmod 600 "$manifest_partial"
mv "$manifest_partial" "$manifest_path"
chmod 600 "$manifest_path"

oss_prefix=${VANCINE_OSS_PREFIX%/}
object_base=$oss_prefix/$backup_kind/$archive_base
object_encrypted=$object_base.age
object_encrypted_checksum=$object_base.age.sha256
object_plain_checksum=$object_base.sha256
object_manifest=$object_base.oss-manifest.json

ossutil_base=(
  ossutil
  --config-file "$VANCINE_OSSUTIL_CONFIG_FILE"
  --endpoint "$VANCINE_OSS_ENDPOINT"
  --region "$VANCINE_OSS_REGION"
  --sign-version v4
  --mode AK
  --retry-times 5
)

"${ossutil_base[@]}" cp "$encrypted_path" "oss://$VANCINE_OSS_BUCKET/$object_encrypted" \
  --force --no-progress --checkpoint-dir "$checkpoint_dir"
"${ossutil_base[@]}" cp "$encrypted_checksum_path" "oss://$VANCINE_OSS_BUCKET/$object_encrypted_checksum" \
  --force --no-progress --checkpoint-dir "$checkpoint_dir"
"${ossutil_base[@]}" cp "$checksum_path" "oss://$VANCINE_OSS_BUCKET/$object_plain_checksum" \
  --force --no-progress --checkpoint-dir "$checkpoint_dir"
"${ossutil_base[@]}" cp "$manifest_path" "oss://$VANCINE_OSS_BUCKET/$object_manifest" \
  --force --no-progress --checkpoint-dir "$checkpoint_dir"

verify_dir=$verify_root/$backup_kind/$archive_base
install -d -m 700 "$verify_dir"
"${ossutil_base[@]}" cp "oss://$VANCINE_OSS_BUCKET/$object_encrypted_checksum" "$verify_dir/$(basename "$encrypted_checksum_path")" \
  --force --no-progress --checkpoint-dir "$checkpoint_dir"
cmp "$encrypted_checksum_path" "$verify_dir/$(basename "$encrypted_checksum_path")"

printf 'OSS backup upload complete: kind=%s object=%s encrypted_bytes=%s\n' \
  "$backup_kind" "oss://$VANCINE_OSS_BUCKET/$object_encrypted" "$encrypted_bytes"
