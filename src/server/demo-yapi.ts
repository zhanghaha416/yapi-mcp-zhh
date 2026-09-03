import { Hono } from "hono";
import type {
  AdvancedMock,
  InterfaceDetail,
  MockCase,
  YapiEnvelope
} from "./types.js";
import type { FetchFn } from "./yapi-client.js";

type DemoInterface = InterfaceDetail & {
  catName: string;
};

type DemoStore = {
  uid: number;
  token: string;
  project: {
    _id: number;
    name: string;
    basepath: string;
  };
  cats: Array<{ _id: number; name: string }>;
  interfaces: DemoInterface[];
  scripts: Map<number, AdvancedMock>;
  cases: MockCase[];
  nextCaseId: number;
  nextInterfaceId: number;
};

function envelope<T>(data: T, errcode = 0, errmsg = "成功"): YapiEnvelope<T> {
  return { errcode, errmsg, data };
}

function seed(): DemoStore {
  const projectId = 1001;
  const profile: DemoInterface = {
    id: 8801,
    projectId,
    catId: 21,
    catName: "用户",
    title: "查询当前用户资料",
    method: "GET",
    path: "/api/user/profile",
    status: "done",
    resBodyType: "json",
    resBodyIsJsonSchema: false,
    resBody: JSON.stringify(
      {
        code: 0,
        msg: "ok",
        data: {
          userId: 10086,
          name: "张三",
          role: "ops",
          mobile: "13800138000"
        }
      },
      null,
      2
    ),
    mockUrl: `/mock/${projectId}/api/user/profile`,
    desc: "联调用的登录用户资料"
  };

  const orders: DemoInterface = {
    id: 8802,
    projectId,
    catId: 22,
    catName: "订单",
    title: "分页查询订单",
    method: "POST",
    path: "/api/order/list",
    status: "undone",
    resBodyType: "json",
    resBodyIsJsonSchema: false,
    resBody: JSON.stringify(
      {
        code: 0,
        msg: "ok",
        data: {
          total: 2,
          list: [
            { orderId: "OD-1001", amount: "19.90", status: "PAID" },
            { orderId: "OD-1002", amount: "88.00", status: "PENDING" }
          ]
        }
      },
      null,
      2
    ),
    mockUrl: `/mock/${projectId}/api/order/list`,
    desc: "后台订单列表"
  };

  const detail: DemoInterface = {
    id: 8803,
    projectId,
    catId: 22,
    catName: "订单",
    title: "订单详情",
    method: "GET",
    path: "/api/order/{id}",
    status: "done",
    resBodyType: "json",
    resBodyIsJsonSchema: true,
    resBody: JSON.stringify(
      {
        type: "object",
        properties: {
          code: { type: "number" },
          data: {
            type: "object",
            properties: {
              orderId: { type: "string" },
              status: { type: "string" }
            }
          }
        }
      },
      null,
      2
    ),
    mockUrl: `/mock/${projectId}/api/order/1001`,
    desc: "路径参数示例"
  };

  return {
    uid: 7,
    token: "demo-session-token",
    project: { _id: projectId, name: "支付中台（演示）", basepath: "" },
    cats: [
      { _id: 21, name: "用户" },
      { _id: 22, name: "订单" }
    ],
    interfaces: [profile, orders, detail],
    scripts: new Map([
      [
        8802,
        {
          interfaceId: 8802,
          projectId,
          enable: true,
          exists: true,
          mockScript: `if (params.status === 'EMPTY') {\n  mockJson = { code: 0, msg: 'ok', data: { total: 0, list: [] } };\n}\n`
        }
      ]
    ]),
    cases: [
      {
        id: 501,
        interfaceId: 8802,
        projectId,
        name: "空列表",
        params: { status: "EMPTY" },
        resBody: JSON.stringify({ code: 0, msg: "ok", data: { total: 0, list: [] } }),
        code: 200,
        delay: 0,
        ipEnable: false,
        caseEnable: true,
        headers: []
      }
    ],
    nextCaseId: 600,
    nextInterfaceId: 8900
  };
}

function parseBodyJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

