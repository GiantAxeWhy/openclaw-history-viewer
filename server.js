const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();

// Configuration with environment variable support
const CONFIG = {
  port: parseInt(process.env.PORT || process.env.OPENCLAW_VIEWER_PORT || '3456'),
  openclawDir: process.env.OPENCLAW_DIR || path.join(os.homedir(), '.openclaw'),
  agentName: process.env.OPENCLAW_AGENT || 'main'
};

// Derived paths
const SESSIONS_DIR = path.join(CONFIG.openclawDir, 'agents', CONFIG.agentName, 'sessions');
const SESSIONS_JSON = path.join(SESSIONS_DIR, 'sessions.json');
const OPENCLAW_CONFIG = path.join(CONFIG.openclawDir, 'openclaw.json');

app.use(express.static('public'));
app.use(express.json());

// Get list of all sessions
app.get('/api/sessions', (req, res) => {
  try {
    // Read sessions.json for metadata
    let sessionsMeta = {};
    if (fs.existsSync(SESSIONS_JSON)) {
      sessionsMeta = JSON.parse(fs.readFileSync(SESSIONS_JSON, 'utf-8'));
    }

    // Check if sessions directory exists
    if (!fs.existsSync(SESSIONS_DIR)) {
      return res.json({ sessions: [], meta: sessionsMeta });
    }

    // Read all .jsonl files
    const files = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.'))
      .map(f => {
        const filePath = path.join(SESSIONS_DIR, f);
        const stats = fs.statSync(filePath);
        const sessionId = f.replace('.jsonl', '');
        
        // Try to get first message preview
        let preview = '';
        let messageCount = 0;
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.trim().split('\n');
          messageCount = lines.filter(l => {
            try {
              const parsed = JSON.parse(l);
              return parsed.type === 'message';
            } catch { return false; }
          }).length;
          
          // Get first user message as preview
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === 'message' && parsed.message?.role === 'user') {
                const text = parsed.message.content?.[0]?.text || '';
                preview = text.slice(0, 100).replace(/\n/g, ' ');
                break;
              }
            } catch {}
          }
        } catch {}

        return {
          id: sessionId,
          file: f,
          updatedAt: stats.mtime.toISOString(),
          size: stats.size,
          messageCount,
          preview
        };
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.json({ sessions: files, meta: sessionsMeta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a specific session
app.get('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    
    const messages = [];
    let sessionInfo = null;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        
        if (parsed.type === 'session') {
          sessionInfo = parsed;
        } else if (parsed.type === 'message') {
          const msg = parsed.message;
          if (msg && msg.role && msg.content) {
            messages.push({
              id: parsed.id,
              role: msg.role,
              content: msg.content,
              timestamp: parsed.timestamp
            });
          }
        }
      } catch {}
    }

    res.json({ 
      sessionId, 
      sessionInfo,
      messages 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Switch to a session (update sessions.json to point to this session)
app.post('/api/sessions/:sessionId/switch', (req, res) => {
  try {
    const { sessionId } = req.params;
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Read current sessions.json
    let sessionsMeta = {};
    if (fs.existsSync(SESSIONS_JSON)) {
      sessionsMeta = JSON.parse(fs.readFileSync(SESSIONS_JSON, 'utf-8'));
    }

    // Update the main session to point to this sessionId
    const mainKey = `agent:${CONFIG.agentName}:main`;
    if (sessionsMeta[mainKey]) {
      sessionsMeta[mainKey].sessionId = sessionId;
      sessionsMeta[mainKey].sessionFile = filePath;
      sessionsMeta[mainKey].updatedAt = Date.now();
    } else {
      sessionsMeta[mainKey] = {
        sessionId,
        sessionFile: filePath,
        updatedAt: Date.now(),
        systemSent: false,
        abortedLastRun: false
      };
    }

    // Write back
    fs.writeFileSync(SESSIONS_JSON, JSON.stringify(sessionsMeta, null, 2));

    res.json({ success: true, sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current active session
app.get('/api/current-session', (req, res) => {
  try {
    if (!fs.existsSync(SESSIONS_JSON)) {
      return res.json({ currentSessionId: null });
    }
    const sessionsMeta = JSON.parse(fs.readFileSync(SESSIONS_JSON, 'utf-8'));
    const mainKey = `agent:${CONFIG.agentName}:main`;
    const mainSession = sessionsMeta[mainKey];
    res.json({ 
      currentSessionId: mainSession?.sessionId || null,
      sessionKey: mainKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// Model Management APIs
// =====================

// Get all available models from openclaw.json
app.get('/api/models', (req, res) => {
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG)) {
      return res.status(404).json({ error: 'OpenClaw config not found' });
    }

    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf-8'));
    const models = [];
    
    // Extract models from providers
    const providers = config.models?.providers || {};
    for (const [providerName, providerConfig] of Object.entries(providers)) {
      const providerModels = providerConfig.models || [];
      for (const model of providerModels) {
        const fullId = `${providerName}/${model.id}`;
        models.push({
          id: fullId,
          name: model.name || model.id,
          provider: providerName,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          reasoning: model.reasoning || false,
          cost: model.cost
        });
      }
    }

    // Get current default model
    const currentModel = config.agents?.defaults?.model?.primary || null;
    
    // Get model aliases
    const aliases = config.agents?.defaults?.models || {};

    res.json({ 
      models, 
      currentModel,
      aliases 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Switch default model
app.post('/api/models/switch', (req, res) => {
  try {
    const { modelId } = req.body;
    
    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required' });
    }

    if (!fs.existsSync(OPENCLAW_CONFIG)) {
      return res.status(404).json({ error: 'OpenClaw config not found' });
    }

    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf-8'));

    // Validate that the model exists
    const [provider, modelName] = modelId.split('/');
    const providerConfig = config.models?.providers?.[provider];
    if (!providerConfig) {
      return res.status(400).json({ error: `Provider '${provider}' not found` });
    }
    
    const modelExists = providerConfig.models?.some(m => m.id === modelName);
    if (!modelExists) {
      return res.status(400).json({ error: `Model '${modelName}' not found in provider '${provider}'` });
    }

    // Update the default model
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.model) config.agents.defaults.model = {};
    
    const previousModel = config.agents.defaults.model.primary;
    config.agents.defaults.model.primary = modelId;
    
    // Update meta
    config.meta = config.meta || {};
    config.meta.lastTouchedAt = new Date().toISOString();

    // Write back
    fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2));

    res.json({ 
      success: true, 
      previousModel,
      currentModel: modelId,
      message: 'Model switched. Restart OpenClaw gateway for changes to take effect.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get server config info
app.get('/api/config', (req, res) => {
  res.json({
    openclawDir: CONFIG.openclawDir,
    agentName: CONFIG.agentName,
    sessionsDir: SESSIONS_DIR,
    configPath: OPENCLAW_CONFIG,
    configExists: fs.existsSync(OPENCLAW_CONFIG)
  });
});

app.listen(CONFIG.port, () => {
  console.log(`\n🦞 OpenClaw History Viewer running at http://localhost:${CONFIG.port}\n`);
  console.log(`   OpenClaw directory: ${CONFIG.openclawDir}`);
  console.log(`   Agent: ${CONFIG.agentName}`);
  console.log(`   Sessions: ${SESSIONS_DIR}`);
  console.log(`\n   Configuration via environment variables:`);
  console.log(`   - PORT / OPENCLAW_VIEWER_PORT: Server port (default: 3456)`);
  console.log(`   - OPENCLAW_DIR: OpenClaw config directory (default: ~/.openclaw)`);
  console.log(`   - OPENCLAW_AGENT: Agent name (default: main)\n`);
});
