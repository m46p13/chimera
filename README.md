# Chimera

A visual interface for [Codex CLI](https://github.com/openai/codex) with built-in browser automation.

![Chimera](https://img.shields.io/badge/version-0.1.7-blue)

## Features

- **Visual Codex Interface** — Chat with Codex in a native desktop app
- **Built-in Browser Panel** — Watch your agent browse the web in real-time
- **Workspace Management** — Open folders as workspaces with persistent thread history
- **New Session** — Quick-start new projects in `~/Chimera Projects/`
- **Thread History** — SQLite-backed conversation persistence per workspace
- **Terminal Integration** — Built-in terminal for manual commands
- **Codex Cloud** — Optional cloud integration for remote sessions

## Quick Start

```bash
# Install dependencies
pnpm install

# Run in development
pnpm dev

# Build for production
pnpm build
```

## Browser Automation via MCP

Chimera includes an MCP (Model Context Protocol) server that lets Codex control the built-in browser panel directly.

### Setup

Register the MCP server with Codex:

```bash
codex mcp add chimera-browser -- npm run mcp:browser --prefix ~/chimera
```

### Available Tools

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL |
| `browser_screenshot` | Capture the current page (base64 PNG) |
| `browser_click` | Click an element by CSS selector |
| `browser_type` | Type into an input field |
| `browser_evaluate` | Execute JavaScript |
| `browser_get_url` | Get current URL |
| `browser_get_title` | Get page title |

### Example

> "Navigate to github.com, search for 'codex', and screenshot the results"

The agent performs these actions live in the browser panel — you watch it happen.

### Architecture

```
Codex CLI ↔ MCP Server (stdio) ↔ HTTP (localhost:18799) ↔ Chimera ↔ Browser Panel
```

## Workspaces

- **Open Folder** — Select any folder as your workspace
- **New Session** — Creates `~/Chimera Projects/session-YYYY-MM-DD-NNN` for quick brainstorming
- **Recent Workspaces** — Quick access to previously opened folders
- **Per-workspace Threads** — Each workspace maintains its own conversation history

## Development

```bash
pnpm dev          # Start in dev mode with hot reload
pnpm build        # Build for production
pnpm package      # Package as distributable app
```

### Project Structure

```
src/
├── main/         # Electron main process
├── renderer/     # React frontend
├── mcp/          # MCP browser server
└── preload/      # Electron preload scripts
```

## License

MIT
