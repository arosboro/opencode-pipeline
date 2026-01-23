
interface Model {
  id: string;
}

// COPIED FROM detect_model.ts
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

const mockModels: Model[] = [
    { id: "openai/gpt-oss-120b" },
    { id: "mistralai/mistral-large" },
    { id: "google/gemma-3-12b" },
    { id: "openai/gpt-oss-20b" },
    { id: "overthinking-rustacean-behemoth_mlx_8" },
    { id: "mistralai/devstral-small-2-2512" },
    { id: "nomic-ai/nomic-embed-text-v1.5" },
    { id: "garbage-model-v0" }
];

console.log("Testing Heuristics with Mock Models:");
mockModels.forEach(m => console.log(` - ${m.id}`));
console.log("\nResults:");

const planner = detectBestRoleMatch(mockModels, 'planner');
console.log(`Planner (Expect 120b): ${planner} ${planner?.includes('120b') ? '✅' : '❌'}`);

const primary = detectBestRoleMatch(mockModels, 'primary');
console.log(`Primary (Expect 20b or 12b): ${primary} ${['20b', '12b'].some(x => primary?.includes(x)) ? '✅' : '❌'}`);

const coder = detectBestRoleMatch(mockModels, 'coder');
console.log(`Coder (Expect rustacean): ${coder} ${coder?.includes('rustacean') ? '✅' : '❌'}`);

const embedding = detectBestRoleMatch(mockModels, 'embedding');
console.log(`Embedding (Expect nomic): ${embedding} ${embedding?.includes('nomic') ? '✅' : '❌'}`);
