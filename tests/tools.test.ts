import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/server/config.js";
import { createDemoFetch, createDemoYapi } from "../src/server/demo-yapi.js";
import { createTools } from "../src/server/tools.js";
import { YapiClient } from "../src/server/yapi-client.js";

function demoTools() {
  const { app } = createDemoYapi();
  const config = loadConfig({ demo: true, port: 43181 });
  return createTools(config, new YapiClient(config, createDemoFetch(app)));
}

describe("YApi mock tools against demo backend", () => {
  it("searches interfaces by path", async () => {
    const tools = demoTools();
    const result = await tools.searchInterfaces("order");
    expect(result.total).toBe(2);
    expect(result.interfaces[0].path).toContain("/api/order");
  });

  it("updates interface mock JSON and reads it back", async () => {
    const tools = demoTools();
    const body = JSON.stringify({ code: 0, data: { ping: "pong" } });
    const saved = await tools.updateInterfaceMock({
      interfaceId: 8801,
      resBody: body
    });
    expect(saved.dryRun).toBe(false);
    const read = await tools.getInterfaceMock(8801);
    expect(JSON.parse(read.resBody)).toEqual({ code: 0, data: { ping: "pong" } });
  });

  it("writes advanced mock script using session login", async () => {
    const tools = demoTools();
    const saved = await tools.updateAdvancedMock({
      interfaceId: 8801,
      mockScript: "mockJson.code = 0;",
      enable: true
    });
    expect(saved.dryRun).toBe(false);
    if (saved.dryRun) {
      return;
    }
    expect(saved.saved.enable).toBe(true);
    expect(saved.saved.mockScript).toContain("mockJson.code");
  });

  it("saves a mock case and hits it via mock URL", async () => {
    const tools = demoTools();
    await tools.saveMockCase({
      interfaceId: 8802,
      name: "失败",
      params: { status: "FAIL" },
      resBody: JSON.stringify({ code: 1, msg: "failed" })
    });
    const hit = await tools.callMock({
      interfaceId: 8802,
      body: { status: "FAIL" }
    });
    expect(hit.json).toEqual({ code: 1, msg: "failed" });
  });

  it("creates an interface and can hit its mock URL", async () => {
    const tools = demoTools();
    const body = JSON.stringify({ ok: true, from: "create" });
    const saved = await tools.createInterface({
      title: "MCP ping",
      path: "mcp/ping",
      method: "GET",
      catName: "用户",
      resBody: body
    });
    expect(saved.dryRun).toBe(false);
    if (saved.dryRun) {
      return;
    }
    expect(saved.created.path).toBe("/mcp/ping");
    expect(saved.created.method).toBe("GET");
    expect(JSON.parse(saved.created.resBody)).toEqual({ ok: true, from: "create" });
    const hit = await tools.callMock({ interfaceId: saved.created.id });
    expect(hit.json).toEqual({ ok: true, from: "create" });
  });

  it("lists projects without requiring a projectId argument", async () => {
    const tools = demoTools();
    const listed = await tools.listProjects();
    expect(listed.projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 1001, name: "支付中台（演示）" })])
    );
    const searched = await tools.searchInterfaces("");
    expect(searched.projectIds).toEqual([1001]);
    expect(searched.total).toBe(3);
  });
});
