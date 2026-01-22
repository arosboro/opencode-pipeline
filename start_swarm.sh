#!/bin/bash
set -e

# Load environment variables
if [ -f "scaffolding/.env" ]; then
    export $(cat scaffolding/.env | xargs)
fi

echo "🚀 Starting OpenCode Swarm..."

# 1. Check LM Studio Connection
echo "📡 Checking LM Studio connection at $LM_STUDIO_URL..."
if curl --output /dev/null --silent --head --fail "$LM_STUDIO_URL/v1/models"; then
    echo "✅ LM Studio is reachable."
else
    echo "❌ Could not connect to LM Studio at $LM_STUDIO_URL"
    echo "   Please make sure LM Studio is running and the local server is started on port 1234."
    exit 1
fi

# 2. Start the Orchestrator
echo "🧠 Launching Orchestrator..."
# Assuming we will use bun to run the typescript orchestrator
bun run scaffolding/orchestrator.ts
