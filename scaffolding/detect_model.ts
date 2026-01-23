import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import * as readline from "readline";

// Helper for delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://localhost:1234";

interface Model {
  id: string;
}

interface ModelsResponse {
  data: Model[];
}

interface ModelConfig {
  primaryModel: string;
  plannerModel: string;
  coderModel: string;
  embeddingModel: string;
}

// Heuristics for auto-detecting the best model for a specific role
function detectBestRoleMatch(models: Model[], role: 'planner' | 'primary' | 'coder' | 'embedding'): string | null {
    const availableIds = models.map(m => m.id);
    
    // Helper to find first match for a list of patterns
    const findMatch = (patterns: RegExp[]): string | undefined => {
        for (const pattern of patterns) {
            const match = availableIds.find(id => pattern.test(id));
            if (match) return match;
        }
        return undefined;
    };

    switch (role) {
        case 'planner':
            // High Intelligence / Reasoning
            // User Prefernce: gpt-oss-120b
            return findMatch([
                /gpt-oss-120b/i,
                /120b/i,
                /70b/i,
                /llama-?3-?70b/i,
                /gpt-4/i,
                /opus/i,
                /claude-3-opus/i,
                /large/i,
                /command-r-plus/i
            ]) || null;

        case 'primary':
            // General Purpose / Balanced Speed & Smarts
            // User Preference: gemma-3-12b, gpt-oss-20b
            return findMatch([
                 /gpt-oss-20b/i,
                 /gemma-3-12b/i,
                 /mistral-small/i,
                 /mixtral-8x7b/i,
                 /24b/i,
                 /20b/i,
                 /12b/i,
                 /8b/i,
                 /7b/i,
                 /medium/i
            ]) || null;

        case 'coder':
            // Code Specialist
            // User Preference: overthinking-rustacean-behemoth, devstral
            return findMatch([
                /overthinking-rustacean/i,
                /behemoth/i,
                /devstral/i,
                /deepseek-coder/i,
                /codestral/i,
                /code/i,
                /qwen-coder/i,
                /rust/i
            ]) || null;

        case 'embedding':
             // Vector Embeddings
            return findMatch([
                /nomic-embed/i,
                /text-embedding/i,
                /bert/i,
                /bge/i
            ]) || null;
    }
    
    return null;
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
    if (!response.ok) return [];
    const data = (await response.json()) as ModelsResponse;
    return data.data;
  } catch (e) {
    return [];
  }
}

async function ensureConnection() {
  process.stderr.write(`📡 Checking connection to ${LM_STUDIO_URL}... `);
  
  for (let i = 0; i < 3; i++) {
      if (await checkConnection()) {
          console.error("✅ Connected.");
          return;
      }
      await sleep(500);
  }

  console.error(`\n⚠️  Could not connect to ${LM_STUDIO_URL}. Attempting to proceed with config...`);
}

function getOpenCodeConfigModel(): string | null {
    try {
        const configPath = join(homedir(), ".config/opencode/opencode.json");
        if (!existsSync(configPath)) return null;

        const content = readFileSync(configPath, 'utf8');
        const config = JSON.parse(content);
        return config.model || null;
    } catch (e) {
        return null;
    }
}

// Basic input helper that writes to stderr so stdout is not polluted
function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr, // IMPORTANT: UI goes to stderr
    });

    return new Promise((resolve) => {
        rl.question(query, (ans) => {
            rl.close();
            resolve(ans.trim());
        });
    });
}

// ------------------------------------------------------------------
// Robust TUI Selection Implementation
// ------------------------------------------------------------------

async function selectModelInteractive(models: Model[], role: string, defaultId?: string | null): Promise<string> {
    if (models.length === 0) {
        return "";
    }

    // Prepare TUI
    const stdin = process.stdin;
    const stderr = process.stderr;

    let selectedIndex = 0;
    
    // Set default selection if provided
    if (defaultId) {
        const idx = models.findIndex(m => m.id === defaultId);
        if (idx !== -1) {
            selectedIndex = idx;
        }
    }

    // Show up to 10 items at a time to avoid huge lists
    const pageSize = 10;
    
    // Ensure raw mode
    if (stdin.isTTY) {
        stdin.setRawMode(true);
        stdin.resume();
        readline.emitKeypressEvents(stdin);
    } else {
        // Fallback for non-TTY
        console.error("⚠️  Non-interactive terminal detected. Defaulting to first model.");
        return models[0].id;
    }

    // Hide cursor
    stderr.write("\x1B[?25l");

    // Printing logic
    let firstRender = true;
    const printMenu = () => {
        const lines = [];
        lines.push(`🤖 Select ${role}:`);
        
        const startIdx = Math.max(0, Math.min(selectedIndex - Math.floor(pageSize / 2), models.length - pageSize));
        const endIdx = Math.min(startIdx + pageSize, models.length);

        for (let i = startIdx; i < endIdx; i++) {
            const isSelected = i === selectedIndex;
            const prefix = isSelected ? "\x1B[36m> \x1B[0m" : "  "; // Cyan arrow for selected
            const style = isSelected ? "\x1B[36m" : "";
            const reset = isSelected ? "\x1B[0m" : "";
            const modelId = models[i].id;
            lines.push(`${prefix}${style}${modelId}${reset}`);
        }
        
        if (models.length > pageSize) {
            lines.push(`\x1B[90m(Showing ${startIdx+1}-${endIdx} of ${models.length} - Use Arrow Keys)\x1B[0m`);
        } else {
            lines.push(`\x1B[90m(Use Arrow Keys to Move, Enter to Select)\x1B[0m`);
        }

        // Move cursor up if not first render to overwrite
        if (!firstRender) {
             stderr.write(`\x1B[${lines.length}A`); // Move up N lines
        }
        
        // Print lines
        // We use \r to ensure we start at column 0
        stderr.write(lines.map(l => l + "\x1B[K").join("\n") + "\n"); // Clear to end of line
        firstRender = false;
        return lines.length;
    };

    let linesPrinted = 0;

    return new Promise<string>((resolve, reject) => {
        const cleanup = () => {
            stderr.write("\x1B[?25h"); // Show cursor
            if (stdin.isTTY) stdin.setRawMode(false);
            stdin.removeListener('keypress', handleKey);
        };

        const handleKey = (str: string, key: readline.Key) => {
            if (key.ctrl && key.name === 'c') {
                cleanup();
                process.exit(1);
            }

            switch (key.name) {
                case 'up':
                    selectedIndex = Math.max(0, selectedIndex - 1);
                    linesPrinted = printMenu();
                    break;
                case 'down':
                    selectedIndex = Math.min(models.length - 1, selectedIndex + 1);
                    linesPrinted = printMenu();
                    break;
                case 'return':
                case 'enter':
                    cleanup();
                    // Leave the final selection visible
                    console.error(`\x1B[32m✔ Selected: ${models[selectedIndex].id}\x1B[0m\n`);
                    resolve(models[selectedIndex].id);
                    break;
            }
        };

        stdin.on('keypress', handleKey);
        linesPrinted = printMenu();
    });
}

