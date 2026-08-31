import type { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./mcp-server.js";
import type { YapiTools } from "./tools.js";

export function mcpAuthToken(): string | undefined {
  const token = process.env.MCP_HTTP_AUTH_TOKEN?.trim();
  return token || undefined;
}

export function mountMcpHttp(app: Hono, tools: YapiTools, options?: { authToken?: string; demo?: boolean }) {
  const authToken = options?.authToken ?? mcpAuthToken();

  app.all("/mcp", async (c) => {
    if (authToken) {
      const header = c.req.header("authorization") || "";
      const provided = header.replace(/^Bearer\s+/i, "").trim();
      if (provided !== authToken) {
        return c.json({ error: "MCP 需要 Authorization: Bearer <MCP_HTTP_AUTH_TOKEN>" }, 401);
      }
    } else if (!options?.demo) {
      return c.json(
        {
          error: "组内 HTTP MCP 必须设置 MCP_HTTP_AUTH_TOKEN，避免把 YApi 写权限裸露在内网。"
        },
        403
      );
    }

    const server = createMcpServer(tools);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });
}
