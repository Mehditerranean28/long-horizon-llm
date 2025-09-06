#!/usr/bin/env bash

# ============================================================================
# Ollama + Mistral Runner
# ============================================================================
# Installs Ollama if needed, pulls the Mistral model and starts the server.
# At the end it prints a curl example for querying the API.
#
# Usage: ./run_ollama_mistral.sh
# ---------------------------------------------------------------------------

set -euo pipefail

# STEP 1️⃣: Ensure the ollama binary exists
if ! command -v ollama >/dev/null 2>&1; then
  echo "Installing Ollama..."
  curl -fsSL https://ollama.ai/install.sh | sh
fi

# STEP 2️⃣: Pull the model (this can take a while on first run)
ollama pull mistral

# STEP 3️⃣: Start the server on port 11434
ollama serve &
SERVER_PID=$!
trap 'kill $SERVER_PID' EXIT

# STEP 4️⃣: Show the user how to query the API
cat <<MSG
Ollama with the Mistral model is now running.
Send requests with:
  curl -X POST http://localhost:11434/api/generate \
       -d '{"model":"mistral","prompt":"Hello"}'
Press Ctrl+C to stop the server.
MSG

wait $SERVER_PID

