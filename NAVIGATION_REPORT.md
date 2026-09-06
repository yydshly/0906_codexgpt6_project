# 画室、M1 与 M2 入口关联补正

状态：已提交并发布，公开站点完整导航与媒体验证通过。应用部署提交 `afade5ff731b5f1f523403f56d012313358283ab`；[Pages 运行 34008629255](https://github.com/yydshly/0906_codexgpt6_project/actions/runs/34008629255) 的构建、引擎检查与发布均成功。

用户指出当前打开的 M1 验收页与 M2 完整体验没有清楚关联。原因是此前 Pages 只发布画室应用，验收资料主要在本地；旧 M1 页还显示交付当时的“未进入 M2”。这会让人把历史证据页误认为当前产品全貌。

M1 与 M2 本来共用同一个应用：M1 的真实绘画、覆盖/混色、撤销和导出，已作为 M2 的基础；M2 继续提供日落引导、草稿恢复、签名与完成。此次补上入口关系，不新增绘画功能或重新设计画室。

## 新的入口

- [完整画室](https://yydshly.github.io/0906_codexgpt6_project/)：实际绘画与完成作品。
- [体验与验收总览](https://yydshly.github.io/0906_codexgpt6_project/review/)：解释两阶段关系，提供三个明确入口。
- [M1 实际验收](https://yydshly.github.io/0906_codexgpt6_project/artifacts/m1/index.html)：历史固定样本、录像、导出与检查记录。
- [M2 完整体验](https://yydshly.github.io/0906_codexgpt6_project/artifacts/m2/index.html)：完整日落、引导关闭、恢复、签名和真实导出的证据。

画室右上角增加“体验与验收”，在新标签页打开资料，当前画作仍在原标签页。M1/M2 资料页顶部有共同导航，可回总览、互相切换或打开完整画室。本机旧地址 `http://127.0.0.1:5174/artifacts/m1/index.html` 刷新后也显示同样的阶段说明与导航。

## 保留与实现

新增 `review/index.html` 与 `build/review.ts`。开发服务和构建过程为既有验收 HTML 添加导航、修正容易误读的当前阶段说明；**原始历史 HTML、图片、录像、颜色、轨迹和种子不被改写**。只复制被这些页面直接引用的 47 份文件，共 38,031,914 字节；生成 `review/evidence-manifest.json` 供逐文件校验。报告直接链接 GitHub，未打包所有调试迭代目录。

上述大小为 Windows 本地工作区计数；Linux 发布端为 38,030,552 字节，差异来自 Git 文本换行规范化。另以 Git 中存储的原始字节独立核对远端清单，47 个文件 SHA-256 全部匹配：[Git 原件核对](artifacts/m2/navigation/online-final/git-evidence-check.json)。图片与录像没有重编码或替换。

应用代码只增加一个入口及其样式；绘画、输入、混色、材质、草稿和导出实现保持不变。Vite 配置接入资料页构建，不改 GitHub Actions 工作流、不新增依赖或付费服务。没有进入图片扩展或 M3。

## 验证

| 项目 | 状态与证据 |
| --- | --- |
| 类型检查 | 通过；[日志](artifacts/m2/navigation/preflight/typecheck.log) |
| 远端子路径生产构建 | 通过；[最终构建日志](artifacts/m2/navigation/preflight/final-build.log) |
| 本地总览 → M1 → M2 → 总览 → 实际画室 | 通过；真实浏览器点击，44 个同站点链接 HTTP 200；[结果](artifacts/m2/navigation/preflight/results.json) |
| 打开资料不丢画作 | 通过；新标签页打开，原画室保持可操作，前后 PNG 文件完全相同；新开的画室可读取此前已存草稿，不空白覆盖 |
| 原始证据一致 | 通过；47 个发布文件逐一读取并核对原件 SHA-256，全相同；M1/M2 历史交付文件在 Git 中无改动 |
| M2 录像可用 | 通过；实际解码中间帧，1440×900、29.44 秒，readyState 4 |
| 用户当前本机 M1 旧地址 | 通过；开发服务响应包含新导航和“当前画室已包含 M2 完整体验”说明 |
| 原有 test:e2e | 通过；4 项，包括固定笔触、真实导出、输入取消/缩放、降级和上下文恢复；[日志](artifacts/m2/navigation/regression/test-e2e.log) |
| M2 完整日落操作回归 | 通过；1 项，28.8 秒，仍使用原有测试、5 秒预览断言和实际鼠标绘画；[日志](artifacts/m2/navigation/regression/journey.log) |
| Pages 发布及远端全部入口 | 通过；[工作流结果](artifacts/m2/navigation/online-final/github-actions.json)；公开网址实际走通画室 → 总览 → M1 → M2 → 总览 → 画室，原画作导出前后不变；[最终结果](artifacts/m2/navigation/online-final/results.json) |
| 远端媒体与链接 | 通过；47 份媒体/数据完整下载后 SHA-256 全部与原件一致，再检查 44 个同站点链接响应 200；[逐文件结果](artifacts/m2/navigation/online-final/asset-results.json)；M2 视频直接播放推进并解码，未用静态海报代替 |

本轮原始记录在 `artifacts/m2/navigation`。完整 M2 其余功能和性能测试沿用 [M2_REPORT.md](M2_REPORT.md)，此次未重新跑完整性能基准。V4 与真实用户体验仍待用户确认，导航成功不代表人工验收通过。

## 页面证据

[统一入口](artifacts/m2/navigation/preflight/overview.png) · [画室入口位置](artifacts/m2/navigation/preflight/studio.png) · [关联后的 M1](artifacts/m2/navigation/preflight/m1-linked.png) · [关联后的 M2](artifacts/m2/navigation/preflight/m2-linked.png)。

[远端总览](artifacts/m2/navigation/online-final/overview.png) · [远端 M1](artifacts/m2/navigation/online-final/m1-linked.png) · [远端 M2](artifacts/m2/navigation/online-final/m2-linked.png) · [远端验证日志](artifacts/m2/navigation/online-final/browser.log)。

## 中间未通过记录

首次线上验证在 M2 媒体检查阶段长时间未结束，主动终止，具体等待 API 未从当时日志定位；[未完成记录](artifacts/m2/navigation/online/interruption.json) 和当时检查脚本保留。随后对图片解码和播放增加明确的 20 秒超时，直接验证视频播放，不再依赖超大时间 seek 推断流式 WebM 时长。历史视频及应用代码未改动。

第二次运行完成了真实跳转、播放、画作保护及 47 份文件完整校验，但之后为了检查链接状态再次下载 `actual-painting.png`，收到 HTTP 200 后发生 30 秒传输超时；[该轮失败日志](artifacts/m2/navigation/online-verified/browser.log) 保留，未写成整轮通过。最终维持逐文件完整内容与 SHA-256 验证，之后用 HEAD 检查链接状态，避免重复传输大文件；最终 `online-final` 全部通过。此结果不承诺任意网络条件下都没有延迟。

证据页里的图片和录像用于验收，不能在其上绘画；“进入完整画室”才是当前可操作应用。此区别在页面与导航中明确说明。
