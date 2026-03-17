#!/bin/sh
# Rachax402 onchain-agent — container entrypoint
# Seeds wallet_data.txt from WALLET_DATA_JSON env var on first boot,
# then starts the Next.js standalone server.
set -e

WALLET_FILE="/app/wallet/wallet_data.txt"

if [ ! -f "$WALLET_FILE" ]; then
  if [ -n "$WALLET_DATA_JSON" ]; then
    echo "[entrypoint] Seeding wallet_data.txt from WALLET_DATA_JSON env var..."
    printf '%s\n' "$WALLET_DATA_JSON" > "$WALLET_FILE"
    echo "[entrypoint] Wallet seeded: $(cat $WALLET_FILE)"
  else
    echo "[entrypoint] WARNING: WALLET_DATA_JSON not set and no wallet_data.txt in volume."
    echo "[entrypoint] AgentKit will create a NEW wallet on first start."
    echo "[entrypoint] Set WALLET_DATA_JSON to reuse an existing wallet:"
    echo '[entrypoint] WALLET_DATA_JSON={"ownerAddress":"0x...","smartWalletAddress":"0x..."}'
  fi
else
  echo "[entrypoint] Existing wallet_data.txt found."
fi

exec node server.js