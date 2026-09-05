# M1 交付与实际验收报告

日期：2026-09-06（北京时间）。范围：仅 M1，本次补正撤销测试及验收记录。V4 人工视觉和手感验收 **待用户确认**；未进入 M2。

## 本次验收补正

原 `tests/engine.spec.ts` 使用 `Buffer.from(p.height.buffer)` 保存高度预期。这个重载共享原 ArrayBuffer；继续绘画或撤销时，预期值会随当前高度一起改变。因此，上一轮引擎测试的“通过”不足以证明逐笔高度恢复正确。颜色预期 `Buffer.from(p.color)` 本来就是独立副本。业务引擎自己的历史快照使用 `height.slice()`，未发现同样问题，本次没有修改绘画、混色、输入、渲染或页面代码。

本次将高度预期改为 `Buffer.from(new Uint8Array(p.height.buffer, p.height.byteOffset, p.height.byteLength))`，复制完整字节范围，保留每个 Uint16 的两个字节。补充以下验证：

1. 保存独立预期后，将当前高度全部改成 99、颜色改成 201。旧写法的预期随之变为 99，新写法仍保留原高度 4660 和末尾 12000，且颜色与高度的完整预期字节都不变。结果：[snapshot-independence.json](artifacts/m1/acceptance-correction/snapshot-independence.json)。
2. 分别画 20 笔和 21 笔，每笔开始前保存独立颜色/高度预期，再逐次撤销最近 20 笔。两组共 40 次撤销、80 次完整状态字节比较均通过；20 笔组回到空白，21 笔组保留第一笔。另验证撤销后新画再撤销、清空再撤销。逐步结果：[20 笔](artifacts/m1/acceptance-correction/undo-20-results.json)、[21 笔](artifacts/m1/acceptance-correction/undo-21-results.json)。
3. 仅在测试实例中包装 `undo`，让颜色正常恢复，却故意保留撤销前的错误高度。常规负向用例确认同一断言抛出高度错误；另以 `M1_TEST_BAD_HEIGHT_RESTORE=1` 实际运行正常的 20 笔测试，第一次撤销即报 `undo 20 -> 19: height bytes`，退出码为 1。该次测试状态为 **未通过（预期的故障注入）**，证明正常逐笔测试能检出错误高度恢复。故障包装仅存在于测试文件，未进入业务代码。原始证据：[失败日志](artifacts/m1/acceptance-correction/negative-control/runner.log)、[退出码](artifacts/m1/acceptance-correction/negative-control/exit-code.txt)、[测试结果](artifacts/m1/acceptance-correction/negative-control/npx-results.json)。

已有 UI SHA-256 检查保留；本轮浏览器回归再次执行了单次撤销、清空撤销及降级恢复的状态一致性检查。位于性能测试中的“20 笔 UI 绘画再撤 20 次”SHA-256 检查也保留，但本轮未重跑，沿用上一轮记录。UI 摘要检查没有替代上述逐笔颜色与高度验证。

本轮结果使用 `M1_ARTIFACT_DIR=artifacts/m1/acceptance-correction` 单独保存，避免覆盖原证据。固定颜色、轨迹、seed=906 及性能测试未改动；原三张固定样本、操作录像、导出 PNG、性能和内存记录与 Git 中原文件的内容散列一致，见 [保留证据核对](artifacts/m1/acceptance-correction/preserved-evidence.json)。这不是第三轮视觉优化。

## 实际交付

已建立“慢光”数字油画室。在同一个设计过的暖色桌面页面内，右侧选择六种颜料，用平头笔连续绘画，切换覆盖/基础混色，调节大小和上色量，撤销最近 20 笔，确认清空或导出真实 1024×1024 PNG。

作品来自 CPU RGBA8 颜色/覆盖和 Uint16 高度数组，WebGL2 按实际高度生成局部光照。没有参考图揭幕、预制画作、普通圆头线冒充刷毛或运行时模型调用。PNG 来自独立原生工作分辨率渲染目标，含画布与真实笔触，不含页面工具和光标。

