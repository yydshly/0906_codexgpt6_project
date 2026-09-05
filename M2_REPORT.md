# M2 交付：一幅旅行日落的完整创作体验

核对日期：2026-09-06。M2 开发与自动化验证已完成；完整体验等待人工验收。**M1 的 V4 人工视觉/手感仍为「待用户确认」**，没有因开始 M2 改为通过。

当前最终证据为 [artifacts/m2/delivery](artifacts/m2/delivery)，不要将迭代目录 `final`、`release` 的名称理解为最终结果。可打开 [本地验收页](http://127.0.0.1:5174/artifacts/m2/index.html)，或直接双击 [离线证据入口](artifacts/m2/index.html)。

## 基线与范围

开始时本地工作区干净，main 与 origin/main 均为 `82c5c6f5bdb4d5b2a847387ef35b72a02c6d6036`，包含 `c75332d` 的独立撤销预期/反向验证与 `82c5c6f` 的验收资料。读取了 AGENTS、产品/体验/验收资料、M0 方案、M1 报告、应用与测试。未回退到旧提交。

`codex/m2-guided-creation` 原先不存在，从该实际基线新建。按可运行增量提交推送：

| 增量 | 内容 | 对应验证与提交 |
| --- | --- | --- |
| A | 一个主题入口、四步引导、独立辅助层、保护现有画作；AGENTS 与后续记录 | 类型检查、构建、2 项浏览器测试通过；`345b0ed`，已推送 |
| B | 一个本地草稿、准确恢复、失败提示与数据保护 | 类型检查、构建、6 项 M2 浏览器测试通过；`aa44f1e`，已推送 |
| C | 签名、真实预览与导出、生产编码修正、完整回归及本报告 | 下列最终检查通过；随本报告所在提交推送同一分支，提交号见分支历史 |

保留慢光品牌、当前纸张/木质页面风格和平头笔引擎。没有启动第三轮视觉重做，没有新增依赖、付费服务、账号、云同步或作品管理平台。未修改部署工作流，不合并 main、不手动触发 Pages、不强制推送。现有线上页面仍为此前的 M1；本轮 M2 从本地入口验收。

[BACKLOG.md](BACKLOG.md) 已记录“图片 → 实际笔触序列 → 自动绘制过程 → 暂停接手 → 导出”，注明专项验证、质量与教学边界。本轮没有图片接口、通用回放框架或占位功能。

## 已实现的体验与职责

左侧新增“画一幅旅行日落”，自由画布仍直接可用。天空 → 远山 → 水面 → 反光与个人细节，每步有区域、建议色/笔宽/上色量、短落笔提示和继续入口；建议需点击才采用，随后可以修改。允许跳过、返回、关闭和重新打开。有画作时先选择保留取消、在当前画作上继续或新画一张；清空需要明确选择，清空操作仍可撤销。

`src/guidance` 只管理文案、步骤与 SVG 提示层。提示层是画布旁的独立 DOM，不写入颜色/高度，关闭与切换不绘画。`src/painting` 继续管理真实作品与最近 20 笔撤销。`src/rendering` 保留原材质计算，`src/works` 管草稿与完成导出。

草稿包含 1024×1024 的 RGBA8 颜色与 Uint16 高度、格式与画笔版本、固定种子、画笔、主题步骤、签名和校验值。IndexedDB 中仅一个当前记录；只在事务真正完成后显示“已保存”。页面先读取/校验已有数据，再等待恢复或新建选择，初始空画布不会抢先写入。

自动保存等待笔画结束并防抖 650ms，绘画仍在进行时延后；不会按每次指针采样复制整张画布。保存串行进行，较旧写入完成不能把更新中的画作误报为已保存。事务内核对记录版本，另一标签页已更新时提示冲突并保留当前内存画作。

恢复可继续画，颜色和高度精确恢复；旧撤销历史不跨刷新，界面明确说明撤销从新笔开始。选择“暂不恢复”保留旧草稿，并暂停对其自动覆盖；当前内存画面仍可画和导出。写入失败不丢当前画面，提供重试与导出。校验损坏时不覆盖原记录，仍允许画画和导出。本地草稿按浏览器和站点隔离，不是永久备份。

“签名与完成”打开实际作品的 PNG 预览，签名可留空、最多 40 个 UTF-16 字符单位，使用系统字体合成到作品右下角。签名变化时更新预览；下载使用当前预览的同一份 Blob。返回修改保留画作与签名。原生 1024×1024 导出只包含实际作品、画布材质和签名，不含辅助层、工具或鼠标。

## 启动与复现

```powershell
Set-Location E:\0906_codexgpt6_project
# 依赖已在本机；新环境才需 npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

实际开发地址：[http://127.0.0.1:5174/](http://127.0.0.1:5174/)，由 [启动日志](artifacts/m2/server.log) 确认。保留了占用 5173 的其他项目。额外用 `npm run preview -- --host 127.0.0.1 --port 5176 --strictPort` 验证当前 dist，地址由 [生产预览日志](artifacts/m2/delivery/production-server.log) 确认；它是本地构建验证，不是部署。

```powershell
# 重跑时请用新的目录，避免覆盖本次交付证据
$env:M1_ARTIFACT_DIR = 'artifacts/m2/local-rerun'
npm run typecheck
npm run build
npm run test:engine
npm run test:e2e
npm run test:m2
npm run test:m2perf
```

沿用已有兼容环境变量名称；本次执行目录为 `artifacts/m2/delivery`。Playwright 使用本机 Chrome、有头窗口、1440×900，功能测试保存真实操作录像。性能测试关闭录像、单独运行。

## 最终验证结果

| 检查 | 状态 | 实际结果 / 日志 |
| --- | --- | --- |
| typecheck | 通过 | [日志](artifacts/m2/delivery/typecheck.log) |
| build | 通过 | [日志](artifacts/m2/delivery/build.log)；JS 235.00kB，gzip 76.11kB；CSS 16.83kB；编码 Worker 0.41kB |
| test:engine | 通过 | 7 项，3.7s；[日志](artifacts/m2/delivery/test-engine.log)、[原始结果](artifacts/m2/delivery/test-engine-results.json) |
| test:e2e | 通过 | 原有 4 项，51.2s；[日志](artifacts/m2/delivery/test-e2e.log)、[结果](artifacts/m2/delivery/test-e2e-results.json) |
| test:m2 | 通过 | 8 项，约 1.3 分钟；[日志](artifacts/m2/delivery/test-m2.log)、[结果](artifacts/m2/delivery/test-m2-results.json) |
| test:m2perf | 通过 | 1 项，约 1.1 分钟；[日志](artifacts/m2/delivery/test-m2perf.log)、[结果](artifacts/m2/delivery/test-m2perf-results.json) |
| 当前生产构建烟测 | 通过 | 实际鼠标落笔、签名、1024 PNG、刷新恢复后 PNG 相同；生产诊断入口不存在，打包的 Worker 正常加载；[结果](artifacts/m2/delivery/production-results.json) |
| Worker 缺失兼容路径 | 通过（注入条件） | 同一 Chrome 中隐藏 Worker，原生 toBlob 仍能输出与签名预览相同的 PNG；不是旧浏览器实测 |
| WebGL 不可用 / 上下文丢失恢复 | 通过（受控条件） | 原浏览器回归包含拒绝初始化与 WEBGL_lose_context，简化显示仍可画/混色/撤销/导出，恢复状态不丢；[结果](artifacts/m2/delivery/fallback-results.json) |

本次最终常规测试共 **20 项通过**，没有把生产烟测或重复诊断次数混入这个数量。

| M2 验收条目 | 状态与证据 |
| --- | --- |
| U1 进入与首笔 | 自动化通过：首笔 1914ms，无登录/付费门槛；真实首次用户用时未测试，不能用此数宣称人类 60 秒目标已达成 |
| U2 引导独立性 | 通过：遍历四步、返回、跳过、采用建议、关闭轮廓/引导均保持颜色和高度 SHA-256；[结果](artifacts/m2/delivery/guide-results.json) |
| U3 用户自主绘画 | 通过：采用建议后自行换朱红并实际落笔，颜色/高度及接触像素改变；引擎原有大小、上色量、方向性验证保留 |
| U4 保存与恢复 | 通过：显示已保存后刷新，两数组 SHA-256 精确匹配，画笔/步骤恢复，新画一笔后撤销精确回到恢复状态；加载人为延迟期间原存储不变；[结果](artifacts/m2/delivery/restore-results.json) |
| U4 保存失败与损坏 | 通过（测试内故障注入）：put 抛出配额错误不误报已保存，原草稿/当前画作保留且能导出，重试成功；高度单比特损坏被校验拒绝；[写入失败](artifacts/m2/delivery/save-failure-results.json)、[损坏](artifacts/m2/delivery/corruption-results.json) |
| U5 真实预览与签名 PNG | 通过：1024×1024，签名区域 1601 像素变化、区域外变化 0；引导开/关 PNG 文件完全相同；签名预览与下载文件完全相同；[结果](artifacts/m2/delivery/journey-results.json) |
| U6 完整路径与数据保护 | 通过：实际走完四阶段、个人细节、关闭引导、签名/导出、返回修改、清空取消、刷新恢复。已有画作入口取消/继续保持数组，新画布清空可撤销；暂不恢复保留旧草稿，之后替换内存画面有明确提示。另验证旧标签页不能覆盖另一页新草稿 |
| U7 M1 核心回归 | 通过：保留固定笔触/颜色/轨迹/seed=906、RYB、输入取消/转向、布局变化、逐笔撤销和真实导出测试。独立历史预期及错误高度恢复反向验证继续通过；UI SHA-256 没有替代逐笔数组断言 |
| M1 V4 / M2 完整体验人工判断 | 待用户确认；未执行真实新手任务试验，不自动判定观感/手感通过 |

## 自动保存、性能和内存

实际环境：[系统记录](artifacts/m2/system.json) 为 Windows 11 家庭版 10.0.26200、i9-13980HX、Node 22.15.0/npm 10.9.2；Chrome 152.0.0.0。实际 WebGL 设备为 Intel UHD Graphics，经 ANGLE D3D11，未使用软件渲染标识。视口 1440×900，逻辑画布 1024×1024，显示缓冲 611×611，DPR 约 1。该高刷新桌面的 rAF 数值不能推广到其他机器。

测试使用原引擎、固定 seed=906、96px/上色量 0.5/混色、初始 20 笔历史；先持续按住绘画 30 秒，再五段各 4.6 秒绘画并留 1.25 秒保存间隔。实际 60,323ms，发送 2880 次测量内移动，接收 2881 次（含开始定位事件）。[完整数据](artifacts/m2/delivery/autosave-performance.json)：

| 指标 | 实测 / 判断 |
| --- | --- |
| 平均 rAF 帧率 | 238.79 FPS；通过本机最低 30 FPS 门槛 |
| p95 帧间隔 | 4.30ms；通过 50ms 门槛 |
| 最长帧 / 超过 50ms 的帧 | **71ms / 1 帧**；存在长帧，不能称为零卡顿 |
| 测量期间草稿快照/成功写入 | 6 / 6；含暖场累计 7 / 7 |
| 首个持续按住 30 秒期间全图保存快照 | 0；活动笔画期间捕获总数也为 0 |
| 单次保存复制最长 | 2.20ms；每份颜色+高度 6MiB |
| 最长异步写入耗时 | 30.5ms；是事务经过时间，不是同步阻塞或输入延迟 |
| 测量结束历史 | 20 笔，125,829,120 字节（120MiB）；当前作品 6MiB，pending 0 |
| 强制 GC 后 JS heap 前→后 | 6,950,064 → 7,683,008 字节；仅一次前后读数，不含全部外部数组/GPU/驱动内存 |

按本次门槛自动保存绘画性能通过；这不替代人类跟手评价，也不证明总内存永久稳定。M1 的四组基准、五轮撤销/清空/重画内存趋势仍引用 [M1_REPORT.md](M1_REPORT.md) 的历史记录，**本轮未重新执行完整 test:perf，也未完成 M2 五轮总内存平台验证**。本轮新测的 60 秒自动保存与有界历史数据如上，未把旧结果写成 M2 新结果。

## 本轮发现、修复与未通过的中间记录

完整录像回归曾暴露 Chrome 主线程 PNG 编码等待：两次 toBlob 分别约 6.7 秒，签名预览累计超过 13 秒，原 5 秒预览断言失败。[诊断记录](artifacts/m2/diagnostic-run/preview-stall.json) 保留真实时间。主线程 OffscreenCanvas.convertToBlob 也曾遇到同样等待，[该方案的未通过记录](artifacts/m2/encoding-verification/preview-stall.json) 同样保留，未以单次成功掩盖其不稳定性。

最终只把已经渲染完成的像素 PNG 编码移到短生命周期 Worker，最多两个并行编码、10 秒失败提示与资源释放；没有把绘画、混色、材质计算或引导改到另一条路线。renderer 仅引入编码函数并替换最后的 Blob 编码调用，shader、作品数组和采样逻辑未改。预览仍需通过原有 5 秒断言；诊断的额外等待仅记录失败原因，随后重新抛出原断言错误。最终编码方案 [连续两次完整流程](artifacts/m2/worker-verification/runner.log) 通过，之后本报告的完整 20 项测试及生产构建再次通过。旧浏览器无 Worker 的兼容路径在注入条件下可用，但可能回到较慢编码路径。

另一次 [中间全套运行](artifacts/m2/final/test-m2.log) 为 7 通过/1 未通过：Windows 在 Playwright 将已下载 PNG 复制到已有证据路径时报告 `copyfile UNKNOWN`；此前保存失败提示、旧记录与当前状态断言已通过。此为证据复制失败，仍按该轮未通过记录；最终使用新的独立交付目录，未降低断言。此失败没有单独保留截图，不能当作有图证据。A 阶段还排除了旧开发服务缓存导致的旧页面，重新启动本项目服务后验证通过，日志在 `artifacts/m2/step-a`。

全部迭代记录保留；`final`、`verified`、`diagnostic-run`、`encoding-verification`、`release` 为过程记录。本报告的结果表只引用当前最终 `delivery`，不选择性混用各轮最好数字。

## 固定样本与 M1 资料保留

[基线核对](artifacts/m2/baseline-preservation.json) 确认 `engine.ts`、`input.ts`、`mix.ts`、固定样本源、M1_REPORT、M1 历史证据和部署工作流保持基线内容；renderer 的差异只在 PNG 编码接入。

当前单笔、黄蓝两色交叠 PNG 与 M1 原文件字节完全相同。重复叠涂样本在 1,048,576 像素中有 **37 像素不同，最大通道差 6/255**。该微小差异的具体来源尚未证明；页面位置变化后的指针坐标量化是可能因素，不能当作已确认原因。未修改颜色、轨迹、随机种子或原样本来消除差异，也未开启新的材质优化。

- [M1 原重复叠涂](artifacts/m1/repeated-layering.png) 与 [M2 当前重复叠涂](artifacts/m2/delivery/repeated-layering.png) 可直接比对。
- V4 继续待用户判断，文件接近或自动化通过不等于油画观感达标。

## 可打开的交付证据

| 证据 | 文件 |
| --- | --- |
| 全部本地验收入口 | [index.html](artifacts/m2/index.html) |
| 实际首屏 | [first-screen.png](artifacts/m2/delivery/first-screen.png) |
| 真实绘制并开启引导 | [sunset-guided.png](artifacts/m2/delivery/sunset-guided.png) |
| 引导关闭后的作品 | [sunset-guide-closed.png](artifacts/m2/delivery/sunset-guide-closed.png) |
| 签名与完成页面 | [completion.png](artifacts/m2/delivery/completion.png) |
| 实际完整 UI 操作录像 | [journey.webm](artifacts/m2/delivery/journey.webm) |
| 真实签名导出 / 同一份预览 | [travel-sunset.png](artifacts/m2/delivery/travel-sunset.png) / [preview.png](artifacts/m2/delivery/preview.png) |
| 无签名原作品 / 引导开启时导出 | [unsigned-sunset.png](artifacts/m2/delivery/unsigned-sunset.png) / [guided-export.png](artifacts/m2/delivery/guided-export.png) |
| 原有固定单笔 / 两色交叠 / 重复叠涂 | [single-stroke.png](artifacts/m2/delivery/single-stroke.png) / [two-color-overlap.png](artifacts/m2/delivery/two-color-overlap.png) / [repeated-layering.png](artifacts/m2/delivery/repeated-layering.png) |
| 原有 M1 操作闭环回归录像 | [workflow.webm](artifacts/m2/delivery/workflow.webm) |
| 刷新提示 / 恢复结果 / 写入失败提示 | [restore-prompt.png](artifacts/m2/delivery/restore-prompt.png) / [restored.png](artifacts/m2/delivery/restored.png) / [save-failure.png](artifacts/m2/delivery/save-failure.png) |
| 本地生产构建签名实测 | [production.png](artifacts/m2/delivery/production.png) |

录像是 Playwright 操作当前 UI 时实际录制，日落通过逐笔鼠标输入画出；不是预制成品揭幕，也不是面向用户的新回放功能。此自动化画作的用途是检验完整路径，不代表新手通常能画出的质量或完整任务耗时。

交付入口检查通过：20 个链接返回 HTTP 200、10 张图片成功解码，离线 HTML 图片也能打开。日落录像 29.44 秒，原闭环回归录像 28.12 秒，均为 1440×900；分别在 10%、50%、90% 位置实际解码得到不同帧。[入口检查](artifacts/m2/delivery/review-entry-check.json)、[录像解码结果](artifacts/m2/delivery/video-check.json)、[日落解码帧](artifacts/m2/delivery/journey-frame.png) 可复核。此检查证明媒体可用，不替代人工观看和手感判断。

## 未测试与人工验收入口

- **待用户确认**：M1 V4 油画观感/手感；M2 指引是否清楚、是否愿意完成和保存作品。没有自行评定参考效果达标。
- **未测试**：真实首次用户完成率、10–15 分钟任务目标、真实端到端输入延迟；没有用自动化 1914ms 首笔替代它们。
- **未测试**：iPad/触控笔/触摸真机、压感体验、低配置设备、Safari/Firefox/Edge 与旧浏览器矩阵；当前实际 Chrome/GPU 可用，不是缺少工具。
- **未测试**：真实磁盘耗尽、存储被系统回收、长期存储保留、M2 五轮总内存趋势。配额失败和数据损坏仅为测试内故障注入，业务代码没有故意错误。
- **已知限制**：一个当前本地草稿、跨刷新不恢复旧撤销；RYB 仍为基础近似，无干燥或专业颜料物理。单次 71ms 长帧与固定重复样本的 37 像素差异均保留。数据损坏时提供导出当前可用画作，不承诺修复损坏的旧内容。

建议人工从 [本机画室](http://127.0.0.1:5174/) 依次体验：开始主题或自由绘画 → 采用并修改建议 → 四步绘制/返回/跳过 → 关闭提示 → 等待已保存后刷新恢复 → 新画一笔并撤销 → 签名预览 → 返回修改 → 导出 PNG。检查所有选择是否容易理解、是否保留个人画作，最后确认 V4 与完整任务体验。

交付后停止 M2 开发，等待完整体验验收；不自动进入图片扩展、M3、合并或部署。
