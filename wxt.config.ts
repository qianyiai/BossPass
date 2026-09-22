import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  srcDir: 'src',
  outDirTemplate: 'bosspass-{{browser}}-mv{{manifestVersion}}',
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: 'BossPass — AI Job Copilot',
    description:
      'AI 求职助手：岗位分析 · 匹配度 · 针对岗位优化简历 · 生成打招呼 · 聊天辅助 · 申请跟踪',
    permissions: ['storage', 'sidePanel', 'activeTab'],
    host_permissions: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
    web_accessible_resources: [
      {
        resources: ['injected.js'],
        matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
      },
    ],
    action: {
      default_title: '打开 BossPass',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    ...(browser === 'firefox' ? {} : {}),
  }),
})
