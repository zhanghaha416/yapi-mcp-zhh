export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type YapiEnvelope<T> = {
  errcode: number;
  errmsg: string;
  data: T;
};

export type ProjectTokenMap = Map<number, string>;

export type AppConfig = {
  baseUrl: string;
  defaultProjectId?: number;
  tokens: ProjectTokenMap;
  email?: string;
  password?: string;
  cookie?: string;
  insecureTls: boolean;
  demo: boolean;
  port: number;
  loginMode: "auto" | "ldap" | "password";
};

export type InterfaceSummary = {
  id: number;
  projectId: number;
  catId: number;
  catName: string;
  title: string;
  method: string;
  path: string;
  status?: string;
};

export type InterfaceDetail = InterfaceSummary & {
  resBody: string;
  resBodyType: string;
  resBodyIsJsonSchema: boolean;
  reqBodyType?: string;
  reqBodyOther?: string;
  mockUrl: string;
  desc?: string;
};

export type AdvancedMock = {
  interfaceId: number;
  projectId?: number;
  enable: boolean;
  mockScript: string;
  exists: boolean;
};

export type MockCase = {
  id: number;
  interfaceId: number;
  projectId: number;
  name: string;
  params: Record<string, string>;
  resBody: string;
  code: number;
  delay: number;
  ipEnable: boolean;
  ip?: string;
  caseEnable: boolean;
  headers: Array<{ name: string; value: string }>;
};

export type RpcResult = {
  ok: boolean;
  tool: string;
  data?: unknown;
  error?: string;
};
