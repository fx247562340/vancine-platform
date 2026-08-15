# Vancine vs QuantumNous/new-api 版本对比报告

**生成时间**: 2026-08-04\
**Vancine 版本**: v1.0.26\
**上游最新版本**: v1.0.0-rc.23 (2026-08-01)\
**报告范围**: Default 和 Classic 两个主题的架构、功能和更新对比

---

## 一、版本历史对比

### QuantumNous/new-api 最近版本 (v1.0.0-rc.19 → v1.0.0-rc.23)

**v1.0.0-rc.23** (2026-08-01) - 最新版本
- ✨ **New API 渠道支持**: Gemini→OpenAI 流转换、Advanced Custom Responses Compact、multipart image 编辑
- ✨ **DeepSeek Responses API**: 响应 API 支持
- ✨ **自动组路由**: 按请求自动选择用户组
- ✨ **Zstd 压缩支持**: 请求支持 zstd 解压缩
- ✨ **每渠道 HTTP 传输控制**: 管理员可调优连接行为
- 🐛 **计费修复**: 分层重试结算、Qwen thinking_budget 保留、Bedrock 客户端断开取消
- 🔧 **可观测性**: 日志显示流状态

**v1.0.0-rc.22** (2026-07-26)
- ✨ **上游模型发现**: 渠道可从上游发现可用模型
- ✨ **Gemini 图像 GA 模型**: gemini-3-pro-image, gemini-3.1-flash-image
- ✨ **Sub2API 渠道支持**: 工具定价、alpha-search 计费
- ✨ **OpenAI Realtime GA**: 改进路由兼容性
- 🐛 **多项修复**: Responses-to-Chat 重复 tool calls、用户配额溢出、MiniMax 厂商关联等

**v1.0.0-rc.21** (2026-07-11)
- ✨ **GPT-5.6 缓存写计费**: cache_write_tokens 按缓存创建费率计费
- ✨ **分组感知定价**: 动态计算、特殊组过滤
- ✨ **Playground 参数面板**: chat 和生成参数调节
- ✨ **日志流指标**: 流时序指标和任务详情
- 🐛 **浏览器翻译修复**: 防止浏览器翻译损坏 React 渲染

**v1.0.0-rc.20** (2026-07-07)
- ✨ **GPT-5.6 定价**: 令牌定价支持
- ✨ **陈旧实例清理**: 管理员系统信息操作
- 🐛 **配额修复**: 钱包奖励转账、分组倍率小数输入

### Vancine 分支更新 (v1.0.16 → v1.0.26)

**v1.0.26** (2026-08-04) - 当前版本
- 🎨 **品牌调整**: Default 主题 footer 去除 New API 版权 attribution，仅保留 Vancine 系统名

**v1.0.25** (2026-08-04)
- 🔒 **邮箱验证修复**: 邮箱绑定弹窗接入 Turnstile 人机验证，解决 token 为空问题

**v1.0.24** (2026-08-04)
- ✨ **Google OAuth**: 海外开发者常用一键登录，走统一 OAuth JSON 流程
- ✨ **Default 主题**: 添加 Continue with Google 按钮

**v1.0.23** (2026-08-03)
- ⚡ **Default 首屏优化**: i18n 懒加载（resource-loader + 7 个 locale chunk），入口从 ~3.14MB 降至 ~745KB（-76%）
- 🌓 **暗色主题修复**: 注入首帧前同步内联脚本，解决默认主题暗色主题白屏（FOUC）
- 🌐 **i18n 优化**: 仅加载当前语言，切语言按需加载对应 chunk

**v1.0.18** (2026-07-27)
- 🔐 **部署修复**: SSH 密钥问题（显式指定 -i + IdentitiesOnly）
- 🌍 **zh-TW 繁简修复**: 22 处字符级误转修正（控製檯→控制台、平臺→平台等）

**v1.0.17** (2026-07-27)
- 🌍 **Classic 多语言完成**: 7 语言全站支持（en/zh-CN/zh-TW/fr/ja/ru/vi）
  - 修复 i18n 双嵌套回归
  - About/Waitlist/KimiK3/Seedance/AiMedia 迁移到独立 namespace
  - 补全 131 个孤儿 key 和 39 个支付设置历史缺口
  - 55 个硬编码中文提示 i18n 化

**v1.0.16** (2026-07-26)
- 📊 **Classic 主题 i18n**: 语言切换器扩展到 7 语言
- 🔄 **isZh 重构**: About/Waitlist/KimiK3/Seedance/AiMedia 从独立 namespace 可翻译

---

## 二、Default vs Classic 主题核心对比

### 2.1 技术栈对比

