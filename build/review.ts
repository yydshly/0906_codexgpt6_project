import type { Plugin } from 'vite';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

// Publish the existing evidence pages and only the media/data they link to.
// Original historical HTML, samples and recordings are never edited.
const pages = ['review/index.html', 'artifacts/m1/index.html', 'artifacts/m2/index.html', 'artifacts/e1/prepared-studio/index.html', 'artifacts/e1/structure-mode/index.html', 'artifacts/e1/finished-quality/index.html'];
const repo = 'https://github.com/yydshly/0906_codexgpt6_project/blob/main/';
export function reviewPages(): Plugin {
  let root = '', out = '', base = '/', building = false;
  const render = (file: string, html: string) => {
    html = html.replaceAll('href="http://127.0.0.1:5174/"', `href="${base}"`)
      .replaceAll('打开本机画室', '打开当前画室').replaceAll('进入本机画室', '打开当前画室');
    html = html.replace(/href="([^"?#]+\.md)"/g, (match, link: string) => /^https?:/.test(link) ? match : `href="${repo}${relative(root, resolve(root, dirname(file), link)).split(sep).join('/')}"`);
    if (file === 'review/index.html') return html;
    if (file.startsWith('artifacts/e1/')) {
      return html.replace(/(<body>|<main>)/, '$1<p style="padding:12px;border:1px solid #c7b99c">发布说明：本页保留当时实验结论，最新实验现已发布供观察；历史“未部署”描述对应交付时状态。成品质量未通过及人工待确认状态不变。</p>');
    }
    const m1 = file.includes('/m1/');
    const nav = `<style>.review-nav{max-width:1120px;margin:20px auto 0;padding:14px 24px;display:flex;gap:22px;flex-wrap:wrap;border-bottom:1px solid #cfc3af;font:13px/1.7 system-ui,sans-serif}.review-nav a{color:#5c6a4d}.review-nav a[aria-current]{font-weight:700;text-decoration:none}</style><nav class="review-nav" aria-label="体验与验收导航"><a href="${base}review/">体验与验收总览</a><a href="${base}" target="_blank" rel="noopener">打开完整画室 ↗</a><a href="${base}artifacts/m1/index.html"${m1 ? ' aria-current="page"' : ''}>M1 实际验收</a><a href="${base}artifacts/m2/index.html"${m1 ? '' : ' aria-current="page"'}>M2 完整体验</a></nav>`;
    if (m1) html = html.replace('没有预制画作，未进入 M2。', '此页保留 M1 交付时的历史证据；当前画室已包含 M2 完整体验。').replace('<h2>当前画室</h2>', '<h2>M1 交付时的画室</h2>');
    html = html.replace('进入画室需要本地 5174 服务运行。', '上方导航可进入当前画室和 M2 体验资料。')
      .replace('进入画室需保持本地 5174 服务运行。', '可通过上方导航打开当前完整画室。');
    return html.replace('<body>', `<body>${nav}`);
  };
  return {
    name: 'slowlight-review-pages',
    configResolved(config) { root = config.root; out = resolve(root, config.build.outDir); base = config.base; building = config.command === 'build'; },
    transformIndexHtml(html, context) {
      const filename = context.filename ? relative(root, context.filename).split(sep).join('/') : '';
      const file = pages.find(page => filename === page || context.path.endsWith(`/${page}`));
      return file ? render(file, html) : html;
    },
    closeBundle() {
      if (!building) return;
      const assets = new Set<string>();
      for (const file of pages) {
        const html = readFileSync(resolve(root, file), 'utf8');
        for (const match of html.matchAll(/(?:href|src|poster)="([^"?#]+)"/g)) {
          const link = match[1];
          if (/^(https?:|data:|#|\/)/.test(link) || !['.png', '.jpg', '.jpeg', '.webm', '.json', '.log'].includes(extname(link))) continue;
          const path = relative(root, resolve(root, dirname(file), link));
          if (path.startsWith('..') || path.includes(':')) throw new Error(`Evidence path outside project: ${link}`);
          assets.add(path);
        }
        const target = resolve(out, file); mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, render(file, html));
      }
      const manifest = [];
      for (const file of assets) {
        const source = resolve(root, file), target = resolve(out, file);
        mkdirSync(dirname(target), { recursive: true }); copyFileSync(source, target);
        const bytes = readFileSync(source);
        manifest.push({ path: file.split(sep).join('/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
      writeFileSync(resolve(out, 'review/evidence-manifest.json'), JSON.stringify(manifest, null, 2));
      console.log(`Published review navigation and ${manifest.length} unchanged evidence files.`);
    },
  };
}
