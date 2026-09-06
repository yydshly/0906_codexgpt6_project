# 来源与使用条件

核对日期：2026-09-06。版本和许可证从本地安装包 package.json 实查；完整传递依赖固定在 package-lock.json，各包 LICENSE 随 node_modules 安装。没有付费运行能力或远端模型 API。

| 直接依赖 | 锁定版本 | 许可证 | 官方来源 |
| --- | --- | --- | --- |
| react / react-dom | 19.2.8 | MIT | https://github.com/facebook/react |
| vite | 8.2.2 | MIT | https://github.com/vitejs/vite |
| @vitejs/plugin-react | 6.1.1 | MIT | https://github.com/vitejs/vite-plugin-react |
| typescript | 7.0.2 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| @playwright/test | 1.63.0 | Apache-2.0 | https://github.com/microsoft/playwright |
| @types/node | 26.4.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react | 19.2.18 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react-dom | 19.2.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

本地安装时 npm audit 报告 0 个已知漏洞（当时的依赖与数据库结果，不是永久安全保证）。

## 项目自制内容

页面设计、图标 SVG、木板程序纹理、颜料按钮 CSS、画布纹理函数、定向刷毛/历史/导出代码为本项目编写。没有引入第三方图片、字体下载、预制画作或画笔材质资产。字体使用系统已有字体。

RYB 转换代码使用去公共白分量、黄绿分解与范围归一化的近似运算，自行实现并用固定色对验证，没有复制 Fluid Paint、商业颜料引擎或付费混色库。它不代表光谱/化学准确性。

用户提供的 oil-painting-product-kit/reference/reference.png 仅作为布局、材料和氛围参考，不属于运行素材，不进入任何导出。

## API 文档依据

- [Vite 启动与 Node 要求](https://vite.dev/guide/)
- [WebGL 资源预算、避免同步阻塞与纹理上传](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- [Pointer Events 合并采样](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents)
- [Pointer Events 压力语义](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pressure)
- [Playwright 录像保存](https://playwright.dev/docs/videos)

M2 没有增加运行或测试依赖。四步引导文案与 SVG 轮廓为本项目编写；保存使用浏览器 IndexedDB 和 Web Crypto，签名使用系统字体与 Canvas 2D，在已有真实材质导出结果上合成。

- [IndexedDB 使用与事务](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [事务 complete 事件：实际提交成功后触发](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event)
- [OffscreenCanvas.convertToBlob：原生 PNG 编码](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/convertToBlob)

上述文档说明接口机制，实际功能与性能以 artifacts/m1 的历史记录及 artifacts/m2 的当前测试结果为准。

## E1 参考与固定照片

规划思想参考 Aaron Hertzmann, 1998, [Painterly Rendering with Curved Brush Strokes of Multiple Sizes](https://mrl.cs.nyu.edu/publications/painterly98/)。使用由粗到细、局部差异选择及梯度切向思路；本项目独立编写实现，没有复制论文配套代码，也未新增依赖。

三张固定输入仅为许可已核对的公开测试素材，用户私图不进入仓库：

- 风景：NPS / Jim Peaco，2014，黄石湖冬景。[文件与许可](https://commons.wikimedia.org/wiki/File:View_of_Yellowstone_Lake_from_Bluebell_Pool_in_West_Thumb_Geyser_Basin_(05b9248a-1dd8-b71b-0ba2-f766d11fbc0f).jpg)。美国联邦政府 NPS 公务作品，美国公共领域。固定输入为 Commons 1280×853 缩略版本，保留完整构图，非作者 5184×3456 原始相机文件；在首次算法输出前固定。
- 静物：mcfoodie，2013，[Coffee cup and coffee bean](https://commons.wikimedia.org/wiki/File:Coffee_cup_and_coffee_bean.jpg)，CC0 1.0。固定原文件 1547×1024。
- 复杂场景：Chris Spielmann / National Cancer Institute，2002，[City street at night](https://commons.wikimedia.org/wiki/File:City_street_at_night.jpg)。作者释放至公共领域，NCI 图号 3531；固定原文件 3642×2406。保留作者与机构署名。

artifacts/e1/fixtures/manifest.json 记录固定文件 SHA-256 和参数。照片仅用于测试输入/对照；结果来自现有引擎笔触。不以自动化成功或误差指标代替人工质量验收。

E1 细节补正继续使用相同照片与论文思路。512 像素分析、空间配额、边缘截断、细笔和薄颜料参数均为本项目编写，未引入第三方代码或依赖。新参数另记 artifacts/e1/refinement/manifest.json，历史参数与证据保持不变。

可见笔尖 SVG 为本项目自行绘制。它只显示实际采样位置和抬笔状态，不读取参考图，不进入作品数组和 PNG。


E1 笔头与沾色过程增量：SVG 木柄、金属箍及刷毛由本项目代码绘制，无新增图片或第三方实现。局部非相交笔触调序与取色计划为本项目原创实现；继续使用上述三张固定授权照片，无新增依赖。

E1 预备笔具与固定色盘布局草案：笔架、不同宽度的平刷及色盘均为本项目原创 CSS 示意，使用系统字体，没有引入照片、外部字体或第三方图标素材。`artifacts/e1/prepared-layout` 中的 PNG 是该草案的实际浏览器截图，不是新的绘画结果。布局验证使用项目已有的 Playwright，没有新增运行或测试依赖。

布局草案 02 参考本项目原版 `src/style.css` 与 `artifacts/m1/page.png` 的画布/木板构成，笔架、色盘与纸张示意仍为原创 CSS，未引入第三方素材或依赖。新截图独立保存于 `artifacts/e1/prepared-layout-v2`，未覆盖第一稿或历史绘画证据。

E1 备料实施：本地加权中位切分、材料清单与取用调度由本项目独立编写；木板样式沿用项目原版 CSS，笔架复用项目已有 SVG 笔具显示。没有复制第三方量化代码、引入新依赖或上传图片。继续使用既有三张授权照片，证据写入 `artifacts/e1/prepared-studio`。

E1 可选结构优先模式：颜色边缘权重、几何区域内材料任务和模式切换均为本项目自行实现，复用现有绘画、渲染与测试工具，没有新增第三方代码、依赖、字体或图片素材。继续使用同一批固定授权照片；证据在 `artifacts/e1/structure-mode`。未复制、上传或提交用户私人照片与其结果。
# 自动成品质量增量

- 录像采样解码使用本机已经安装的 FFmpeg n6.1.3-20250831，仅作为证据检查工具，未安装新依赖、未随应用打包或分发二进制。文件协议下浏览器画布读回限制保持启用；直接从本地实际录像解码首/中/末采样帧，结果仍在私人目录。

- 独立人物验证照片：NASA S99-00858，原地址与锁定 SHA-256 见 artifacts/e1/finished-quality/fixtures/README.md。NASA 媒体使用说明 https://www.nasa.gov/nasa-brand-center/images-and-media/ 于本轮核对；仅信息与算法对照，不作宣传、代言或训练，成品标为项目输出。
- 新质量规划与覆盖范围验证为本项目原创代码，沿用已有 Painting/StudioRenderer 和依赖；未引入第三方算法实现、模型或服务。私人诊断沿用仓库外既有资料，不纳入公开素材。