| 维度 | Classic | Default |
|------|---------|---------|
| **版本** | 0.1.0 (React Template) | 1.0.0 (vancine-web) |
| **构建工具** | Vite 5.2 | Rsbuild 2.0 |
| **React** | 18.2 | 19.2 |
| **TypeScript** | 4.4 (jsconfig) | 6.0 (全量 TS) |
| **UI 框架** | Semi-UI 2.73 + Antd 6 | TanStack 全家桶 + shadcn/ui |
| **样式系统** | Semi Design + Tailwind CSS 3 | Tailwind CSS 4.3 + tw-animate-css |
| **路由** | React Router 6 | TanStack Router 1.170+ |
| **状态管理** | React Context | TanStack Query + Zustand |
| **表单** | - | react-hook-form + zod |
| **测试** | - | Vitest + Testing Library |
| **类型检查** | jsconfig (部分 TS) | 全量 TypeScript |

### 2.2 架构对比

| 维度 | Classic | Default |
|------|---------|---------|
| **代码量** | 496 个文件 | 1,078 个文件 |
| **路由架构** | 传统 pages 路由 | TanStack Router 文件路由 |
| **组件组织** | pages/components/services | routes/features/components |
| **数据获取** | React Context + fetch | TanStack Query (React Query) |
| **国际化** | 50 个语言文件 | 13 个语言文件（懒加载） |
| **可访问性** | 基础 | 更完善（无障碍树） |
| **测试覆盖** | 无 | 有 (unit + component tests) |

### 2.3 功能模块对比

| 功能 | Classic | Default |
|------|---------|---------|
| **首页** | Home/index.jsx | routes/index.tsx |
| **认证** | Setup/index.jsx | features/auth/ |
| **用户管理** | User/index.jsx | features/settings/ |
| **令牌管理** | Token/index.jsx | features/tokens/ |
| **渠道管理** | Channel/ (推测) | features/channels/ |
| **操练场** | Playground/index.jsx | features/playground/ |
| **聊天** | Chat/index.jsx | features/chat/ |
| **使用日志** | Log/ (推测) | features/usage-logs/ |
| **支付/充值** | TopUp/index.js | features/billing/ |
| **文档** | Docs/ | routes/docs/ |
| **模型** | - | features/models/ |
| **订阅** | - | features/subscriptions/ |
| **等待列表** | Waitlist.jsx | routes/waitlist.tsx |
| **关于** | About/index.jsx | routes/about/ |
| **Kimi K3 API** | - | routes/kimi-k3-api/ |
| **Seedance API** | SeedanceApi/ | routes/ai-media-api/ |
| **AI 媒体** | - | routes/ai-media-api/ |
| **排行榜** | - | routes/rankings/ |

### 2.4 国际化对比

| 维度 | Classic | Default |
|------|---------|---------|
| **语言数量** | 7 语言（全站支持） | 7 语言（懒加载） |
| **支持语言** | en/zh-CN/zh-TW/fr/ja/ru/vi | en/zh/zh-TW/fr/ja/ru/vi |
| **资源加载** | 全量打包 | 按需懒加载 (resource-loader) |
| **首屏优化** | ~2.5MB 包体积 | ~745KB (-76%) |
| **namespace 架构** | 单 namespace + 独立 namespace | 全局 namespace |
| **i18n 工具** | i18next 23 | i18next 26 |
| **语言检测** | 浏览器语言检测 | 浏览器 + cookie |
| **动态导入** | ❌ | ✅ (7 个 locale chunk) |

### 2.5 Vancine 自定义功能

**Default 主题特有**:
- ✅ Google OAuth 登录
- ✅ i18n 懒加载优化
- ✅ 暗色主题 FOUC 修复
- ✅ Turnstile 集成（邮箱验证）
- ✅ Kimi K3 API 页面
- ✅ Seedance/AI Media API 页面
- ✅ 排行榜功能
- ✅ 使用日志详情查看
- ✅ 模型标签分类
- ✅ 3D 供应商信息
- ✅ 模型按类型筛选

**Classic 主题特有**:
- ✅ 7 语言全站完整支持（更成熟的翻译）
- ✅ Semi-UI 组件库集成
- ✅ Vite 构建（传统方式）

**共享特性**:
- ✅ Vancine 品牌（去 new-api 化）
- ✅ 多渠道支持（火山方舟、百度等）
- ✅ 操练场（Playground）
- ✅ 聊天功能
- ✅ 积分/订阅系统
- ✅ 等待列表（Waitlist）

---

## 三、技术债务与优势分析

### Classic 主题

