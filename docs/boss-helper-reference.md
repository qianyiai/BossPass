# boss-helper 技术分析（Ocyss/boss-helper）

> 本文档是 BossPass 项目的内部技术分析，基于对 `Ocyss/boss-helper` 源码的直接阅读（2026-09-22，main 分支）。
> 目的：在实现自己的 Boss Adapter 之前，充分理解其已验证过的 BOSS 页面集成方案，避免从零踩坑。
> 结论先行：**参考与重新实现，不整库复制**。其许可为 MIT，但 README 声明"禁止商用"，两者冲突，故本项目不复制其代码，只吸收技术方案。

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│ BOSS 页面 (zhipin.com, Vue 2 应用)                           │
│                                                             │
│  injected.js (defineUnlistedScript, PAGE/MAIN world)        │
│   ├─ hook Vue 实例数据/方法 (useHookVueData/useHookVueFn)     │
│   ├─ 读取 window._PAGE (uid/token/用户信息)                   │
│   ├─ window.Cookie.get('bst') 取 Zp_token                    │
│   ├─ 调 BOSS wapi REST 接口                                  │
│   └─ MQTT(protobuf) 直发聊天消息                              │
│        ▲▼ CustomEvent('_boss-helper-message_', JSON)        │
│  content.ts (ISOLATED world, document_start)                │
│   ├─ injectScript('/boss.js') 注入并建立 comctx 桥            │
│   └─ counter 代理 (存储/通知/跨域fetch 转发到 background)      │
└─────────────────────────────────────────────────────────────┘
        ▲▼ browser.runtime messaging (comctx defineProxy)
┌─────────────────────────────────────────────────────────────┐
│ background.ts                                               │
│  └─ BackgroundCounter: storage(@webext-core/storage)         │
│     + IndexedDB('ExtensionGlobalDB'/'images') 存图片          │
└─────────────────────────────────────────────────────────────┘
        ▲▼
UI: Vue 3 + Nuxt UI + Tailwind，挂在 Custom Elements
   (`boss-helper-job`/`boss-helper-menu`) 的 Shadow DOM 里
```

技术栈：WXT + Vue 3 + Nuxt UI + Tailwind（`vite-plugin-tailwind-shadowdom`）+ Vercel AI SDK v5（`ai` + `@ai-sdk/openai`）+ `comctx`（跨上下文 RPC）+ `mqtt` + `protobufjs`。

## 2. WXT Entry Points

- `src/entrypoints/content.ts`：`defineContentScript({ matches: ['*://zhipin.com/*','*://*.zhipin.com/*'], runAt: 'document_start', world: 'ISOLATED' })`。main() 中 `injectScript('/boss.js', { keepInDom: true, modifyScript })` 注入页面脚本并绑定通信适配器。
- `src/entrypoints/boss/index.ts`：`defineUnlistedScript`，即注入到页面的主逻辑（boss.js）。构建产物 `boss.js` 在 manifest 里声明为 `web_accessible_resources`。
- `src/entrypoints/background.ts`：`defineBackground`，提供 `BackgroundCounter`（存储/通知/代理 fetch/IndexedDB 图片）。
- `src/entrypoints/options/`：独立设置页。
- `wxt.config.ts`：`srcDir:'src'`，`@wxt-dev/module-vue`，vite 里挂 `@nuxt/ui/vite`、`vue-jsx`、`tailwindShadowDOM`；manifest 权限仅 `storage`+`notifications`，`host_permissions: http(s)://*/*`。

## 3. Content Script 注入机制（重点）

1. Content script 跑在 **ISOLATED world**，无法访问页面的 `window._PAGE`、`window.Cookie`、Vue 实例。
2. 通过 `injectScript('/boss.js')` 把 unlisted script 以 `<script>` 标签注入 **页面 world**，获得完整页面上下文。
3. 两侧通信用 **`comctx` 库**：content 侧 `ProvideContentScriptAdapter` 把 message `JSON.stringify` 后在 script 元素上派发 `CustomEvent('_boss-helper-message_')`；注入脚本侧监听同一事件。Firefox 需要 `cloneInto`。
4. 再叠加一层：content ↔ background 也用 `comctx defineProxy`（`browser.runtime.sendMessage`），形成三级代理链：
   - `__boss-helper-content__`（页面 ↔ content）：存储读写、通知、图片
   - `__boss-helper-background__`（content ↔ background）
5. 存储默认走 `sync:` 前缀（`@webext-core/storage`），大对象（图片）走 background 的 IndexedDB。

