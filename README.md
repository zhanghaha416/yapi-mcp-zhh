# YApi Mock MCP — 操作说明

在 Cursor 里改内网 YApi 的 Mock（返回体、高级脚本、期望），不用再打开 YApi 网页点保存。

先分清三个东西，后面才不会配错：

| 名字 | 是什么 |
| --- | --- |
| **本仓库** | 这份 MCP 工具源码。clone、`npm install` 都针对它 |
| **你们前端业务仓库** | 页面代码。不用把本工具嵌进去 |
| **YApi 项目** | YApi 网页上的接口集合，有一个数字 ID。那是配置项，不是 git |

代码在 GitHub：<https://github.com/zhanghaha416/yapi-mcp-zhh>  
自己用、给同事用，都先 clone 这份仓库（不是你们前端业务仓库）。

需要：Node.js 20+、本机能访问你们的 YApi。

---

## 一、自己本机接到 Cursor（按这个做就行）

### 1. 把本仓库弄到本机

```bash
git clone https://github.com/zhanghaha416/yapi-mcp-zhh.git
cd yapi-mcp-zhh
```

### 2. 安装依赖并编译

```bash
npm install
npm run build
```

成功后会有文件：

```text
dist/server/mcp-stdio.js
```

Cursor 真正启动的是这个 js，记住它的**绝对路径**。

- macOS / Linux 示例：`/Users/xiaoming/yapi-mcp-zhh/dist/server/mcp-stdio.js`
- Windows 示例：`C:\tools\yapi-mcp-zhh\dist\server\mcp-stdio.js`

### 3. 打开 Cursor 的 MCP 配置

Cursor → Settings → MCP → 编辑配置（或直接改本机的 `~/.cursor/mcp.json`）。

把仓库里 `share/mcp.stdio.json` **整段拷进去**，然后改下面几项。

### 4. 改路径和账号

```json
{
  "mcpServers": {
    "yapi-mock": {
      "command": "node",
      "args": ["/改成你本机的绝对路径/dist/server/mcp-stdio.js"],
      "env": {
        "YAPI_BASE_URL": "http://你们公司的yapi地址",
        "YAPI_PROJECT_ID": "123",
        "YAPI_TOKEN": "YApi项目设置里的token",
        "YAPI_EMAIL": "你的登录名",
        "YAPI_PASSWORD": "你的密码"
      }
    }
  }
}
```

| 字段 | 去哪找 | 不填会怎样 |
| --- | --- | --- |
| `args` 里的路径 | 第 2 步编出来的 js | Cursor 起不来 MCP |
| `YAPI_BASE_URL` | 浏览器打开 YApi 时的地址，末尾不要 `/` | 走内存演示数据，改不到真 YApi |
| `YAPI_TOKEN` | YApi → 项目 → 设置 → Token | 改不了接口返回体 |
| `YAPI_EMAIL` / `YAPI_PASSWORD` | 登录 YApi 的账号（LDAP 也把登录名填在 EMAIL） | 改不了高级脚本和期望，会提示请登录 |
| `YAPI_PROJECT_ID` | YApi 网址里的项目数字，或项目设置页 | 搜列表时可能要先问项目；已经知道接口 ID 时可以不填 |

内网 HTTPS 证书不受信任时，再加一行：`"YAPI_INSECURE_TLS": "true"`。

不想把密码写进配置：从浏览器拷 `_yapi_token`、`_yapi_uid`，改成 `"YAPI_COOKIE": "_yapi_token=...; _yapi_uid=..."`，可以去掉 PASSWORD。

### 5. 保存并看 MCP 是否亮起来

保存配置，必要时重载 Cursor。MCP 列表里应出现 `yapi-mock`。

在对话里试一句：

> 列出我能访问的 YApi 项目，再搜一下 /api/order/list

或：

> 把某个接口的空列表 Mock 期望改成返回 0 条，并打一次 mock 确认

---

## 二、先不接 YApi，只想看演示

在本仓库目录：

```bash
npm install
npm run build
npm start
```

浏览器打开本机提示的地址（默认 `http://127.0.0.1:43181`）。这是演示台，数据在内存里，**不会写到公司 YApi**。

这和 Cursor MCP 是同一套能力；接真环境仍然要走第一节的配置。

---

## 三、给组内同事

**不是拷一条 MCP 链接就结束。** 同事电脑上也要有这份工具（或连你们内网的一台 HTTP 服务）。

### 方式 A：每人本机一份（推荐，权限跟个人账号走）

把仓库地址发给同事即可：

https://github.com/zhanghaha416/yapi-mcp-zhh

让他们按**第一节**做一遍（clone → install → build → 改自己的路径和账号）。

每人改自己的：

- js 的绝对路径（每人电脑路径不一样）
- 自己的 YApi Token / 登录账号

不要把你的密码写进仓库再推上去。

### 方式 B：组里一台机器，同事只贴 URL

适合「大家共用一个联调账号、同事不想 install」。

在一台能访问 YApi 的机器上：

```bash
cp .env.example .env
# 编辑 .env：YApi 地址、Token、登录账号
# 再写一长串随机令牌，例如：
# MCP_HTTP_AUTH_TOKEN=用 openssl rand -hex 24 生成
npm install
npm run build
npm start
```

同事 Cursor 配置用 `share/mcp.http.json`：

```json
{
  "mcpServers": {
    "yapi-mock": {
      "url": "http://那台机器的内网IP:43181/mcp",
      "headers": {
        "Authorization": "Bearer 和服务器上MCP_HTTP_AUTH_TOKEN一样"
      }
    }
  }
}
```

同事拿不到 YApi 密码，但写出的 Mock 都算服务器上那个账号。连真 YApi 时必须设 `MCP_HTTP_AUTH_TOKEN`，不要把端口开到公网。

---

## 四、Cursor 里能做什么

| 你想做的事 | 对应工具 |
| --- | --- |
| 不知道项目 ID | `yapi_list_projects` |
| 按路径/标题找接口 | `yapi_search_interfaces` |
| 看/改接口返回体（普通 Mock） | `yapi_get_interface_mock` / `yapi_update_interface_mock` |
| 看/改高级 Mock 脚本 | `yapi_get_advanced_mock` / `yapi_update_advanced_mock` |
| 看/增/删 Mock 期望 | `yapi_list_mock_cases` / `yapi_save_mock_case` / `yapi_delete_mock_case` |
| 打 mock 地址确认是否生效 | `yapi_call_mock` |

YApi Mock 优先级：**期望 > 脚本 > 接口返回体**。项目 Token 只能改返回体；脚本和期望必须登录态。

---

## 五、常见问题

**MCP 起不来**  
`args` 不是绝对路径，或还没 `npm run build`，本机没有 `dist/server/mcp-stdio.js`。

**搜接口说缺 projectId**  
补 `YAPI_PROJECT_ID`，或 Token 写成 `项目ID:token`。也可以先让助手调 `yapi_list_projects`。

**改脚本提示请登录**  
只配了项目 Token 不够。补 `YAPI_EMAIL` + `YAPI_PASSWORD`，或 `YAPI_COOKIE`。

**改了但前端还是旧数据**  
用 `yapi_call_mock` 打 `${YAPI_BASE_URL}/mock/{项目ID}{接口路径}`。浏览器缓存或本地代理没指到 YApi mock 时，页面不会变。
