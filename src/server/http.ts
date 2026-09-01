import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { createDemoFetch, createDemoYapi } from "./demo-yapi.js";
import { mcpAuthToken, mountMcpHttp } from "./mcp-http.js";
import { createTools, type YapiTools } from "./tools.js";
import { toolCatalog } from "./mcp-server.js";
import type { AppConfig } from "./types.js";
import { YapiClient, YapiError } from "./yapi-client.js";

export function createHttpApp(config: AppConfig, tools: YapiTools, demoApp?: ReturnType<typeof createDemoYapi>["app"]) {
  const app = new Hono();
  const authToken = mcpAuthToken();

  app.use("*", cors());
  if (demoApp) {
    app.route("/demo-yapi", demoApp);
  }
  mountMcpHttp(app, tools, { authToken, demo: config.demo });

  app.get("/api/status", async (c) => {
    return c.json({
      ...(await tools.getStatus()),
      tools: toolCatalog,
      mcpHttpPath: "/mcp",
      mcpHttpAuthRequired: Boolean(authToken) || !config.demo,
      hint: config.demo
        ? "当前是内置演示，不必填项目 ID。点左侧接口就能改 Mock。组内同事可连 /mcp。"
        : "已指向真实 YApi。HTTP MCP 在 /mcp，同事只需 URL 和 Bearer，不要发 YApi 密码。"
    });
  });

  app.post("/api/rpc", async (c) => {
    const body = (await c.req.json()) as { tool?: string; arguments?: Record<string, unknown> };
    const name = body.tool;
    const args = body.arguments || {};
    try {
      switch (name) {
        case "yapi_list_projects":
          return c.json({
            ok: true,
            tool: name,
            data: await tools.listProjects()
          });
        case "yapi_search_interfaces":
          return c.json({
            ok: true,
            tool: name,
            data: await tools.searchInterfaces(String(args.keyword ?? ""), args.projectId as number | undefined)
          });
        case "yapi_create_interface":
          return c.json({
            ok: true,
            tool: name,
            data: await tools.createInterface({
              title: String(args.title ?? ""),
              path: String(args.path ?? ""),
              method: args.method as string | undefined,
              projectId: args.projectId as number | undefined,
              catId: args.catId as number | undefined,
              catName: args.catName as string | undefined,
              desc: args.desc as string | undefined,
              resBody: args.resBody as string | undefined,
              resBodyType: args.resBodyType as "json" | "raw" | undefined,
              resBodyIsJsonSchema: args.resBodyIsJsonSchema as boolean | undefined,
              dryRun: Boolean(args.dryRun)
            })
          });
        case "yapi_get_interface_mock":
          return c.json({
            ok: true,
            tool: name,
            data: await tools.getInterfaceMock(Number(args.interfaceId), args.projectId as number | undefined)
          });
        case "yapi_update_interface_mock":
          return c.json({
            ok: true,
            tool: name,
            data: await tools.updateInterfaceMock({
              interfaceId: Number(args.interfaceId),
              projectId: args.projectId as number | undefined,
              resBody: String(args.resBody),
              resBodyType: args.resBodyType as "json" | "raw" | undefined,
              resBodyIsJsonSchema: args.resBodyIsJsonSchema as boolean | undefined,
              dryRun: Boolean(args.dryRun)
            })
          });
        case "yapi_get_advanced_mock":
          return c.json({
            ok: true,
            tool: name,
            data: await tools.getAdvancedMock(Number(args.interfaceId), args.projectId as number | undefined)
          });
        case "yapi_update_advanced_mock":
          return c.json({
            ok: true,
            tool: name,
            data: await tools.updateAdvancedMock({
              interfaceId: Number(args.interfaceId),
              projectId: args.projectId as number | undefined,
              mockScript: String(args.mockScript ?? ""),
              enable: args.enable as boolean | undefined,
              dryRun: Boolean(args.dryRun)
            })
          });
        case "yapi_list_mock_cases":
          return c.json({
            ok: true,
            tool: name,
            data: await tools.listMockCases(Number(args.interfaceId), args.projectId as number | undefined)
          });
        case "yapi_save_mock_case":
          return c.json({
            ok: true,
            tool: name,
            data: await tools.saveMockCase({
              interfaceId: Number(args.interfaceId),
              projectId: args.projectId as number | undefined,
              caseId: args.caseId as number | undefined,
              name: String(args.name),
              resBody: String(args.resBody),
              params: args.params as Record<string, string> | undefined,
              code: args.code as number | undefined,
              delay: args.delay as number | undefined,
              ipEnable: args.ipEnable as boolean | undefined,
              ip: args.ip as string | undefined,
              dryRun: Boolean(args.dryRun)
            })
          });
        case "yapi_delete_mock_case":
          return c.json({
            ok: true,
            tool: name,
            data: await tools.deleteMockCase(Number(args.caseId), args.projectId as number | undefined)
          });
        case "yapi_call_mock":
          return c.json({
            ok: true,
            tool: name,
            data: await tools.callMock({
              interfaceId: args.interfaceId as number | undefined,
              mockUrl: args.mockUrl as string | undefined,
              method: args.method as string | undefined,
              body: args.body,
              projectId: args.projectId as number | undefined
            })
          });
        default:
          return c.json({ ok: false, error: `Unknown tool: ${name}` }, 400);
      }
    } catch (error) {
      const message =
        error instanceof YapiError ? error.message : error instanceof Error ? error.message : String(error);
      return c.json({ ok: false, tool: name, error: message }, 400);
    }
  });

  const clientDir = existsSync(join(process.cwd(), "dist/client/index.html")) ? "./dist/client" : "";
  if (clientDir) {
    app.use("/assets/*", serveStatic({ root: clientDir }));
    app.get("*", async (c) => {
      const html = await readFile(join(process.cwd(), "dist/client/index.html"), "utf8");
      return c.html(html);
    });
  } else {
    app.get("/", (c) =>
      c.html(
        `<!doctype html><meta charset="utf-8"><title>YApi Mock MCP</title>
         <p>Playground UI is not built yet. Run <code>npm run build</code> or <code>npm run dev</code>.</p>`
      )
    );
  }

  return app;
}

const port = Number(process.env.PORT || "43181");
const config = loadConfig({ port });
const demo = createDemoYapi();
const client = config.demo ? new YapiClient(config, createDemoFetch(demo.app)) : new YapiClient(config);
const tools = createTools(config, client);

if (!process.env.VITEST) {
  const app = createHttpApp(config, tools, demo.app);
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
    console.log(`YApi mock playground http://127.0.0.1:${info.port}`);
    console.log(`Team MCP endpoint   http://127.0.0.1:${info.port}/mcp`);
    if (config.demo) {
      console.log(`Demo YApi           http://127.0.0.1:${info.port}/demo-yapi`);
    } else {
      console.log(`Proxying YApi       ${config.baseUrl}`);
    }
  });
}
