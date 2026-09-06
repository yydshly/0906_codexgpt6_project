import { useEffect, useRef, useState } from 'react';
import { Painting } from '../painting/engine';
import { StudioRenderer } from '../rendering/renderer';
import { downloadBlob } from '../works/export';
import { analyzeImage, decodeLocalImage } from './image';
import { PlanPlayer } from './player';
import { STAGES, type StrokePlan, type Composition } from './plan';
import './experiment.css';

type ExperimentTest = { painting: Painting; renderer: StudioRenderer; player: PlanPlayer | null; plan: StrokePlan | null; planningMs: number };
declare global { interface Window { __experiment?: ExperimentTest } }
export function ImageExperiment({ back }: { back: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null), flat = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<ExperimentTest | null>(null), worker = useRef<Worker | null>(null), generation = useRef(0);
  const source = useRef<{ bitmap: ImageBitmap; inputHash: string } | null>(null);
  const [preview, setPreview] = useState(''), [composition, setComposition] = useState<Composition>('contain');
  const [name, setName] = useState(''), [message, setMessage] = useState('从一张你愿意留住的照片开始。');
  const [working, setWorking] = useState(false), [version, refresh] = useState(0), [leaving, setLeaving] = useState(false);
  const [exporting, setExporting] = useState(false), [fallback, setFallback] = useState(false);
  const [speed, setSpeed] = useState(1), [pending, setPending] = useState<{ kind: 'replace' | 'replan' | 'replay'; file?: File } | null>(null);
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
    setMessage(next === 'crop' ? '居中方形将裁去预览框外内容。请检查主体；再次确认前不会改变右侧作品。' : '完整保留原比例，空白处保留画布纹理。再次确认前不会改变右侧作品。');
  }
  async function select(file?: File) {
    if (!file) return;
    stopWork(); const id = generation.current; setWorking(true); setMessage('正在本地读取图片…');
    try {
      const next = await decodeLocalImage(file);
      if (id !== generation.current) { next.bitmap.close(); return; }
      source.current?.bitmap.close(); source.current = next;
      setName(file.name); setComposition('contain'); setPreview(analyzeImage(next.bitmap, 'contain').preview);
      const current = runtime.current!; current.player?.dispose(); current.player = null; current.plan = null; current.painting.clear(); changed();
      setMessage('完整保留构图，上下或两侧留白。确认后，从空白画布逐笔开始。');
    } catch (error) { if (id === generation.current) setMessage((error as Error).message); }
    finally { if (id === generation.current) setWorking(false); }
  }
  function generate() {
    if (!source.current) return;
    stopWork(); const id = generation.current, current = runtime.current!;
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
        current.player = new PlanPlayer(current.painting, current.plan, changed); current.player.speed = speed; current.player.play();
        setMessage('笔尖沿真实路径落笔。可在当前路径采样点暂停，继续时接着这一笔画。');
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
  const progressText = !player ? '等待第一笔' : player.state === 'complete' ? `${player.index} 笔 · 绘制完成` : `第 ${player.index + 1} 笔 · ${player.state === 'paused' ? '已暂停' : player.tip.down ? '落笔中' : '抬笔移动'}（已完成 ${player.index} / ${player.plan.strokes.length} 笔）`;
  return <dialog ref={dialog} className="image-experiment" aria-label="图片自动绘制实验" onCancel={event => { event.preventDefault(); if (pending) setPending(null); else leave(); }} data-version={version}>
    <div inert={!!pending || leaving}>
    <header className="experiment-heading"><div><p className="eyebrow">SLOWLIGHT / LOCAL STUDY · E1</p><h1>让照片，慢慢成为笔触。</h1><p>图片自动绘制 · 实验　<span>原画室与草稿已保留</span></p></div><button disabled={exporting} onClick={leave}>返回画室</button></header>
    <div className="experiment-tools"><label className="file-button">{name ? '更换本地图片' : '选择本地图片'}<input aria-label="选择本地图片" type="file" accept="image/png,image/jpeg" disabled={exporting || !!pending || leaving} onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }}/></label><span>{name || 'PNG / JPEG · 最多 12 MB / 1200 万像素'}</span><button className="confirm-button" disabled={!preview || working || exporting} onClick={requestGenerate}>确认构图并绘制</button>{working && <button onClick={() => { stopWork(); setMessage('已取消。可以重新选图或重新开始。'); }}>取消处理</button>}</div>
    <div className="composition-options" aria-label="构图方式"><button aria-pressed={composition === 'contain'} disabled={!preview || exporting} onClick={() => changeComposition('contain')}>完整保留 · 留白</button><button aria-pressed={composition === 'crop'} disabled={!preview || exporting} onClick={() => changeComposition('crop')}>居中方形 · 裁切</button><span>{composition === 'crop' ? '请检查主体：只绘制预览框内的部分' : '保留完整比例，无拉伸或裁切'}</span></div>
    <div className="experiment-pair"><figure><figcaption><span>01 / 原图构图</span><small>只用于分析与对照</small></figcaption><div className="experiment-reference">{preview ? <img src={preview} alt="原图构图缩略预览"/> : <div className="experiment-empty"><span>＋</span><p>一处风景，一件小物<br/>先从轮廓清楚的照片试起</p></div>}</div><p>{composition === 'contain' ? '完整保留比例 · 留白保留画布纹理' : '居中方形 · 框外部分不进入新画作'}</p></figure><figure><figcaption><span>02 / 实际画作</span><small>1024 × 1024 · 油画布</small></figcaption><div className="canvas-frame"><div className="experiment-surface" data-testid="experiment-surface"><canvas ref={canvas}/><canvas ref={flat}/>{player?.tip.visible && <svg className="experiment-pen" viewBox="0 0 1024 1024" aria-hidden="true" data-testid="experiment-pen" data-down={player.tip.down}><g transform={`translate(${player.tip.x} ${player.tip.y})`}><circle r={player.tip.down ? 10 : 6} fill="none" stroke="#fffdf3" strokeWidth="3"/><g transform={`rotate(30) translate(0 ${player.tip.down ? 0 : -10})`}><path d="M-6-28 L-4-96 Q0-106 4-96 L6-28Z" fill="#665039" stroke="#faf4de" strokeWidth="2"/><path d="M-8-29 L8-29 L9-17 L-9-17Z" fill="#c1b69d" stroke="#544c3d" strokeWidth="1.5"/><path d="M-9-17 L9-17 Q8-4 0 0 Q-8-4-9-17" fill={player.tip.color} stroke="#faf3de" strokeWidth="1.5"/></g></g></svg>}</div></div><p>{progressText}</p></figure></div>
    <div className="experiment-playback"><label>播放速度 <select aria-label="播放速度" value={speed} disabled={exporting} onChange={event => { const next = +event.target.value; setSpeed(next); if (player) player.speed = next; }}><option value="0.5">慢一点 · 0.5×</option><option value="1">从容 · 1×</option><option value="4">快一点 · 4×</option></select></label><button disabled={!player || player.state === 'complete' || exporting} onClick={() => player?.state === 'playing' ? player.pause() : player?.play()}>{player?.state === 'playing' ? '暂停绘制' : '继续绘制'}</button><button disabled={!player || exporting} onClick={() => { player?.pause(); setPending({ kind: 'replay' }); }}>从空白重新播放</button><button className="confirm-button" disabled={!player?.hasPaint || working || exporting} onClick={download}>{exporting ? '正在导出…' : '导出实验 PNG'}</button></div>
    <p className="experiment-message" role="status">{message}</p>{fallback && <p role="alert">正在使用简化画布显示，局部材质光照暂不可用。</p>}
    <footer className="experiment-note">图片仅在本机处理，不上传。实验结果不自动保存，退出或刷新前请导出。<br/>这是算法的绘制过程，不是专业画师教学步骤；细小文字、人脸与复杂场景可能失真。</footer>
    </div>
    {leaving && <div className="experiment-leave" role="alertdialog" aria-modal="true" aria-label="离开实验确认"><div><h2>把这次实验带走吗？</h2><p>实验画作不会自动保存。退出后原画室、签名与草稿仍在。</p><button autoFocus onClick={() => setLeaving(false)}>留在实验</button><button disabled={exporting || !player?.hasPaint} onClick={download}>先导出 PNG</button><button className="confirm-button" disabled={exporting} onClick={back}>确认退出实验</button></div></div>}
    {pending && <div className="experiment-leave" role="alertdialog" aria-modal="true" aria-label="替换实验画作确认"><div><h2>{pending.kind === 'replay' ? '从第一笔再看一次？' : '开始一次新的实验？'}</h2><p>这会替换当前实验结果。请先导出想保留的画作；原画室草稿不会改变。</p><button autoFocus onClick={() => setPending(null)}>取消，保留实验画作</button><button disabled={exporting || !player?.hasPaint} onClick={download}>先导出 PNG</button><button className="confirm-button" disabled={exporting} onClick={confirmPending}>确认{pending.kind === 'replay' ? '重新播放' : '替换实验画作'}</button></div></div>}
  </dialog>;
}