**BossPass 采纳**：同样的 ISOLATED + 注入 + CustomEvent(JSON) 桥。我们用更轻量的自研桥（`postMessage`-free，CustomEvent + JSON，协议常量集中管理），不引入 comctx 依赖（少一层抽象，协议可自己掌控）。

## 4. BOSS 页面数据获取方法（重点）

核心思路：**Hook Vue 实例，而不是解析 DOM**。BOSS 招聘端是 Vue 2 应用：

- `getRootVue()`（`src/composables/useVue.ts`）：轮询 `document.querySelector('#wrap').__vue__`（300ms 间隔，20s 超时）拿根 Vue 实例。
- `useHookVueData(selectors, key, dataRef, update)`：找到容器元素（`#wrap .page-job-wrapper` / `.job-recommend-main` / `.page-jobs-main`）的 `__vue__`，读出 `jobVue[key]`，然后 `Object.defineProperty` 覆盖 setter（先 `__lookupSetter__` 保存原 setter）实现响应式监听。
- `useHookVueFn(selectors, key)`：直接取实例方法引用（`pageChangeAction`/`searchJobAction`/`onSearch`/`clickJobCardAction`）。
- Hook 的数据 key：`pageVo`、`hasMore`、`jobDetail`、`jobList`。
- 路由变化：`rootVue.$router.afterHooks.push(...)` 后重新 `onMount(path)`。

页面全局对象：
- `window._PAGE.encryptUserId`（求职者加密 id）、`token`、`uid`、`showName`、`largeAvatar`。
- `window.Cookie.get('bst')` → 请求头 `Zp_token`（BOSS wapi 的鉴权 token）。

## 5. Job Detail 获取流程（重点）

列表项 `BossZpJobItemData`（hook 自 jobList）关键字段：
`securityId`、`encryptJobId`、`jobName`、`salaryDesc`、`jobLabels`（经验/学历）、`skills`、`jobExperience`、`jobDegree`、`cityName/areaDistrict/businessDistrict`、`brandName/brandLogo/brandScaleName/brandIndustry/brandStageName`、`welfareList`、`contact`（已沟通）、`goldHunter`、`bossName/bossTitle/bossAvatar/encryptBossId/bossOnline`、`encryptBrandId`、`lastModifyTime`、`gps`。

获取完整详情（`onJobCardClick`）：
1. 调 hooked 的 `clickJobCardAction(jobitem)` 让页面自己走真实点击流程（这会触发页面渲染详情 + 内部数据更新，最不容易触发风控）。
2. 轮询 hooked `_jobDetail` ref，直到 `jobDetail.lid === jobitem.lid`（100ms 间隔，60s 超时）。
3. 详情 `BossZpDetailData` 关键字段：
   - `jobInfo`：`jobName/positionName/postDescription`（完整 JD 文本）、`locationName/address/longitude/latitude`、`experienceName/degreeName/salaryDesc`、`showSkills`
   - `bossInfo`：`name/title/brandName/certificated/activeTimeDesc/bossOnline/bossSource`
   - `brandComInfo`：`encryptBrandId/brandName/logo/stageName/scaleName/industryName/introduce/labels`
4. 职位唯一 key：`boss::${encryptJobId}`，链接 `https://www.zhipin.com/job_detail/${encryptJobId}.html`。

REST 直调接口（均在页面 world 发起，带 `Zp_token` 头）：
| 接口 | 方法 | 说明 |
|---|---|---|
| `wapi/zpgeek/job/detail.json?securityId&lid` | GET | 岗位完整详情（BossZpDetailData） |
| `wapi/zpgeek/friend/add.json?securityId&jobId` | POST | 加好友/打招呼（=投递），需处理 120/150 限额弹窗与"操作频繁"频控 |
| `wapi/zpchat/geek/getBossData`（FormData: bossId/securityId/bossSrc=0） | POST | HR 侧数据（`bossId` 数字 uid、weixin/mobile、bothTalked…） |
| `wapi/zppassport/get/wt` | GET | 聊天 WebSocket 密码 `wt2` |
| `wapi/zpupload/image/uploadSingle` / `quicklyUpload` | POST | 聊天图片上传 |

## 6. BOSS Chat 实现

`src/entrypoints/boss/chat/`：
- `GeekChatClientManager.connect()`：
  1. `GET wapi/zppassport/get/wt` 拿 `wt2`；
  2. `mqtt.connect('wss://ws6.zhipin.com/chatws', { clientId: 'ws-<uuid16>', username: `${token}|0`, password: wt, keepalive: 25, protocolVersion: 4, createWebsocket: 自定义带 wt 子协议 })`。
