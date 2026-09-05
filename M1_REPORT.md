# M1 交付与实际验收报告

日期：2026-09-06（北京时间）。范围：仅 M1。实现与自动化验证完成，V4 人工视觉和手感验收 **待用户确认**；未进入 M2。

## 实际交付

已建立“慢光”数字油画室。在同一个设计过的暖色桌面页面内，右侧选择六种颜料，用平头笔连续绘画，切换覆盖/基础混色，调节大小和上色量，撤销最近 20 笔，确认清空或导出真实 1024×1024 PNG。

作品来自 CPU RGBA8 颜色/覆盖和 Uint16 高度数组，WebGL2 按实际高度生成局部光照。没有参考图揭幕、预制画作、普通圆头线冒充刷毛或运行时模型调用。PNG 来自独立原生工作分辨率渲染目标，含画布与真实笔触，不含页面工具和光标。

完整证据可打开 [本地验收索引](http://127.0.0.1:5174/artifacts/m1/index.html)，其中包含初版、第一轮和最终样本对照。

## 启动和复现

实际启动日志确认地址：[http://127.0.0.1:5174/](http://127.0.0.1:5174/)。服务仅监听本机。5173 原有另一个项目在运行，本轮保留该服务，使用 5174。

```powershell
Set-Location E:\0906_codexgpt6_project
npm ci
npm run dev
```

也可显式运行 `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`。启动记录见 [server-5174.log](artifacts/m1/server-5174.log)，启动错误输出为空。最初 5173 占用记录保留在 server-error.log，没有隐藏这个环境调整。

| 命令 | 最终结果 | 原始证据 |
| --- | --- | --- |
| npm run typecheck | 通过 | artifacts/m1/typecheck.log |
| npm run build | 通过 | artifacts/m1/build.log；生成 dist |
| npm run test:engine | 通过，4 项 | artifacts/m1/test-engine-results.json |
| npm run test:e2e | 通过，4 项 | artifacts/m1/test-e2e-results.json |
| npm run test:perf（当时首项基准） | 通过，4 组 60 秒与五轮内存循环 | artifacts/m1/test-perf-results.json、perf.json、memory.json |
| npx playwright test --project=performance -g 'actual pointer pipeline' | 通过，补充鼠标全路径、20 次 UI 撤销、录像解码 | artifacts/m1/npx-results.json、ui-perf.json、video-check.json |

当前 `npm run test:perf` 已包含上述两项性能测试，可一次复现；本次为了避免重复四组已通过的基准，第二项单独执行。最终共 10 项自动化测试通过；不是用测试数量替代美感验收。

## 验收状态

| 条目 | 状态 | 实际验证与限制 |
| --- | --- | --- |
| F1 启动 | 通过 | Vite 实际运行，Chrome 页面无 pageerror，正常 WebGL2 绘制 |
| F2 取色/落笔 | 通过 | 真实鼠标拖动改变像素；换色影响新笔，正常抬起结束 |
| F3 稳定输入 | 通过（已测范围） | 慢直线、快弧线、转向、外部抬笔、pointercancel、失焦、捕获丢失、绘制中 resize；cancel/blur 部分由事件注入测试，非人工 Alt+Tab 手感 |
| F4 参数 | 通过 | 大小与上色量的像素覆盖/高度变化分别验证；UI 滑块可键盘操作 |
| F5 覆盖/基础混色 | 通过 | 固定黄蓝交叉、相同轨迹覆盖对照、接触外不变；RYB 同色、白提亮、黄红/红蓝数值有界验证。非光谱准确 |
| F6 撤销 | 通过 | 引擎逐字节恢复颜色/高度；21 笔撤最近 20 笔后正确留第一笔；实际 UI 画 20 笔再撤 20 次，两个状态 SHA-256 均与空白一致；撤销后新画与清空撤销也测过 |
| F7 PNG 导出 | 通过 | 实际点击按钮下载、浏览器解码 1024×1024；54,873 像素具有明显色差，文件非空；与导出时同一作品再渲染的 PNG 字节一致 |
| F8 布局变化 | 通过（已测范围） | 1440×900 ↔ 1100×760，作品不变；CSS zoom 125% 后继续画。浏览器菜单缩放另列未测试 |
| V1 页面 | 通过（设计结构与证据） | 实际首屏有桌面层次、织纹画布、木板颜料与紧凑工具；没有截图视频控件；审美认可仍归 V4 |
| V2 固定样本 | 通过（证据与可观察特征） | 三张来自同一实际引擎的固定样本，呈现方向刷毛、边缘和局部高度；关闭高度光照对照已保存。是否达到投资门槛由 V4 判断 |
| V3 操作录像 | 通过 | 30.24 秒，1440×900，包含选色、真实绘制、混色、撤销和导出；Chrome 解码并取第 27 秒帧成功 |
| V4 人工视觉/手感 | 待用户确认 | 未自评拟真程度，不宣布已达到参考效果 |
| 性能门槛 | 通过（此机器与测量范围） | 见下表，均达到平均 ≥30、p95 ≤50ms；少量最长帧明显高于 p95，完整披露 |
| 内存边界 | 通过（显式缓冲与可得堆指标） | 五轮稳定，历史不超过 20；不等于已测完整浏览器/GPU 驱动内存 |
| GL 不可用/丢失/恢复 | 通过 | 强制拒绝初始化后仍能画、混、撤、导出、重试；WEBGL_lose_context 后，降级期间新增作品也在恢复时保留 |
| 触摸/触控笔/iPad 真机 | 未测试 | 不宣称真实压感或完整设备适配 |
| 人工 Alt+Tab、浏览器菜单缩放、Edge/Firefox/低端设备 | 未测试 | 不将合成事件、CSS zoom 和本机 Chrome 结果外推 |
| 实际内存耗尽与 PNG 编码失败注入 | 未测试 | 有错误处理，但本轮未造成系统级耗尽或主动破坏编码器 |

## 性能与内存数据

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
| 性能 / 内存 / 20 笔撤销 / 颜色矩阵 | artifacts/m1/perf.json、ui-perf.json、memory.json、undo-results.json、mix-matrix.json |
| 环境 | artifacts/m1/environment.json、os.json、cpu.json、system-gpus.json、displays.json |
| 初版与第一轮 | artifacts/m1/initial/、artifacts/m1/round-1/ |

## 改动、限制与停止点

新增 AGENTS.md 落实用户批准的执行规则；新增应用配置与锁文件；src/main.tsx 和 style.css 实现页面，painting 目录负责输入/刷毛/混色/历史，rendering 负责材质/降级/导出；tests 与 artifacts/m1 提供测试和真实证据；README.md、SOURCES.md 与本报告说明运行、许可与限制。

全部既有产品资料、参考图与 M0 计划保留。没有提交或推送 Git，没有发布、部署、收费服务或图片上传。

M1 的作品仅保留在当前页内存，刷新会丢失；导出后浏览器也不提供可编辑项目文件。降级导出不含正常档局部光照。主题引导、持久化、签名、完成页均未实施，M2 未启动。

已停止 M1 开发。下一步仅等待用户确认 V4 视觉与手感，以及是否接受上述剩余差异。
