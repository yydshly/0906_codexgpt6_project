# M2 远端发布记录

后续的画室/M1/M2 入口关联与验收资料上线记录见 [NAVIGATION_REPORT.md](NAVIGATION_REPORT.md)。以下保留首次 M2 发布时的检查与提交记录。

用户在 M2 开发交付后另行授权“提交到远端 GitHub，网页部署在远端”。本次只发布已有 M2，不继续产品开发，也不把 V4 或完整体验的人工状态改为通过。

目标站点：[慢光数字油画室](https://yydshly.github.io/0906_codexgpt6_project/)。

**状态：已发布，线上实测通过。** 2026-09-06 11:00（Asia/Shanghai）完成公开站点验证。实际部署提交为 `a3be5f5d7b28cdb95351099e7cbb83fc081579a0`，包含 `705ff03` 的 M2 应用；本记录随后作为仅文档/证据提交同步，应用内容不变。

## 发布前核对

开始时工作区干净，`codex/m2-guided-creation` 与远端均为 `705ff03`，main 与远端均为 `82c5c6f`，没有发现额外远端更新。M2 的 A/B/C 已分别提交为 `345b0ed`、`aa44f1e`、`705ff03`。

本次未修改应用、绘画引擎、材质、依赖或 `.github/workflows/deploy.yml`。保留 M1/M2 历史证据；仅补充发布授权、当前使用说明与独立发布验证记录。

## 本次验证

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| typecheck | 通过 | [日志](artifacts/m2/publish/preflight/typecheck.log) |
| Pages 子路径生产构建 | 通过 | 使用 `DEPLOY_BASE_PATH=/0906_codexgpt6_project/`；[构建日志](artifacts/m2/publish/preflight/build.log) |
| test:engine | 通过 | 7 项；[日志](artifacts/m2/publish/preflight/test-engine.log) |
| 本地生产子路径浏览器实测 | 通过 | 实际落笔、两次选色、关闭引导、签名下载、已保存后刷新恢复、新画一笔并撤销；[结果](artifacts/m2/publish/preflight/results.json) |
| 子路径 Worker / PNG | 通过 | Worker 从 `/0906_codexgpt6_project/assets/` 加载；真实 PNG 1024×1024，预览/下载相同，恢复后再次预览相同 |
| 颜色/高度持久化 | 通过 | 实测保存前后两数组 SHA-256 相同，签名/画笔/步骤相同；没有使用开发诊断入口 |
| GitHub Actions 发布 | 通过 | [运行 34007834055](https://github.com/yydshly/0906_codexgpt6_project/actions/runs/34007834055)，build 与 deploy 均 success；[原始结果](artifacts/m2/publish/online/github-actions.json) |
| 实际线上页面 | 通过 | HTTP 200；页面加载的 `index-Dufj6Tif.js` 与本地 Pages 子路径构建一致，Worker 从远端正确子路径加载；页面异常和失败响应均为 0；[线上结果](artifacts/m2/publish/online/results.json) |
| 线上绘画、草稿恢复和撤销 | 通过 | 在公开站点用真实鼠标绘画、换色、关闭引导；等待已保存后刷新恢复，再画一笔并撤销，重新保存后的颜色/高度 SHA-256 与原保存状态相同；画笔、主题与签名也相同 |
| 线上签名下载 | 通过 | 实际下载 1024×1024 PNG 与签名预览一致；返回修改、刷新恢复、新笔撤销后重新预览仍与原 PNG 完全一致；[导出文件](artifacts/m2/publish/online/signed-export.png) |

本地生产验证地址由 [日志](artifacts/m2/publish/preflight/preview.log) 确认为 `http://127.0.0.1:5176/0906_codexgpt6_project/`。发布验证脚本为 [verify-site.mjs](artifacts/m2/publish/verify-site.mjs)，在隔离的 Chrome 上操作，不读取或覆盖用户现有草稿。

M2 已完成的 20 项完整回归及性能/降级记录继续引用 [M2_REPORT.md](M2_REPORT.md)。本轮应用代码未变，没有重新运行完整浏览器矩阵和性能基准。V4、真实新手体验、触控笔和平板等状态仍按原报告保留，不以部署成功代替验收。

线上验证使用隔离的 Chrome 152、1440×900 视口，见 [首屏](artifacts/m2/publish/online/first-screen.png)、[实际签名预览](artifacts/m2/publish/online/signed-preview.png) 与 [执行日志](artifacts/m2/publish/online/browser.log)。此发布操作样本用于检查远端资源和数据闭环，不替换 M1 固定轨迹样本或 M2 完整日落录像。

## 发布方式与停止点

已将验证过的分支快进至 main 并推送，触发现有 Pages 构建、引擎校验与部署流程，没有修改工作流或强制推送。仅文档与证据的后续提交使用 `[skip ci]`，避免相同应用重复部署。

本地分支切换曾因 Windows 临时预览进程占用两份日志而阻止合并。关闭本次预览、保留日志副本后快进成功；没有代码冲突、覆盖历史或丢失资料。临时 5176 服务已停止，远端网页独立于本机服务运行。

线上 M2 草稿保存在该站点当前浏览器的 IndexedDB 中，不是云同步；localhost 和线上站点不会自动迁移草稿。用户可随时导出当前画作留存。

完成后停止发布工作，不进入图片扩展或 M3，等待人工体验确认。
