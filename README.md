# BossPass — AI Job Copilot

AI 求职助手浏览器插件。第一阶段支持 **BOSS 直聘**，架构上通过平台 Adapter 抽象，未来扩展 LinkedIn / Indeed / SEEK / 猎聘 / 智联 / 前程无忧。

## 产品定位

不是"AI 简历生成器"，也不是"自动投递机器人"，而是完整的求职 Copilot：

```
发现岗位 → 理解岗位 → 分析匹配 → 针对岗位修改简历 → 生成打招呼 → 联系 HR → 辅助聊天 → 跟进 → 管理申请
```

核心原则：

1. Master Resume 永不覆盖，每个岗位生成独立 Resume Version
2. AI 不允许编造经历（资料中没有的能力走"我有相关经验 → 追问 → 确认"流程）
3. 所有 AI 输出（简历修改、打招呼、聊天回复）必须用户确认后才使用
4. 简历 / API Key / 申请记录本地保存
5. 第一版重点：把**单个岗位**的求职体验做完整、可靠，不做无人值守批量投递

## 技术栈

WXT · Vue 3 · TypeScript · Tailwind CSS 4 · Vercel AI SDK · Zod · IndexedDB · Chrome Storage

BOSS 页面集成方案参考了 [Ocyss/boss-helper](https://github.com/Ocyss/boss-helper) 的已验证实现（Vue Hook、注入架构、wapi 接口），详见 [docs/boss-helper-reference.md](docs/boss-helper-reference.md)。本项目为独立实现，未复制其代码。

## 开发

```bash
pnpm install
pnpm dev        # Chrome 开发模式（加载 .output/chrome-mv3）
pnpm build      # 生产构建
pnpm compile    # 类型检查
pnpm zip        # 打包上架 zip
```

## 目录

```
src/
  adapters/     平台适配器（boss/ 第一个实现；核心只依赖统一 Job Schema）
  ai/           Provider（OpenAI 兼容）+ prompts/ + agents/（按任务分配模型）
  resume/       Resume Schema、PDF 解析、版本管理、Diff、PDF 导出
  jobs/         统一 Job Schema
  applications/ 申请跟踪
  storage/      IndexedDB + Chrome Storage
  entrypoints/  background / content(ISOLATED) / injected(页面 world) / sidepanel UI
  components/   Side Panel 组件
  message/      注入桥与扩展内部消息协议
```

## 使用流程

1. 安装插件，打开 Side Panel
2. 上传 PDF 简历 → 解析为 Master Resume（可编辑）
3. 配置 AI（OpenAI 兼容 API：OpenAI / DeepSeek / Kimi / GLM / Qwen / OpenRouter…）
4. 打开 BOSS 岗位页 → 自动识别岗位 → 「分析岗位」看匹配度/优劣势/风险
5. 「优化简历」→ 逐条审阅 Diff → 保存为岗位 Resume Version → 导出 ATS PDF
6. 「生成打招呼」→ 选择风格 → 预览/编辑 → 确认后填入聊天框发送
7. HR 回复后用「聊天辅助」生成回复建议（资料中没有的经验不会被编造）
8. 「申请跟踪」看全流程状态

## 风险提示

BOSS 页面集成本质上依赖其前端私有实现（Vue 实例结构、wapi），可能随改版失效；请控制使用频率，遵守平台规则。本项目仅供学习交流。