export function createDemoYapi() {
  const store = seed();
  const app = new Hono();

  const requireLogin = (cookieHeader: string | undefined) =>
    Boolean(cookieHeader && cookieHeader.includes(store.token));

  const issueLoginCookies = (c: { header: (name: string, value: string, opts?: { append?: boolean }) => void }) => {
    c.header("Set-Cookie", `_yapi_token=${store.token}; Path=/`, { append: true });
    c.header("Set-Cookie", `_yapi_uid=${store.uid}; Path=/`, { append: true });
  };

  const loginOk = (c: { header: (name: string, value: string, opts?: { append?: boolean }) => void; json: (v: unknown) => Response }, email: string) => {
    issueLoginCookies(c);
    return c.json(
      envelope({
        username: email,
        uid: store.uid,
        email,
        add_time: Date.now(),
        up_time: Date.now(),
        role: "admin",
        type: "site",
        study: false
      })
    );
  };

  app.post("/api/user/login_by_ldap", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      username?: string;
    };
    const account = body.email || body.username;
    if (!account || !body.password) {
      return c.json(envelope(null, 400, "用户名或密码不能为空"));
    }
    if (!/ldap|@corp/i.test(account) && !account.includes("\\")) {
      return c.json(envelope(null, 404, "非LDAP账户"));
    }
    return loginOk(c, account);
  });

  app.post("/api/user/login", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    if (!body.email || !body.password) {
      return c.json(envelope(null, 400, "邮箱或密码不能为空"));
    }
    return loginOk(c, body.email);
  });

  app.get("/api/group/list", (c) => {
    return c.json(
      envelope([
        {
          _id: 11,
          group_name: "演示空间",
          role: "owner"
        }
      ])
    );
  });

  app.get("/api/project/list", (c) => {
    return c.json(
      envelope({
        list: [
          {
            _id: store.project._id,
            name: store.project.name,
            basepath: store.project.basepath,
            group_id: 11
          }
        ],
        total: 1
      })
    );
  });

  app.get("/api/project/get", (c) => {
    return c.json(
      envelope({
        ...store.project,
        project_type: "private",
        uid: store.uid
      })
    );
  });

  app.get("/api/interface/getCatMenu", (c) => {
    return c.json(envelope(store.cats));
  });

  app.get("/api/interface/list_menu", (c) => {
    const menu = store.cats.map((cat) => ({
      _id: cat._id,
      name: cat.name,
      list: store.interfaces
        .filter((item) => item.catId === cat._id)
        .map((item) => ({
          _id: item.id,
          title: item.title,
          path: item.path,
          method: item.method,
          project_id: item.projectId,
          catid: item.catId,
          status: item.status
        }))
    }));
    return c.json(envelope(menu));
  });

  app.get("/api/interface/list", (c) => {
    const keyword = (c.req.query("keyword") || "").toLowerCase();
    const list = store.interfaces.filter((item) => {
      if (!keyword) {
        return true;
      }
      return `${item.title} ${item.path} ${item.method}`.toLowerCase().includes(keyword);
    });
    return c.json(
      envelope({
        count: list.length,
        total: list.length,
        list: list.map((item) => ({
          _id: item.id,
          title: item.title,
          path: item.path,
          method: item.method,
          project_id: item.projectId,
          catid: item.catId,
          status: item.status
        }))
      })
    );
  });

  app.get("/api/interface/get", (c) => {
    const id = Number(c.req.query("id"));
    const found = store.interfaces.find((item) => item.id === id);
    if (!found) {
      return c.json(envelope(null, 40022, "不存在的接口"));
    }
    return c.json(
      envelope({
        _id: found.id,
        title: found.title,
        path: found.path,
        method: found.method,
        project_id: found.projectId,
        catid: found.catId,
        status: found.status,
        desc: found.desc,
        res_body: found.resBody,
        res_body_type: found.resBodyType,
        res_body_is_json_schema: found.resBodyIsJsonSchema,
        req_body_type: found.reqBodyType,
        req_body_other: found.reqBodyOther
      })
    );
  });

  app.post("/api/interface/add", async (c) => {
    if (!requireLogin(c.req.header("cookie"))) {
      return c.json(envelope(null, 40011, "请登录..."));
    }
    const body = (await c.req.json()) as {
      title?: string;
      path?: string;
      method?: string;
      catid?: number;
      project_id?: number;
      desc?: string;
    };
    const title = (body.title || "").trim();
    const method = (body.method || "GET").trim().toUpperCase();
    const path = body.path?.startsWith("/") ? body.path : `/${body.path || ""}`;
    const cat = store.cats.find((item) => item._id === Number(body.catid));
    if (!title || !body.path) {
      return c.json(envelope(null, 400, "请填写接口名称和路径"));
    }
    if (!cat) {
      return c.json(envelope(null, 400, "不存在的分类"));
    }
    const dup = store.interfaces.find((item) => item.path === path && item.method === method);
    if (dup) {
      return c.json(envelope(null, 40022, `已存在的接口:${path}`));
    }
    const id = store.nextInterfaceId++;
    const created: DemoInterface = {
      id,
      projectId: Number(body.project_id) || store.project._id,
      catId: cat._id,
      catName: cat.name,
      title,
      method,
      path,
      status: "undone",
      resBodyType: "json",
      resBodyIsJsonSchema: false,
      resBody: "",
      mockUrl: `/mock/${store.project._id}${path}`,
      desc: body.desc
    };
    store.interfaces.push(created);
    return c.json(
      envelope({
        _id: created.id,
        title: created.title,
        path: created.path,
        method: created.method,
        catid: created.catId,
        project_id: created.projectId,
        status: created.status,
        res_body_type: created.resBodyType
      })
    );
  });

  app.post("/api/interface/up", async (c) => {
    const body = (await c.req.json()) as {
      id?: number;
      res_body?: string;
      res_body_type?: string;
      res_body_is_json_schema?: boolean;
      title?: string;
    };
    const found = store.interfaces.find((item) => item.id === Number(body.id));
    if (!found) {
      return c.json(envelope(null, 40022, "不存在的接口"));
    }
    if (typeof body.res_body === "string") {
      found.resBody = body.res_body;
    }
    if (body.res_body_type) {
      found.resBodyType = body.res_body_type;
    }
    if (typeof body.res_body_is_json_schema === "boolean") {
      found.resBodyIsJsonSchema = body.res_body_is_json_schema;
    }
    if (body.title) {
      found.title = body.title;
    }
    return c.json(envelope({ n: 1, nModified: 1, ok: 1 }));
  });

  app.get("/api/plugin/advmock/get", (c) => {
    if (!requireLogin(c.req.header("cookie"))) {
      return c.json(envelope(null, 40011, "请登录..."));
    }
    const interfaceId = Number(c.req.query("interface_id"));
    const script = store.scripts.get(interfaceId);
    if (!script) {
      return c.json(envelope(null, 408, "mock脚本不存在"));
    }
    return c.json(
      envelope({
        interface_id: script.interfaceId,
        project_id: script.projectId,
        mock_script: script.mockScript,
        enable: script.enable
      })
    );
  });

  app.post("/api/plugin/advmock/save", async (c) => {
    if (!requireLogin(c.req.header("cookie"))) {
      return c.json(envelope(null, 40011, "请登录..."));
    }
    const body = (await c.req.json()) as {
      interface_id: number;
      project_id: number;
      mock_script?: string;
      enable?: boolean;
    };
    const next: AdvancedMock = {
      interfaceId: Number(body.interface_id),
      projectId: Number(body.project_id),
      mockScript: body.mock_script || "",
      enable: body.enable === true,
      exists: true
    };
    store.scripts.set(next.interfaceId, next);
    return c.json(envelope({ n: 1, ok: 1 }));
  });

  app.get("/api/plugin/advmock/case/list", (c) => {
    if (!requireLogin(c.req.header("cookie"))) {
      return c.json(envelope(null, 40011, "请登录..."));
    }
    const interfaceId = Number(c.req.query("interface_id"));
    const list = store.cases
      .filter((item) => item.interfaceId === interfaceId)
      .map((item) => ({
        _id: item.id,
        interface_id: item.interfaceId,
        project_id: item.projectId,
        name: item.name,
        params: item.params,
        res_body: item.resBody,
        code: item.code,
        delay: item.delay,
        ip_enable: item.ipEnable,
        ip: item.ip,
        case_enable: item.caseEnable,
        headers: item.headers,
        username: "demo"
      }));
    return c.json(envelope(list));
  });

  app.get("/api/plugin/advmock/case/get", (c) => {
    if (!requireLogin(c.req.header("cookie"))) {
      return c.json(envelope(null, 40011, "请登录..."));
    }
    const id = Number(c.req.query("id"));
    const found = store.cases.find((item) => item.id === id);
    if (!found) {
      return c.json(envelope(null, 400, "期望不存在"));
    }
    return c.json(
      envelope({
        _id: found.id,
        interface_id: found.interfaceId,
        project_id: found.projectId,
        name: found.name,
        params: found.params,
        res_body: found.resBody,
        code: found.code,
        delay: found.delay,
        ip_enable: found.ipEnable,
        case_enable: found.caseEnable,
        headers: found.headers
      })
    );
  });

  app.post("/api/plugin/advmock/case/save", async (c) => {
    if (!requireLogin(c.req.header("cookie"))) {
      return c.json(envelope(null, 40011, "请登录..."));
    }
    const body = (await c.req.json()) as {
      id?: number;
      interface_id: number;
      project_id: number;
      name: string;
      params?: Record<string, string>;
      res_body: string;
      code?: number;
      delay?: number;
      ip_enable?: boolean;
      ip?: string;
      headers?: Array<{ name: string; value: string }>;
    };
    if (!body.res_body) {
      return c.json(envelope(null, 408, "请输入 Response Body"));
    }
    const existing = body.id
      ? store.cases.find((item) => item.id === Number(body.id))
      : undefined;
    if (existing) {
      existing.name = body.name;
      existing.params = body.params || {};
      existing.resBody = body.res_body;
      existing.code = body.code || 200;
      existing.delay = body.delay || 0;
      existing.ipEnable = Boolean(body.ip_enable);
      existing.ip = body.ip;
      existing.headers = body.headers || [];
      return c.json(envelope({ n: 1, nModified: 1 }));
    }
    const created: MockCase = {
      id: store.nextCaseId++,
      interfaceId: Number(body.interface_id),
      projectId: Number(body.project_id),
      name: body.name,
      params: body.params || {},
      resBody: body.res_body,
      code: body.code || 200,
      delay: body.delay || 0,
      ipEnable: Boolean(body.ip_enable),
      ip: body.ip,
      caseEnable: true,
      headers: body.headers || []
    };
    store.cases.push(created);
    return c.json(envelope({ _id: created.id }));
  });

  app.post("/api/plugin/advmock/case/del", async (c) => {
    if (!requireLogin(c.req.header("cookie"))) {
      return c.json(envelope(null, 40011, "请登录..."));
    }
    const body = (await c.req.json()) as { id?: number };
    store.cases = store.cases.filter((item) => item.id !== Number(body.id));
    return c.json(envelope({ n: 1 }));
  });

  app.all("/mock/:projectId/*", async (c) => {
    const rest = `/${c.req.path.split("/").slice(3).join("/")}`;
    const method = c.req.method.toUpperCase();
    const query = new URL(c.req.url).searchParams;
    const body =
      method === "GET" || method === "HEAD"
        ? {}
        : ((await c.req.json().catch(() => ({}))) as Record<string, string>);
    const params = { ...Object.fromEntries(query.entries()), ...body };

    const iface = store.interfaces.find((item) => {
      const pattern = item.path.replace(/\{[^}]+\}/g, "[^/]+");
      return new RegExp(`^${pattern}$`).test(rest) && item.method === method;
    });
    if (!iface) {
      return c.json({ errcode: 404, errmsg: "No mock matched" }, 404);
    }

    const matchedCase = store.cases.find((item) => {
      if (item.interfaceId !== iface.id || !item.caseEnable) {
        return false;
      }
      return Object.entries(item.params).every(([key, value]) => String(params[key]) === String(value));
    });
    if (matchedCase) {
      return c.json(parseBodyJson(matchedCase.resBody), matchedCase.code as 200);
    }

    const script = store.scripts.get(iface.id);
    if (script?.enable && params.status === "EMPTY") {
      return c.json({ code: 0, msg: "ok", data: { total: 0, list: [] } });
    }

    return c.json(parseBodyJson(iface.resBody));
  });

  return { app, store };
}

export function createDemoFetch(app: Hono, prefix = "/demo-yapi"): FetchFn {
  return async (url, init) => {
    const parsed = new URL(String(url), "http://127.0.0.1");
    let path = parsed.pathname + parsed.search;
    if (path.startsWith(prefix)) {
      path = path.slice(prefix.length) || "/";
    }
    const headers = new Headers();
    const raw = init?.headers;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw as Record<string, string>)) {
        headers.set(key, value);
      }
    }
    return app.request(path, {
      method: init?.method,
      headers,
      body: typeof init?.body === "string" ? init.body : undefined
    });
  };
}