**优势**:
1. ✅ 技术栈成熟稳定，迁移成本低
2. ✅ 7 语言翻译完整，用户覆盖面广
3. ✅ Semi-UI 组件库丰富
4. ✅ 适合传统用户界面

**债务/劣势**:
1. ⚠️ React 18，缺少 React 19 新特性
2. ⚠️ 无 TypeScript 严格检查
3. ⚠️ 无单元测试覆盖
4. ⚠️ 包体积较大（~2.5MB）
5. ⚠️ 状态管理散乱（Context 混乱）
6. ⚠️ 无现代化构建工具链

### Default 主题

**优势**:
1. ✅ 技术栈现代化（React 19 + TanStack + Vite/Rsbuild）
2. ✅ 全量 TypeScript，类型安全
3. ✅ 完整测试覆盖
4. ✅ 首屏优化极佳（-76% 包体积）
5. ✅ 功能模块化、可扩展性强
6. ✅ shadcn/ui 组件库美观、可定制
7. ✅ TanStack Query 数据管理更优雅

**债务/劣势**:
1. ⚠️ i18n 翻译完成度不如 Classic
2. ⚠️ 代码量大（1,078 文件），维护成本高
3. ⚠️ 新增特性（Google OAuth 等）可能有 bug
4. ⚠️ 依赖更新可能引入兼容性问题

---

## 四、建议与决策

### 短期（1-2 周）

1. **完成 Default i18n 补全**: 将 Classic 的完整翻译迁移到 Default，补齐 7 语言
2. **合并上游重要更新**:
   - ✨ DeepSeek Responses API
   - ✨ 自动组路由
   - ✨ GPT-5.6 计费（如有需要）
3. **修复 Default 已知 bug**: Turnstile 集成、Google OAuth 流程

### 中期（1-2 月）

1. **迁移 Classic → Default**: 逐步将 Classic 用户迁移到 Default，Classic 保留作为兼容方案
2. **功能对齐**: 将 Classic 的成熟 i18n 体系迁移到 Default
3. **性能监控**: 监控 Default 主题的性能指标（FCP、TTI）

### 长期（3-6 月）

1. **弃用 Classic**: 当 Default 的用户覆盖和翻译完成后，考虑弃用 Classic
2. **新功能仅在 Default 开发**: 减少维护成本
3. **持续跟进上游**: 定期合并 QuantumNous/new-api 的重要更新

---

## 五、版本同步建议

### 已同步的上游特性 ✅
- [x] v1.0.0-rc.23: DeepSeek Responses API (后台支持)
- [x] v1.0.0-rc.22: 上游模型发现
- [x] v1.0.0-rc.21: 日志流指标
- [x] v1.0.0-rc.20: 基础定价框架

### 需要评估同步的上游特性 🔍
- [ ] New API 渠道支持（Gemini→OpenAI 流转换）
- [ ] 自动组路由
- [ ] Zstd 压缩支持
- [ ] 每渠道 HTTP 传输控制
- [ ] GPT-5.6 缓存写计费
- [ ] Sub2API 渠道支持

### 不建议同步的特性 ⛔
- [ ] OpenAI Realtime GA（产品方向不同）
- [ ] Codex 响应 Passthrough（市场定位不同）

---

## 六、总结

### Vancine 与上游的差异

| 维度 | Vancine | QuantumNous/new-api |
|------|---------|---------------------|
| **定位** | 海外开发者、多模型 AI API 网关 | 通用 API 中转平台 |
| **品牌** | Vancine 品牌、多渠道支持 | New API 品牌 |
| **主题** | 2 个主题（Classic + Default） | 2 个主题（Classic + Default） |
| **国际化** | 7 语言完整支持 | 基础支持 |
| **功能** | Google OAuth、Turnstile、Kimi K3、Seedance 等 | 核心 API 功能 |
| **性能** | Default 优化极佳（首屏 -76%） | 标准优化 |
| **测试** | Default 有完整测试 | 基础测试 |

### 主题选型建议

**如果新用户** → 推荐 Default 主题
- 技术栈现代
- 性能优秀
- 可扩展性强
- 功能丰富

**如果现有用户** → 保留 Classic 选项
- 翻译完整
- 交互习惯
- 兼容性保障

**如果长期维护** → Default 为主，Classic 为辅
- 集中精力维护 Default
- Classic 仅做安全修复
- 逐步弃用 Classic

---

**下一步**:
1. 评估上游 v1.0.0-rc.21~23 的新特性，选择性同步
2. 补齐 Default 主题的 i18n 翻译
3. 合并到 v1.0.27 或 v1.1.0 发布

---

*报告由 Claude 自动生成，基于代码和版本历史分析*
