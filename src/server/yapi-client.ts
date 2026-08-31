import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import type { AppConfig, YapiEnvelope } from "./types.js";

type Query = Record<string, string | number | undefined>;

export class YapiError extends Error {
  constructor(
    message: string,
    readonly errcode?: number,
    readonly path?: string
  ) {
    super(message);
    this.name = "YapiError";
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function parseSetCookie(headers: Headers, existing: Map<string, string>): void {
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const list = raw.length > 0 ? raw : [headers.get("set-cookie") || ""];
  for (const line of list) {
    if (!line) {
      continue;
    }
    const pair = line.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) {
      existing.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
}

export type FetchFn = (url: string | URL, init?: UndiciRequestInit) => Promise<Response>;

export class YapiClient {
  private cookies = new Map<string, string>();
  private loggedIn = false;
  private dispatcher?: Agent;
  private readonly fetchFn: FetchFn;

  constructor(
    private readonly config: AppConfig,
    fetchFn?: FetchFn
  ) {
    this.fetchFn = fetchFn ?? ((url, init) => undiciFetch(url, init) as Promise<Response>);
    if (config.cookie) {
      for (const part of config.cookie.split(";")) {
        const eq = part.indexOf("=");
        if (eq > 0) {
          this.cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
        }
      }
      this.loggedIn = this.cookies.size > 0;
    }
    if (config.insecureTls) {
      this.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }
  }

  tokenFor(projectId?: number): string | undefined {
    if (projectId && this.config.tokens.has(projectId)) {
      return this.config.tokens.get(projectId);
    }
    if (this.config.tokens.size === 1) {
      return [...this.config.tokens.values()][0];
    }
    return this.config.tokens.get(0);
  }

  async login(): Promise<void> {
    if (!this.config.email || !this.config.password) {
      throw new YapiError("高级 Mock 需要登录态：请配置 YAPI_EMAIL / YAPI_PASSWORD，或提供 YAPI_COOKIE");
    }
    const result = await this.request<unknown>(
      "POST",
      "/api/user/login",
      {
        email: this.config.email,
        password: this.config.password
      },
      { skipAuth: true, allowLoginError: true }
    );
    if (result.errcode !== 0) {
      throw new YapiError(result.errmsg || "YApi 登录失败", result.errcode, "/api/user/login");
    }
    this.loggedIn = true;
  }

  async ensureSession(): Promise<void> {
    if (this.loggedIn || this.cookies.size > 0) {
      return;
    }
    await this.login();
  }

  async get<T>(path: string, query?: Query, opts?: { session?: boolean; projectId?: number }): Promise<T> {
    return this.unwrap(await this.request<T>("GET", path, undefined, { query, ...opts }), path);
  }

  async post<T>(
    path: string,
    body?: Record<string, unknown>,
    opts?: { session?: boolean; projectId?: number }
  ): Promise<T> {
    return this.unwrap(await this.request<T>("POST", path, body, opts), path);
  }

  private unwrap<T>(envelope: YapiEnvelope<T>, path: string): T {
    if (envelope.errcode !== 0) {
      throw new YapiError(envelope.errmsg || "YApi 请求失败", envelope.errcode, path);
    }
    return envelope.data;
  }

  private cookieHeader(): string | undefined {
    if (this.cookies.size === 0) {
      return undefined;
    }
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    opts?: {
      query?: Query;
      session?: boolean;
      projectId?: number;
      skipAuth?: boolean;
      allowLoginError?: boolean;
      retried?: boolean;
    }
  ): Promise<YapiEnvelope<T>> {
    if (opts?.session) {
      await this.ensureSession();
    }

    const url = new URL(joinUrl(this.config.baseUrl, path));
    const token = this.tokenFor(opts?.projectId);
    if (opts?.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }
    if (token && method === "GET") {
      url.searchParams.set("token", token);
    }

    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    const cookie = this.cookieHeader();
    if (cookie) {
      headers.Cookie = cookie;
    }

    const init: UndiciRequestInit = { method, headers };
    if (this.dispatcher) {
      init.dispatcher = this.dispatcher;
    }
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
      const payload = { ...(body || {}) };
      if (token && !opts?.skipAuth) {
        payload.token = token;
      }
      init.body = JSON.stringify(payload);
    }

    const response = await this.fetchFn(url, init);
    parseSetCookie(response.headers, this.cookies);
    const json = (await response.json()) as YapiEnvelope<T>;

    const needLogin = json.errcode === 40011 || /请登录/.test(json.errmsg || "");
    if (needLogin && !opts?.skipAuth && !opts?.retried && !opts?.allowLoginError) {
      if (this.config.email && this.config.password) {
        await this.login();
        return this.request<T>(method, path, body, { ...opts, retried: true, session: true });
      }
    }
    if (!response.ok && json.errcode === undefined) {
      throw new YapiError(`HTTP ${response.status} ${path}`, response.status, path);
    }
    return json;
  }

  async callMock(mockUrl: string, method: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const url = mockUrl.startsWith("http") ? mockUrl : joinUrl(this.config.baseUrl, mockUrl);
    const init: UndiciRequestInit = {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json" }
    };
    if (this.dispatcher) {
      init.dispatcher = this.dispatcher;
    }
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    const response = await this.fetchFn(url, init);
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  }
}