- `geek-chat-core.ts`：内嵌 BOSS 私有 Protobuf 协议（`cn.techwolf.boss.chat.ChatProtocol`：TechwolfMessage/TechwolfUser/TechwolfMessageBody…），`ProtoBufferMessage` 负责 encode/decode，`createTextMessage(stanza, { text })` 构造文本消息。
- WebSocket hook 方案（Proxy window.WebSocket 捕获 chatws）在其代码中**已被注释弃用**，改为自己主动建 MQTT 连接。

## 7. 消息发送流程

`BossHelperCtx.sendMessage(data, msgs)`：
1. 组 stanza：`uid = Number(getBossData().data.bossId)`（注意是数字 uid，不是 encryptBossId）、`friendSource = detail.bossInfo.bossSource`、`encryptUid = jobitem.encryptBossId`、`clientMid = Date.now()`（每条消息独立，否则被判重）。
2. 文本 → `msgBuilder.createTextMessage` → `encode`；图片 → 先上传拿 CDN URL。
3. `mqtt client.publish('chat', encoded, { qos: 1, retain: true })`。

打招呼的完整 workflow（`src/entrypoints/boss/delivery.ts`，依赖拓扑排序执行）：
`已沟通过滤 → 相同公司 → 相同HR → 岗位名 → 公司名 → 薪资 → 公司规模 → 猎头 → 岗位详情获取 → 活跃度 → HR职位 → 地址 → 好友状态 → 工作内容 → 金牌面试官 → 高德 → AI筛选 → 岗位投递(friend/add) → Boss信息获取 → 自定义招呼语 → AI招呼语(chatModel 生成 + sendMessage)`。

风控要点：各种 `delayDelivery*/delayMessageSending` 人为延时；错误分类 `LimitError`（150/日上限）、`RateLimitError`（操作频繁）、`PublishError`、`GreetError`；命中"120位"限额弹窗时自动补发 `actionLog/geek/chatremind.json` 确认请求。

## 8. AI Provider 架构

`src/composables/useModel/`：
- `openai.ts`：唯一 provider 实现。`createOpenAI({ baseURL, apiKey, headers })`，`conf.responses ? provider.responses(model) : provider.chat(model)`（Chat Completions / Responses 两种协议）。预置 BaseURL：openai / openrouter / deepseek / moonshot / 火山方舟等。
- 模型配置 `ModelConf = { key, name, color, data: { base_url, api_key, model, other: { timeout }, advanced: { json, stream, temperature, top_p, presence_penalty, frequency_penalty, extra_headers, extra_body, tool_choice, tools } } }`，多模型共存，存 `conf-model` key。
- `chatModel.ts`：
  - `createAgent(formDataAi, name, { json })`：按任务名（`filtering`/`greetings`/…）缓存 `ToolLoopAgent`（Vercel AI SDK v5 的 Agent 类），`json ? Output.json() : Output.text()`，`allowSystemInMessages: true`。**每个任务可绑定不同模型**。
  - `chat(agentName, data)`：Prompt 模板渲染（`renderTemplate(content, data)`，`{{ jobData.xxx }}` 占位符），先注入一条岗位 JD 的 system 消息，`agent.stream()` 后消费 `stream.toUIMessageStream()` 的 `reasoning-delta/text-delta` chunk 更新 `VueChatState`（实现 ai 的 ChatState 接口供 Nuxt UI 聊天组件渲染）。
- `useModel/index.ts`：模型列表 CRUD + 导入导出 + storage 持久化。

## 9. AI Greeting 流程

`handles.ts` 的 `aiGreeting` task：
1. 校验 `aiGreeting.model` 已配置 → `chatModel.createAgent(conf.formData.aiGreeting, 'greetings')`；
2. `chatModel.chat('greetings', data)` → 返回流，任务内取 `.text`；
3. `helper.sendMessage(data, msg)` 直接 MQTT 发出（无人值守模式）。

默认 Prompt 模板存于 `composables/conf/info.ts`（`aiGreeting.prompt`），含 system（角色+输出格式："招呼语字符串，无书信格式和前缀"）+ user（岗位信息模板变量）。AI 过滤（`aiFiltering`）类似但 `json: true`，输出打分。

## 10. Storage 架构

- 配置：VueUse `useStorageAsync` + 自定义 `ExtStorage` 适配器（经 counter 代理统一走 background，content/popup 共享）。
- 默认 `sync:` 区（小配置随账号同步），去重集合（sameCompany/sameHr）用 `local:` 区。
- 图片 blob：background IndexedDB（`ExtensionGlobalDB` / images store）。
- 模型列表、招呼语配置均为普通 JSON key。

