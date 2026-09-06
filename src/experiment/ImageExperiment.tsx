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
  const changed = () => { runtime.current?.renderer.request(); refresh(v => v + 1); };
  useEffect(() => {
    dialog.current!.showModal();
    const painting = new Painting(false);
    const renderer = new StudioRenderer(canvas.current!, flat.current!, painting, () => setFallback(renderer.mode !== 'webgl2'));
    runtime.current = { painting, renderer, player: null, plan: null, planningMs: 0 };
    setFallback(renderer.mode !== 'webgl2');
    const resize = new ResizeObserver(() => renderer.resize()); resize.observe(canvas.current!.parentElement!);
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('test') === '1') window.__experiment = runtime.current;
    const unload = (event: BeforeUnloadEvent) => { if (source.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { generation.current++; worker.current?.terminate(); runtime.current?.player?.dispose(); source.current?.bitmap.close(); renderer.dispose(); resize.disconnect(); window.removeEventListener('beforeunload', unload); delete window.__experiment; };
  }, []);
  function stopWork() { generation.current++; worker.current?.terminate(); worker.current = null; runtime.current?.player?.pause(); setWorking(false); }
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
    const task = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' }); worker.current = task;
    task.onerror = () => { if (id === generation.current) { stopWork(); setMessage('规划未能完成，请重试。'); } };
    task.onmessage = (event: MessageEvent<{ type: string; stage: number; plan: StrokePlan; elapsed: number; message: string }>) => {
      if (id !== generation.current) return;
      if (event.data.type === 'progress') setMessage(`正在规划 · ${STAGES[event.data.stage].name}`);
      else if (event.data.type === 'plan') {
        task.terminate(); worker.current = null; setWorking(false); current.plan = event.data.plan; current.planningMs = event.data.elapsed;
        current.player = new PlanPlayer(current.painting, current.plan, changed); current.player.play();
        setMessage('每一笔都在画布上真实落下。暂停会在当前整笔结束后生效。');
      } else { stopWork(); setMessage(event.data.message); }
    };
    const { pixels } = analyzeImage(source.current.bitmap, composition);
    task.postMessage({ pixels, composition, inputHash: source.current.inputHash }, [pixels.buffer]);
  }
  async function download() {
    runtime.current?.player?.pause(); setExporting(true);
    try { downloadBlob(await runtime.current!.renderer.exportPng(), '慢光-图片实验.png'); setMessage('已导出当前实际画作。实验不自动保存，退出前请妥善留存。'); }
    catch { setMessage('导出失败，画作仍保留在这里，请重试。'); }
    finally { setExporting(false); }
  }
  const player = runtime.current?.player;
  return <dialog ref={dialog} className="image-experiment" aria-label="图片自动绘制实验" onCancel={event => { event.preventDefault(); setLeaving(true); runtime.current?.player?.pause(); }} data-version={version}>
    <header className="experiment-heading"><div><p className="eyebrow">SLOWLIGHT / LOCAL STUDY · E1</p><h1>让照片，慢慢成为笔触。</h1><p>图片自动绘制 · 实验　<span>原画室与草稿已保留</span></p></div><button onClick={() => { runtime.current?.player?.pause(); setLeaving(true); }}>返回画室</button></header>
    <div className="experiment-tools"><label className="file-button">{name ? '更换本地图片' : '选择本地图片'}<input aria-label="选择本地图片" type="file" accept="image/png,image/jpeg" disabled={exporting} onChange={event => { void select(event.target.files?.[0]); event.target.value = ''; }}/></label><span>{name || 'PNG / JPEG · 最多 12 MB / 1200 万像素'}</span><button className="confirm-button" disabled={!preview || working || exporting} onClick={generate}>确认构图并绘制</button>{working && <button onClick={() => { stopWork(); setMessage('已取消。可以重新选图或重新开始。'); }}>取消处理</button>}</div>
    <div className="experiment-pair"><figure><figcaption><span>01 / 原图构图</span><small>只用于分析与对照</small></figcaption><div className="experiment-reference">{preview ? <img src={preview} alt="已确认前的原图构图预览"/> : <div className="experiment-empty"><span>＋</span><p>一处风景，一件小物<br/>先从轮廓清楚的照片试起</p></div>}</div><p>完整保留比例 · 留白也由笔触铺开</p></figure><figure><figcaption><span>02 / 实际画作</span><small>1024 × 1024 · 油画布</small></figcaption><div className="canvas-frame"><div className="experiment-surface" data-testid="experiment-surface"><canvas ref={canvas}/><canvas ref={flat}/></div></div><p>{player ? `${player.index} / ${player.plan.strokes.length} 笔 · ${player.state === 'complete' ? '绘制完成' : player.state === 'paused' ? '已暂停' : '逐笔绘制中'}` : '等待第一笔'}</p></figure></div>
    <div className="experiment-playback"><button disabled={!player || player.state === 'complete' || exporting} onClick={() => player?.state === 'playing' ? player.pause() : player?.play()}>{player?.state === 'playing' ? '暂停绘制' : '继续绘制'}</button><button disabled={!player || exporting} onClick={() => player?.replay()}>从空白重新播放</button><button className="confirm-button" disabled={!runtime.current?.painting.revision || working || exporting} onClick={download}>{exporting ? '正在导出…' : '导出实验 PNG'}</button></div>
    <p className="experiment-message" role="status">{message}</p>{fallback && <p role="alert">正在使用简化画布显示，局部材质光照暂不可用。</p>}
    <footer className="experiment-note">图片仅在本机处理，不上传。实验结果不自动保存，退出或刷新前请导出。<br/>这是算法的绘制过程，不是专业画师教学步骤；细小文字、人脸与复杂场景可能失真。</footer>
    {leaving && <div className="experiment-leave" role="alertdialog" aria-label="离开实验确认"><div><h2>把这次实验带走吗？</h2><p>实验画作不会自动保存。退出后原画室、签名与草稿仍在。</p><button autoFocus onClick={() => setLeaving(false)}>留在实验</button><button disabled={exporting} onClick={download}>先导出 PNG</button><button className="confirm-button" disabled={exporting} onClick={back}>确认退出实验</button></div></div>}
  </dialog>;
}