// ------------------------------------------------------------------
// Main Logic
// ------------------------------------------------------------------

async function main() {
  await ensureConnection();
  
  const configPath = join(process.cwd(), "swarm_config.json");

  // 0. Check for existing configuration (Fast Track)
  if (existsSync(configPath)) {
      try {
          const content = readFileSync(configPath, 'utf8');
          const config = JSON.parse(content) as ModelConfig;
          
          // Basic validation to ensure we have what we need
          if (config.primaryModel && config.plannerModel && config.coderModel && config.embeddingModel) {
            console.error(`\n✅ Using existing configuration from ${configPath}`);
            console.error(`   Primary:   ${config.primaryModel}`);
            console.error(`   Planner:   ${config.plannerModel}`);
            console.error(`   Coder:     ${config.coderModel}`);
            console.error(`   Embedding: ${config.embeddingModel}`);
            
            // Output for shell script
            process.stdout.write(config.primaryModel);
            writeFileSync(join(process.cwd(), ".last_detected_model"), config.primaryModel);
            process.exit(0);
          } else {
             console.error(`\n⚠️  Existing configuration at ${configPath} is incomplete. Re-running setup.`);
          }
      } catch (e) {
          console.error(`\n⚠️  Failed to read existing configuration at ${configPath}. Re-running setup.`);
      }
  }

  // 1. Try to get model from OpenCode config (legacy check, but good for context)
  const configModel = getOpenCodeConfigModel();
  if (configModel) {
      console.error(`\n📋 Detected Global Preference: ${configModel}`);
  }

  const models = await getModels();
  if (models.length === 0) {
      console.error("❌ No models available from API to select.");
      process.exit(1);
  }
  
  console.error("\n🤖 Configuring Swarm Models...");
  console.error("   We will select models for 4 distinct roles: Planner, Primary, Coder, and Embedding.");
  console.error("   Smart defaults have been selected based on your preferences.\n");

  // --- Planner Selection ---
  const defaultPlanner = detectBestRoleMatch(models, 'planner') || configModel || models[0].id;
  const selectedPlanner = await selectModelInteractive(models, "Planner (High Intelligence)", defaultPlanner);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);

  // --- Primary Selection ---
  // Default to planner if no specific primary match found, but prefer balanced models
  const defaultPrimary = detectBestRoleMatch(models, 'primary') || selectedPlanner; 
  const selectedPrimary = await selectModelInteractive(models, "Primary (General/Balanced)", defaultPrimary);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);

  // --- Coder Selection ---
  const defaultCoder = detectBestRoleMatch(models, 'coder') || selectedPlanner;
  const selectedCoder = await selectModelInteractive(models, "Coder (Specialist)", defaultCoder);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);

  // --- Embedding Selection ---
  const defaultEmbedding = detectBestRoleMatch(models, 'embedding') || "text-embedding-nomic-embed-text-v1.5";
  // Filter models for embedding candidates if possible, or just show all but highlight default
  // Ideally we might want to filter, but user might have weird names. sticking to boolean search for defaults.
  const selectedEmbedding = await selectModelInteractive(models, "Embedding", defaultEmbedding);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);

  if (!selectedPlanner || !selectedPrimary || !selectedCoder || !selectedEmbedding) {
      console.error("❌ Invalid model selection.");
      process.exit(1);
  }

  console.error(`\n✅ Final Configuration:`);
  console.error(`   Planner:   ${selectedPlanner}`);
  console.error(`   Primary:   ${selectedPrimary}`);
  console.error(`   Coder:     ${selectedCoder}`);
  console.error(`   Embedding: ${selectedEmbedding}`);

  const config: ModelConfig = {
      primaryModel: selectedPrimary,
      plannerModel: selectedPlanner,
      coderModel: selectedCoder,
      embeddingModel: selectedEmbedding
  };
  
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  // Output PRIMARY model ID to stdout for scripts (historically primary was used for basic echo)
  // or maybe we should output nothing? The script calling this might expect a model ID.
  // Existing scripts expect a single model ID output to use as default.
  // Let's output the Primary model as it's the "General" one.
  process.stdout.write(selectedPrimary);
  
  // Write to a temp file for shell scripts to read reliably without stdout capturing issues
  writeFileSync(join(process.cwd(), ".last_detected_model"), selectedPrimary);
  
  // Explicit exit to ensure no hanging open handles
  process.exit(0);
}

main().catch((err) => {
    console.error(err);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.exit(1);
});
