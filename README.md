# Chimera

Chimera — a Codex GUI with built-in browser automation.

## Features

- Visual interface for Codex CLI
- Built-in browser panel for web automation
- Workspace management
- Thread history with SQLite persistence
- Terminal integration
- Codex Cloud integration

## Browser Automation via MCP

Chimera includes an MCP (Model Context Protocol) server that allows Codex CLI to control the visible browser panel directly. This enables live browser automation where the user can watch the agent interact with websites in real-time.

### Architecture

```
Codex CLI ↔ MCP Server (stdio) ↔ HTTP ↔ Chimera Main Process ↔ BrowserPanel
```

### Setup

To register the MCP server with Codex CLI:

```bash
codex mcp add chimera-browser -- npm run mcp:browser --prefix /Users/macmini/chimera
```

Or manually add to your Codex CLI configuration.

### Available Tools

Once registered, Codex can use these browser automation tools:

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL |
| `browser_screenshot` | Take a screenshot (returns base64 PNG) |
| `browser_click` | Click an element by CSS selector |
| `browser_type` | Type text into an input field |
| `browser_evaluate` | Execute JavaScript in the browser |
| `browser_get_url` | Get the current page URL |
| `browser_get_title` | Get the current page title |

### Usage Example

With the MCP server registered, you can ask Codex to:

> "Navigate to example.com, take a screenshot, and click the 'Get Started' button"

The browser automation will happen live in Chimera's browser panel, visible to the user.

### Technical Details

- **HTTP Port**: 18799 (localhost only for security)
- **MCP Transport**: stdio
- **Security**: HTTP server only listens on 127.0.0.1

### Running the MCP Server Manually

```bash
npm run mcp:browser
```

This starts the MCP server on stdio, which communicates with Chimera's HTTP API to control the browser.

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build
```

## License

MIT
