import type { AppConfig } from "./types.js";
import type { AdvancedMock, InterfaceDetail, InterfaceSummary, MockCase } from "./types.js";
import { YapiClient, YapiError } from "./yapi-client.js";

type MenuCat = {
  _id: number;
  name: string;
  list?: Array<{
    _id: number;
    title: string;
    path: string;
    method: string;
    project_id: number;
    catid: number;
    status?: string;
  }>;
};

type RawInterface = {
  _id: number;
  title: string;
  path: string;
  method: string;
  project_id: number;
  catid: number;
  status?: string;
  desc?: string;
  res_body?: string;
  res_body_type?: string;
  res_body_is_json_schema?: boolean;
  req_body_type?: string;
  req_body_other?: string;
};

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
}

export function createTools(config: AppConfig, client = new YapiClient(config)) {
  const projectIdOrThrow = (projectId?: number) => {
    const id = projectId ?? config.defaultProjectId;
    if (!id) {
      throw new YapiError("缺少 projectId，请传入参数或配置 YAPI_PROJECT_ID");
    }
    return id;
  };

  const mockUrlFor = (projectId: number, path: string) => {
    const cleaned = path.startsWith("/") ? path : `/${path}`;
    return `${config.baseUrl}/mock/${projectId}${cleaned}`;
  };

  async function listInterfaces(projectId?: number): Promise<InterfaceSummary[]> {
    const pid = projectIdOrThrow(projectId);
    const menu = await client.get<MenuCat[]>("/api/interface/list_menu", { project_id: pid }, { projectId: pid });
    const rows: InterfaceSummary[] = [];
    for (const cat of menu || []) {
      for (const item of cat.list || []) {
        rows.push({
          id: item._id,
          projectId: item.project_id,
          catId: item.catid,
          catName: cat.name,
          title: item.title,
          method: item.method,
          path: item.path,
          status: item.status
        });
      }
    }
    return rows;
  }

  async function getInterface(interfaceId: number, projectId?: number): Promise<InterfaceDetail> {
    const raw = await client.get<RawInterface>(
      "/api/interface/get",
      { id: interfaceId },
      { projectId: projectId ?? config.defaultProjectId }
    );
    const pid = raw.project_id;
    return {
      id: raw._id,
      projectId: pid,
      catId: raw.catid,
      catName: "",
      title: raw.title,
      method: raw.method,
      path: raw.path,
      status: raw.status,
      desc: raw.desc,
      resBody: raw.res_body || "",
      resBodyType: raw.res_body_type || "json",
      resBodyIsJsonSchema: Boolean(raw.res_body_is_json_schema),
      reqBodyType: raw.req_body_type,
      reqBodyOther: raw.req_body_other,
      mockUrl: mockUrlFor(pid, raw.path)
    };
  }

  async function knownProjectIds(): Promise<number[]> {
    if (config.defaultProjectId) {
      return [config.defaultProjectId];
    }
    const fromTokens = [...config.tokens.keys()].filter((id) => id > 0);
    if (fromTokens.length > 0) {
      return fromTokens;
    }
    const listed = await listProjects();
    return listed.projects.map((item) => item.id);
  }

  async function listProjects() {
    const groups = await client.get<Array<{ _id: number; group_name: string }>>(
      "/api/group/list",
      undefined,
      { session: true }
    );
    const projects: Array<{ id: number; name: string; groupId: number; groupName: string; basepath?: string }> = [];
    for (const group of groups || []) {
      const page = await client.get<{
        list?: Array<{ _id: number; name: string; group_id: number; basepath?: string }>;
      }>("/api/project/list", { group_id: group._id, page: 1, limit: 50 }, { session: true });
      for (const item of page?.list || []) {
        projects.push({
          id: item._id,
          name: item.name,
          groupId: group._id,
          groupName: group.group_name,
          basepath: item.basepath
        });
      }
    }
    return { defaultProjectId: config.defaultProjectId ?? null, projects };
  }

  return {
    client,
    async getStatus() {
      return {
        demo: config.demo,
        baseUrl: config.baseUrl,
        defaultProjectId: config.defaultProjectId ?? null,
        hasToken: config.tokens.size > 0,
        hasPassword: Boolean(config.email && config.password),
        hasCookie: Boolean(config.cookie),
        insecureTls: config.insecureTls
      };
    },

    listProjects,

    async listCategories(projectId?: number) {
      const pid = projectIdOrThrow(projectId);
      const cats = await client.get<Array<{ _id: number; name: string }>>(
        "/api/interface/getCatMenu",
        { project_id: pid },
        { projectId: pid }
      );
      return { projectId: pid, categories: cats.map((c) => ({ id: c._id, name: c.name })) };
    },

    async searchInterfaces(keyword: string, projectId?: number) {
      const projectIds = projectId ? [projectId] : await knownProjectIds();
      if (projectIds.length === 0) {
        throw new YapiError(
          "还不知道要搜哪个项目。先调用 yapi_list_projects，或配置 YAPI_PROJECT_ID / YAPI_PROJECT_TOKENS=项目ID:token"
        );
      }
      const rows: InterfaceSummary[] = [];
      for (const id of projectIds) {
        rows.push(...(await listInterfaces(id)));
      }
      const q = keyword.trim().toLowerCase();
      const matched = q
        ? rows.filter((row) => `${row.title} ${row.path} ${row.method} ${row.catName}`.toLowerCase().includes(q))
        : rows;
      return { total: matched.length, projectIds, interfaces: matched.slice(0, 100) };
    },

    async getInterfaceMock(interfaceId: number, projectId?: number) {
      return getInterface(interfaceId, projectId);
    },

    async createInterface(input: {
      title: string;
      path: string;
      method?: string;
      projectId?: number;
      catId?: number;
      catName?: string;
      desc?: string;
      resBody?: string;
      resBodyType?: string;
      resBodyIsJsonSchema?: boolean;
      dryRun?: boolean;
    }) {
      const pid = projectIdOrThrow(input.projectId);
      const method = (input.method || "GET").trim().toUpperCase();
      const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
      if (!input.title.trim()) {
        throw new YapiError("缺少 title");
      }
      if (!input.path.trim()) {
        throw new YapiError("缺少 path");
      }
      if (input.resBody && input.resBodyType !== "raw") {
        JSON.parse(input.resBody);
      }
      const cats = await client.get<Array<{ _id: number; name: string }>>(
        "/api/interface/getCatMenu",
        { project_id: pid },
        { session: true, projectId: pid }
      );
      const list = cats || [];
      const cat = input.catId
        ? list.find((item) => item._id === input.catId)
        : input.catName
          ? list.find((item) => item.name === input.catName)
          : list.find((item) => item.name === "公共分类") || list[0];
      if (!cat) {
        throw new YapiError("找不到分类：请传入 catId / catName，或先在 YApi 项目里建一个分类");
      }
      const payload = {
        title: input.title.trim(),
        path,
        method,
        catid: cat._id,
        project_id: pid,
        desc: input.desc || ""
      };
      if (input.dryRun) {
        return { dryRun: true as const, wouldWrite: payload, category: { id: cat._id, name: cat.name } };
      }
      const created = await client.post<{ _id?: number; id?: number }>(
        "/api/interface/add",
        payload,
        { session: true, projectId: pid }
      );
      const interfaceId = created?._id ?? created?.id;
      if (!interfaceId) {
        throw new YapiError("新建接口成功但未返回 ID");
      }
      if (input.resBody) {
        await this.updateInterfaceMock({
          interfaceId,
          projectId: pid,
          resBody: input.resBody,
          resBodyType: input.resBodyType,
          resBodyIsJsonSchema: input.resBodyIsJsonSchema
        });
      }
      return {
        dryRun: false as const,
        created: await getInterface(interfaceId, pid),
        category: { id: cat._id, name: cat.name }
      };
    },

    async updateInterfaceMock(input: {
      interfaceId: number;
      projectId?: number;
      resBody: string;
      resBodyType?: string;
      resBodyIsJsonSchema?: boolean;
      dryRun?: boolean;
    }) {
      if (input.resBodyType !== "raw") {
        JSON.parse(input.resBody);
      }
      const current = await getInterface(input.interfaceId, input.projectId);
      const payload = {
        id: current.id,
        res_body: input.resBody,
        res_body_type: input.resBodyType || current.resBodyType || "json",
        res_body_is_json_schema:
          input.resBodyIsJsonSchema ?? current.resBodyIsJsonSchema
      };
      if (input.dryRun) {
        return { dryRun: true, wouldWrite: payload, current };
      }
      await client.post("/api/interface/up", payload, { projectId: current.projectId });
      const updated = await getInterface(input.interfaceId, current.projectId);
      return { dryRun: false, updated };
    },

    async getAdvancedMock(interfaceId: number, projectId?: number): Promise<AdvancedMock> {
      const iface = await getInterface(interfaceId, projectId);
      try {
        const raw = await client.get<{
          interface_id: number;
          project_id?: number;
          mock_script?: string;
          enable?: boolean;
        }>("/api/plugin/advmock/get", { interface_id: interfaceId }, { session: true, projectId: iface.projectId });
        return {
          interfaceId,
          projectId: raw.project_id || iface.projectId,
          mockScript: raw.mock_script || "",
          enable: Boolean(raw.enable),
          exists: true
        };
      } catch (error) {
        if (error instanceof YapiError && (error.errcode === 408 || /不存在/.test(error.message))) {
          return {
            interfaceId,
            projectId: iface.projectId,
            mockScript: "",
            enable: false,
            exists: false
          };
        }
        throw error;
      }
    },

    async updateAdvancedMock(input: {
      interfaceId: number;
      projectId?: number;
      mockScript: string;
      enable?: boolean;
      dryRun?: boolean;
    }) {
      const iface = await getInterface(input.interfaceId, input.projectId);
      const payload = {
        interface_id: iface.id,
        project_id: iface.projectId,
        mock_script: input.mockScript,
        enable: input.enable !== false
      };
      if (input.dryRun) {
        return { dryRun: true, wouldWrite: payload };
      }
      await client.post("/api/plugin/advmock/save", payload, { session: true, projectId: iface.projectId });
      return { dryRun: false, saved: await this.getAdvancedMock(iface.id, iface.projectId) };
    },

    async listMockCases(interfaceId: number, projectId?: number) {
      const iface = await getInterface(interfaceId, projectId);
      const raw = await client.get<
        Array<{
          _id: number;
          interface_id: number;
          project_id: number;
          name: string;
          params?: Record<string, string>;
          res_body?: string;
          code?: number;
          delay?: number;
          ip_enable?: boolean;
          ip?: string;
          case_enable?: boolean;
          headers?: Array<{ name: string; value: string }>;
        }>
      >("/api/plugin/advmock/case/list", { interface_id: interfaceId }, { session: true, projectId: iface.projectId });
      const cases: MockCase[] = (raw || []).map((item) => ({
        id: item._id,
        interfaceId: item.interface_id,
        projectId: item.project_id,
        name: item.name,
        params: asRecord(item.params),
        resBody: item.res_body || "",
        code: item.code || 200,
        delay: item.delay || 0,
        ipEnable: Boolean(item.ip_enable),
        ip: item.ip,
        caseEnable: item.case_enable !== false,
        headers: item.headers || []
      }));
      return { interfaceId, cases };
    },

    async saveMockCase(input: {
      interfaceId: number;
      projectId?: number;
      caseId?: number;
      name: string;
      resBody: string;
      params?: Record<string, string>;
      code?: number;
      delay?: number;
      ipEnable?: boolean;
      ip?: string;
      dryRun?: boolean;
    }) {
      JSON.parse(input.resBody);
      const iface = await getInterface(input.interfaceId, input.projectId);
      const payload = {
        id: input.caseId,
        interface_id: iface.id,
        project_id: iface.projectId,
        name: input.name,
        params: input.params || {},
        res_body: input.resBody,
        code: input.code || 200,
        delay: input.delay || 0,
        ip_enable: Boolean(input.ipEnable),
        ip: input.ip,
        headers: []
      };
      if (input.dryRun) {
        return { dryRun: true, wouldWrite: payload };
      }
      const saved = await client.post<unknown>("/api/plugin/advmock/case/save", payload, {
        session: true,
        projectId: iface.projectId
      });
      const listed = await this.listMockCases(iface.id, iface.projectId);
      return { dryRun: false, saved, cases: listed.cases };
    },

    async deleteMockCase(caseId: number, projectId?: number) {
      await client.post("/api/plugin/advmock/case/del", { id: caseId }, {
        session: true,
        projectId: projectId ?? config.defaultProjectId
      });
      return { deleted: caseId };
    },

    async callMock(input: {
      interfaceId?: number;
      mockUrl?: string;
      method?: string;
      body?: unknown;
      projectId?: number;
    }) {
      let method = input.method;
      let url = input.mockUrl;
      if (input.interfaceId) {
        const iface = await getInterface(input.interfaceId, input.projectId);
        method = method || iface.method;
        url = url || iface.mockUrl;
      }
      if (!url) {
        throw new YapiError("缺少 mockUrl 或 interfaceId");
      }
      return client.callMock(url, (method || "GET").toUpperCase(), input.body);
    }
  };
}

export type YapiTools = ReturnType<typeof createTools>;
