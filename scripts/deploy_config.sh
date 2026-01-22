#!/bin/bash
set -e

OPENCODE_CONFIG_DIR="$HOME/.config/opencode"
REPO_ROOT="$(pwd)"

echo "🚀 Deploying Configuration to OpenCode..."

# 1. Deploy Agents with Format Correction
echo "📦 Syncing and Transforming Agents to $OPENCODE_CONFIG_DIR/agents..."
mkdir -p "$OPENCODE_CONFIG_DIR/agents"

# We use Bun/Node to process the markdowns, fixing tools and colors
# Write script to temp file to avoid shell escaping hell
cat << 'EOF' > "$OPENCODE_CONFIG_DIR/transform_agents.ts"
const fs = require('fs');
const path = require('path');

const srcDirs = process.env.SRC_DIRS.split(',');
const destDir = process.env.DEST_DIR;

const colorMap = {
  'blue': '#0000FF',
  'cyan': '#00FFFF',
  'gold': '#FFD700',
  'green': '#008000',
  'indigo': '#4B0082',
  'magenta': '#FF00FF',
  'orange': '#FFA500',
  'pink': '#FFC0CB',
  'purple': '#800080',
  'red': '#FF0000',
  'teal': '#008080',
  'yellow': '#FFFF00'
};

function processDir(currentPath, relPath = '') {
  if (!fs.existsSync(currentPath)) return;
  
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  const destCurrentPath = path.join(destDir, relPath);
  
  if (!fs.existsSync(destCurrentPath)) {
      fs.mkdirSync(destCurrentPath, { recursive: true });
  }

  for (const entry of entries) {
    if (entry.name === '.git') continue;

    const fullPath = path.join(currentPath, entry.name);
    const destPath = path.join(destCurrentPath, entry.name);

    if (entry.isDirectory()) {
      processDir(fullPath, path.join(relPath, entry.name));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Fix Tools: tools: Tool1, Tool2 -> tools:\n  Tool1: true\n  Tool2: true
      content = content.replace(/^tools:\s*(.+)$/m, (match, toolsStr) => {
          if (toolsStr.trim().startsWith('{') || toolsStr.includes(':')) return match;
          const parts = toolsStr.split(',').map(s => s.trim()).filter(s => s);
          if (parts.length === 0) return 'tools: {}';
          return 'tools:\n' + parts.map(p => '  ' + p + ': true').join('\n');
      });

      // Fix Colors: color: name -> color: "#Hex"
      content = content.replace(/^color:\s*(\w+)$/m, (match, colorName) => {
          const hex = colorMap[colorName.toLowerCase()];
          if (hex) {
              return 'color: "' + hex + '"';
          }
          return match;
      });

      fs.writeFileSync(destPath, content);
    } else if (entry.isFile()) {
        fs.copyFileSync(fullPath, destPath);
    }
  }
}

// Process each source directory
for (const src of srcDirs) {
    if (fs.existsSync(src)) {
        console.log(`   Processing: ${src}`);
        processDir(src);
    } else {
        console.log(`   Skipping missing source: ${src}`);
    }
}
console.log('✅ Agents processed and synced.');
EOF

# Execute the transformation script
# We pass multiple source directories separated by comma
SRC_DIRS="$REPO_ROOT/agents,$REPO_ROOT/scaffolding/overlays/agents" DEST_DIR="$OPENCODE_CONFIG_DIR/agents" bun "$OPENCODE_CONFIG_DIR/transform_agents.ts"
rm "$OPENCODE_CONFIG_DIR/transform_agents.ts"

# 2. Generate MCP Config with Absolute Paths
echo "🔧 Generating MCP Configuration..."
MCP_CONFIG_PATH="$OPENCODE_CONFIG_DIR/mcp_config.json"

# We use Bun/Node to generate the JSON to handle avoiding escaping hell
bun -e "
const fs = require('fs');
const path = require('path');
const config = require('./scaffolding/mcp_config.json');

const repoRoot = '$REPO_ROOT';

// Update filesystem path to absolute
if (config.mcpServers && config.mcpServers.filesystem) {
    const args = config.mcpServers.filesystem.args;
    const idx = args.indexOf('.');
    if (idx !== -1) {
        args[idx] = repoRoot;
    }
}

// Update swarm-tools path to absolute
if (config.mcpServers && config.mcpServers['swarm-tools']) {
    const args = config.mcpServers['swarm-tools'].args;
    // Find the argument that starts with swarm-tools/ and prepend repo root
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('swarm-tools/')) {
            args[i] = path.join(repoRoot, args[i]);
        }
    }
}

console.log(JSON.stringify(config, null, 2));
" > "$MCP_CONFIG_PATH"

echo "✅ Generated MCP Config at: $MCP_CONFIG_PATH"

# 3. Generate opencode.json (Model Config) via Dynamic Discovery
echo "⚙️  Discovering Local Models from localhost:8080..."
OPENCODE_JSON_PATH="$OPENCODE_CONFIG_DIR/opencode.json"

# Use Bun to fetch models and generate config
bun -e "
const fs = require('fs');

async function main() {
  try {
    console.log('   Pinging http://localhost:8080/v1/models ...');
    // Using fetch (built-in to Bun)
    const response = await fetch('http://localhost:8080/v1/models');
    
    if (!response.ok) {
        throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    
    const data = await response.json();
    const models = data.data; // Array of { id: '...' }
    
    if (!models || models.length === 0) {
        throw new Error('No models found in response');
    }

    console.log(\`   Found \${models.length} models.\`);
    
    const modelConfig = {
      model: models[0].id, // Default to the first one
      provider: {
        'local-openai': {
          npm: '@ai-sdk/openai-compatible',
          name: 'Local AI (8080)',
          options: {
            baseURL: 'http://localhost:8080/v1'
          },
          models: {}
        }
      }
    };

    // Populate models map
    models.forEach(m => {
        modelConfig.provider['local-openai'].models[m.id] = {
            name: m.id + ' (Local)'
        };
        // Smart default: prefer gpt-oss-120b if available
        if (m.id.includes('120b')) {
            modelConfig.model = m.id;
        }
    });

    console.log(\`   Defaulting to: \${modelConfig.model}\`);
    
    fs.writeFileSync('$OPENCODE_JSON_PATH', JSON.stringify(modelConfig, null, 2));
    console.log('✅ Generated opencode.json with dynamic model list.');

  } catch (error) {
    console.error('⚠️  Failed to fetch models dynamically:', error.message);
    console.log('   Falling back to static configuration.');
    
    // Fallback Config
    const fallback = {
      '\$schema': 'https://opencode.ai/config.json',
      'model': 'local-openai/openai/gpt-oss-20b',
      'provider': {
        'local-openai': {
          'npm': '@ai-sdk/openai-compatible',
          'name': 'Local AI (8080)',
          'options': {
            'baseURL': 'http://localhost:8080/v1'
          },
          'models': {
            'openai/gpt-oss-20b': {
              'name': 'GPT-OSS 20B (Local)'
            }
          }
        }
      }
    };
    fs.writeFileSync('$OPENCODE_JSON_PATH', JSON.stringify(fallback, null, 2));
  }
}

main();
"

echo ""
echo "👉 Action Required:"
echo "   1. Restart OpenCode to apply changes."
echo "   2. Configure MCP Servers in OpenCode Settings using:"
echo "      $MCP_CONFIG_PATH"
echo "   3. Verify 'Swarm Orchestrator' is in your Agent list."
