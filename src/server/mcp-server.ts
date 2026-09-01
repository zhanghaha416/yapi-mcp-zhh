import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { createTools, type YapiTools } from "./tools.js";
import { YapiError } from "./yapi-client.js";

function text(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }]
  };
}

function fail(error: unknown) {
  const message = error instanceof YapiError ? error.message : error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }]
  };
}

export const toolCatalog = [
  {
    name: "yapi_list_projects",
    title: "列出可访问项目",
    description: "不知道项目 ID 时先调这个。用登录态拉分组和项目；有默认项目时也会标出来。"
  },
  {
    name: "yapi_search_interfaces",
    title: "搜索接口",
    description: "按标题、路径、方法搜索当前 YApi 项目里的接口，不知道 interfaceId 时先用这个。"
  },
  {
    name: "yapi_create_interface",
    title: "新建接口",
    description: "在 YApi 项目里新建一条接口。需要登录态。可顺带写入普通 Mock 返回体。"
  },
  {
    name: "yapi_get_interface_mock",
    title: "读取接口 Mock 文档",
    description: "读取接口的 res_body（普通 Mock 文档 / JSON Schema）、类型，以及可请求的 mock URL。"
  },
  {
    name: "yapi_update_interface_mock",
    title: "改接口 Mock 文档",
    description:
      "更新接口返回体文档（YApi 编辑页里的返回数据 / JSON Schema）。这是普通 Mock 的数据源。写高级脚本或期望请用另外两个工具。"
  },
  {
    name: "yapi_get_advanced_mock",
    title: "读取高级 Mock 脚本",
    description: "读取官方 advanced-mock 插件的自定义脚本和启用状态。需要登录态，不只是项目 token。"
  },
  {
    name: "yapi_update_advanced_mock",
    title: "改高级 Mock 脚本",
    description: "覆盖保存某接口的高级 Mock 脚本，并默认开启。整段覆盖，不合并。"
  },
  {
    name: "yapi_list_mock_cases",
    title: "列出 Mock 期望",
    description: "列出接口下的高级 Mock 期望（按请求参数匹配返回不同 JSON）。"
  },
  {
    name: "yapi_save_mock_case",
    title: "保存 Mock 期望",
    description: "新增或更新一条高级 Mock 期望。更新时传 caseId。params 是匹配用的键值，例如 {\"status\":\"EMPTY\"}。"
  },
  {
    name: "yapi_delete_mock_case",
    title: "删除 Mock 期望",
    description: "按 caseId 删除一条高级 Mock 期望。"
  },
  {
    name: "yapi_call_mock",
    title: "试打 Mock URL",
    description: "对 YApi mock 地址发真实请求，用来确认刚才写入是否生效。"
  }
] as const;