## 11. 值得复用的代码/思路

1. **Vue Hook 三件套**（getRootVue / useHookVueData / useHookVueFn）——重新实现（约 100 行），思路完全采纳。
2. **ISOLATED + 注入脚本 + CustomEvent 桥**——采纳，协议自研。
3. **`clickJobCardAction` + 轮询 `jobDetail.lid` 的详情获取**——采纳（比裸 REST 更稳，风控友好）。
4. **BOSS wapi 接口清单与鉴权（Zp_token=Cookie bst）**——采纳。
5. **`friend/add.json` 的限额/频控错误分类**——采纳到 messenger 错误处理。
6. **Vercel AI SDK + 多模型配置 + 按任务绑定模型**——采纳同款组合。
7. **Prompt 模板渲染 + 配置外置**——采纳并升级为"文件化 Prompt + Zod 结构化输出"。
8. **Job 详情/列表的类型定义**（BossZpJobItemData/BossZpDetailData 字段）——作为我们 `adapters/boss/types.ts` 的字段参考。

## 12. 不应带入新项目的模块

1. **自动投递 Workflow 全家桶**（任务管线、批量翻页、相同HR去重、金牌面试官过滤、高德通勤）——我们是"单岗位深度求职 Copilot"，不做无人值守批量投递。
2. **Nuxt UI + Shadow DOM UI 架构**（页面内嵌面板）——我们用 Side Panel，无 Shadow DOM 样式隔离问题，技术栈减负。
3. **comctx 依赖**——自有桥替代。
4. **油猴脚本双版本兼容逻辑**。
5. MQTT 聊天收发我们**阶段性降级**（见下）。

## 13. 依赖 BOSS 私有实现的部分（高风险清单）

1. **Protobuf 聊天协议**（TechwolfMessage 等）——BOSS 私有协议，字段无文档，升级随时变。
2. **MQTT 端点与鉴权**（ws6.zhipin.com/chatws、wt2 token）。
3. **wapi 接口**（detail.json/friend add/getBossData）——非公开 API，参数与返回结构可能变化。
4. **Vue 2 实例结构**（`#wrap.__vue__`、`pageVo/jobDetail/jobList` 等组件 data key、`clickJobCardAction` 方法名）——前端重构即失效。
5. `window._PAGE` / `window.Cookie.get('bst')` 全局对象。
6. `friend/add.json` 的限额弹窗文案匹配（"您今天已与120位BOSS沟通"）——纯文案特征。

## 14. 未来容易失效的点与 BossPass 的对策

| 失效点 | 对策 |
|---|---|
| Vue data key / 方法名变化 | Hook 层做"探测+多候选"：每个 key 尝试多个候选名与容器 selector；失败时降级 REST 直调 / DOM 提取 |
| JD 改版 | BossAdapter 内聚所有 zhipin 知识，核心引擎只依赖统一 `Job` Schema |
| wapi 鉴权变化 | API 层统一注入 token，失败码集中处理 |
| MQTT/Protobuf 变化 | **第一版 Messenger 不走 MQTT**：采用"生成 → 预览 → 用户确认 → 自动填入聊天输入框 → 用户点击发送"，零协议依赖；MQTT 直发作为后续可选增强 |
| 限额/风控 | 不做自动批量；每次发送均需用户确认 |

## 15. BossPass 的差异化架构决策

1. **平台 Adapter 抽象**：`src/adapters/types.ts` 定义 `PlatformAdapter`（detect/parseJob/observe/sendGreeting/readChat），`src/adapters/boss/*` 是第一个实现；后续 LinkedIn/SEEK 等只加 Adapter。
2. **统一 Job Schema（Zod）**：Boss 原始数据 → `parseJob()` → 统一 Job，核心（分析/简历/打招呼）只认统一 Schema。
3. **AI 层与 UI/平台解耦**：`src/ai/prompts/*` 文件化管理 + Zod 结构化输出 + 多 Provider + 按任务分配模型。
4. **Resume 引擎独立**：Master Resume 永不覆盖；每个岗位生成 Version；AI 输出 diff（path/before/after/reason）由用户逐条裁决。
5. **反编造机制**：AI 输出必须标注证据来源；资料中不存在的能力（如 JD 要求 K8s 而事实库没有）走"我有相关经验→追问→确认"流程。
6. **本地优先**：简历、API Key、申请记录全部本地（IndexedDB/chrome.storage），不上传服务器。
