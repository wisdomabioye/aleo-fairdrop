#!/usr/bin/env bash
#
# Sign a message with multiple admin keys.
#
# Usage:
#   ./scripts/multisig-sign.sh <message>
#   ./scripts/multisig-sign.sh <message> --keys path/to/keys.json
#
# Keys file: JSON array of { label, address, privateKey } objects.
# Defaults to scripts/admin-keys.json. See admin-keys.example.json.
#
# Output per admin:
#   Admin 0 | aleo1abc...xyz
#   sign1xxxxxxxxx...
#
# Paste address + signature directly into the Signature Panel.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <message> [--keys path/to/keys.json]" >&2
  exit 1
fi

MESSAGE="$1"
shift

KEYS_FILE="$(dirname "$0")/admin-keys.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keys) KEYS_FILE="$2"; shift 2 ;;
    *)      echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -f "$KEYS_FILE" ]]; then
  echo "Keys file not found: $KEYS_FILE" >&2
  echo "Copy admin-keys.example.json → admin-keys.json and fill in your keys." >&2
  exit 1
fi

COUNT=$(jq length "$KEYS_FILE")

for ((i = 0; i < COUNT; i++)); do
  LABEL=$(jq -r ".[$i].label" "$KEYS_FILE")
  ADDRESS=$(jq -r ".[$i].address" "$KEYS_FILE")
  PRIVATE_KEY=$(jq -r ".[$i].privateKey" "$KEYS_FILE")

  SIG=$(leo account sign --private-key "$PRIVATE_KEY" --message "$MESSAGE" 2>&1)

  echo "$LABEL | $ADDRESS"
  echo "$SIG"
  echo ""
done