export function createMcpServer(tools: YapiTools = createTools(loadConfig())) {
  const server = new McpServer({
    name: "yapi-mcp-zhh",
    version: "1.0.0"
  });

  server.tool(
    "yapi_list_projects",
    "列出当前账号能看到的 YApi 项目。不知道项目 ID 时先用这个，不必事先配置 YAPI_PROJECT_ID。",
    {},
    async () => {
      try {
        return text(await tools.listProjects());
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.tool(
    "yapi_search_interfaces",
    "按标题、路径、方法搜索当前 YApi 项目里的接口，不知道 interfaceId 时先用这个。",
    {
      keyword: z.string().describe("搜索关键字，可为空表示列出全部"),
      projectId: z.number().optional().describe("YApi 项目 ID，可省略并使用环境变量")
    },
    async ({ keyword, projectId }) => {
      try {
        return text(await tools.searchInterfaces(keyword, projectId));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.tool(
    "yapi_create_interface",
    "在指定 YApi 项目新建接口。需要登录账号。不传 catId 时优先用「公共分类」，否则用第一个分类。",
    {
      title: z.string().describe("接口标题，例如 MCP测试接口 ping"),
      path: z.string().describe("接口路径，例如 /mcp/ping"),
      method: z
        .enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
        .optional()
        .describe("默认 GET"),
      projectId: z.number().optional(),
      catId: z.number().optional().describe("分类 ID，可省略"),
      catName: z.string().optional().describe("分类名称，例如 公共分类"),
      desc: z.string().optional(),
      resBody: z.string().optional().describe("可选，新建后写入的 Mock 返回体 JSON 字符串"),
      resBodyType: z.enum(["json", "raw"]).optional(),
      resBodyIsJsonSchema: z.boolean().optional(),
      dryRun: z.boolean().optional()
    },
    async (args) => {
      try {
        return text(await tools.createInterface(args));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.tool(
    "yapi_get_interface_mock",
    "读取接口的 res_body（普通 Mock 文档 / JSON Schema）以及 mock URL。",
    {
      interfaceId: z.number(),
      projectId: z.number().optional()
    },
    async ({ interfaceId, projectId }) => {
      try {
        return text(await tools.getInterfaceMock(interfaceId, projectId));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.tool(
    "yapi_update_interface_mock",
    "更新接口返回体文档（普通 Mock）。高级脚本和期望请用对应工具。",
    {
      interfaceId: z.number(),
      projectId: z.number().optional(),
      resBody: z.string().describe("返回体 JSON 字符串，或 JSON Schema 字符串"),
      resBodyType: z.enum(["json", "raw"]).optional(),
      resBodyIsJsonSchema: z.boolean().optional(),
      dryRun: z.boolean().optional()
    },
    async (args) => {
      try {
        return text(await tools.updateInterfaceMock(args));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.tool(
    "yapi_get_advanced_mock",
    "读取高级 Mock 自定义脚本。需要 YAPI_EMAIL/YAPI_PASSWORD 或 Cookie。",
    {
      interfaceId: z.number(),
      projectId: z.number().optional()
    },
    async ({ interfaceId, projectId }) => {
      try {
        return text(await tools.getAdvancedMock(interfaceId, projectId));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.tool(
    "yapi_update_advanced_mock",
    "覆盖保存高级 Mock 脚本。官方插件接口不在项目 token 白名单里，必须走登录态。",
    {
      interfaceId: z.number(),
      projectId: z.number().optional(),
      mockScript: z.string().describe("YApi 高级 Mock JS，可改 mockJson / httpCode / delay"),
      enable: z.boolean().optional(),
      dryRun: z.boolean().optional()
    },
    async (args) => {
      try {
        return text(await tools.updateAdvancedMock(args));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.tool(
    "yapi_list_mock_cases",
    "列出接口的高级 Mock 期望。",
    {
      interfaceId: z.number(),
      projectId: z.number().optional()
    },
    async ({ interfaceId, projectId }) => {
      try {
        return text(await tools.listMockCases(interfaceId, projectId));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.tool(
    "yapi_save_mock_case",
    "新增或更新一条 Mock 期望。更新时传 caseId。",
    {
      interfaceId: z.number(),
      projectId: z.number().optional(),
      caseId: z.number().optional(),
      name: z.string(),
      resBody: z.string(),
      params: z.record(z.string()).optional(),
      code: z.number().optional(),
      delay: z.number().optional(),
      ipEnable: z.boolean().optional(),
      ip: z.string().optional(),
      dryRun: z.boolean().optional()
    },
    async (args) => {
      try {
        return text(await tools.saveMockCase(args));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.tool(
    "yapi_delete_mock_case",
    "删除一条 Mock 期望。",
    {
      caseId: z.number(),
      projectId: z.number().optional()
    },
    async ({ caseId, projectId }) => {
      try {
        return text(await tools.deleteMockCase(caseId, projectId));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.tool(
    "yapi_call_mock",
    "请求 mock URL，确认写入是否生效。",
    {
      interfaceId: z.number().optional(),
      mockUrl: z.string().optional(),
      method: z.string().optional(),
      body: z.unknown().optional(),
      projectId: z.number().optional()
    },
    async (args) => {
      try {
        return text(await tools.callMock(args));
      } catch (error) {
        return fail(error);
      }
    }
  );

  return server;
}
