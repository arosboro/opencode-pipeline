# Manual Testing & Verification Guide

This document provides practical steps to test the `opencode-pipeline` scaffold, verify the environment, and troubleshoot common issues.

## 1. Prerequisites

Before running the pipeline, ensure the following tools are installed and running:

- **Git**: Version control (required for submodules).
- **Bun**: JavaScript runtime (`v1.0.0+`).
    - Install: `curl -fsSL https://bun.sh/install | bash`
- **LM Studio**: Local AI server (must be running on port `1234` or configured URL).
    - Download: [lmstudio.ai](https://lmstudio.ai/)
    - **Important**: Enable the "Local Inference Server" in LM Studio Settings.

## 2. Setup Verification

Run these checks to confirm your environment is ready.

### 2.1 Check Dependencies
```bash
# Verify Bun
bun --version

# Verify Git
git --version
```

### 2.2 Verify LM Studio Connection
Ensure LM Studio is running and the server is active.
```bash
# Test connection (should return HTTP 200 or JSON)
curl -v http://localhost:1234/v1/models
```

## 3. Getting Up and Running

Follow these steps to initialize and start the swarm.

### 3.1 Initialization
This script updates submodules and installs dependencies.
```bash
./setup.sh
```
*Expected Output:*
- "Updates git submodules..."
- "Installing dependencies in swarm-tools..." (warnings about peer deps are usually fine)
- "Setup complete!"

### 3.2 Starting the Swarm
This script detects models and launches the orchestrator.
```bash
./start_swarm.sh
```

**Interactive Steps:**
1. The script will query LM Studio for available models.
2. You will be prompted to select a **primary model** (Planner) and a **coder model** (Worker).
3. Use `Arrow Keys` to navigate and `Enter` to select.

*Expected Output:*
```text
🚀 Starting OpenCode Swarm...
🔍 Detecting AI Models...
🤖 Select PRIMARY model (Coordinator/Planner):
> ... (your models)
✅ Selected: <model-id>
🎯 Using Model: <model-id>
🧠 Launching Orchestrator...
...
✅ MOE System Ready.
```

## 4. Verification Checkpoints

Use this checklist to validate the scaffold health.

| Area | Check | Pass Criteria |
|------|-------|---------------|
| **Setup** | `./setup.sh` | Exits with `0` and "Setup complete!" message. |
| **Model Detection** | `./start_swarm.sh` | Lists models defined in your LM Studio instance. |
| **Orchestrator** | Startup | Prints "MOE System Ready" and listens (process doesn't crash). |
| **Configuration** | `swarm_config.yaml` | `orchestrator.ts` successfully loads 2+ experts from YAML. |

## 5. Troubleshooting & Limitations

### Known Issue: Configuration Mismatch
- **Symptom**: Settings saved during model selection (in `swarm_config.json`) are not fully reflected in the orchestrator (which reads `swarm_config.yaml`).
- **Workaround**: Currently, the **Model ID** is correctly passed via environment variables. For other settings, manually edit `scaffolding/swarm_config.yaml`.

### Connection Refused (LM Studio)
- **Error**: `❌ Could not connect to LM Studio.`
- **Fix**: Ensure LM Studio is open, the Server tab is active, and "Start Server" is clicked. Default port is `1234`.

### Missing Dependencies
- **Error**: `Bun is not installed` or module not found.
- **Fix**: Re-run `./setup.sh` to ensure `swarm-tools` dependencies are installed.

### Architecture Mismatch (exit code 1 on setup)
- **Error**: `esbuild` platform conflict (e.g., trying to install `darwin-arm64` but running on `x64` Node).
- **Cause**: Using Rosetta-emulated (x64) Node.js on Apple Silicon alongside native (arm64) Bun.
- **Fix**: Install Native Node.js (arm64).
    ```bash
    # Verify Architecture (should be arm64)
    node -p "process.arch"
    


## 6. IDE Verification (OpenCode / Cursor / Claude)

To verify the MCP servers "in practice" independent of the scaffold:

1.  **Locate Config**: The scaffold generates a standard MCP config at `scaffolding/mcp_config.json`.
2.  **Configure IDE**:
    - **Method A: UI Settings**
        - Click the **Gear Icon** (Settings) in the bottom-left or top-right.
        - Search for "MCP" or "Context".
        - If an "Add MCP Server" form appears, enter the details.
    - **Method B: Manual Config (Recommended)**
        - For **Claude Desktop**: Edit `~/Library/Application Support/Claude/claude_desktop_config.json`.
        - For **VS Code / Cursor**: Open "User Settings (JSON)" (`Cmd+Shift+P` -> `Preferences: Open User Settings (JSON)`).
        - Add the configuration below.

    > **CRITICAL**: You MUST replace `.` with the **Absolute Path** to this repository (e.g., `/Users/arosboro/git/opencode-pipeline`). IDEs typically cannot resolve relative paths like `.` correctly.

    *Configuration Snippet*:
    ```json
    {
      "mcpServers": {
        "filesystem": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/arosboro/git/opencode-pipeline"]
        },
        "memory": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-memory"]
        }
      }
    }
    ```

3.  **Test Commands**:
    - Open a new Chat session.
    - Ask: *"Read the file README.md in the repository."*
    - The IDE should prompt you to allow the `filesystem` tool to execute `read_file`.


