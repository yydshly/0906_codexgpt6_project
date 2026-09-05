import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Painting, type Brush } from './painting/engine';
import { attachInput } from './painting/input';
import { StudioRenderer } from './rendering/renderer';
import './style.css';

export const COLORS = [
  { name: '暖白', en: 'TITANIUM WHITE', hex: '#F1ECE0' },
  { name: '日落黄', en: 'SUNLIT YELLOW', hex: '#EBC43C' },
  { name: '赭黄', en: 'YELLOW OCHRE', hex: '#BE8745' },
  { name: '朱红', en: 'VERMILION', hex: '#C95139' },
  { name: '群青', en: 'ULTRAMARINE', hex: '#3155A6' },
  { name: '深褐', en: 'BURNT UMBER', hex: '#584335' },
];

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    undo: <><path d="M8 5 3 10l5 5M3 10h10a6 6 0 1 1 0 12" transform="translate(1 -3)"/></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/></>,
    clear: <><path d="m4 17 9-12 7 6-9 11H7l-3-5Zm6 0 6 5m-5 0h10" transform="translate(0 -2)"/></>,
    brush: <><path d="m13 3 7 3-5 11-7-3 5-11ZM8 14l-3 6 7-3m-5 5 2-5"/></>,
    check: <path d="m5 12 4 4 10-10"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

type TestStudio = { painting: Painting; renderer: StudioRenderer; setBrush: (brush: Partial<Brush>) => void; finish: () => void; refresh: () => void };
declare global { interface Window { __studio?: TestStudio } }

