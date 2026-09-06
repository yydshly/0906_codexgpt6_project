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
