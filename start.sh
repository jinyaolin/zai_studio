#!/bin/bash
# Start both CosyVoice TTS server and zai dev server.
# Usage: ./start.sh

set -e

# Start CosyVoice if TTS_PROVIDER=cosyvoice and server isn't already running
if grep -q "TTS_PROVIDER=cosyvoice" .env 2>/dev/null; then
  if ! curl -sS http://127.0.0.1:9880/healthz > /dev/null 2>&1; then
    echo "Starting CosyVoice server..."
    cd ~/dev/CosyVoice
    source venv/bin/activate
    python server.py &
    COSYVOICE_PID=$!
    cd ~/zai
    echo "  waiting for model to load..."
    sleep 12
    echo "  CosyVoice ready (PID $COSYVOICE_PID)"
  else
    echo "CosyVoice server already running."
  fi
fi

# Start zai dev server
echo "Starting zai dev server on :3100..."
exec npm run dev
