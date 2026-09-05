# 慢光 · 数字油画室

M1 本地应用：在同一画室中选色、用平头笔真实绘画、覆盖/基础 RYB 混色、撤销最近 20 笔，并导出原生 1024×1024 PNG。页面与笔触均由代码实时绘制，没有预制作品或运行时模型调用。

## GitHub Pages 部署

站点地址：[慢光数字油画室](https://yydshly.github.io/0906_codexgpt6_project/)。用户已明确批准本次推送与部署；M1 报告中“不推送、不部署”描述的是上一阶段的历史状态。

推送到 main 后，`.github/workflows/deploy.yml` 用锁定依赖构建、执行引擎测试，再将 dist 发布到 GitHub Pages。部署配置通过 `DEPLOY_BASE_PATH=/0906_codexgpt6_project/` 设置资源路径；本地开发仍使用根路径与 5174 端口。也可以在 GitHub Actions 中手动运行该工作流。

线上仅发布应用构建产物；产品资料、M1 截图、录像和验收报告保留在仓库中。公开站点没有后端，画作仍只保存在当前页面内存中，请在刷新或离开前导出。

## 启动

本次实际环境：Windows 11，Node 22.15.0，npm 10.9.2。

```powershell
Set-Location E:\0906_codexgpt6_project
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

本地地址：[http://127.0.0.1:5174/](http://127.0.0.1:5174/)。启动日志保存在 artifacts/m1/server-5174.log。原计划的 5173 被已有“理想书房”项目占用，因此本项目使用 5174，没有停止或修改另一个服务。

点击右侧颜料，在画布内按住鼠标拖动。大小控制笔宽，上色量控制覆盖和堆积；“混色”在当前笔触接触到底色的位置进行近似混合。“撤销”或 Ctrl+Z 撤销一笔；清空需确认，也能撤销。导出只包含真实画作与画布材质。

作品目前只在当前页面内存中；离开或刷新前请导出。本地持久化、主题步骤、签名和完成页属于未实施的 M2。

## 验证

```powershell
npm run typecheck
npm run build
npm run test:engine
npm run test:e2e
npm run test:perf
```

Playwright 配置使用本机 Chrome、1440×900 视口，自动启动或复用 5174 端口服务。需要安装 Chrome；录像需要 Playwright 的 FFmpeg，如本机未准备可执行 `npx playwright install ffmpeg`。本次复用了既有 Chrome，没有下载浏览器矩阵。性能测试单独运行并关闭录像；不要同时开多个基准。

test:e2e 保留真实鼠标操作录像、固定笔触和下载文件。test:perf 用同一绘画引擎和渲染器运行四组 60 秒基准（32/96 像素 × 空/满历史），另做五轮历史内存循环、完整鼠标事件路径 60 秒基准和录像解码验证。完整性能命令约五分钟；它测量帧间隔，不是硬件输入延迟。

结果与证据见 [M1_REPORT.md](M1_REPORT.md) 和 artifacts/m1。视觉与手感 V4 待用户确认。

## 实现边界

- React/TypeScript/Vite 管页面，Pointer Events 处理输入，CPU RGBA8 + Uint16 高度数组保存作品，原生 WebGL2 由局部高度显示材质。
- 单笔固定种子和方向刷毛；基础混色为 RYB 近似，没有干燥、跨区携色或光谱物理模拟。
- 最近 20 笔完整快照有界；颜色与高度同时恢复。参考图只用于审阅，不打包进应用。
- WebGL 不可用/丢失时以 Canvas 2D 简化显示，可继续绘画、混色、撤销和导出，缺少局部光照；恢复材质后重新上传完整状态。
- 本轮仅 M1，不含账号、收费、社区、图层平台或云服务，不发布、不部署、不推送。

仅开发模式且显式 `?test=1` 提供自动化诊断入口；`?test=1&fallback=1` 用于降级测试，生产构建不会开放这些入口。
