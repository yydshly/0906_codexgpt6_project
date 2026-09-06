import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = 'artifacts/e1/structure-mode';
const samples = { landscape: '风景', 'still-life': '简单静物', complex: '复杂场景' };
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const batchStats = plan => {
  const sizes = plan.pickups.map((p, i) => (plan.pickups[i + 1]?.before ?? plan.strokes.length) - p.before);
  return { strokes: plan.strokes.length, pickups: sizes.length, perPickup: plan.strokes.length / sizes.length, singleFraction: sizes.filter(n => n === 1).length / sizes.length, brushChanges: plan.processMetrics.brushChanges };
};
const comparisons = Object.keys(samples).map(sample => {
  const old = read(`artifacts/e1/prepared-studio/c/${sample}/plan.json`), next = read(`${root}/b-fixed/${sample}/plan.json`), result = read(`${root}/b-fixed/${sample}/results.json`);
  assert.equal(next.inputHash, old.inputHash); assert.equal(next.seed, old.seed); assert.equal(next.composition, old.composition);
  assert.deepEqual(result.final, result.independent);
  const png = readFileSync(`${root}/b-fixed/${sample}/final.png`);
  assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024);
  return { sample, original: batchStats(old), structure: batchStats(next), planningMs: result.planningMs, p95BatchMs: result.p95BatchMs, humanQuality: '待用户确认' };
});
writeFileSync(`${root}/comparison.json`, JSON.stringify({ status: '通过', scope: 'Same fixed inputs/seeds/compositions; counts and independent state correspondence, not a quality verdict.', comparisons }, null, 2));
const fig = (path, label) => `<figure><a href="${path}"><img src="${path}" loading="lazy" alt="${label}"></a><figcaption>${label}</figcaption></figure>`;
const cards = comparisons.map(c => {
  const base = `b-fixed/${c.sample}`;
  return `<section><h2>${samples[c.sample]}</h2><div class="compare">${fig(`../fixtures/${c.sample}.jpg`, '固定原图')}${fig(`../prepared-studio/c/${c.sample}/final.png`, '保留的原版实际结果')}${fig(`${base}/final.png`, '结构优先 · 实际结果')}</div><p>原版 ${c.original.strokes} 笔 / ${c.original.pickups} 次取色 → 新模式 ${c.structure.strokes} 笔 / ${c.structure.pickups} 次取色。<br>平均每次取色 ${c.original.perPickup.toFixed(2)} → ${c.structure.perPickup.toFixed(2)} 笔；只画一笔的批次 ${(c.original.singleFraction * 100).toFixed(1)}% → ${(c.structure.singleFraction * 100).toFixed(1)}%。次数减少不等于画质通过。</p><div class="stages">${Array.from({length:5}, (_,i)=>fig(`${base}/stage-${i+1}.png`, `阶段 ${i+1}`)).join('')}</div><details><summary>完整真实过程录像 · 4×，含阶段暂停与导出</summary><video controls preload="metadata" src="${base}/process.webm"></video></details><nav><a href="${base}/final.png" download>实际 PNG</a><a href="${base}/plan.json">实际笔触计划</a><a href="${base}/input.json">固定输入参数</a><a href="${base}/results.json">测试原始记录</a><a href="${base}/reference-hidden.png">关闭原图后的页面</a></nav></section>`;
}).join('');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>慢光 · 原版与结构优先对照</title><style>body{margin:0;background:#efeadf;color:#524b3c;font:14px/1.8 "Microsoft YaHei",sans-serif}main{max-width:1240px;margin:auto;padding:32px}h1,h2{font-family:KaiTi,serif;font-weight:400}h1{font-size:34px}h2{font-size:25px}a{color:#526448}nav{display:flex;gap:18px;flex-wrap:wrap;margin:16px 0}section{background:#fbf7ee;border:1px solid #cabea7;padding:24px;margin:24px 0}.note{padding:15px;background:#e3ddca;border-left:3px solid #958369}.compare{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}figure{margin:0}img{width:100%;aspect-ratio:1;object-fit:contain;background:#ece7d9;display:block}figcaption{color:#7b715c;font-size:12px}.stages{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:20px}video{display:block;width:100%;margin-top:12px}details{margin:18px 0}summary{cursor:pointer}@media(max-width:700px){main{padding:14px}section{padding:14px}.compare{grid-template-columns:1fr}.stages{grid-template-columns:repeat(2,1fr)}}</style></head><body><main><p>SLOWLIGHT / TWO WAYS TO PAINT</p><h1>保留原来的笔触，多一种落笔安排。</h1><p>在图片实验中选择“原版 · 油画笔触”或“结构优先 · 实验”，再准备笔与颜色。切换选项不会清空画作；重新生成前仍需确认替换。</p><nav><a href="../../../" target="_blank" rel="noopener">打开慢光画室 ↗</a><a href="../../../E1_STRUCTURE_MODE_REPORT.md">本轮报告</a><a href="../prepared-studio/index.html">保留的原版验收资料</a><a href="comparison.json">同图动作统计</a><a href="../../../SOURCES.md">图片来源与许可</a></nav><p class="note">结构优先仍用真实笔触，不是原图揭幕。它按局部颜色边缘安排任务，不识别人脸或专业画师步骤。人物相似度、细小文字和复杂场景仍有局限；画作与过程待用户确认，M1/M2 人工验收状态不变。</p><section><h2>两个可用入口与安全切换</h2>${fig('a-checks/switching/mode-prepared.png', '实际页面中的模式选择')}<details><summary>实际切换、取消保留、准备与局部导出录像</summary><video controls preload="metadata" src="a-checks/switching/process.webm"></video></details></section>${cards}<p>这里是本地验收入口。新模式只推送 E1 分支，不替换线上 M2。不包含私人选图。</p></main></body></html>`;
for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) assert.ok(existsSync(resolve(root, m[1])), `Missing target: ${m[1]}`);
writeFileSync(`${root}/index.html`, html);
console.log(JSON.stringify(comparisons, null, 2));
