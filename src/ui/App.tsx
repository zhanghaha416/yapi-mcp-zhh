import { useEffect, useMemo, useState } from "react";
import { FileJson, Play, RefreshCw, Search, Server } from "lucide-react";

type Status = {
  demo: boolean;
  baseUrl: string;
  defaultProjectId: number | null;
  hasToken: boolean;
  hasPassword: boolean;
  hasCookie: boolean;
  hint: string;
  mcpHttpPath?: string;
  mcpHttpAuthRequired?: boolean;
  tools: Array<{ name: string; title: string; description: string }>;
};

type InterfaceRow = {
  id: number;
  projectId: number;
  catId: number;
  catName: string;
  title: string;
  method: string;
  path: string;
};

type InterfaceMock = InterfaceRow & {
  resBody: string;
  resBodyType: string;
  resBodyIsJsonSchema: boolean;
  mockUrl: string;
  desc?: string;
};

type AdvancedMock = {
  interfaceId: number;
  enable: boolean;
  mockScript: string;
  exists: boolean;
};

type MockCase = {
  id: number;
  name: string;
  params: Record<string, string>;
  resBody: string;
  code: number;
  delay: number;
};

type Tab = "doc" | "script" | "cases" | "probe";

async function rpc<T>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, arguments: args })
  });
  const json = (await response.json()) as { ok: boolean; data?: T; error?: string };
  if (!json.ok) {
    throw new Error(json.error || "请求失败");
  }
  return json.data as T;
}

