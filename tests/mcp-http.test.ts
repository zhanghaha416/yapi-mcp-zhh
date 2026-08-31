import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/server/config.js";
import { createDemoFetch, createDemoYapi } from "../src/server/demo-yapi.js";
import { createHttpApp } from "../src/server/http.js";
import { createTools } from "../src/server/tools.js";
import { YapiClient } from "../src/server/yapi-client.js";

describe("team HTTP MCP", () => {
  it("exposes /mcp without a token in demo mode", async () => {
    const demo = createDemoYapi();
    const config = loadConfig({ demo: true, port: 43181 });
    const tools = createTools(config, new YapiClient(config, createDemoFetch(demo.app)));
    const app = createHttpApp(config, tools, demo.app);
    const response = await app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "vitest", version: "0" }
        }
      })
    });
    expect(response.status).toBeLessThan(500);
    const json = (await response.json()) as { result?: { serverInfo?: { name?: string } } };
    expect(json.result?.serverInfo?.name).toBe("yapi-mock-mcp");
  });

  it("rejects HTTP MCP without bearer when a token is configured", async () => {
    process.env.MCP_HTTP_AUTH_TOKEN = "team-secret";
    try {
      const demo = createDemoYapi();
      const config = loadConfig({ demo: true, port: 43181 });
      const tools = createTools(config, new YapiClient(config, createDemoFetch(demo.app)));
      const app = createHttpApp(config, tools, demo.app);
      const denied = await app.request("/mcp", { method: "POST" });
      expect(denied.status).toBe(401);
    } finally {
      delete process.env.MCP_HTTP_AUTH_TOKEN;
    }
  });
});
