import { spawn } from "child_process";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://localhost:1234";

interface Model {
  id: string;
  object: string;
  owned_by: string;
}

interface ModelsResponse {
  data: Model[];
  object: string;
}

interface ModelConfig {
  primaryModel: string;
  coderModel: string;
  plannerModel: string;
  embeddingModel?: string;
}

// Helper for delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper for reading a single keypress
async function readKey(): Promise<string> {
  if (!process.stdin.isTTY) return "";
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolve) => {
    process.stdin.once("data", (key) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve(key.toString());
    });
  });
}

// Check if LM Studio is reachable
async function checkConnection(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1000);
    const response = await fetch(`${LM_STUDIO_URL}/v1/models`, {
      method: "HEAD",
      signal: controller.signal
    });
    clearTimeout(id);
    return response.ok;
  } catch (e) {
    return false;
  }
}

async function getModels(): Promise<Model[]> {
  try {
    const response = await fetch(`${LM_STUDIO_URL}/v1/models`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = (await response.json()) as ModelsResponse;
    return data.data;
  } catch (e) {
    // console.error("Error fetching models:", e);
    return [];
  }
}

async function ensureConnection() {
  process.stderr.write(`📡 Checking connection to ${LM_STUDIO_URL}... `);
  
  // Try up to 3 times with short delay
  for (let i = 0; i < 3; i++) {
      if (await checkConnection()) {
          console.error("✅ Connected.");
          return;
      }
      await sleep(500);
  }

  console.error("\n❌ Could not connect to LM Studio.");
  console.error("   Please ensure LM Studio is running (port 1234).");
  
  if (process.env.NON_INTERACTIVE) {
      console.error("   Non-interactive mode: Exiting.");
      process.exit(1);
  }
  
  console.error("   Press 'r' to retry, or 'q' to quit.");
  const key = await readKey();
  if (key === "q" || key === "\u0003") process.exit(1);
  if (key === "r") await ensureConnection();
}

function classifyModels(models: Model[]) {
    const coder = models.filter(m => {
        const id = m.id.toLowerCase();
        return id.includes("coder") || id.includes("deepseek") || id.includes("code");
    });
    
    const reasoning = models.filter(m => {
        const id = m.id.toLowerCase();
        return id.includes("reasoning") || id.includes("r1") || id.includes("cot");
    });
    
    // General are those that aren't strictly coder/reasoning specialized, 
    // or just all of them sorted by capability heuristics
    const general = [...models].sort((a, b) => {
        // Prefer larger quantization/parameter count if visible in name, otherwise alpha
        return a.id.localeCompare(b.id);
    });

    return { coder, reasoning, general };
}

async function selectModelFromList(models: Model[], prompt: string, defaultId?: string): Promise<string> {
  if (models.length === 0) {
      if (defaultId) return defaultId;
      console.error("⚠️ No models available for selection.");
      process.exit(1);
  }
  
  if (models.length === 1) {
      console.error(`✅ Auto-selected ${prompt}: ${models[0].id}`);
      return models[0].id;
  }

  if (process.env.NON_INTERACTIVE) {
      // Return best guess or default
      return defaultId || models[0].id;
  }

  let selectedIndex = 0;
  // Try to find default
  if (defaultId) {
      const idx = models.findIndex(m => m.id === defaultId);
      if (idx >= 0) selectedIndex = idx;
  }

  while (true) {
    console.error(`\n🤖 ${prompt}:`);
    
    // Show window around selection if list is long
    const windowSize = 5;
    const startIdx = Math.max(0, Math.min(selectedIndex - 2, models.length - windowSize));
    const endIdx = Math.min(startIdx + windowSize, models.length);
    
    if (startIdx > 0) console.error("  ...");
    
    for (let i = startIdx; i < endIdx; i++) {
        const m = models[i];
        const cursor = i === selectedIndex ? ">" : " ";
        const style = i === selectedIndex ? "\x1b[36m" : "";
        const reset = "\x1b[0m";
        console.error(`${cursor} ${style}${m.id}${reset}`);
    }
    
    if (endIdx < models.length) console.error("  ...");
    
    console.error("(Up/Down to move, Enter to select)");

    const key = await readKey();

    if (key === '\u001b[A' || key === 'w') {
        selectedIndex = Math.max(0, selectedIndex - 1);
    }
    else if (key === '\u001b[B' || key === 's') {
        selectedIndex = Math.min(models.length - 1, selectedIndex + 1);
    }
    else if (key === '\r' || key === '\n') {
        const selected = models[selectedIndex];
        console.error(`✅ Selected: ${selected.id}`);
        return selected.id;
    }
    else if (key === 'q' || key === '\u0003') {
        process.exit(0);
    }
  }
}

async function main() {
  await ensureConnection();
  let models = await getModels();
  
  if (models.length === 0) {
      console.error("❌ No models found in LM Studio.");
      process.exit(1);
  }

  const { coder, reasoning, general } = classifyModels(models);
  
  // 1. Select Primary Model (General/Reasoning)
  // Prefer reasoning models if available for primary planner
  const primaryCandidates = reasoning.length > 0 ? reasoning : general;
  const primaryModel = await selectModelFromList(primaryCandidates, "Select PRIMARY model (Coordinator/Planner)");

  // 2. Select Coder Model
  // Prefer coder models, fallback to primary
  const coderCandidates = coder.length > 0 ? coder : general;
  // Default to primary if it's in the list
  const coderModel = await selectModelFromList(coderCandidates, "Select CODER model (Worker)", primaryModel);

  // 3. Save Config
  const config: ModelConfig = {
      primaryModel,
      plannerModel: primaryModel,
      coderModel,
      embeddingModel: "text-embedding-nomic-embed-text-v1.5" // Default assumption or separate selection
  };
  
  const configPath = join(process.cwd(), "swarm_config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.error(`\n💾 Saved configuration to ${configPath}`);
  
  // Output primary model ID to stdout for scripts
  process.stdout.write(primaryModel);
}

main().catch(console.error);
