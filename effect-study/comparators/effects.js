// Reading aids for public reference media. No product algorithm, paint state or export is modified.
const effectSets = {
  oilbrush: {
    source:'https://digitalmasterpieces.com/oilbrush/',
    conclusion:'这组主要改变笔触与色块：山、树、河流的位置基本相同，天空却能变成软色块、颗粒或长条纹理。更多纹理不自动等于更多原图细节。',
    items:[
      {name:'柔和块面',look:'天空被概括为大的明暗块；岸边树木较松散。',observe:'对照天空与远山交界：边缘变软，空间的大关系仍在。'},
      {name:'颗粒色块',look:'天空出现较明显的短色点；石头边缘更碎。',observe:'同一片天空多了彩色颗粒。这是笔触表达变化，不能据此认定还原度更高。'},
      {name:'长纹理与强色彩',look:'天空有连续的起伏纹理；树木与石头颜色更强。',observe:'这张在纹理和配色上变化最明显，适合判断是否接受较强的风格干预。'},
      {name:'密集细笔',look:'树丛与水面更密集，天空保留较连贯的蓝色。',observe:'从整片色块转向较密集的细小痕迹；“看起来细”与保留真实细节仍需配对原图验证。'}
    ].map((e,i)=>({...e,url:`https://digitalmasterpieces.com/wp-content/uploads/2022/09/Oilbrush-Slider${i+1}.png`}))
  },
  becasso:{
    source:'https://digitalmasterpieces.com/BeCasso/',
    conclusion:'这组跨越材料与风格：同样的大桥轮廓，可以变成蓝天彩绘、暖色表现、排线或黑白。它说明风格范围，不说明某一种必然更像原图。',
    items:[
      {name:'蓝天彩绘',look:'保留彩色场景，海面与天空较平滑。',observe:'桥塔和拉索仍清楚，局部渐变更接近连续的色面。'},
      {name:'暖色表现',look:'天空和海面转为橙紫色，云和岩石更夸张。',observe:'构图近似不变，但光线氛围被重新解释；属于配色与风格的变化。'},
      {name:'排线质感',look:'天空、石头和水面出现密集短线。',observe:'材料表达由色面变为线条；“有更多线”不等于“原照片有更多细节”。'},
      {name:'黑白线描',look:'去除色彩，依靠明暗和线条交代结构。',observe:'这是另一种绘画媒介目标，不能与彩色油画按清晰度简单排名。'}
    ].map((e,i)=>({...e,url:`https://digitalmasterpieces.com/wp-content/uploads/2022/09/BeCasso-Slider${i+1}-1.png`}))
  }
};
const el=id=>document.getElementById(id);
let series='oilbrush', seriesToken=0;
function makeFigure(url,caption){const f=document.createElement('figure'),img=document.createElement('img'),c=document.createElement('figcaption');img.src=url;img.alt=caption;img.referrerPolicy='no-referrer';c.textContent=caption;f.append(img,c);return f;}
function showEffects(a,b){
  const set=effectSets[series];
  el('lightbox-title').textContent=`${series==='oilbrush'?'Oilbrush':'BeCasso'} / 同场景 A、B 效果 / 外观描述非预设名`;
  const left=makeFigure(set.items[a].url,`A · ${set.items[a].name} — ${set.items[a].observe}`);
  const right=makeFigure(set.items[b].url,`B · ${set.items[b].name} — ${set.items[b].observe}`);
  el('lightbox-images').replaceChildren(left,right);el('lightbox').showModal();
}
function showSeries(id){
  series=id;const token=++seriesToken,set=effectSets[id];
  document.querySelectorAll('[data-series]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.series===id)));
  el('series-source').href=set.source;el('series-conclusion').textContent=set.conclusion;
  for(const key of ['effect-a','effect-b'])el(key).replaceChildren(...set.items.map((s,i)=>new Option(`${i+1}. ${s.name}`,String(i))));
  el('effect-a').value='0';el('effect-b').value='2';
  el('series-status').textContent='正在载入同场景效果…';el('series-status').classList.remove('failed');
  const cards=set.items.map((s,i)=>{
    const a=document.createElement('article'),button=document.createElement('button'),img=document.createElement('img'),h=document.createElement('h3'),p=document.createElement('p'),small=document.createElement('span');
    img.src=s.url;img.alt=`${id} 官方同场景效果 ${i+1}：${s.name}`;img.referrerPolicy='no-referrer';button.className='style-image-button';button.append(img);button.setAttribute('aria-label',`将${s.name}选为 B 并与 A 比较`);button.addEventListener('click',()=>{el('effect-b').value=String(i);showEffects(Number(el('effect-a').value),i);});
    h.textContent=`0${i+1} / ${s.name}`;p.textContent=s.look;small.textContent='外观描述 · 点击与 A 对比';a.append(button,h,p,small);return a;
  });el('style-cards').replaceChildren(...cards);
  Promise.all(cards.map(async c=>{try{await c.querySelector('img').decode();return true;}catch{return false;}})).then(ok=>{
    if(token!==seriesToken)return;const pass=ok.every(Boolean);
    el('series-status').textContent=pass?'四份官方效果已载入 · 非原图 / 成品对照，未在本机生成':'部分官方效果无法载入，请打开官方出处；未使用替代图。';el('series-status').classList.toggle('failed',!pass);
  });
}
document.querySelectorAll('[data-series]').forEach(b=>b.addEventListener('click',()=>showSeries(b.dataset.series)));
el('compare-effects').addEventListener('click',()=>showEffects(Number(el('effect-a').value),Number(el('effect-b').value)));

// Normalized rectangles locate inspection views in these public, already paired samples only.
// They are never used for planning or user photographs.
const details={
  oilbrush:{aspect:1500/996,views:[
    {name:'人物轮廓与皮肤',rect:[.32,.08,.45,.57],note:'看女性鼻尖、额头与头发交界：轮廓仍容易辨认，皮肤与发丝被概括得更平滑。这种“保形、减纹理”和把脸画成大块模糊色斑不同。'},
    {name:'衣服与肩膀',rect:[.27,.48,.60,.50],note:'条纹与衬衫边缘仍在，但褶皱更流畅。关键问题是线条是否还对应原图，而不是表面看起来有多少刷痕。'},
    {name:'背景概括',rect:[.01,.02,.30,.62],note:'树与背景灯光被合并为更平滑的块面；此处细节可减少，主体与背景的分界仍应保住。'}]},
  becasso:{aspect:2000/1273,views:[
    {name:'建筑边缘与门窗',rect:[.04,.06,.43,.55],note:'比较门窗、阳台与屋檐：结构还在，色彩与轮廓表达更强。局部是否真实保留，应与左侧照片逐处对应。'},
    {name:'水面与倒影',rect:[.19,.58,.58,.39],note:'水面同时有概括与细碎反光。风格更鲜明不自动意味着细节更准确，观察反光和船的位置是否一致。'}]}
};
function selectDetail(product,sample,index){
  const config=details[product],v=config.views[index],[x,y,w,h]=v.rect;
  el('detail-buttons').querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  const figures=[['官方原图 · 相同位置',sample.before],['官方效果 · 相同位置',sample.after]].map(([caption,url])=>{
    const f=document.createElement('figure'),frame=document.createElement('div'),img=document.createElement('img'),c=document.createElement('figcaption');
    frame.className='detail-window';frame.style.aspectRatio=String(config.aspect*w/h);img.src=url;img.alt=`${caption} / ${v.name}`;img.referrerPolicy='no-referrer';img.style.width=`${100/w}%`;img.style.height=`${100/h}%`;img.style.left=`${-x/w*100}%`;img.style.top=`${-y/h*100}%`;frame.append(img);c.textContent=caption;f.append(frame,c);return f;
  });el('detail-images').replaceChildren(...figures);el('detail-explanation').textContent=v.note;
}
function refreshDetails({product,sample}){
  const has=Boolean(details[product]&&sample.before);el('detail-study').hidden=!has;
  if(!has){el('detail-images').replaceChildren();return;}
  el('detail-buttons').replaceChildren(...details[product].views.map((v,i)=>{const b=document.createElement('button');b.textContent=v.name;b.addEventListener('click',()=>selectDetail(product,sample,i));return b;}));
  selectDetail(product,sample,0);
}
document.addEventListener('comparator-sample',e=>refreshDetails(e.detail));
document.querySelectorAll('[data-tour]').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.tour==='styles'){el('style-lab').scrollIntoView({block:'start'});return;}
  const id=b.dataset.tour==='portrait'?'oilbrush':'dap';document.querySelector(`[data-product="${id}"]`).click();
  if(id==='dap'){el('sample').value='3';el('sample').dispatchEvent(new Event('change'));}
  (id==='oilbrush'?el('detail-study'):el('viewer')).scrollIntoView({block:'start'});
}));
showSeries('oilbrush');
// The preceding script initializes before this listener; trigger the current selection once.
document.querySelector('[data-product][aria-pressed="true"]').click();
