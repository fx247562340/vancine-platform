# CLAUDE.md — Project-level Instructions

## MCP: mimo-image-recognition

When the user requests any image understanding task — including but not limited to: reading, describing, comparing, OCR, text extraction, analyzing, classifying, or answering questions about an image — **always** use the `understand_image` tool provided by the `mimo_image_recognition_mcp` MCP server.

Do NOT use the `Read` tool, `cat`, or any file-reading command to open binary image files (.png, .jpg, .webp, etc.). Doing so will crash the session. Use `understand_image` exclusively.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `prompt` | Yes | Task description (e.g. "提取图中文字", "描述这张图片") |
| `image_path` | No | Single local image path |
| `image_url` | No | Single image URL |
| `image_paths` | No | Array of local image paths (multi-image) |
| `image_urls` | No | Array of image URLs (multi-image) |
| `system_prompt` | No | Optional system prompt |
| `temperature` | No | Default 0.2 |
| `max_tokens` | No | Default 12000 |

### Examples

- Single local image: `image_path: "/Users/xin/test/screenshot.png"`
- Single URL: `image_url: "https://example.com/photo.jpg"`
- Multiple images: `image_paths: ["/Users/xin/a.png", "/Users/xin/b.png"]`

---

## Pending Tasks (2026-06-08)

1. ~~**BUG: 操练场分组不可选择**~~ — group 下拉框无法选择/切换分组 ✅
2. ~~**BUG: 音频模型路由错误**~~ — 火山方舟 TTS 接入完成，使用 v3 HTTP Chunked API ✅
3. ~~**BUG: 操练场 Doubao 文本模型调用失败**~~ — 火山方舟文本模型（Doubao-pro/lite 系列）请求报错，需排查路由或参数格式 ✅
4. 3D 模型浏览器内预览（model-viewer / three.js）
5. 消息中视频/图片的富媒体渲染
6. ~~图片粘贴上传 → 实现后测试图生图（Seedream edits）和图生视频（Seedance i2v）~~ ✅
7. ~~模型标签分类 + 英文描述~~ ✅
8. ~~3D 供应商信息和图标~~ ✅
9. ~~**模型广场按类型筛选**~~ — 补全模型信息后，支持按文本/图片/视频/音频/3D 等类别筛选 ✅
10. **需求验证（P0）** — waitlist 页面 + 社区投放 + 问卷 + 访谈，14 天验证开发者付费意愿
11. ~~**页签标题显示 "new-api"**~~ — 浏览器 tab 标题改为 Vancine ✅
12. ~~**多语言列表裁剪**~~ — 仅支持简体中文和英语 ✅
13. ~~**首页 API 地址显示错误**~~ — 已设置 ServerAddress 为 `https://vancine.com`，用户调用地址为 `https://vancine.com/v1`；`api.vancine.com` 为废弃旧域名，仅保留 301 跳转 ✅
14. ~~**语言切换按钮显示 i18n key**~~ — 已修复 ✅
15. ~~**首页中英文切换适配**~~ — classic 主题首页已做 i18n 适配 ✅
16. ~~**完善平台接入文档**~~ — 编写 API 接入指南 ✅
17. ~~**创建 About 页面**~~ — 填充关于页面 ✅
18. ~~**网站 UI 整体优化**~~ — UI 已优化 ✅
19. ~~**使用日志查看请求详情**~~ — 可查看请求详情 ✅
20. ~~**BUG: 日期组件未跟随语言切换**~~ — 已配置日期库 locale ✅
21. ~~**去 new-api 化**~~ — 已替换为 Vancine 品牌 ✅
22. ~~**百炼渠道模型配置**~~ — 新增 Bailian 和 Bailian-third 渠道，10 个模型 ✅
23. ~~**模型信息英文化**~~ — 全部 27 个模型描述英文，供应商英文 ✅
24. ~~**BUG: 编辑令牌模型列表不显示**~~ — 后端返回新格式 `[{model, endpoints}]`，前端 `loadModels` 未兼容 ✅
25. ~~**BUG: 编辑令牌分组不回显**~~ — `Form.Slot` 不注册字段，改用 `Form.Select` with `field='group'` ✅
26. ~~**BUG: 操练场 loadGroups 依赖循环**~~ — 移除不必要的 `inputs.group` 依赖 ✅

---

## gstack

Use /browse from gstack for all web browsing. Never use mcp\_\_claude-in-chrome\_\_\* tools.

Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review,
/design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy,
/canary, /benchmark, /browse, /open-gstack-browser, /qa, /qa-only, /design-review,
/setup-browser-cookies, /setup-deploy, /setup-gbrain, /sync-gbrain, /retro, /investigate,
/document-release, /document-generate, /codex, /cso, /autoplan, /pair-agent, /careful, /freeze,
/guard, /unfreeze, /gstack-upgrade, /learn, /spec, /health.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
