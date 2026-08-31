import type { AppConfig, ProjectTokenMap } from "./types.js";

function readNumber(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseTokens(): ProjectTokenMap {
  const map: ProjectTokenMap = new Map();
  const multi = process.env.YAPI_PROJECT_TOKENS?.trim();
  if (multi) {
    for (const part of multi.split(",")) {
      const [idRaw, ...tokenParts] = part.split(":");
      const id = Number(idRaw);
      const token = tokenParts.join(":").trim();
      if (Number.isFinite(id) && token) {
        map.set(id, token);
      }
    }
  }
  const single = process.env.YAPI_TOKEN?.trim();
  const projectId = readNumber("YAPI_PROJECT_ID");
  if (single && projectId) {
    map.set(projectId, single);
  } else if (single && map.size === 0) {
    map.set(0, single);
  }
  return map;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const demoEnv = process.env.YAPI_DEMO === "true" || process.env.YAPI_DEMO === "1";
  const port = Number(process.env.PORT || "43181");
  const configuredBase = (process.env.YAPI_BASE_URL || "").replace(/\/$/, "");
  const demo = overrides.demo ?? (demoEnv || !configuredBase);
  const tokens = parseTokens();
  const tokenProjectIds = [...tokens.keys()].filter((id) => id > 0);
  const inferredProjectId =
    readNumber("YAPI_PROJECT_ID") ??
    (tokenProjectIds.length === 1 ? tokenProjectIds[0] : undefined) ??
    (demo ? 1001 : undefined);

  return {
    baseUrl: demo
      ? `http://127.0.0.1:${overrides.port ?? port}/demo-yapi`
      : configuredBase,
    defaultProjectId: inferredProjectId,
    tokens,
    email: process.env.YAPI_EMAIL?.trim() || (demo ? "demo@local" : undefined),
    password: process.env.YAPI_PASSWORD || (demo ? "demo" : undefined),
    cookie: process.env.YAPI_COOKIE?.trim() || undefined,
    insecureTls: process.env.YAPI_INSECURE_TLS === "true",
    demo,
    port,
    ...overrides
  };
}
