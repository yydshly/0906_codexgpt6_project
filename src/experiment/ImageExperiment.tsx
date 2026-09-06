import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Painting } from '../painting/engine';
import { StudioRenderer } from '../rendering/renderer';
import { downloadBlob } from '../works/export';
import { analyzeImage, decodeLocalImage } from './image';
import { PlanPlayer, type MaterialStations } from './player';
import { STAGES, type StrokePlan, type Composition } from './plan';
import './experiment.css';
import './prepared.css';
import { BrushCursor, brushName } from './BrushCursor';
import { MaterialBoard } from './MaterialBoard';

type ExperimentTest = { painting: Painting; renderer: StudioRenderer; player: PlanPlayer | null; plan: StrokePlan | null; planningMs: number };
declare global { interface Window { __experiment?: ExperimentTest } }
export function ImageExperiment({ back }: { back: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null), flat = useRef<HTMLCanvasElement>(null);
  const workspace = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null);
  const runtime = useRef<ExperimentTest | null>(null), worker = useRef<Worker | null>(null), generation = useRef(0);
  const source = useRef<{ bitmap: ImageBitmap; inputHash: string } | null>(null);
  const [preview, setPreview] = useState(''), [composition, setComposition] = useState<Composition>('contain');
  const [name, setName] = useState(''), [message, setMessage] = useState('从一张你愿意留住的照片开始。');
  const [working, setWorking] = useState(false), [version, refresh] = useState(0), [leaving, setLeaving] = useState(false);
  const [exporting, setExporting] = useState(false), [fallback, setFallback] = useState(false);
  const [speed, setSpeed] = useState(1), [pending, setPending] = useState<{ kind: 'replace' | 'replan' | 'replay'; file?: File } | null>(null);
  const [showReference, setShowReference] = useState(true), [preparationValid, setPreparationValid] = useState(false);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const changed = () => { runtime.current?.renderer.request(); refresh(v => v + 1); };
  useEffect(() => {
    dialog.current!.showModal();
    const painting = new Painting(false);
    const renderer = new StudioRenderer(canvas.current!, flat.current!, painting, () => setFallback(renderer.mode !== 'webgl2'));
    renderer.preserveActiveStroke = true;
    runtime.current = { painting, renderer, player: null, plan: null, planningMs: 0 };
    setFallback(renderer.mode !== 'webgl2');
    const resize = new ResizeObserver(() => renderer.resize()); resize.observe(canvas.current!.parentElement!);
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('test') === '1') window.__experiment = runtime.current;
    const unload = (event: BeforeUnloadEvent) => { if (source.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => {
      generation.current++; clearTimeout(deadline.current); worker.current?.terminate(); runtime.current?.player?.dispose(); source.current?.bitmap.close();
      renderer.dispose();
      // Release this dialog's context immediately; repeated experiments must not
      // evict the original studio context from the browser's active-context limit.
      renderer.gl?.getExtension('WEBGL_lose_context')?.loseContext();
      resize.disconnect(); window.removeEventListener('beforeunload', unload); delete window.__experiment;
    };
  }, []);
  function stopWork() { generation.current++; clearTimeout(deadline.current); worker.current?.terminate(); worker.current = null; runtime.current?.player?.pause(); setWorking(false); }
  function leave() { stopWork(); setLeaving(true); }
  function choose(file?: File) {
    if (!file) return;
    stopWork();
    if (runtime.current?.player?.hasPaint) setPending({ kind: 'replace', file });
    else void select(file);
  }
  function changeComposition(next: Composition) {
    if (!source.current || next === composition) return;
    stopWork(); setComposition(next); setPreview(analyzeImage(source.current.bitmap, next).preview);
    setPreparationValid(false); setShowReference(true);
    setMessage(next === 'crop' ? '居中方形将裁去预览框外内容。原实验画作保留，请检查构图并重新准备。' : '完整保留原比例。原实验画作保留，请重新准备笔与颜色。');
  }
  async function select(file?: File) {
    if (!file) return;
    stopWork(); const id = generation.current; setWorking(true); setMessage('正在本地读取图片…');
    try {
      const next = await decodeLocalImage(file);
      if (id !== generation.current) { next.bitmap.close(); return; }
      source.current?.bitmap.close(); source.current = next;
      setName(file.name); setComposition('contain'); setPreview(analyzeImage(next.bitmap, 'contain').preview);
      setPreparationValid(false); setShowReference(true);
      const current = runtime.current!; current.player?.dispose(); current.player = null; current.plan = null; current.painting.clear(); changed();
      setMessage('先检查原图构图，再准备笔与颜色。准备完成后由你决定何时开始。');
    } catch (error) { if (id === generation.current) setMessage((error as Error).message); }
    finally { if (id === generation.current) setWorking(false); }
  }
  function generate() {
    if (!source.current) return;
    stopWork(); const id = generation.current, current = runtime.current!;
    setPreparationValid(false);
    current.player?.dispose(); current.player = null; current.plan = null; current.painting.clear(); changed();
    setWorking(true); setMessage('正在本地规划大色块与轮廓…');
    let task: Worker;
    try { task = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' }); }
    catch { stopWork(); setMessage('后台规划不可用，请使用支持 Worker 的浏览器或重试。'); return; }
    worker.current = task;
    deadline.current = setTimeout(() => { if (id === generation.current) { stopWork(); setMessage('规划超过 120 秒，已停止。请缩小或简化图片后重试。'); } }, 120000);
    task.onerror = event => { event.preventDefault(); if (id === generation.current) { stopWork(); setMessage('规划未能完成，请重试。'); } };
    task.onmessage = (event: MessageEvent<{ type: string; stage: number; plan: StrokePlan; elapsed: number; message: string }>) => {
      if (id !== generation.current) return;
      if (event.data.type === 'progress') setMessage(`正在规划 · ${STAGES[event.data.stage].name}`);
      else if (event.data.type === 'plan') {
        clearTimeout(deadline.current); task.terminate(); worker.current = null; setWorking(false); current.plan = event.data.plan; current.planningMs = event.data.elapsed;
        try { current.player = new PlanPlayer(current.painting, current.plan, changed); current.player.speed = speed; }
        catch { current.plan = null; setMessage('备料校验失败，没有开始绘制，请重新准备。'); changed(); return; }
        setPreparationValid(true); changed();
        setMessage(`已备好 ${current.plan.materials!.brushes.length} 支笔、${current.plan.materials!.dishes.length} 盘颜色。检查后点击“确认准备，开始绘制”。`);
      } else { stopWork(); setMessage(event.data.message); }
    };
    const { pixels } = analyzeImage(source.current.bitmap, composition);
    try { task.postMessage({ pixels, composition, inputHash: source.current.inputHash }, [pixels.buffer]); }
    catch { stopWork(); setMessage('无法启动本地规划，请重试。'); }
  }
  function requestGenerate() {
    if (runtime.current?.player?.hasPaint) { stopWork(); setPending({ kind: 'replan' }); }
    else generate();
  }
  function confirmPending() {
    const choice = pending; setPending(null);
    if (choice?.kind === 'replace') void select(choice.file);
    else if (choice?.kind === 'replan') generate();
    else if (choice?.kind === 'replay') runtime.current?.player?.replay();
  }
  async function download() {
    runtime.current?.player?.pause(); setExporting(true);
    try { downloadBlob(await runtime.current!.renderer.exportPng(), '慢光-图片实验.png'); setMessage('已导出当前实际画作。实验不自动保存，退出前请妥善留存。'); }
    catch { setMessage('导出失败，画作仍保留在这里，请重试。'); }
    finally { setExporting(false); }
  }
  const player = runtime.current?.player;
  const materials = runtime.current?.plan?.materials;
  useLayoutEffect(() => {
    const root = workspace.current, layer = overlay.current, surface = canvas.current?.parentElement;
    if (!root || !layer || !surface) return;
    const locate = () => {
      const rect = surface.getBoundingClientRect(), outer = root.getBoundingClientRect(), scale = 1024 / Math.max(1, rect.width);
      root.style.setProperty('--world-scale', String(rect.width / 1024));
      Object.assign(layer.style, { left: `${rect.left - outer.left}px`, top: `${rect.top - outer.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      const point = (x: number, y: number) => ({ x: (x - rect.left) * scale, y: (y - rect.top) * scale });
      const center = (element: Element) => { const b = element.getBoundingClientRect(); return point(b.left + b.width / 2, b.top + b.height / 2); };
      const stations: MaterialStations = { brushes: {}, dishes: {}, wipe: center(root.querySelector('[data-wipe-station]')!) };
      root.querySelectorAll<HTMLElement>('[data-dish-id]').forEach(item => { stations.dishes[item.dataset.dishId!] = center(item.querySelector('.prepared-well')!); });
      root.querySelectorAll<HTMLElement>('[data-brush-id]').forEach(item => { const svg = item.querySelector('svg')!, matrix = svg.getScreenCTM(); if (matrix) stations.brushes[item.dataset.brushId!] = point(matrix.e, matrix.f); });
      player?.setStations(stations);
    };
    locate(); const observer = new ResizeObserver(locate); observer.observe(root); observer.observe(surface);
    return () => observer.disconnect();
  }, [player, materials]);
  const actionNames: Record<NonNullable<typeof player>['action'], string> = { prepare: '准备下一笔', 'take-brush': '从笔架取笔', 'return-brush': '送回原笔位', 'release-brush': '放回笔架', 'to-wipe': '移向擦拭处', wipe: '擦拭笔毛', 'to-paint': '移向对应色盘', dip: '正在沾色', travel: '抬笔移动', draw: '落笔中', lift: '提笔' };
  const progressText = !player ? '等待备笔与配色' : player.state === 'ready' ? '准备完成 · 等待确认' : player.state === 'complete' ? `${player.index} 笔 · 绘制完成` : `${player.state === 'paused' ? '已暂停 · ' : ''}${actionNames[player.action]}（已完成 ${player.index} / ${player.plan.strokes.length} 笔）`;
  return <dialog ref={dialog} className="image-experiment" aria-label="图片自动绘制实验" onCancel={event => { event.preventDefault(); if (pending) setPending(null); else leave(); }} data-version={version}>
    <div inert={!!pending || leaving}>
    <header className="experiment-heading"><div><p className="eyebrow">SLOWLIGHT / LOCAL STUDY · E1</p><h1>让照片，慢慢成为笔触。</h1><p>图片自动绘制 · 实验　<span>原画室与草稿已保留</span></p></div><button disabled={exporting} onClick={leave}>返回画室</button></header>
    <div className="experiment-tools"><label className="file-button">{name ? '更换本地图片' : '选择本地图片'}<input aria-label="选择本地图片" type="file" accept="image/png,image/jpeg" disabled={exporting || !!pending || leaving} onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }}/></label><span>{name || 'PNG / JPEG · 最多 12 MB / 1200 万像素'}</span><button disabled={!preview || working || exporting} onClick={requestGenerate}>确认构图，准备笔与颜色</button>{working && <button onClick={() => { stopWork(); setMessage('已取消。可以重新选图或重新开始。'); }}>取消处理</button>}</div>
    <div className="composition-options" aria-label="构图方式"><button aria-pressed={composition === 'contain'} disabled={!preview || exporting} onClick={() => changeComposition('contain')}>完整保留 · 留白</button><button aria-pressed={composition === 'crop'} disabled={!preview || exporting} onClick={() => changeComposition('crop')}>居中方形 · 裁切</button><span>{composition === 'crop' ? '请检查主体：只绘制预览框内的部分' : '保留完整比例，无拉伸或裁切'}</span></div>
    <div className="experiment-playback"><label>播放速度 <select aria-label="播放速度" value={speed} disabled={exporting || working} onChange={event => { const next = +event.target.value; setSpeed(next); if (player) player.speed = next; }}><option value="0.5">慢一点 · 0.5×</option><option value="1">从容 · 1×</option><option value="4">快一点 · 4×</option></select></label><button disabled={!player || !preparationValid || player.state === 'ready' || player.state === 'complete' || working || exporting} onClick={() => player?.state === 'playing' ? player.pause() : player?.play()}>{player?.state === 'playing' ? '暂停绘制' : '继续绘制'}</button><button disabled={!player?.hasPaint || !preparationValid || working || exporting} onClick={() => { player?.pause(); setPending({ kind: 'replay' }); }}>从空白重新播放</button><button className="confirm-button" disabled={!player?.hasPaint || working || exporting} onClick={download}>{exporting ? '正在导出…' : '导出实验 PNG'}</button></div>
    {player?.state === 'ready' && <div className="prepared-confirm-row"><span>{preparationValid ? `${materials?.brushes.length} 支笔 · ${materials?.dishes.length} 盘颜色 · 已准备` : '构图已更改，请重新准备'}</span><button className="confirm-button prepared-start" disabled={!preparationValid || working || exporting} onClick={() => { setShowReference(false); player.play(); setMessage('先取笔、沾对应色盘，再沿实际路径绘画。可暂停；擦拭只重置本次笔上的颜色，不模拟颜料化学。'); }}>确认准备，开始绘制</button></div>}
    <div className="prepared-workspace" ref={workspace}>
      <section className="prepared-canvas-column">
        <div className="prepared-canvas-heading"><span>实际画作 · 1024 × 1024</span><button aria-expanded={showReference} disabled={!preview} onClick={() => setShowReference(v => !v)}>{showReference ? '收起原图' : '展开原图'}</button></div>
        <div className="canvas-frame"><div className="experiment-surface" data-testid="experiment-surface"><canvas ref={canvas}/><canvas ref={flat}/></div>
          <div className="prepared-reference" hidden={!showReference || !preview}><div className="experiment-reference">{preview && <img src={preview} alt="原图构图缩略预览"/>}</div><small>仅供对照 · 不进入作品</small></div>
          {!player?.hasPaint && !player?.tip.visible && <div className="prepared-canvas-note"><span>{working ? '正在备笔与配色…' : preparationValid ? '笔与颜色，已经摆好。' : '从一张想留住的照片开始。'}</span><small>{preparationValid ? '确认准备后，从第一笔开始。' : '先检查构图，再为这一幅备料。'}</small></div>}
        </div>
        <p className="prepared-progress" data-testid="prepared-progress">{progressText}</p>
        {player?.hasPaint && <p className="prepared-current">{player.plan.stages[player.plan.strokes[Math.min(player.index, player.plan.strokes.length - 1)].stage]?.name} · {brushName(player.tip.size)} {player.tip.size} px · 上色量 {Math.round(player.tip.load * 100)}%</p>}
      </section>
      <MaterialBoard materials={materials} heldBrushId={player?.heldBrushId} dishId={player?.plan.strokes[player.index]?.dishId} action={player?.action}/>
      <div className="prepared-overlay" ref={overlay}>{player?.tip.visible && <BrushCursor tip={player.tip}/>}</div>
    </div>
    <p className="experiment-message" role="status">{message}</p>{fallback && <p role="alert">正在使用简化画布显示，局部材质光照暂不可用。</p>}
    {import.meta.env.DEV && <p className="experiment-message"><a href={`${import.meta.env.BASE_URL}artifacts/e1/prepared-studio/index.html`} target="_blank" rel="noopener">查看备笔、固定色盘与三图过程 ↗</a></p>}
    <footer className="experiment-note">图片仅在本机处理，不上传。实验结果不自动保存，退出或刷新前请导出。<br/>这是算法的绘制过程，不是专业画师教学步骤；细小文字、人脸与复杂场景可能失真。</footer>
    </div>
    {leaving && <div className="experiment-leave" role="alertdialog" aria-modal="true" aria-label="离开实验确认"><div><h2>把这次实验带走吗？</h2><p>实验画作不会自动保存。退出后原画室、签名与草稿仍在。</p><button autoFocus onClick={() => setLeaving(false)}>留在实验</button><button disabled={exporting || !player?.hasPaint} onClick={download}>先导出 PNG</button><button className="confirm-button" disabled={exporting} onClick={back}>确认退出实验</button></div></div>}
    {pending && <div className="experiment-leave" role="alertdialog" aria-modal="true" aria-label="替换实验画作确认"><div><h2>{pending.kind === 'replay' ? '从第一笔再看一次？' : '开始一次新的实验？'}</h2><p>这会替换当前实验结果。请先导出想保留的画作；原画室草稿不会改变。</p><button autoFocus onClick={() => setPending(null)}>取消，保留实验画作</button><button disabled={exporting || !player?.hasPaint} onClick={download}>先导出 PNG</button><button className="confirm-button" disabled={exporting} onClick={confirmPending}>确认{pending.kind === 'replay' ? '重新播放' : '替换实验画作'}</button></div></div>}
  </dialog>;
}
