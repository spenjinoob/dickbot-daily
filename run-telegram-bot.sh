#!/bin/bash
# Auto-restart wrapper for telegram-bot.mjs
# Usage: ./run-telegram-bot.sh
# Requires: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars

cd "$(dirname "$0")"

RESTART_DELAY=5
MAX_RESTARTS=100
restarts=0

while [ $restarts -lt $MAX_RESTARTS ]; do
    echo "[$(date)] Starting telegram bot (restart #$restarts)..."
    node telegram-bot.mjs
    exit_code=$?
    restarts=$((restarts + 1))

    if [ $exit_code -eq 1 ]; then
        echo "[$(date)] Bot exited with code 1 (config error). Not restarting."
        exit 1
    fi

    echo "[$(date)] Bot exited with code $exit_code. Restarting in ${RESTART_DELAY}s..."
    sleep $RESTART_DELAY

    # Exponential backoff: double delay up to 60s after repeated crashes
    if [ $restarts -gt 5 ]; then
        RESTART_DELAY=$((RESTART_DELAY * 2))
        if [ $RESTART_DELAY -gt 60 ]; then
            RESTART_DELAY=60
        fi
    fi
done

echo "[$(date)] Max restarts ($MAX_RESTARTS) reached. Giving up."
exit 1
