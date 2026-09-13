(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const base = '../artifacts/e1/finished-quality/frozen/';
  const target = './assets/landscape-target.png';
  const subjects = {
    landscape: {
      name: '黄石湖冬景',
      credit: '照片：NPS / Jim Peaco，2014，黄石湖冬景。美国联邦公务作品；候选目标是 AI 生成参考。',
      baseline: { title: '结构优先 · 实际输出', heading: '构图仍在，细枝与色块之间仍有距离。', text: '这是现有结构优先模式的真实笔触输出。湖岸、树群和远山仍可辨，但精细轮廓和局部完整性仍不足；这不是本页新增的算法结果。' },
      quality: { title: '成品细节 · 实际输出', heading: '保留实际差距，不把缺失解释成风格。', text: '这是上一轮成品细节实验的真实输出。细枝、前景与天空仍有简化和空隙，尚不能称为稳定的画质提升。两轮修正已停止，历史证据保持不变。' },
    },
    'portrait-holdout': {
      name: 'NASA 独立人物验证',
      credit: '照片：NASA S99-00858，Eileen Collins 肖像。仅用于信息与算法事实对照；无 AI 目标图，不作代言或宣传。',
      baseline: { title: '结构优先 · 实际输出', heading: '人物仍未解决，先把差距摆在一起。', text: '原有结构优先模式没有可靠保留人物的重要细节。人物样本用于揭示限制，不以模糊五官或缺失轮廓作为可交付目标。本页没有制作人物目标图。' },
      quality: { title: '成品细节 · 实际输出', heading: '独立人物验证未通过。', text: '这是冻结策略后绘制的独立样本，未参与调参。面部、头发与颈圈仍有明显缺失；此前局部改善没有稳定迁移，不能宣称人物问题已修好。' },
    },
  };
  let subject = 'landscape';
  let result = 'target';
  let zoom = 1;
  const gallery = $('gallery');
  const select = $('result-select');
  const images = ['source-image', 'result-image', 'wipe-source', 'wipe-result'].map($);

  function updateImageErrors() {
    $('media-error').hidden = !images.some((img) => img.complete && img.naturalWidth === 0);
  }
  images.forEach((img) => { img.addEventListener('load', updateImageErrors); img.addEventListener('error', updateImageErrors); });

  function setPan(x, y) {
    x = Math.max(0, Math.min(100, Number(x)));
    y = Math.max(0, Math.min(100, Number(y)));
    $('pan-x').value = String(x);
    $('pan-y').value = String(y);
    gallery.style.setProperty('--pan-x', `${x}%`);
    gallery.style.setProperty('--pan-y', `${y}%`);
  }

  function setZoom(value) {
    zoom = Number(value);
    gallery.dataset.zoom = String(zoom);
    gallery.style.setProperty('--zoom', String(zoom));
    document.querySelectorAll('[data-zoom][aria-pressed]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.zoom) === zoom)));
    $('pan-controls').hidden = zoom === 1;
    $('zoom-hint').textContent = zoom === 1
      ? (result === 'target' ? '同一照片来源、相同方形显示尺度，默认完整画面。候选图存在局部重绘，叠合只用于观察，不证明保真改善。' : '同一构图、同一显示尺度。可放大比较细节；默认显示完整画面。')
      : `当前为同尺度 ${zoom}× 局部。移动鼠标或轻触画面可选择位置，也可使用下方位置滑杆；完整画面始终可返回。`;
    setPan(50, 50);
  }

  function refresh() {
    const info = subjects[subject];
    const source = `${base}${subject}/source-composed.png`;
    const isTarget = result === 'target';
    const sourceResult = isTarget ? target : `${base}${subject}/${result === 'quality' ? 'quality' : 'baseline'}-stage-5.png`;
    const title = isTarget ? '候选目标参考' : info[result].title;
    const tag = isTarget ? 'AI 生成目标参考 · 非慢光笔触输出' : '慢光真实笔触输出 · 历史实测';
    $('source-image').src = source;
    $('wipe-source').src = source;
    $('source-image').alt = `${info.name}原始照片，完整构图`;
    $('wipe-source').alt = `${info.name}原图，叠合对照左侧`;
    $('result-image').src = sourceResult;
    $('wipe-result').src = sourceResult;
    $('result-image').alt = `${info.name}，${title}，${tag}`;
    $('wipe-result').alt = `${info.name}，${title}，${tag}`;
    $('result-heading').textContent = title;
    $('result-status').textContent = tag;
    $('result-status').dataset.kind = isTarget ? 'target' : 'actual';
    $('image-tag').textContent = tag;
    $('note-eyebrow').textContent = isTarget ? 'CANDIDATE DIRECTION / 待确认的目标' : 'ACTUAL STROKES / 实际引擎结果';
    $('note-title').textContent = isTarget ? '保住冬景的清透，让笔触有轻重。' : info[result].heading;
    $('note-text').textContent = isTarget
      ? '用这张参考讨论构图、枝叶与明暗应保留到什么程度。它由 AI 图像工具生成，云、树枝与雪地纹理有局部重绘，不用于证明保真改善；不是慢光引擎输出，也没有对应的真实笔触计划。'
      : info[result].text;
    $('source-credit').textContent = info.credit;
    const download = $('download-link');
    download.href = sourceResult;
    download.download = isTarget ? '慢光-候选目标参考-非笔触输出.png' : `慢光-${subject}-${result}-实际输出.png`;
    download.textContent = isTarget ? '下载目标参考图 ↓' : '下载实际输出 PNG ↓';
    setZoom(1);
    updateImageErrors();
  }

  document.querySelectorAll('[data-subject]').forEach((button) => button.addEventListener('click', () => {
    subject = button.dataset.subject;
    document.querySelectorAll('[data-subject]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    select.replaceChildren();
    const choices = subject === 'landscape'
      ? [['target', '候选目标参考'], ['baseline', '结构优先 · 实际输出'], ['quality', '成品细节 · 实际输出']]
      : [['quality', '成品细节 · 实际输出'], ['baseline', '结构优先 · 实际输出']];
    for (const [value, label] of choices) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); }
    result = subject === 'landscape' ? 'target' : 'quality';
    select.value = result;
    refresh();
  }));
  select.addEventListener('change', () => { result = select.value; refresh(); });

  document.querySelectorAll('[data-view][aria-pressed]').forEach((button) => button.addEventListener('click', () => {
    const view = button.dataset.view;
    gallery.dataset.view = view;
    document.querySelectorAll('[data-view][aria-pressed]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    $('wipe-control').hidden = view !== 'wipe';
  }));
  $('wipe-range').addEventListener('input', () => {
    gallery.style.setProperty('--wipe', `${$('wipe-range').value}%`);
    $('wipe-value').value = `${$('wipe-range').value}%`;
  });
  document.querySelectorAll('[data-zoom][aria-pressed]').forEach((button) => button.addEventListener('click', () => setZoom(button.dataset.zoom)));
  $('pan-x').addEventListener('input', () => setPan($('pan-x').value, $('pan-y').value));
  $('pan-y').addEventListener('input', () => setPan($('pan-x').value, $('pan-y').value));
  $('reset-pan').addEventListener('click', () => setPan(50, 50));
  document.querySelectorAll('.image-window').forEach((window) => {
    const position = (event) => { if (zoom === 1) return; const rect = window.getBoundingClientRect(); setPan((event.clientX - rect.left) / rect.width * 100, (event.clientY - rect.top) / rect.height * 100); };
    window.addEventListener('pointermove', (event) => { if (event.pointerType === 'mouse') position(event); });
    window.addEventListener('pointerdown', position);
  });
  refresh();
})();