完整证据可打开 [本地验收索引](http://127.0.0.1:5174/artifacts/m1/index.html)，也可直接用浏览器打开本地文件 `E:\0906_codexgpt6_project\artifacts\m1\index.html`。索引集中展示原有单笔、两色交叠、重复叠涂、实际操作录像和导出 PNG，保留初版、第一轮与最终样本对照，并单独链接本轮补正结果。

入口可用性本轮验证 **通过**：Chrome 分别打开本地 HTTP 与文件入口，12 张图片全部加载，原录像元数据均为 1440×900、30.24 秒；24 个 HTTP 链接返回 200。记录见 [review-entry-check.json](artifacts/m1/acceptance-correction/review-entry-check.json)。这项检查证明材料可以打开，不代表完成 V4 视觉或手感验收。

## 启动和复现

实际启动日志确认地址：[http://127.0.0.1:5174/](http://127.0.0.1:5174/)。服务仅监听本机。5173 原有另一个项目在运行，本轮保留该服务，使用 5174。

```powershell
Set-Location E:\0906_codexgpt6_project
npm ci
npm run dev
```

也可显式运行 `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`。启动记录见 [server-5174.log](artifacts/m1/server-5174.log)，启动错误输出为空。最初 5173 占用记录保留在 server-error.log，没有隐藏这个环境调整。

本次四项检查均实际重新执行。复现时可在上述目录设置 `$env:M1_ARTIFACT_DIR='artifacts/m1/acceptance-correction'` 后运行下表前四项；正常运行时不要设置 `M1_TEST_BAD_HEIGHT_RESTORE`。测试配置和证据辅助代码仅增加输出目录隔离，未删减原有 UI 校验。

| 命令 | 状态与执行轮次 | 原始证据 |
| --- | --- | --- |
| npm run typecheck | 通过，本轮重跑 | [typecheck.log](artifacts/m1/acceptance-correction/typecheck.log) |
| npm run build | 通过，本轮重跑；生成 dist | [build.log](artifacts/m1/acceptance-correction/build.log) |
| npm run test:engine | 通过，本轮 7 项，2.9 秒 | [日志](artifacts/m1/acceptance-correction/test-engine.log)、[JSON](artifacts/m1/acceptance-correction/test-engine-results.json) |
| npm run test:e2e | 通过，本轮 4 项，48.9 秒 | [日志](artifacts/m1/acceptance-correction/test-e2e.log)、[JSON](artifacts/m1/acceptance-correction/test-e2e-results.json) |
| npm run test:perf（上一轮首项基准） | 上一轮通过；本轮未测试，沿用 4 组 60 秒与五轮内存循环 | artifacts/m1/test-perf-results.json、perf.json、memory.json |
| npx playwright test --project=performance -g 'actual pointer pipeline' | 上一轮通过；本轮未测试，沿用鼠标全路径、20 次 UI 撤销、录像解码 | artifacts/m1/npx-results.json、ui-perf.json、video-check.json |

本轮正常引擎与浏览器测试合计 11 项通过，故障注入的预期失败单独列示，不混入通过数量。上一轮根目录的 4 项引擎测试记录原样保留作历史资料，其中高度恢复结论由本轮独立预期验证取代。`npm run test:perf` 仍包含两项性能测试；因生产代码未修改，本轮按用户要求不重复完整性能基准。

故障注入可以单独复现（以下命令预期失败；建议在独立 PowerShell 会话执行，结束后关闭该会话，避免影响正常测试）：

```powershell
$env:M1_ARTIFACT_DIR='artifacts/m1/acceptance-correction/negative-control'
$env:M1_TEST_BAD_HEIGHT_RESTORE='1'
npx playwright test --project=engine -g '20 strokes restore independent'
```

## 验收状态

F1–F8 的引擎/浏览器功能及 GL 降级测试本轮重新执行。V1–V3 的下列展示材料仍引用上一轮保留证据；本轮没有重新评定视觉效果。性能、五轮内存、60 秒完整鼠标链路与 20 次 UI SHA-256 结果沿用上一轮，不当作本轮重测。

| 条目 | 状态 | 实际验证与限制 |
| --- | --- | --- |
| F1 启动 | 通过 | Vite 实际运行，Chrome 页面无 pageerror，正常 WebGL2 绘制 |
| F2 取色/落笔 | 通过 | 真实鼠标拖动改变像素；换色影响新笔，正常抬起结束 |
| F3 稳定输入 | 通过（已测范围） | 慢直线、快弧线、转向、外部抬笔、pointercancel、失焦、捕获丢失、绘制中 resize；cancel/blur 部分由事件注入测试，非人工 Alt+Tab 手感 |
| F4 参数 | 通过 | 大小与上色量的像素覆盖/高度变化分别验证；UI 滑块可键盘操作 |
| F5 覆盖/基础混色 | 通过 | 固定黄蓝交叉、相同轨迹覆盖对照、接触外不变；RYB 同色、白提亮、黄红/红蓝数值有界验证。非光谱准确 |
| F6 撤销 | 通过 | 本轮两组分别逐次撤销 20 笔，对照独立预期完整比较颜色/高度；另有实际失败的错误高度恢复反例。20 次 UI 撤销后两状态 SHA-256 等于空白的记录沿用上一轮；单次 UI 撤销及清空/恢复一致性本轮重跑 |
| F7 PNG 导出 | 通过 | 本轮再次实际点击下载、解码 1024×1024、验证非空绘画内容及与同一作品再渲染 PNG 字节一致；原展示文件的 54,873 个明显色差像素统计沿用上一轮 |
| F8 布局变化 | 通过（已测范围） | 1440×900 ↔ 1100×760，作品不变；CSS zoom 125% 后继续画。浏览器菜单缩放另列未测试 |
| V1 页面 | 通过（设计结构与证据） | 实际首屏有桌面层次、织纹画布、木板颜料与紧凑工具；没有截图视频控件；审美认可仍归 V4 |
| V2 固定样本 | 通过（证据与可观察特征） | 三张来自同一实际引擎的固定样本，呈现方向刷毛、边缘和局部高度；关闭高度光照对照已保存。是否达到投资门槛由 V4 判断 |
| V3 操作录像 | 通过（沿用原证据） | 原录像 30.24 秒，1440×900，包含选色、真实绘制、混色、撤销和导出；Chrome 解码并取第 27 秒帧成功是上一轮记录 |
| V4 人工视觉/手感 | 待用户确认 | 未自评拟真程度，不宣布已达到参考效果 |
| 性能门槛 | 上一轮通过；本轮未测试 | 见下表，此机器均达到平均 ≥30、p95 ≤50ms；少量最长帧明显高于 p95，完整披露 |
| 内存边界 | 上一轮通过；本轮未重跑五轮基准 | 本轮引擎仍校验 20 份历史为 120 MiB；五轮稳定性与堆指标沿用上一轮，不等于已测完整浏览器/GPU 驱动内存 |
| GL 不可用/丢失/恢复 | 通过 | 强制拒绝初始化后仍能画、混、撤、导出、重试；WEBGL_lose_context 后，降级期间新增作品也在恢复时保留 |
| 触摸/触控笔/iPad 真机 | 未测试 | 不宣称真实压感或完整设备适配 |
| 人工 Alt+Tab、浏览器菜单缩放、Edge/Firefox/低端设备 | 未测试 | 不将合成事件、CSS zoom 和本机 Chrome 结果外推 |
| 实际内存耗尽与 PNG 编码失败注入 | 未测试 | 有错误处理，但本轮未造成系统级耗尽或主动破坏编码器 |

## 性能与内存数据

**本节全部性能测量、硬件说明与五轮内存数据均引用上一轮记录；本轮未重跑完整基准。**

系统：Windows 11 家庭版中文版 10.0.26200，i9-13980HX。Chrome 安装版本 152.0.7977.82；实际 GPU 是 ANGLE / Intel UHD Graphics / Direct3D11，未使用软件渲染器，也不是系统中的 RTX 4070。主显示设备报告 2560×1600、240 Hz。

基准视口 1440×900，逻辑画布和颜色/高度数组 1024×1024，屏幕背缓冲 611×611，实际 DPR 约 1（上限 1.5）。背缓冲只影响显示；所有正常导出保持原生 1024×1024。GPU 上传的颜色/高度纹理合计 6 MiB，导出另建 4 MiB 目标，未将浏览器合成器/驱动额外内存计入。

四组基准均先预热，关闭录像。rAF 驱动同一 Painting.move 和 renderer.draw；空历史组持续一笔 60 秒，满历史组每两秒换笔，在满 20 笔条件下混色。平均值 = 帧间隔数量 / 间隔总秒数。此表是 **rAF 帧率与间隔**，不是 GPU 完成时间或端到端输入延迟。

| 笔宽 / 起始历史 | 实际时长 | 平均 rAF FPS | p95 帧间隔 | 最长帧 | >50ms 帧数 | p95 CPU 绘画+提交 |
| --- | --- | --- | --- | --- | --- | --- |
| 32 / 空 | 60.000s | 225.83 | 4.40ms | 558.50ms | 2 | 0.40ms |
| 32 / 满 20 | 60.000s | 235.10 | 4.30ms | 354.20ms | 2 | 0.50ms |
| 96 / 空 | 60.000s | 239.82 | 4.30ms | 45.80ms | 0 | 1.40ms |
| 96 / 满 20 | 60.004s | 239.67 | 4.30ms | 49.90ms | 0 | 1.80ms |

出现高于 60 的均值与本机 240 Hz 显示刷新一致，不能因此宣称跨设备“240 FPS 绘画”。前两组少量 354–559ms 长帧原因尚未归因，可能影响偶发跟手；它们没有被平均值或 p95 隐去。本轮未额外开展第三轮性能/视觉修正。

补充的完整鼠标链路测试，通过 Playwright 鼠标 → 浏览器 Pointer Events → 实际输入模块 → CPU 状态 → 定时 WebGL，连续 60.050 秒：发送/接收均为 3504 次移动事件，平均 rAF 239.85，p95 4.30ms，最长 20.70ms，>50ms 为 0，抬笔后 active=false。它验证自动化事件通路与调度，不替代用户手感。

五轮“画 20 笔 → 撤销 → 清空 → 重画”的结果：

- 每轮历史 20 份 = 120 MiB；当前颜色/高度 6 MiB；备用 Canvas 图像数组 4 MiB；刷毛数组 2 KiB。显式 TypedArray 合计每轮均为 136,316,928 字节（约 130.002 MiB）。
- 活跃笔前快照最多再加 6 MiB，导出读取/翻转数组最多另加 8 MiB；按保守叠加仍约 144 MiB，低于 160 MiB 显式缓冲预算。混色缓存上限 4096 项，不随画笔时长无限增长。
- 非计时区强制 GC 后的 CDP JS heap used 五轮为 5,955,252 / 5,955,664 / 5,949,048 / 5,957,004 / 5,957,984 字节，波动很小，未发现随轮次显著增长。该堆指标不包含全部外部 ArrayBuffer、图形驱动和进程开销，不能称为应用总内存。

## 两轮修正与剩余差异

初版已同时具备页面、实时绘画与导出。实际样本暴露出笔触印章的周期条纹和首屏高度问题；首次完整操作测试还发现滑块精确标签定位包含动态数值，随后补上稳定的 aria-label。

第一轮调整刷毛束、沿程变化、沉积强度、局部光照与页面高度。该轮 UI 测试通过，但固定中心混色的绿色分量判定未过，原始失败结果保存在 round-1/test-engine-results.json。

第二轮仅调整刷毛印章的纵向重叠与沉积窗，减少规律横条并恢复固定混色判定。随后引擎和浏览器测试全部通过。初版与两轮后的相同固定样本均已保留，没有更改颜色、轨迹或 seed=906，没有换引擎或增加范围。

仍需人工判断的核心差异：长笔刷毛沟槽比较规则，重复叠涂仍可呈平行条带；木纹和颜料堆积是程序近似，不能称为真实油画物理。这轮已用完两次聚焦修正预算，现提交可操作版本与差异证据，等待你决定视觉/手感是否达到继续投入的门槛。

## 证据路径

| 证据 | 文件 |
| --- | --- |
| 首屏 / 画后页面 | artifacts/m1/page.png、painted-page.png |
| 固定单笔 / 两色交叠 / 重复叠涂 | artifacts/m1/single-stroke.png、two-color-overlap.png、repeated-layering.png |
| 覆盖对照 / 叠涂第 1、5、10 次 / 关闭高度光照 | artifacts/m1/two-color-cover.png、layer-1.png、layer-5.png、layer-10.png、height-lighting-off.png |
| 实际操作录像 / 可解码帧 | artifacts/m1/workflow.webm、workflow-frame-27s.png、video-check.json |
| 实际下载 PNG / 一致性对照 | artifacts/m1/actual-painting.png、export-comparison.png |
| 输入 / 缩放 / 降级恢复 | artifacts/m1/input-results.json、input-paths.png、resize.png、fallback-results.json、fallback.png、fallback-export.png、context-restored.png |
| 上一轮性能 / 内存 / 原撤销记录 / 颜色矩阵 | artifacts/m1/perf.json、ui-perf.json、memory.json、undo-results.json（高度结论已由补正取代）、mix-matrix.json |
| 本轮独立快照 / 逐笔撤销 / 负向故障 | artifacts/m1/acceptance-correction/snapshot-independence.json、undo-20-results.json、undo-21-results.json、negative-control/ |
| 本轮功能 / 降级 / 新录制的回归操作证据 | artifacts/m1/acceptance-correction/test-e2e-results.json、workflow-results.json、fallback-results.json、workflow.webm、actual-painting.png；原展示材料没有替换 |
| 环境 | artifacts/m1/environment.json、os.json、cpu.json、system-gpus.json、displays.json |
| 初版与第一轮 | artifacts/m1/initial/、artifacts/m1/round-1/ |

## 改动、限制与停止点

新增 AGENTS.md 落实用户批准的执行规则；新增应用配置与锁文件；src/main.tsx 和 style.css 实现页面，painting 目录负责输入/刷毛/混色/历史，rendering 负责材质/降级/导出；tests 与 artifacts/m1 提供测试和真实证据；README.md、SOURCES.md 与本报告说明运行、许可与限制。

全部既有产品资料、参考图与 M0 计划保留。上述应用开发是上一轮 M1 交付；之后曾按用户授权提交并部署。本轮验收补正仅修改测试、测试证据输出配置、报告和本地验收索引；验收补正完成时尚未提交或推送，后续授权的同步记录见下节。没有重新部署，没有新增依赖、收费服务或产品功能。开始补正时已有的 `artifacts/m1/server-5174.log` 修改保留，其已有服务重启记录及补正期间的页面重载记录随验收资料归档。

M1 的作品仅保留在当前页内存，刷新会丢失；导出后浏览器也不提供可编辑项目文件。降级导出不含正常档局部光照。主题引导、持久化、签名、完成页均未实施，M2 未启动。

已停止 M1 开发。下一步仅等待用户确认 V4 视觉与手感，以及是否接受上述剩余差异。

## 后续授权与按步骤同步远端

验收补正完成后，用户明确要求“每一步的执行都提交到远端”。已将“每完成一个可独立审阅、可验证的执行步骤就提交并推送”写入 AGENTS.md，并依次同步到 origin/main：

- [978f5c6：执行规则](https://github.com/yydshly/0906_codexgpt6_project/commit/978f5c6)。
- [c75332d：独立撤销预期、故障注入反例及本轮原始验证证据](https://github.com/yydshly/0906_codexgpt6_project/commit/c75332d)。原始命令日志保留测试运行器输出，包括其末尾空白，不把日志格式提示作为功能测试失败。
- 本报告、人工验收索引、入口可用性记录与服务器日志作为资料整理步骤单独提交并推送；完整记录见 [提交历史](https://github.com/yydshly/0906_codexgpt6_project/commits/main/)。

这次授权解除远端同步限制，未要求重新部署。现有 main 推送会触发 Pages，本次各提交使用 GitHub 支持的 `[skip ci]` 跳过该自动工作流（[官方说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)），本地 typecheck、build、7 项引擎测试和 4 项浏览器测试结果仍以补正章节为准。V4 继续待用户确认，未进入 M2。
