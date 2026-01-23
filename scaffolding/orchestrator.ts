import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// --- Types ---

interface ExpertConfig {
  name: string;
  source: string;
  description: string;
}

interface OrchestratorConfig {
  strategy: string;
  default_expert: string;
}

interface SwarmConfig {
  experts: ExpertConfig[];
  orchestrator: OrchestratorConfig;
}

// --- Helpers ---

// Simple YAML parser for our specific schema to avoid external deps for this scaffold
// Parses lists of objects with simple key-values
function parseSwarmConfig(yaml: string): SwarmConfig {
  const lines = yaml.split("\n");
  const config: any = { experts: [], orchestrator: {} };
  let currentSection = "";
  let currentObject: any = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (line.startsWith("experts:")) {
      currentSection = "experts";
      continue;
    } else if (line.startsWith("orchestrator:")) {
      currentSection = "orchestrator";
      continue;
    }

    if (currentSection === "experts") {
      if (trimmed.startsWith("- name:")) {
        if (currentObject) config.experts.push(currentObject);
        currentObject = {};
        const match = trimmed.match(/- name: "(.*)"/);
        if (match) currentObject.name = match[1];
      } else if (trimmed.startsWith("source:")) {
        const match = trimmed.match(/source: "(.*)"/);
        if (match && currentObject) currentObject.source = match[1];
      } else if (trimmed.startsWith("description:")) {
        const match = trimmed.match(/description: "(.*)"/);
        if (match && currentObject) currentObject.description = match[1];
      }
    } else if (currentSection === "orchestrator") {
       const [key, val] = trimmed.split(":").map(s => s.trim());
       if (key && val) {
         config.orchestrator[key] = val.replace(/"/g, ""); // strip quotes
       }
    }
  }
  // Push last expert
  if (currentSection === "experts" && currentObject) {
    config.experts.push(currentObject);
  }

  return config as SwarmConfig;
}

// --- Main ---

const CONFIG_PATH = join(import.meta.dir, "swarm_config.yaml");

async function main() {
  const modelId = process.env.DEFAULT_MODEL_ID;
  const lmStudioUrl = process.env.LM_STUDIO_URL || "http://localhost:1234";

  if (!modelId) {
    console.error("❌ CRTICAL ERROR: DEFAULT_MODEL_ID is not set.");
    console.error("   The orchestrator must be started via 'start_swarm.sh' to ensure model selection.");
    process.exit(1);
  }

  console.log("🤖 Orchestrator initializing...");
  console.log(`🎯 Targeting Model: ${modelId}`);
  console.log(`🔗 AI Provider: ${lmStudioUrl}`);

  // 1. Load Configuration
  console.log(`📖 Loading config from ${CONFIG_PATH}...`);
  let config: SwarmConfig;
  try {
    const rawYaml = readFileSync(CONFIG_PATH, "utf-8");
    config = parseSwarmConfig(rawYaml);
  } catch (e) {
    console.error(`❌ Failed to read or parse ${CONFIG_PATH}:`, e);
    process.exit(1);
  }

  console.log(`✅ Configuration Loaded:`);
  console.log(`   - Experts: ${config.experts.length} loaded`);
  console.log(`   - Strategy: ${config.orchestrator.strategy}`);
  console.log(`   - Default Expert: ${config.orchestrator.default_expert}`);
  
  // 2. Initialize MCP Servers (Real Initialization)
  console.log("🔌 Initializing MCP Servers...");
  const mcpConfigPath = join(import.meta.dir, "mcp_config.json");
  const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, "utf-8"));
  
  for (const [serverName, srvConfig] of Object.entries(mcpConfig.mcpServers)) {
      const c = srvConfig as any;
      console.log(`   - Starting ${serverName} (${c.command} ${c.args.join(" ")})...`);
      try {
         const pluginRoot = join(process.cwd(), "swarm-tools/packages/opencode-swarm-plugin");
         const env = { 
             ...process.env, 
             CLAUDE_PLUGIN_ROOT: pluginRoot
         };
         
         const child = spawn(c.command, c.args, { stdio: "inherit", env });
         child.on("error", (err: Error) => {
             console.error(`   ❌ Failed to start ${serverName}:`, err);
         });
         console.log(`   ✅ ${serverName} started (PID: ${child.pid})`);
      } catch (err) {
          console.error(`   ❌ Failed to spawn ${serverName}`, err);
      }
  }

  // 3. System Ready
  console.log("\n✅ MOE System Ready.");
  console.log(`   Current Model: ${modelId}`);
  console.log(`   Routing to ${config.experts.length} specialists.`);
  
  // Keep process alive to simulate daemon mode
  setInterval(() => {}, 5000);
}

main().catch(console.error);
