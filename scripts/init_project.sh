#!/bin/bash
set -e

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$1"

if [ -z "$TARGET_DIR" ]; then
    echo "Usage: ./scripts/init_project.sh <target_directory>"
    exit 1
fi

echo "🚀 Initializing new OpenCode Project at $TARGET_DIR..."

# 1. Create Target Directory
mkdir -p "$TARGET_DIR"

# 2. Copy Scaffolding and Scripts
echo "📦 Copying scaffolding..."
cp -r "$SOURCE_DIR/scaffolding" "$TARGET_DIR/"
cp "$SOURCE_DIR/setup.sh" "$TARGET_DIR/"
cp "$SOURCE_DIR/start_swarm.sh" "$TARGET_DIR/"

# 3. Setup Swarm Tools
# We need to decide if we clone the submodule or copy it.
# For "Fresh Storage", let's assume we want a working setup. 
# Providing the .gitmodules and initializing is cleaner than copying massive node_modules.
if [ -f "$SOURCE_DIR/.gitmodules" ]; then
    echo "🔗 Setting up git submodules..."
    cp "$SOURCE_DIR/.gitmodules" "$TARGET_DIR/"
    
    # We need to initialize the git repo to use submodules
    cd "$TARGET_DIR"
    if [ ! -d ".git" ]; then
        git init
    fi
    # We don't want to rely on the source's .git config, so we just init based on the copied .gitmodules
    git submodule init
    # We can't update without the URL being accessible. 
    # If the user has local access, this works. If not, we might need to copy.
    # Let's try to copy the 'agents' directory at least, as it's part of the config.
else 
    echo "⚠️  Warning: No .gitmodules found in source."
fi

# Copy Agents if they exist (they are content, not just tools)
if [ -d "$SOURCE_DIR/agents" ]; then
    echo "busts Copying agents definitions..."
    cp -r "$SOURCE_DIR/agents" "$TARGET_DIR/"
fi

# 4. Final Instructions
echo ""
echo "✅ Project Initialized at $TARGET_DIR"
echo "👉 Next Steps:"
echo "   1. cd $TARGET_DIR"
echo "   2. ./setup.sh"
echo "   3. ./start_swarm.sh"
