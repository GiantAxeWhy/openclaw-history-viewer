# OpenClaw History Viewer

A simple web app for browsing OpenClaw chat history, switching sessions, and managing default models.

## Features

- 📜 **Browse All Sessions** - View all chat sessions sorted by time
- 💬 **Preview Messages** - See message count and preview for each session
- 🔄 **Switch Sessions** - Click to switch to any historical session
- ✅ **Current Session Indicator** - Green marker shows the active session
- 🤖 **Model Switcher** - Dropdown to change the default AI model
- ⚙️ **Configurable** - Works with any OpenClaw installation via environment variables

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/openclaw-history-viewer.git
cd openclaw-history-viewer
npm install
```

## Usage

### Basic Usage (Default Configuration)

```bash
npm start
```

This assumes OpenClaw is installed at `~/.openclaw` with the default `main` agent.

Open your browser: http://localhost:3456

### Custom Configuration

Configure via environment variables:

```bash
# Custom port
PORT=8080 npm start

# Custom OpenClaw directory
OPENCLAW_DIR=/path/to/openclaw npm start

# Custom agent name
OPENCLAW_AGENT=custom-agent npm start

# All options combined
PORT=8080 OPENCLAW_DIR=/custom/path OPENCLAW_AGENT=myagent npm start
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` or `OPENCLAW_VIEWER_PORT` | Server port | `3456` |
| `OPENCLAW_DIR` | OpenClaw config directory | `~/.openclaw` |
| `OPENCLAW_AGENT` | Agent name | `main` |

## Screenshots

```
┌──────────────────────┬─────────────────────────────────────┐
│  🦞 History Viewer   │  Session: b7fbe8d5...               │
│  23 sessions found   │  [✓ Current Session] [↻ Refresh]   │
├──────────────────────┼─────────────────────────────────────┤
│  🤖 Default Model    │                                     │
│  [Claude Opus 4.5 ▼] │  USER                               │
│  200K ctx · 8K out   │  ┌─────────────────────────────────┐│
│  ✓ Ready             │  │ Hello, how are you?             ││
├──────────────────────┤  └─────────────────────────────────┘│
│  02/04 10:40         │                                     │
│  ● Current           │  ASSISTANT                          │
│  查看下我这个open... │  ┌─────────────────────────────────┐│
│  12 msgs · 65 KB     │  │ I'm doing great! How can I...   ││
│                      │  └─────────────────────────────────┘│
│  02/03 16:47         │                                     │
│  A new session was.. │                                     │
│  8 msgs · 17 KB      │                                     │
└──────────────────────┴─────────────────────────────────────┘
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List all sessions |
| `/api/sessions/:id` | GET | Get messages for a session |
| `/api/sessions/:id/switch` | POST | Switch to a session |
| `/api/current-session` | GET | Get current active session |
| `/api/models` | GET | List available models |
| `/api/models/switch` | POST | Switch default model |
| `/api/config` | GET | Get server configuration |

## How It Works

1. **Sessions**: Reads `.jsonl` files from `~/.openclaw/agents/{agent}/sessions/`
2. **Session Switching**: Updates `sessions.json` to point to the selected session
3. **Model Switching**: Modifies `openclaw.json` to change the default model

## Notes

- After switching sessions, refresh the OpenClaw Control UI for changes to take effect
- After switching models, restart the OpenClaw gateway for changes to take effect
- This tool only reads/modifies config files - it doesn't delete chat history
- For local use only - no authentication is implemented

## Directory Structure

```
~/.openclaw/
├── openclaw.json          # Main config (models, agents, etc.)
└── agents/
    └── main/
        └── sessions/
            ├── sessions.json   # Session metadata
            ├── abc123.jsonl    # Session chat log
            └── def456.jsonl    # Another session
```

## License

MIT
