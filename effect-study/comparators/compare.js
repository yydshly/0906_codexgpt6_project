// Official media references only. This page does not invoke a painting engine or upload images.
const dm = 'https://digitalmasterpieces.com/';
const dap = 'https://www.mediachance.com/dap/';
const painterDoc = 'https://product.corel.com/help/Painter/540213829/Main/EN/Win-Documentation/';
const water = 'https://www.tinrocket.com/apps/waterlogue/standard/';
const products = {
  oilbrush: {
    name:'Oilbrush', category:'FINISHED ART / 油画成品', summary:'先看照片转成油画后，人物还能留下多少细节。',
    look:'官方情侣样例保留侧脸轮廓、发型与衣服关系，皮肤和背景更平滑，能看见方向性的纹理。',
    process:'官方展示的是效果调整。这里的视频不是从空白按笔触重建的证据。',
    relevance:'适合讨论人物成品应保留到什么程度，尤其是脸部辨识和自然的颜色过渡。',
    integration:'厂商有商业 BeCasso Engine API / Webservice；本轮未调用，未核实 Oilbrush 全部效果与笔触数据是否开放。',
    limit:'官方没有在该样例旁完整列出参数或修整过程，不能认定为一键默认效果，更不能证明你的照片也会同样好。',
    source:dm+'oilbrush/', samples:[{title:'人物 · 情侣原图与效果',before:dm+'wp-content/uploads/2022/10/oilbrush-romantic-couple.webp',after:dm+'wp-content/uploads/2022/10/oil-painting-of-a-romantic-couple-created-with-Oilbrush.webp',note:'官方提供的同图前后对照。可重点比较侧脸、额头与头发交界、衬衫线条；具体预设、耗时和人工修整情况未说明。'}],
    video:{type:'video',src:dm+'wp-content/uploads/2022/10/Oilbrush-abstract-paintings-from-photos-on-iPad.mp4',title:'Oilbrush · 官方调节演示',note:'展示 App 中调整油画效果的操作；不是慢光实测，也不是逐笔生成录像。',source:dm+'oilbrush/'}
  },
  dap:{name:'Dynamic Auto Painter',category:'STROKE BY STROKE / 算法重绘',summary:'与慢光的真实笔触方向最接近，人物和材料都值得单独观察。',
    look:'官方人物拼图中可见从概括到细化的不同表现；眼部和胡须特写仍有明显笔触。',process:'官方明确从空白逐笔重建，不使用生成式 AI。V9 介绍了曲线落笔、底层补覆盖与平坦区域衔接。',
    relevance:'结构导向、覆盖完整性和细节区的笔触控制，正好对应慢光现有薄弱处。',integration:'这是 Windows 商业软件；未核实可嵌入网页的 SDK 或能转成慢光画笔的笔触计划接口。',
    limit:'这些是厂商样例，人物拼图没有明确逐幅标明阶段与预设；本页不把它解释成一段确定的生成过程。未用同一人物照片独立复现。',source:dap+'new_v9.html',
    samples:[{title:'人物 · 官方表现拼图',image:dap+'index_html_files/36246.png',caption:'官方人物效果拼图 · 各幅具体阶段 / 设置未说明',note:'保留官方完整拼图，不额外标注“原图”“第几笔”或“最终阶段”。观察轮廓和五官可辨识度，不能用它代替同图实测。'},
      {title:'人物 · 眼部与胡须',image:dap+'index_html_files/36247.png',caption:'官方人物细节样例',note:'官方提供的局部特写。它能展示笔触与五官细节共存的方向，不能单凭特写验证完整构图或相似度。'},
      {title:'风景 · 运河成品',image:dap+'index_html_files/36148.jpg',caption:'官方 Guerbois 9 样例',note:'厂商在该样例处注明为 DAP9 未编辑输出，用于展示平坦区域衔接；本轮未独立复现。'},
      {title:'材料 · 旧引擎与 V9 衔接对照',image:dap+'index_html_files/36249.png',caption:'官方旧引擎（左）与 V9 Fair Engine（右）',note:'同一池塘局部的官方对照：左边用标线指出杂乱的细小痕迹，右边水面衔接更连贯。它示范的是放笔和材料衔接，不是增加输出分辨率；其他设置与耗时未披露。'},
      {title:'轮廓 · 曲线落笔与建筑细节',image:dap+'index_html_files/34995.jpg',caption:'官方建筑局部 · 曲线笔触与窗框',note:'观察笔触怎样沿拱窗和屋檐弯曲。完整图像保留了建筑形体，局部仍能看到起伏的刷痕；未提供这张局部的配对原图。'}]
  },
  painter:{name:'Corel Painter',category:'BRUSH & FORM / 画笔与形体',summary:'自动落笔只是专业画室的一部分，需要区分自动结果与人工完成作品。',
    look:'这里选用自动绘画手册内的儿童照片 / 画作示例，没有拿专业画师的手绘作品冒充自动输出。',process:'Smart Stroke 跟随照片形体；Smart Settings 在细节区调笔宽、长度与压力。支持控制速度和停止。',relevance:'参考如何用实际画笔保留轮廓；但不能直接沿用它需要人工修整的工作流作为慢光默认方案。',
    integration:'Windows / macOS 商业桌面软件；未验证网页调用、批量自动化及授权。',limit:'手册样例分辨率仅 450×298，不能证明高精度人物成品。下方视频为同厂 Painter Essentials 8，不代表 Painter 2023 同版本实测。',source:painterDoc+'Corel-Painter-AutoPainting-Photos.html',
    samples:[{title:'人物 · 自动绘画手册示例',image:painterDoc+'images/Corel-Painter-auto-paint.png',caption:'官方手册：左为照片，右为自动绘画示例',note:'按原样保留手册合图；原图只有 450×298，放大不会增加可判断的细节。具体设置和耗时未披露。'}],
    video:{type:'iframe',src:'https://www.youtube.com/embed/tacCIEwnyRY',title:'Painter Essentials 8 · 官方照片绘画入门',note:'同厂入门版本的操作教学，包含自动与手工工作流。不是本机测试，不作为全自动成品质量证明。',source:'https://learn.corel.com/tutorials/painter-essentials-getting-started-auto-painting/'}
  },
  becasso:{name:'BeCasso',category:'STYLES & CONTROL / 风格与控制',summary:'用同一张运河照片观察风格改变与建筑细节保留。',look:'官方对照保留门窗、船和水面结构，同时提高线条与色块的艺术化表现。',process:'官方提供艺术滤镜、风格迁移与局部调节；未核实可对外导出真实笔触序列。',relevance:'适合研究最终画面中“结构保留”和“风格强度”的取舍。',integration:'厂商明确提供原生 API 与 Webservice；使用需核对商业许可，服务返回笔触计划的能力未验证。',limit:'有局部修整工具不等于默认自动结果足够好。该官方图片的参数与修整记录未披露，不能当作零干预证明。',source:dm+'BeCasso/',
    samples:[{title:'风景 · 运河原图与效果',before:dm+'wp-content/uploads/2022/09/BeCasso-Photo-before.webp',after:dm+'wp-content/uploads/2022/09/BeCasso-ArtWork-After.webp',note:'官方同图前后对照。注意建筑轮廓保留与色彩变化；这是艺术风格样例，不代表油画唯一目标。'}],
    video:{type:'video',src:dm+'wp-content/uploads/2022/10/BeCasso-Adjust-Tools-Overlayed.mp4',title:'BeCasso · 官方效果调节',note:'演示调整控制，可能包含人为参数操作；不解释为自动绘画过程。',source:dm+'BeCasso/'}
  },
  brushstroke:{name:'Brushstroke',category:'PHOTO TO ART / 简洁成品流程',summary:'围绕选风格、调色、画布和签名，完成一张可保存的装饰画。',look:'官方运河与向日葵样例展示较明显的色块和笔触取舍；当前选择的素材没有原图对照。',process:'新核对的官方说明称逐笔重绘，并可分别选择色盘与表面。下方转换动画不能独立验证笔触计划输出。',relevance:'参考成品风格选择和保存路径；色盘、画布与绘画风格是不同的调整，不应全部合称“精度”。',integration:'商业 App；本轮未核实可集成的引擎 SDK 或服务。',limit:'没有配对原图，不能判断遗漏多少结构或人物相似度；动画只展示视觉转换。',source:'https://www.codeorgana.com/photo-to-painting',
    samples:[{title:'风景 · 威尼斯运河',image:'https://www.codeorgana.com/assets/img/brushstroke-venice-canal-painting.jpg',caption:'官方 Brushstroke 成品样例 · 未配原图',note:'单张厂商成品展示，不构成与其他产品的同图比赛。'},
      {title:'静物 · 向日葵',image:'https://www.codeorgana.com/assets/img/brushstroke-sunflower-painting.jpg',caption:'官方静物成品样例 · 未配原图',note:'观察花瓣和背景的概括程度。具体参数、加工过程未提供。'},
      {title:'能力 · 独立选择色盘',image:'https://www.codeorgana.com/assets/img/brushstroke-pro-color-palettes.jpg',caption:'官方 Brushstroke Pro 色盘选择界面',note:'色盘调整作品的配色与氛围。它与增加可见细节是两种能力；这里保留完整软件界面，未把界面截图当作独立成品。'},
      {title:'能力 · 独立选择画布表面',image:'https://www.codeorgana.com/assets/img/brushstroke-pro-3d-canvases.jpg',caption:'官方 Brushstroke Pro 画布选择界面',note:'表面控制纹理与材料表现。原图里缺失的结构不会仅靠更换画布自动恢复；具体算法和可导出数据未验证。'}],
    video:{type:'video',src:'https://www.codeorgana.com/assets/video/brushstroke-photo-to-painting-animation.mp4',title:'Brushstroke · 官方转换动画',note:'这是照片与效果之间的展示动画，不是逐笔从零绘制的证明。',source:'https://www.codeorgana.com/brushstroke'}
  },
  waterlogue:{name:'Waterlogue',category:'WATERCOLOR / 另一种材料方向',summary:'借助水彩的留白与概括，展示不同于油画的成品取舍。',look:'官方人物截图采用明显的暖色与水彩概括。只参考另一种材料语言，不要求慢光改成水彩。',process:'官方提供产品介绍视频；本轮未核实可导出的、可重放的笔触数据。',relevance:'帮助区分有意的风格概括与无意结构损失，也可参考单一画风的成品体验。',integration:'商业 App；未核实可直接接入慢光的接口。',limit:'这是 App 截图，不是原图 / 结果对照，无法凭此判断相似度。水彩质感不能替代油画质量验收。',source:water,
    samples:[{title:'人物 · 水彩效果截图',image:water+'files/stacks-image-e73f985-550x1200.jpg',caption:'官方 Waterlogue 界面与人物样例',note:'保留界面和完整截图，未裁出画作冒充独立生成文件。该样例未配原图。'},
      {title:'另一份官方界面样例',image:water+'files/stacks-image-6542140-550x1200.jpg',caption:'官方 Waterlogue 界面样例',note:'厂商产品展示。是否适合你的照片、是否无需调整，仍需独立测试。'}],
    video:{type:'iframe',src:'https://player.vimeo.com/video/1153435616?dnt=1&autoplay=0',title:'Waterlogue · 官方产品介绍',note:'视频由 Vimeo 原站提供，展示产品介绍，不作为可导出笔触数据的证据。',source:water}
  }
};
const $ = id => document.getElementById(id);
let selected='oilbrush', generation=0;
function renderSample() {
  const token=++generation, p=products[selected], s=p.samples[Number($('sample').value)||0];
  const pair=Boolean(s.before);
  $('image-area').classList.toggle('single',!pair);$('right-figure').hidden=!pair;
  $('image-area').setAttribute('aria-busy','true');
  $('media-label').textContent=pair?'官方原图 / 官方效果':'官方样例 · 不是本机输出';
  $('left-caption').textContent=pair?'厂商提供的原始照片':s.caption;
  $('right-caption').textContent='厂商提供的处理结果';
  $('sample-note').textContent=s.note;
  document.dispatchEvent(new CustomEvent('comparator-sample',{detail:{product:selected,sample:s}}));
  $('sample-source').href=p.source;
  $('load-status').classList.remove('failed');$('load-status').textContent='正在载入官方图片…';
  $('right-image').removeAttribute('src');
  const images=[[$('left-image'),pair?s.before:s.image],...(pair?[[$('right-image'),s.after]]:[])];
  Promise.all(images.map(async([img,url])=>{img.alt=`${p.name} · ${pair?(img.id==='left-image'?'官方原始照片':'官方处理结果'):s.caption}`;img.referrerPolicy='no-referrer';img.src=url;try{await img.decode();return true;}catch{return false;}})).then(ok=>{
    if(token!==generation)return;
    $('image-area').setAttribute('aria-busy','false');
    $('load-status').textContent=ok.every(Boolean)?'官方图片已载入 · 本机同图生成未测试':'部分官方图片无法载入，请使用“查看官方出处”。未以替代图冒充。';
    $('load-status').classList.toggle('failed',!ok.every(Boolean));
  });
}
function clearVideo(){
  const v=$('video-container').querySelector('video');if(v){v.pause();v.removeAttribute('src');v.load();}
  $('video-container').replaceChildren();$('video-status').textContent='';$('load-video').hidden=false;
}
function chooseProduct(id){
  selected=id; const p=products[id];clearVideo();
  document.querySelectorAll('[data-product]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.product===id)));
  for(const field of ['name','category','summary','look','process','relevance','integration','limit']) $(field).textContent=p[field];
  $('product-source').href=p.source;
  $('sample').replaceChildren(...p.samples.map((s,i)=>new Option(s.title,String(i))));
  $('video-section').hidden=!p.video;
  if(p.video){$('video-heading').textContent=p.video.title;$('video-note').textContent=p.video.note;$('video-source').href=p.video.source;}
  renderSample();
}
document.querySelectorAll('[data-product]').forEach(b=>b.addEventListener('click',()=>chooseProduct(b.dataset.product)));
$('sample').addEventListener('change',renderSample);
$('load-video').addEventListener('click',()=>{
  const v=products[selected].video;if(!v)return;
  $('load-video').hidden=true;
  if(v.type==='video'){
    const el=document.createElement('video');el.controls=true;el.playsInline=true;el.preload='metadata';el.src=v.src;el.setAttribute('aria-label',v.title);
    el.addEventListener('loadedmetadata',()=>{if(el.isConnected)$('video-status').textContent='官方视频已载入，点击播放观看。';});
    el.addEventListener('error',()=>{if(el.isConnected)$('video-status').textContent='原站视频加载失败，请打开官方页面观看。';});
    $('video-container').append(el);
  }else{
    const el=document.createElement('iframe');el.src=v.src;el.title=v.title;el.allow='fullscreen; picture-in-picture; encrypted-media';el.allowFullscreen=true;
    $('video-container').append(el);$('video-status').textContent='外部播放器：如出现网络、登录或播放限制，请打开官方页面。本页不将播放器载入视作成功播放。';
  }
});
$('enlarge').addEventListener('click',()=>{
  const p=products[selected],s=p.samples[Number($('sample').value)||0];$('lightbox-title').textContent=`${p.name} / ${s.title} / 官方样例`;
  const figures=[...$('image-area').querySelectorAll('figure')].filter(f=>!f.hidden).map(f=>{const copy=f.cloneNode(true);copy.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));copy.querySelector('.frame').className='';return copy;});
  $('lightbox-images').replaceChildren(...figures);$('lightbox').showModal();
});
$('close-lightbox').addEventListener('click',()=>$('lightbox').close());
$('lightbox').addEventListener('click',e=>{if(e.target===$('lightbox')){const r=$('lightbox').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('lightbox').close();}});
chooseProduct(selected);
