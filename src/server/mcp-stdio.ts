#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createDemoFetch, createDemoYapi } from "./demo-yapi.js";
import { createMcpServer } from "./mcp-server.js";
import { createTools } from "./tools.js";
import { YapiClient } from "./yapi-client.js";

const config = loadConfig({ demo: process.env.YAPI_DEMO === "true" || !process.env.YAPI_BASE_URL });
if (!config.demo && !process.env.YAPI_BASE_URL) {
  console.error("Missing YAPI_BASE_URL. Set it, or YAPI_DEMO=true for the in-process mock.");
  process.exit(1);
}

const client = config.demo
  ? new YapiClient(config, createDemoFetch(createDemoYapi().app))
  : new YapiClient(config);
const server = createMcpServer(createTools(config, client));
const transport = new StdioServerTransport();
await server.connect(transport);
