# 前端主题现状（Current Frontend Theme State）

- 记录日期：2026-08-26
- 适用范围：Vancine 平台前端（`web/`）
- 关联基线：main @ 128d4cb6（Image / Video Playground「Canvas Composer」视觉改造起点）

本文档修正并固定当前前端的目录与主题事实，作为后续视觉工作的记忆基线。历史日期型文档（`docs/reports/` 中带具体日期的评审、整改、升级报告等）仍是当时的历史证据，不因本文档而批量改写。

## 1. 当前目录与主题事实

- 当前运行时只有一套前端：Default 前端，源码位于 `web/src`。
- 根目录 `AGENTS.md` 曾引用 `web/default/src` 的旧路径，已于本次修正为 `web/src`。
- 工作树中不存在 `web/default/` 或 `web/classic/` 目录（它们存在于 git 历史中，不在当前运行时内）。
- 主题体系：`web/src/styles/theme.css` 定义全局主题 token（light `:root` 与 `.dark`），`web/src/styles/theme-presets.css` 定义可叠加的预设（颜色 / 圆角 / 密度），通过 `<body data-theme-preset=...>` 应用。
- UI 组件：`web/src/components/ui/`（Base UI 原语封装）；图标：`@hugeicons/core-free-icons` + `@hugeicons/react`。

## 2. Classic 与 Default 的关系

- Classic 是历史前端主题，仅作为历史代码与历史文档背景存在；当前运行时没有可切换的 Classic 主题。
- 新页面与新视觉改造禁止把 Classic 的基调（纯黑底、重紫色光晕、重玻璃拟态）当作默认风格。
- 引用 Classic 的场景只剩：历史记录、对比文档、以及尚未清理的历史代码路径。

## 3. Default light / Default dark 的定义

- Default light 与 Default dark 是同一套 Default 前端的两种 appearance，通过主题 token + `.dark` class 切换，不是两个前端。
- Default light 是主要设计验收基准；Default dark 必须通过现有主题 token 正常适配。
- 页面样式只允许使用主题 token（`--background`、`--card`、`--primary`、`--muted`、`--border` 等），禁止硬编码页面主题颜色。

## 4. Image / Video Playground 的 Canvas Composer 决策

- 两个操练场页面采用方向 A「Canvas Composer」：页面头部（标题 + Image/Video 路由导航 + Usage Logs 入口）→ 作曲器卡片（顶部工具条 / 主体（桌面左右两列：左为 120–144px Reference Tray，右为 Prompt）/ 底部 quick controls + Advanced Popover/Sheet）→ 结果画廊。
- 方向 B（Split Studio）与方向 C（Gallery First）不实施。
- 交互原型（2026-08-24 可视化）只定义视觉层级、空间关系与交互方向；原型中的假数据、渐变缩略图、固定模型参数、演示脚本一律不得进入生产代码。
- Reference Tray 规则：桌面两列（左 120–144px、右 Prompt）；移动回退为单列（Prompt 优先、Tray 紧凑展示）；Tray 内部资源多时折行或滚动，不能挤压 Prompt；375px / 320px 视口不得横向溢出。
- Image Advanced 规则：常驻在 Popover（桌面）/ Sheet（移动）中，不再以 `<details>` 占据正文；服务端字段错误如果属于高级字段，会自动打开对应面板。
- Video 任务状态：用户可见状态统一为 Queued / Submitting / Running / Completed / Failed / Cancelled。展示映射只调整；`useSubmission`、轮询状态机、服务端状态解析均不改。
- 共享视觉组件位于 `web/src/features/media-playground/components/`：
  - `MediaPlaygroundHeader`：页面标题 + Image/Video 导航 + Usage Logs 入口（+ 状态插槽）。Usage Logs 使用 `Button render={<Link/>}` 标准组合。
  - `CanvasComposerShell`：作曲器卡片外壳（toolbar / body / footer 三个展示插槽）。
  - `GenerationGalleryShell`：结果区头部（标题 + meta 插槽）。
  - 共享组件只接收展示数据与回调，不拥有 API 请求、secret、mutation、schema、capability resolver、serializer、轮询或资源校验。
- QuickParameterPill 改为现有 `Button` 变体的薄包装（variant `outline`），不重画 Button 外观；`data-icon` 只使用规范值 `inline-start` / `inline-end`，不直接写原生 `<select>`。
- 未进一步抽取的部分及原因：
  - ComposerToolbar / QuickParameterBar：已由 `CanvasComposerShell` 的 toolbar / footer 插槽覆盖，再包一层属于冗余。
  - ReferenceTray：Video 的三类资源 Popover 添加器与 Image 的拖拽上传交互模型差异大，仅共享「虚线容器」视觉语言，各自保留在功能目录内。
  - ResultCardShell：结果卡片直接使用既有 `Card` 原语与 token，无需新壳。
- `web/src/features/video-playground/components/` 下的 `media-playground-header.tsx` 与 `canvas-composer-shell.tsx` 已于本轮征得范总明确批准后删除；图片与视频页面现在直接引用 `@/features/media-playground/components/{media-playground-header,canvas-composer-shell}`。`media-playground` 不再依赖 `video-playground`，`image-playground` 亦不再跨域依赖 `video-playground`。`QuickParameterPill` 的唯一实现位于 `@/features/media-playground/components/quick-parameter-pill`。

## 5. 功能层与视觉层的边界

- 视觉重构冻结业务契约：出站请求体、表单单一状态源（RHF）、capability / profile 驱动的参数能力、参考资源校验（安全、格式、大小、时长、数量、64MB）、API Key secret 生命周期（仅内存、仅掩码展示）、批量提交 / 轮询 / 取消 / 重试、预览 / 打开 / 下载，全部不得因视觉改动而变化。
- 页面级契约测试（`video-playground/__tests__/page-level.test.tsx` 等）拦截真实 POST，作为出站 body 不变的证据；视觉层的回归测试只断言语义结构、可访问名称与状态展示。
- 新增用户可见文案必须走 `useTranslation()` 与 i18n 脚本流程（七种语言），禁止手改 `locales/*.json`。

## 6. 历史文档处理原则

- `docs/reports/` 中带日期的历史报告（升级评估、整改计划、发布检查等）是当时的历史证据，保持原样，不做批量改写。
- 与现状冲突的旧表述（如 `web/default/src` 路径、Classic 可选主题的假设），以本文档与更新后的 `AGENTS.md` / `web/AGENTS.md` 为准。