function App() {
  const [brush, setBrush] = useState<Brush>({ color: '#3155A6', size: 32, load: .6, mode: 'cover', seed: 906 });
  const [historyCount, setHistoryCount] = useState(0);
  const [hasPaint, setHasPaint] = useState(false);
  const [status, setStatus] = useState('每一笔，都由你决定。');
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const surface = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), flat = useRef<HTMLCanvasElement>(null), cursor = useRef<HTMLDivElement>(null);
  const painting = useRef<Painting | null>(null), renderer = useRef<StudioRenderer | null>(null), input = useRef<ReturnType<typeof attachInput> | null>(null);
  const brushRef = useRef(brush); brushRef.current = brush;
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = COLORS.find(c => c.hex === brush.color)!;
  function update() { if (!painting.current) return; setHistoryCount(painting.current.history.length); setHasPaint(painting.current.color.some(v => v !== 0)); }

  useEffect(() => {
    const art = new Painting(); painting.current = art;
    const params = new URLSearchParams(location.search);
    const view = new StudioRenderer(canvas.current!, flat.current!, art, () => { setFallback(view.mode !== 'webgl2'); update(); }, import.meta.env.DEV && params.get('fallback') === '1'); renderer.current = view;
    setFallback(view.mode !== 'webgl2');
    const controls = attachInput(surface.current!, art, () => brushRef.current, () => view.request(), update, p => {
      if (!cursor.current) return;
      cursor.current.style.display = p ? 'block' : 'none';
      if (p) cursor.current.style.transform = `translate(${p.x}px,${p.y}px)`;
    }, setStatus); input.current = controls;
    const resize = new ResizeObserver(() => view.resize()); resize.observe(surface.current!);
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey && !dialog.current?.open) { event.preventDefault(); controls.finish(); art.undo(); view.request(); update(); }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (art.color.some(v => v !== 0)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('keydown', key); window.addEventListener('beforeunload', beforeUnload);
    if (import.meta.env.DEV && params.get('test') === '1') window.__studio = { painting: art, renderer: view, setBrush: b => { setBrush(old => ({ ...old, ...b })); brushRef.current = { ...brushRef.current, ...b }; }, finish: controls.finish, refresh: () => { view.request(); update(); } };
    return () => { controls.dispose(); view.dispose(); resize.disconnect(); window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', beforeUnload); delete window.__studio; };
  }, []);

  useEffect(() => { if (confirmClear) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmClear]);
  const undo = () => { input.current?.finish(); painting.current?.undo(); renderer.current?.request(); update(); setStatus('已撤回上一笔，慢慢来。'); };
  const clear = () => { input.current?.finish(); painting.current?.clear(); renderer.current?.request(); update(); setConfirmClear(false); setStatus('一张空白画布，一次新的开始。清空也可以撤销。'); };
  const download = async () => {
    if (!renderer.current || busy) return;
    input.current?.finish(); setBusy(true); setStatus('正在将你的画作装进 PNG…');
    try {
      const blob = await renderer.current.exportPng();
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = '慢光-我的小画.png'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus(renderer.current.mode === 'webgl2' ? 'PNG 已导出。把这段时光留在身边。' : 'PNG 已导出：简化显示，不含局部光照。');
    } catch (error) { setStatus(error instanceof Error ? error.message : '导出失败，请重试。'); }
    finally { setBusy(false); update(); }
  };

  return <div className="studio">
    <header className="header">
      <div className="wordmark" aria-label="慢光数字油画室"><span className="brand-symbol"><Icon name="sun" size={24}/></span><span className="brand-name">慢光<span className="brand-en">SLOWLIGHT</span></span></div>
      <div className="header-note">留一点时间，给手中的颜色。</div>
      <div className="edition"><span/> 数字油画室 <small>VOL. 01</small></div>
    </header>

    <main className="workspace">
      <section className="canvas-column" aria-label="创作区">
        <div className="workspace-heading"><div><p className="eyebrow">A LITTLE TIME, A LITTLE PAINT</p><h1>把此刻，慢慢画下来。</h1></div><span className="paper-label">你的画布 <span>01</span></span></div>
        <div className="toolbar" aria-label="绘画工具">
          <div className="toolbar-actions"><button className="icon-button" aria-label="撤销" title="撤销 · Ctrl+Z" disabled={!historyCount || busy} onClick={undo}><Icon name="undo"/></button><button className="icon-button" aria-label="清空画布" title="清空画布" disabled={!hasPaint || busy} onClick={() => setConfirmClear(true)}><Icon name="clear"/></button></div>
          <div className="mode-switch" aria-label="绘画方式"><button aria-pressed={brush.mode === 'cover'} onClick={() => setBrush({ ...brush, mode: 'cover' })}>覆盖</button><button aria-pressed={brush.mode === 'mix'} onClick={() => setBrush({ ...brush, mode: 'mix' })}>混色</button></div>
          <span className="toolbar-caption">{brush.mode === 'cover' ? '让新的颜色，留在画布上' : '让两种颜色，在接触处相遇'}</span>
          <button className="export-button" onClick={download} disabled={busy}><Icon name="download" size={17}/>{busy ? '导出中…' : '导出 PNG'}</button>
        </div>
        <div className="canvas-frame">
          <div ref={surface} className="painting-surface" data-testid="painting-surface" aria-label="油画画布，选择颜色后按住鼠标拖动绘画" style={{ pointerEvents: busy ? 'none' : 'auto' }}>
            <canvas ref={canvas} aria-label="油画材质显示"/><canvas ref={flat} aria-label="简化画布显示"/>
            <div ref={cursor} className="brush-cursor"><span style={{ width: `calc(var(--canvas-side) * ${brush.size} / 1024)`, height: `calc(var(--canvas-side) * ${brush.size} / 1024)` }}/></div>
          </div>
        </div>
        <div className="canvas-footer"><span><span className="tiny-cross">＋</span>{hasPaint ? '每一处痕迹，都是你的选择。' : '选一种颜色，在画布上拖动开始。'}</span><span>1024 × 1024 <i/> 油画布</span></div>
      </section>

      <aside className="materials" aria-label="颜料与画笔">
        <div className="materials-heading"><h2>手边的颜色</h2><span>THE PALETTE</span></div>
        <div className="palette-board"><div className="thumb-hole" aria-hidden="true"/>
          <span className="wood-engraving">SLOWLIGHT · OILS</span>
          <div className="pigments">{COLORS.map((color, i) => <button key={color.hex} className={`pigment ${brush.color === color.hex ? 'selected' : ''}`} aria-label={`选择${color.name}`} aria-pressed={brush.color === color.hex} onClick={() => setBrush({ ...brush, color: color.hex })}>
            <span className="paint-dab" style={{ '--pigment': color.hex, '--turn': `${i * 11 - 13}deg` } as React.CSSProperties}><span className="paint-ridge"/></span><span className="pigment-label">{color.name}<small>{color.en}</small></span><span className="selection-dot"/></button>)}</div>
        </div>
        <div className="brush-settings">
          <div className="brush-heading"><span className="brush-medallion"><Icon name="brush" size={23}/></span><div><h2>平头油画笔</h2><span>一支笔，就从这里开始</span></div></div>
          <label className="range-label" htmlFor="brush-size">笔刷大小 <output>{brush.size}<small> px</small></output></label>
          <input id="brush-size" aria-label="笔刷大小" type="range" min="8" max="96" value={brush.size} onChange={e => setBrush({ ...brush, size: +e.target.value })}/>
          <label className="range-label" htmlFor="paint-load">上色量 <output>{Math.round(brush.load * 100)}<small> %</small></output></label>
          <input id="paint-load" aria-label="上色量" type="range" min="15" max="100" value={Math.round(brush.load * 100)} onChange={e => setBrush({ ...brush, load: +e.target.value / 100 })}/>
          <div className="current-color"><span style={{ background: selected.hex }}/><span>正在使用 · {selected.name}</span><Icon name="check" size={14}/></div>
        </div>
        <p className="material-note">不必急着画好。<br/>先感受颜色经过画布的样子。</p>
      </aside>
    </main>
    <footer className="statusbar"><span className="live-status" role="status">{status}</span><span>作品暂存在本页 · 离开前记得导出</span></footer>
    {fallback && <div className="fallback-notice" role="alert"><strong>已切换简化显示</strong><span>仍可绘画、混色、撤销和导出；局部光照暂不可用。</span><button onClick={() => renderer.current?.retry()}>重试材质显示</button></div>}
    <dialog ref={dialog} className="clear-dialog" onCancel={() => setConfirmClear(false)} onClose={() => setConfirmClear(false)}><p className="eyebrow">A FRESH START</p><h2>回到一张空白画布？</h2><p>当前画面会被清空。你仍然可以撤销这次清空。</p><div><button autoFocus onClick={() => setConfirmClear(false)}>继续画</button><button className="confirm-button" onClick={clear}>确认清空</button></div></dialog>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
