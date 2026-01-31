#!/usr/bin/env node
/**
 * MCP Browser Server for Chimera
 * 
 * This server provides browser automation tools via the Model Context Protocol.
 * It connects to Chimera's BrowserPanel through an HTTP API on localhost:18799.
 * 
 * Usage with Codex CLI:
 *   codex mcp add chimera-browser -- npm run mcp:browser --prefix /Users/macmini/chimera
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

const CHIMERA_HTTP_PORT = 18799;
const CHIMERA_HTTP_HOST = "127.0.0.1";

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: "browser_navigate",
    description: "Navigate the browser to a specific URL. The user can see the browser automation happening live in Chimera.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to (e.g., 'https://example.com')",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current browser page. Returns a base64-encoded PNG image.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "browser_click",
    description: "Click an element on the page using a CSS selector. The element will be scrolled into view before clicking.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to click (e.g., '#submit-button', '.nav-link')",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "browser_type",
    description: "Type text into an input field or contenteditable element on the page.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the input element (e.g., '#search-input', 'input[name=\"q\"]')",
        },
        text: {
          type: "string",
          description: "The text to type into the element",
        },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "browser_evaluate",
    description: "Execute JavaScript code in the browser and return the result. Use this for complex interactions or data extraction.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "JavaScript code to execute in the browser context",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "browser_get_url",
    description: "Get the current URL of the browser page.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "browser_get_title",
    description: "Get the title of the current browser page.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// HTTP client for Chimera
async function chimeraRequest(
  method: string,
  endpoint: string,
  body?: unknown
): Promise<unknown> {
  const url = `http://${CHIMERA_HTTP_HOST}:${CHIMERA_HTTP_PORT}${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  
  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || `HTTP ${response.status}`;
      } catch {
        errorMessage = errorText || `HTTP ${response.status}`;
      }
      throw new Error(errorMessage);
    }
    
    return await response.json();
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("ECONNREFUSED") || err.message.includes("fetch failed")) {
        throw new Error(
          "Cannot connect to Chimera. Make sure Chimera is running and the browser panel is open."
        );
      }
      throw err;
    }
    throw new Error(String(err));
  }
}

// Create MCP server
const server = new Server(
  {
    name: "chimera-browser",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool list requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "browser_navigate": {
        const url = (args as { url: string }).url;
        await chimeraRequest("POST", "/browser/navigate", { url });
        return {
          content: [
            {
              type: "text",
              text: `Successfully navigated to ${url}`,
            },
          ],
        };
      }

      case "browser_screenshot": {
        const result = await chimeraRequest("POST", "/browser/screenshot") as { success: boolean; image: string };
        // Return the base64 image
        const base64Data = result.image.replace(/^data:image\/png;base64,/, "");
        return {
          content: [
            {
              type: "image",
              data: base64Data,
              mimeType: "image/png",
            },
          ],
        };
      }

      case "browser_click": {
        const { selector } = args as { selector: string };
        const result = await chimeraRequest("POST", "/browser/click", { selector }) as { success: boolean; clicked: boolean };
        if (!result.clicked) {
          return {
            content: [
              {
                type: "text",
                text: `Element not found or not clickable: ${selector}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Clicked element: ${selector}`,
            },
          ],
        };
      }

      case "browser_type": {
        const { selector, text } = args as { selector: string; text: string };
        const result = await chimeraRequest("POST", "/browser/type", { selector, text }) as { success: boolean; typed: boolean };
        if (!result.typed) {
          return {
            content: [
              {
                type: "text",
                text: `Could not type into element: ${selector}. Element may not be an input field or contenteditable element.`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Typed text into element: ${selector}`,
            },
          ],
        };
      }

      case "browser_evaluate": {
        const { code } = args as { code: string };
        const result = await chimeraRequest("POST", "/browser/evaluate", { code }) as { success: boolean; result: unknown };
        const resultText = typeof result.result === "string" 
          ? result.result 
          : JSON.stringify(result.result, null, 2);
        return {
          content: [
            {
              type: "text",
              text: `JavaScript executed successfully. Result:\n${resultText}`,
            },
          ],
        };
      }

      case "browser_get_url": {
        const result = await chimeraRequest("GET", "/browser/url") as { success: boolean; url: string };
        return {
          content: [
            {
              type: "text",
              text: result.url,
            },
          ],
        };
      }

      case "browser_get_title": {
        const result = await chimeraRequest("GET", "/browser/title") as { success: boolean; title: string };
        return {
          content: [
            {
              type: "text",
              text: result.title,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't interfere with stdio protocol (development only)
  if (process.env.NODE_ENV === "development" || process.env.DEBUG) {
    // eslint-disable-next-line no-console
    console.error("Chimera Browser MCP Server running on stdio");
  }
}

main().catch((error) => {
  // Always log fatal errors
  // eslint-disable-next-line no-console
  console.error("Fatal error:", error);
  process.exit(1);
});
