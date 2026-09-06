# 慢光 · 数字油画室

本分支增加 **图片自动绘制 · 实验（E1）**：从当前画室右上角进入，选择本地 PNG/JPEG、确认构图，再观看现有油画引擎逐笔重绘；支持暂停、继续、从空白重播和真实 PNG 导出。自由绘画、旅行日落及其草稿仍保留。实验结果不自动保存，退出前请导出。

E1 仅在 `codex/e1-image-painting` 分支开发与推送，**没有覆盖线上 M2**。[E1 交付报告](E1_REPORT.md) · [本地固定样本与真实录像入口](artifacts/e1/index.html)。本地服务运行后访问 [E1 验收资料](http://127.0.0.1:5174/artifacts/e1/index.html)；画作与过程质量仍待用户确认。

用户确认的细节与可见笔尖补正见 [本轮报告](E1_REFINEMENT_REPORT.md) 和 [新旧三图对照与过程录像](http://127.0.0.1:5174/artifacts/e1/refinement/index.html)。同一照片、seed 1906，512 分析、五档细笔与薄颜料高度；笔尖沿真实路径逐点执行，可在一笔中间暂停、导出后继续。当前没有新增多风格，也不把算法阶段称为画师教学。

本轮新增笔头、沾色与局部绘制过程，见 [实施与验收报告](E1_BRUSH_PROCESS_REPORT.md) 与 [三图、沾色和完整 1× 重播录像](http://127.0.0.1:5174/artifacts/e1/brush-process/index.html)。粗细、方向和用色对应实际落笔，当前仍为扁刷族；没有增加风格或颜料耗尽模拟。固定三图的成品颜色和高度保留不变。

当前版本实现 M2：保留同页平头笔绘画、覆盖/基础 RYB 混色和最近 20 笔撤销，增加旅行日落四步引导、一个本地草稿的保存/恢复、签名与完成预览。导出为实际画作和签名的原生 1024×1024 PNG。没有预制作品或运行时模型调用。

[体验与验收总览](https://yydshly.github.io/0906_codexgpt6_project/review/) · [M1 实际验收](https://yydshly.github.io/0906_codexgpt6_project/artifacts/m1/index.html) · [M2 完整体验](https://yydshly.github.io/0906_codexgpt6_project/artifacts/m2/index.html) · [M2 验收报告](M2_REPORT.md)。M1 的 V4 人工视觉/手感仍待用户确认，M2 完整体验等待人工验收。

M1 的真实绘画、混色、撤销和导出已包含在当前 M2 画室中；M2 增加引导、草稿恢复、签名与完成。验收页用于查看历史证据，实际绘画请打开画室。画室右上角“体验与验收”新开资料页，保留原标签页和画作；三个资料入口也能互相切换。[导航补正记录](NAVIGATION_REPORT.md)。

## GitHub Pages 部署

线上站点：[慢光数字油画室](https://yydshly.github.io/0906_codexgpt6_project/)。用户已在 M2 开发交付后另行授权发布；本次通过同步 main 触发现有 Pages 流程。实际发布状态、部署提交及线上实测见 [M2 发布记录](M2_DEPLOYMENT.md)。

现有 `.github/workflows/deploy.yml` 在 main 推送时构建并发布 dist；M2 分支不匹配这个推送条件。部署配置通过 `DEPLOY_BASE_PATH=/0906_codexgpt6_project/` 设置资源路径，本地开发仍使用根路径与 5174 端口。

线上发布应用、体验与验收页面及其中引用的 47 份既有媒体/测试文件；报告链接到 GitHub，未引用的过程资料仍保留在仓库中。历史源文件不被改写，导航与阶段说明在开发服务和构建产物中添加。M2 使用当前浏览器的 IndexedDB 保存一个草稿，没有后端或云同步；等待“已保存”后刷新可恢复。线上与 localhost 的草稿按站点隔离，不会自动迁移本地作品，请导出留存。

## 启动

本次实际环境：Windows 11，Node 22.15.0，npm 10.9.2。

```powershell
Set-Location E:\0906_codexgpt6_project
npm ci
npm run dev
```

本地地址：[http://127.0.0.1:5174/](http://127.0.0.1:5174/)。M2 启动日志保存在 artifacts/m2/server.log。原计划的 5173 被已有“理想书房”项目占用，因此本项目使用 5174，没有停止或修改另一个项目的服务。

点击右侧颜料，在画布内按住鼠标拖动。大小控制笔宽，上色量控制覆盖和堆积；“混色”在当前笔触接触到底色的位置进行近似混合。“撤销”或 Ctrl+Z 撤销一笔；清空需确认，也能撤销。导出只包含真实画作与画布材质。

左侧可开启“画一幅旅行日落”，也可直接自由绘画。四步提示和辅助轮廓不写入作品，可跳过、返回或关闭。点击“采用本步建议”才改变画笔；有画作时新建先选择，不自动清空。

画笔停止后会保存一个当前草稿，包括颜色、厚度、画笔、引导进度和签名；请等到“已保存”后再刷新。刷新后选择恢复，旧撤销历史不会恢复，但之后新画的最近 20 笔仍可撤销。“暂不恢复”保留旧草稿，新的内存画面暂不自动保存；明确选择新建才替换旧草稿。写入失败时画作仍在，可重试保存或导出。数据损坏时保留原记录，提示失败并允许自由绘画和导出。

“签名与完成”打开实际作品预览，可返回修改或下载同一份 PNG。签名会印在右下角，参考层不导出。本地草稿按浏览器和站点地址隔离，不会同步到另一个浏览器或另一个站点；清理浏览器数据也可能丢失，请导出留存。

## 验证

```powershell
$env:M1_ARTIFACT_DIR = 'artifacts/e1/refinement/local'
npm run typecheck
npm run build
npm run test:engine
npm run test:e2e
npm run test:m2
npm run test:m2perf
npm run test:perf
npm run test:e1
npm run test:e1perf
```

Playwright 配置使用本机 Chrome、1440×900 视口，自动启动或复用 5174 端口服务。需要安装 Chrome；录像需要 Playwright 的 FFmpeg，如本机未准备可执行 `npx playwright install ffmpeg`。本次复用了既有 Chrome，没有下载浏览器矩阵。性能测试单独运行并关闭录像；不要同时开多个基准。

E1 重跑默认写入被 Git 忽略的 artifacts/e1/refinement/local，不覆盖已交付的历史三图、计划和录像。需要保存新一轮结果时，通过上述环境变量指定新的独立目录。

test:e2e 保留真实鼠标操作录像、固定笔触和下载文件。test:perf 用同一绘画引擎和渲染器运行四组 60 秒基准（32/96 像素 × 空/满历史），另做五轮历史内存循环、完整鼠标事件路径 60 秒基准和录像解码验证。完整性能命令约五分钟；它测量帧间隔，不是硬件输入延迟。

`test:m2` 验证主题、草稿恢复/失败/损坏、签名与完整任务；`test:m2perf` 在满 20 笔历史下进行约 60 秒真实鼠标输入与自动保存间歇测试。当前测试默认写入 artifacts/m2，`M1_ARTIFACT_DIR` 作为已有兼容环境变量可指定独立结果目录；不覆盖 artifacts/m1。M1 历史报告见 [M1_REPORT.md](M1_REPORT.md)，M2 当前结果见 [M2_REPORT.md](M2_REPORT.md)。

## 实现边界

- React/TypeScript/Vite 管页面，Pointer Events 处理输入，CPU RGBA8 + Uint16 高度数组保存作品，原生 WebGL2 由局部高度显示材质。
- 单笔固定种子和方向刷毛；基础混色为 RYB 近似，没有干燥、跨区携色或光谱物理模拟。
- 最近 20 笔完整快照有界；颜色与高度同时恢复。参考图只用于审阅，不打包进应用。
- WebGL 不可用/丢失时以 Canvas 2D 简化显示，可继续绘画、混色、撤销和导出，缺少局部光照；恢复材质后重新上传完整状态。
- M2 已发布；当前实验分支仅增加用户批准的 E1 本地图片笔触绘制，不含账号、收费、社区、图层平台、云同步或通用回放框架。E1 尚未合并 main 或部署。

仅开发模式且显式 `?test=1` 提供自动化诊断入口；`?test=1&fallback=1` 用于降级测试，生产构建不会开放这些入口。
