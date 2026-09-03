import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/server/config.js";
import { createDemoFetch, createDemoYapi } from "../src/server/demo-yapi.js";
import { YapiClient } from "../src/server/yapi-client.js";

function clientWith(overrides: Parameters<typeof loadConfig>[0]) {
  const { app } = createDemoYapi();
  const config = loadConfig({ demo: true, port: 43181, ...overrides });
  return new YapiClient(config, createDemoFetch(app));
}

describe("YApi login", () => {
  it("falls back to password login when LDAP account is not recognized", async () => {
    const client = clientWith({ email: "demo@local", password: "demo", loginMode: "auto" });
    await client.login();
    const groups = await client.get<unknown[]>("/api/group/list", undefined, { session: true });
    expect(groups.length).toBeGreaterThan(0);
  });

  it("logs in via LDAP first for domain-style accounts", async () => {
    const client = clientWith({
      email: "corp\\zhangsan",
      password: "demo",
      loginMode: "auto"
    });
    await client.login();
    const groups = await client.get<unknown[]>("/api/group/list", undefined, { session: true });
    expect(groups.length).toBeGreaterThan(0);
  });

  it("does not call password login when mode is ldap-only and account is not LDAP", async () => {
    const client = clientWith({ email: "demo@local", password: "demo", loginMode: "ldap" });
    await expect(client.login()).rejects.toThrow(/非LDAP/);
  });
});
