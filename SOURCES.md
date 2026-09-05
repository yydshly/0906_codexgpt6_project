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

上述文档说明接口机制，实际功能与性能以 artifacts/m1 的测试结果为准。
