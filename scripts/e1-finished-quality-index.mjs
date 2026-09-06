import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root='artifacts/e1/finished-quality';
const samples={
  'portrait-holdout':{name:'独立人物验证图 · 未参与调参',box:[330,90,260,285],finding:'未通过。面部、头发与颈圈仍有明显缺失；第一轮在私人案例中的改善没有稳定迁移。'},
  landscape:{name:'原固定风景',box:[480,300,260,245],finding:'远景和树群仍能辨认，但细枝不完整，前景和天空留有大笔概括痕迹。不能视为全面画质提升。'},
  'still-life':{name:'原固定静物',box:[460,240,300,330],finding:'未通过稳定改善目标。杯体仍可辨，但咖啡豆碎裂，笔触空隙与杯口细节仍明显。'},
  complex:{name:'原固定复杂场景',box:[80,270,340,330],finding:'未通过精细成品目标。街道整体仍可辨，车辆、招牌与建筑局部大量简化。'}
};
const png=(file,label)=>`<figure><a href="${file}"><img src="${file}" loading="lazy" alt="${label}"></a><figcaption>${label}</figcaption></figure>`;
const crop=(file,box,label)=>`<figure><svg viewBox="${box.join(' ')}" role="img" aria-label="${label}"><rect width="1024" height="1024" fill="#f2eee2"/><image href="${file}" width="1024" height="1024"/></svg><figcaption>${label}</figcaption></figure>`;
const rows=[],cards=[];
for(const [name,sample] of Object.entries(samples)){
  const dir=`frozen/${name}`,r=JSON.parse(readFileSync(`${root}/${dir}/results.json`,'utf8')),[b,q]=r.summaries;
  const plan=JSON.parse(readFileSync(`${root}/${dir}/quality-plan.json`,'utf8'));
  assert.equal(plan.inputHash,r.inputHash);assert.equal(plan.seed,1906);assert.equal(plan.composition,'contain');
  rows.push({sample:name,baseline:b.strokes,quality:q.strokes,pickups:[b.pickups,q.pickups],planningMs:[r.baselinePlanningMs,r.qualityPlanningMs],offlineComputeMs:[b.computeMs,q.computeMs],materials:[b.materials,q.materials],qualityObjective:'未通过 / 不宣称全面改善'});
  const files=[['source-composed.png','同构图原图'],['baseline-stage-5.png','当前结构优先基线'],['quality-stage-5.png','第一轮策略 · 实际输出']];
  cards.push(`<section><h2>${sample.name}</h2><p class="failure">${sample.finding}</p><div class="compare">${files.map(([f,l])=>png(`${dir}/${f}`,l)).join('')}</div><h3>同一局部 · 同一放大尺度</h3><div class="compare crops">${files.map(([f,l])=>crop(`${dir}/${f}`,sample.box,l)).join('')}</div><p>笔数 ${b.strokes} → ${q.strokes}；取色 ${b.pickups} → ${q.pickups}；材料 ${b.materials} → ${q.materials} 盘。规划 ${(r.baselinePlanningMs/1000).toFixed(2)} → ${(r.qualityPlanningMs/1000).toFixed(2)} 秒；离线实际绘画计算 ${(b.computeMs/1000).toFixed(2)} → ${(q.computeMs/1000).toFixed(2)} 秒，均不含动作播放。数值不替代画质。</p><details><summary>五个真实笔触阶段（离线执行，不是过程录像）</summary><div class="stages">${[1,2,3,4,5].map(i=>png(`${dir}/quality-stage-${i}.png`,`阶段 ${i}`)).join('')}</div></details><nav><a href="${dir}/quality-stage-5.png" download>实际 PNG</a><a href="${dir}/quality-plan.json">新策略可重放计划</a><a href="${dir}/baseline-plan.json">基线计划</a><a href="${dir}/results.json">原始测量与状态</a><a href="${dir}/prepared.png">实际应用入口</a></nav></section>`);
}
writeFileSync(`${root}/comparison.json`,JSON.stringify({status:'通过',scope:'Fixed inputs, native PNGs, plans and measured counts. Visual quality objective NOT passed.',rows},null,2));
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>慢光 · 自动成品质量实测</title><style>body{margin:0;background:#efe9dd;color:#514a3d;font:14px/1.8 "Microsoft YaHei",sans-serif}main{max-width:1280px;margin:auto;padding:30px}h1,h2{font-family:KaiTi,serif;font-weight:400}h1{font-size:34px}section{margin:26px 0;background:#fff9ef;border:1px solid #bbae98;padding:20px}a{color:#52634b}nav{display:flex;gap:16px;flex-wrap:wrap}.failure{padding:10px;background:#eee0ca;border-left:3px solid #9a7450}.compare{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}figure{margin:0}img,svg{display:block;width:100%;background:#f2eee2}img{aspect-ratio:1;object-fit:contain}figcaption{font-size:12px;color:#7b715f}.crops svg{height:300px}.stages{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0}summary{cursor:pointer}details{margin:18px 0}@media(max-width:700px){main{padding:14px}.compare{grid-template-columns:1fr}.stages{grid-template-columns:repeat(2,1fr)}}</style><main><p>SLOWLIGHT / FINISHED QUALITY STUDY</p><h1>有局部收益，尚未达到自动成品目标。</h1><p class="failure">两轮已停止。第二轮减少动作却丢失更多结构，未采用；保留第一轮作可选实验。独立人物验证未通过，不能将它宣称为人物修复完成，也不让用户手动补画承担失败。</p><p>原版和结构优先保留；此分支未合并 main、未部署。这里是验收对照页，可绘画入口在画室中的“图片自动绘制 · 实验”→“成品细节 · 实验”。</p><nav><a href="../../../" target="_blank" rel="noopener">打开慢光画室 ↗</a><a href="../../../E1_FINISHED_QUALITY_REPORT.md">本轮报告</a><a href="comparison.json">耗时、笔数及动作对照</a><a href="fixtures/README.md">独立验证图来源与冻结记录</a></nav><p>四组均为相同输入、contain 构图、1024 作品、seed 1906。局部框仅用于验收显示，不参与规划。原图不进入作品。私人原图、实际录像和计划只在仓库外本地入口提供，未上传。</p>${cards.join('')}<p>NASA 独立验证照片仅用于信息与算法检验，原图来源 NASA；笔触输出属于本项目，不代表 NASA 审核或认可。M1 V4、M2 与本轮人工成品/过程继续待用户确认。</p></main></html>`;
for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g))assert.ok(existsSync(resolve(root,m[1])),`Missing ${m[1]}`);
writeFileSync(`${root}/index.html`,html);
console.log(JSON.stringify({status:'通过',comparisons:rows.length,visualQuality:'未通过'}));
