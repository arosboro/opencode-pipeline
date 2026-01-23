#!/bin/bash
set -e

# Load environment variables (Safe Method)
if [ -f "scaffolding/.env" ]; then
    set -a
    source scaffolding/.env
    set +a
fi

echo "🚀 Starting OpenCode Swarm..."

# 1. Detect and Select Model (Interactive)
echo "🔍 Detecting AI Models..."
# Run the interactive detection script directly (std in/out/err connected to terminal)
bun run scaffolding/detect_model.ts

# Check if detection was successful (script exits 1 on failure/quit)
if [ $? -ne 0 ]; then
    echo "❌ Model selection cancelled or failed. Exiting."
    exit 1
fi

# Read result from file
if [ -f ".last_detected_model" ]; then
    DETECTED_MODEL_ID=$(cat .last_detected_model)
    rm .last_detected_model
else
    echo "❌ Error: Could not determine selected model."
    exit 1
fi

export DEFAULT_MODEL_ID="$DETECTED_MODEL_ID"
echo "🎯 Using Model: $DEFAULT_MODEL_ID"

# 2. Start the Orchestrator
echo "🧠 Launching Orchestrator..."
# Pass the environment explicitly to be safe
bun run scaffolding/orchestrator.ts
