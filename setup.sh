#!/bin/bash
set -e

echo "🚀 Initializing OpenCode Pipeline Environment..."

# 1. Update Submodules
echo "📦 Updating git submodules..."
git submodule update --init --recursive

# 2. Check for Bun
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install Bun: https://bun.sh/"
    exit 1
fi

# 3. Initialize .env if missing (Do this early so config exists)
if [ ! -f "scaffolding/.env" ]; then
    echo "📝 Creating .env from example..."
    cp scaffolding/env.example scaffolding/.env
else
    echo "✅ .env already exists."
fi

# 4. Install Dependencies in Swarm Tools
if [ -d "swarm-tools" ]; then
    echo "🔧 Installing dependencies in swarm-tools..."
    cd swarm-tools
    # Allow install to fail without exiting the whole script, but warn user
    if ! bun install; then
        echo "⚠️  Warning: global bun install in swarm-tools had issues."
        echo "   You may need to go into swarm-tools/ and debug manually."
    fi
    cd ..
else
    echo "⚠️ swarm-tools directory not found!"
fi

echo "🎉 Setup complete! You can now run ./start_swarm.sh"
