import { spawn } from "child_process";

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

// Helper for delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper for reading a single keypress
async function readKey(): Promise<string> {
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
    const response = await fetch(`${LM_STUDIO_URL}/v1/models`, {
      method: "HEAD",
    });
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
    console.error("Error fetching models:", e);
    return [];
  }
}

async function ensureConnection() {
  while (true) {
    console.error(`📡 Checking connection to ${LM_STUDIO_URL}...`);
    if (await checkConnection()) {
      console.error("✅ LM Studio is reachable.");
      return;
    }

    console.error("\n❌ Could not connect to LM Studio.");
    console.error("   Please ensure LM Studio is running and the local server is started.");
    console.error("   Press 'r' to retry, or 'q' to quit.");

    const key = await readKey();
    if (key === "q" || key === "\u0003") {
      process.exit(1);
    }
    // Loop back to retry
  }
}

async function selectModel(models: Model[]): Promise<string> {
  if (models.length === 0) {
    console.error("⚠️ No models found loaded in LM Studio.");
    console.error("   Please load a model in LM Studio and press 'r' to refresh.");
    const key = await readKey();
    if (key === 'r') return selectModel(await getModels());
    process.exit(1);
  }

  if (models.length === 1) {
    console.error(`✅ One model found: ${models[0].id}`);
    return models[0].id;
  }

  let selectedIndex = 0;

  while (true) {
    // Clear console (optional, maybe just reprint lines if we wanted to be fancy, 
    // but for simple CLI scrolling is okay, or we can use ANSI codes to clear lines)
    // We'll just print the list
    console.error("\n🤖 Multiple models found. Please select one:");
    
    models.forEach((m, idx) => {
      const cursor = idx === selectedIndex ? ">" : " ";
      const style = idx === selectedIndex ? "\x1b[36m" : ""; // Cyan
      const reset = "\x1b[0m";
      console.error(`${cursor} ${style}${idx + 1}. ${m.id}${reset}`);
    });
    
    console.error("\n(Use arrow keys (w/s) to move, Enter to select)");

    const key = await readKey();

    // Arrow Up / 'w'
    if (key === '\u001b[A' || key === 'w') {
        selectedIndex = Math.max(0, selectedIndex - 1);
    }
    // Arrow Down / 's'
    else if (key === '\u001b[B' || key === 's') {
        selectedIndex = Math.min(models.length - 1, selectedIndex + 1);
    }
    // Enter
    else if (key === '\r' || key === '\n') {
        const selected = models[selectedIndex];
        console.error(`✅ Selected: ${selected.id}`);
        return selected.id;
    }
    else if (key === 'q' || key === '\u0003') {
        process.exit(1);
    }
  }
}

async function main() {
  await ensureConnection();
  
  let models = await getModels();
  
  // Logic to handle "no models loaded" vs "models available"
  // The API returns all available models usually, but we want to encourage the user to pick one.
  
  const selectedId = await selectModel(models);
  
  // Output ONLY the ID to stdout so it can be captured
  process.stdout.write(selectedId);
}

main().catch(console.error);
