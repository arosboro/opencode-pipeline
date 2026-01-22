#!/bin/bash
set -e

# Load environment variables
if [ -f "scaffolding/.env" ]; then
    export $(cat scaffolding/.env | xargs)
fi

echo "🚀 Starting OpenCode Swarm..."

# 1. Detect and Select Model (Interactive)
echo "🔍 Detecting AI Models..."
# Run the interactive detection script. 
# It prints logs to stderr (visible to user) and the ID to stdout (captured here).
DETECTED_MODEL_ID=$(bun run scaffolding/detect_model.ts)

# Check if detection was successful (script exits 1 on failure/quit)
if [ $? -ne 0 ]; then
    echo "❌ Model selection cancelled or failed. Exiting."
    exit 1
fi

export DEFAULT_MODEL_ID="$DETECTED_MODEL_ID"
echo "🎯 Using Model: $DEFAULT_MODEL_ID"

# 2. Start the Orchestrator
echo "🧠 Launching Orchestrator..."
# Pass the environment explicitly to be safe
bun run scaffolding/orchestrator.ts