function methodColor(method: string) {
  switch (method) {
    case "GET":
      return "bg-emerald-500/15 text-emerald-300";
    case "POST":
      return "bg-sky-500/15 text-sky-300";
    case "PUT":
      return "bg-amber-500/15 text-amber-200";
    case "DELETE":
      return "bg-rose-500/15 text-rose-300";
    default:
      return "bg-zinc-700 text-zinc-200";
  }
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<InterfaceRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<InterfaceMock | null>(null);
  const [script, setScript] = useState<AdvancedMock | null>(null);
  const [cases, setCases] = useState<MockCase[]>([]);
  const [tab, setTab] = useState<Tab>("doc");
  const [resBody, setResBody] = useState("");
  const [mockScript, setMockScript] = useState("");
  const [caseName, setCaseName] = useState("新期望");
  const [caseParams, setCaseParams] = useState('{"status":"EMPTY"}');
  const [caseBody, setCaseBody] = useState('{"code":0,"data":{}}');
  const [probeBody, setProbeBody] = useState("{}");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [probeResult, setProbeResult] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) || null, [rows, selectedId]);

  async function loadStatus() {
    try {
      const response = await fetch("/api/status");
      if (!response.ok) {
        throw new Error(`无法连接 playground 后端 (${response.status})`);
      }
      setStatus((await response.json()) as Status);
      setStatusError("");
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadList(nextKeyword = keyword) {
    setLoadingList(true);
    setError("");
    try {
      const data = await rpc<{ interfaces: InterfaceRow[] }>("yapi_search_interfaces", { keyword: nextKeyword });
      setRows(data.interfaces);
      if (data.interfaces.length === 0) {
        setSelectedId(null);
        setDetail(null);
      } else if (!data.interfaces.some((row) => row.id === selectedId)) {
        setSelectedId(data.interfaces[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingList(false);
    }
  }

  async function loadDetail(id: number) {
    setBusy(true);
    setError("");
    try {
      const iface = await rpc<InterfaceMock>("yapi_get_interface_mock", { interfaceId: id });
      setDetail(iface);
      setResBody(iface.resBody);
      const adv = await rpc<AdvancedMock>("yapi_get_advanced_mock", { interfaceId: id });
      setScript(adv);
      setMockScript(adv.mockScript);
      const listed = await rpc<{ cases: MockCase[] }>("yapi_list_mock_cases", { interfaceId: id });
      setCases(listed.cases);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadStatus();
    void loadList("");
  }, []);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    }
  }, [selectedId]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs tracking-[0.2em] text-amber-300/80">YAPI MOCK MCP</p>
            <h1 className="mt-1 text-2xl font-semibold">直接改内网 YApi 的 Mock 文档</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              演示数据可以直接点。连真内网时：已经知道接口 ID 就不用项目 ID；要搜列表才需要项目，可以只配一次，或先列出项目。
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            {statusError ? (
              <p className="text-rose-300">{statusError}</p>
            ) : status ? (
              <>
                <p className="flex items-center gap-2 font-medium">
                  <Server size={16} />
                  {status.demo ? "演示 YApi（内存）" : "真实 YApi"}
                </p>
                <p className="mt-1 break-all text-zinc-400">{status.baseUrl}</p>
                <p className="mt-1 text-xs text-zinc-500">{status.hint}</p>
              </>
            ) : (
              <p className="text-zinc-500">正在读取连接状态…</p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 md:grid-cols-[280px_1fr] md:px-8 lg:grid-cols-[320px_1fr_280px]">
        <section className="rounded-2xl border border-white/10 bg-[#11181f] p-3">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void loadList(keyword);
            }}
          >
            <label className="sr-only" htmlFor="keyword">
              搜索接口
            </label>
            <input
              id="keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜路径 / 标题 / GET"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-amber-400 px-3 text-black"
              aria-label="搜索"
            >
              <Search size={16} />
            </button>
          </form>
          <div className="mt-3 space-y-1">
            {loadingList ? (
              <p className="px-2 py-6 text-sm text-zinc-500">正在拉取接口列表…</p>
            ) : rows.length === 0 ? (
              <p className="px-2 py-6 text-sm text-zinc-500">没有匹配的接口。换个关键字，或检查项目 Token。</p>
            ) : (
              rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full rounded-xl px-3 py-2 text-left ${
                    row.id === selectedId ? "bg-amber-400/15 ring-1 ring-amber-400/40" : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${methodColor(row.method)}`}>
                      {row.method}
                    </span>
                    <span className="truncate text-sm">{row.title}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {row.catName} · {row.path}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#11181f] p-4">
          {!selected || !detail ? (
            <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
              {error || "选左侧接口后即可编辑 Mock"}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{detail.title}</h2>
                  <p className="mt-1 font-mono text-xs text-zinc-400">
                    #{detail.id} {detail.method} {detail.path}
                  </p>
                  <p className="mt-1 break-all text-xs text-zinc-500">{detail.mockUrl}</p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-sm"
                  onClick={() => selectedId && void loadDetail(selectedId)}
                >
                  <RefreshCw size={14} /> 刷新
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(
                  [
                    ["doc", "普通 Mock 文档"],
                    ["script", "高级脚本"],
                    ["cases", "Mock 期望"],
                    ["probe", "试请求"]
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`rounded-full px-3 py-1 text-sm ${tab === id ? "bg-white text-black" : "bg-white/5 text-zinc-300"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "doc" && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-zinc-400">
                    对应接口编辑页的返回数据。JSON Schema 模式会按 schema 生成随机 Mock；普通 JSON 则作为 Mock.js
                    模板。
                  </p>
                  <p className="text-xs text-zinc-500">
                    {detail.resBodyIsJsonSchema ? "当前是 JSON Schema" : "当前是 JSON 示例 / Mock 模板"} ·{" "}
                    {detail.resBodyType}
                  </p>
                  <textarea
                    value={resBody}
                    onChange={(event) => setResBody(event.target.value)}
                    className="h-72 w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
                    onClick={() =>
                      run("已写入普通 Mock 文档", async () => {
                        await rpc("yapi_update_interface_mock", {
                          interfaceId: detail.id,
                          resBody,
                          resBodyIsJsonSchema: detail.resBodyIsJsonSchema
                        });
                        await loadDetail(detail.id);
                      })
                    }
                  >
                    保存到 YApi
                  </button>
                </div>
              )}

              {tab === "script" && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-zinc-400">
                    对应「高级 Mock → 脚本」。可改 <code>mockJson</code>、<code>httpCode</code>、<code>delay</code>
                    ，并使用 <code>params</code> / <code>header</code>。
                  </p>
                  <p className="text-xs text-zinc-500">
                    {script?.exists ? (script.enable ? "已启用" : "已保存但未启用") : "此接口还没有高级脚本"}
                  </p>
                  <textarea
                    value={mockScript}
                    onChange={(event) => setMockScript(event.target.value)}
                    className="h-72 w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-sm"
                    placeholder={"if (params.status === 'EMPTY') {\n  mockJson.data.list = [];\n}"}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
                    onClick={() =>
                      run("已覆盖高级 Mock 脚本", async () => {
                        await rpc("yapi_update_advanced_mock", {
                          interfaceId: detail.id,
                          mockScript,
                          enable: true
                        });
                        await loadDetail(detail.id);
                      })
                    }
                  >
                    覆盖保存并启用
                  </button>
                </div>
              )}

              {tab === "cases" && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-zinc-400">匹配优先级：期望 &gt; 脚本 &gt; 普通 Mock。</p>
                  {cases.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/15 px-3 py-6 text-sm text-zinc-500">
                      还没有期望。下面可以新增一条，例如 status=EMPTY 返回空列表。
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {cases.map((item) => (
                        <li key={item.id} className="rounded-xl border border-white/10 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">{item.name}</p>
                            <button
                              type="button"
                              className="text-xs text-rose-300"
                              onClick={() =>
                                run("已删除期望", async () => {
                                  await rpc("yapi_delete_mock_case", { caseId: item.id });
                                  await loadDetail(detail.id);
                                })
                              }
                            >
                              删除
                            </button>
                          </div>
                          <p className="mt-1 font-mono text-xs text-zinc-500">{JSON.stringify(item.params)}</p>
                          <pre className="mt-2 overflow-auto text-xs text-zinc-300">{item.resBody}</pre>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="text-xs text-zinc-500">
                      名称
                      <input
                        value={caseName}
                        onChange={(event) => setCaseName(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <label className="text-xs text-zinc-500">
                      匹配参数 JSON
                      <input
                        value={caseParams}
                        onChange={(event) => setCaseParams(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white"
                      />
                    </label>
                  </div>
                  <textarea
                    value={caseBody}
                    onChange={(event) => setCaseBody(event.target.value)}
                    className="h-40 w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
                    onClick={() =>
                      run("已保存 Mock 期望", async () => {
                        await rpc("yapi_save_mock_case", {
                          interfaceId: detail.id,
                          name: caseName,
                          params: JSON.parse(caseParams) as Record<string, string>,
                          resBody: caseBody
                        });
                        await loadDetail(detail.id);
                      })
                    }
                  >
                    新增期望
                  </button>
                </div>
              )}

              {tab === "probe" && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-zinc-400">对 mock URL 发一次真实请求，确认刚才的写入已经生效。</p>
                  <textarea
                    value={probeBody}
                    onChange={(event) => setProbeBody(event.target.value)}
                    className="h-32 w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
                    onClick={() =>
                      run("已请求 mock", async () => {
                        const result = await rpc<{ status: number; json: unknown }>("yapi_call_mock", {
                          interfaceId: detail.id,
                          method: detail.method,
                          body: detail.method === "GET" ? undefined : JSON.parse(probeBody || "{}")
                        });
                        setProbeResult(JSON.stringify(result, null, 2));
                      })
                    }
                  >
                    <Play size={14} /> 请求 Mock
                  </button>
                  {probeResult ? (
                    <pre className="overflow-auto rounded-xl bg-black/40 p-3 text-xs text-emerald-200">{probeResult}</pre>
                  ) : null}
                </div>
              )}

              {(message || error) && (
                <p className={`mt-4 text-sm ${error ? "text-rose-300" : "text-emerald-300"}`}>{error || message}</p>
              )}
            </>
          )}
        </section>

        <aside className="hidden rounded-2xl border border-white/10 bg-[#11181f] p-4 lg:block">
          <p className="flex items-center gap-2 text-sm font-medium">
            <FileJson size={16} /> 给组内同事
          </p>
          <p className="mt-2 text-sm text-zinc-400">不是只能你本机用。两种导出方式：</p>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-zinc-400">
            <li>每人 clone 后跑 stdio，配自己的 YApi 账号（权限跟着个人走）。</li>
            <li>组内一台机器跑 HTTP MCP，同事只配 URL + Bearer，YApi 密码留在服务器。</li>
          </ol>
          <p className="mt-3 text-xs text-zinc-500">
            HTTP 入口 {status?.mcpHttpPath || "/mcp"}
            {status?.mcpHttpAuthRequired ? " · 需要 Bearer" : " · 演示模式可先不配 Token"}
          </p>
          <pre className="mt-3 overflow-auto rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-300">{`{
  "mcpServers": {
    "yapi-mock": {
      "url": "http://<这台机器>:43181/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_HTTP_AUTH_TOKEN>"
      }
    }
  }
}`}</pre>
          {status?.tools ? (
            <ul className="mt-4 space-y-2 text-xs text-zinc-500">
              {status.tools.map((tool) => (
                <li key={tool.name}>
                  <span className="text-zinc-300">{tool.name}</span>
                  <span className="block">{tool.title}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>
      </main>
    </div>
  );
}
