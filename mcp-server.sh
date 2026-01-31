#!/bin/bash
# Direct MCP server wrapper for Chimera
# This bypasses npm to avoid potential buffering issues

cd /Users/macmini/chimera
exec /Users/macmini/chimera/node_modules/.bin/tsx src/mcp/browser-server.ts
