import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Painting, type Brush } from './painting/engine';
import { attachInput } from './painting/input';
import { StudioRenderer } from './rendering/renderer';
import { Guide, GuideOverlay } from './guidance/Guide';
import { emptyGuide, type GuideState } from './guidance/sunset';
import { DraftSession, type DraftRecord, type SaveState } from './works/draft';
import { Completion } from './works/Completion';
import { downloadBlob, exportArtwork } from './works/export';
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

type TestStudio = { painting: Painting; renderer: StudioRenderer; draft: DraftSession; setBrush: (brush: Partial<Brush>) => void; finish: () => void; refresh: () => void };
declare global { interface Window { __studio?: TestStudio } }

function App() {
  const [brush, setBrush] = useState<Brush>({ color: '#3155A6', size: 32, load: .6, mode: 'cover', seed: 906 });
  const [historyCount, setHistoryCount] = useState(0);
  const [hasPaint, setHasPaint] = useState(false);
  const [status, setStatus] = useState('每一笔，都由你决定。');
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [guide, setGuide] = useState<GuideState>(emptyGuide);
  const [newChoice, setNewChoice] = useState(false);
  const newDialog = useRef<HTMLDialogElement>(null);
  const [signature, setSignature] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ phase: 'loading', message: '正在读取本地草稿…' });
  const [availableDraft, setAvailableDraft] = useState<DraftRecord | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const recoveryDialog = useRef<HTMLDialogElement>(null);
  const draft = useRef<DraftSession | null>(null);
  const guideRef = useRef(guide), signatureRef = useRef(signature);
  guideRef.current = guide; signatureRef.current = signature;
  const metadataMounted = useRef(false), restoringDetails = useRef(false);
  const surface = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), flat = useRef<HTMLCanvasElement>(null), cursor = useRef<HTMLDivElement>(null);
  const painting = useRef<Painting | null>(null), renderer = useRef<StudioRenderer | null>(null), input = useRef<ReturnType<typeof attachInput> | null>(null);
  const brushRef = useRef(brush); brushRef.current = brush;
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = COLORS.find(c => c.hex === brush.color) ?? { hex: brush.color, name: '自选色' };
  function update() { if (!painting.current) return; setHistoryCount(painting.current.history.length); setHasPaint(painting.current.color.some(v => v !== 0)); }
  function changed() { update(); draft.current?.changed(); }

  useEffect(() => {
    const art = new Painting(); painting.current = art;
    const drafts = new DraftSession(art, () => ({ brush: brushRef.current, guide: guideRef.current, signature: signatureRef.current }), setSaveState); draft.current = drafts;
    let disposed = false;
    void drafts.load().then(record => { if (!disposed && record) { setAvailableDraft(record); setRecoveryOpen(true); } });
    const params = new URLSearchParams(location.search);
    const view = new StudioRenderer(canvas.current!, flat.current!, art, () => { setFallback(view.mode !== 'webgl2'); update(); }, import.meta.env.DEV && params.get('fallback') === '1'); renderer.current = view;
    setFallback(view.mode !== 'webgl2');
    const controls = attachInput(surface.current!, art, () => brushRef.current, () => view.request(), changed, p => {
      if (!cursor.current) return;
      cursor.current.style.display = p ? 'block' : 'none';
      if (p) cursor.current.style.transform = `translate(${p.x}px,${p.y}px)`;
    }, setStatus); input.current = controls;
    const resize = new ResizeObserver(() => view.resize()); resize.observe(surface.current!);
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,[contenteditable=true]') || document.querySelector('dialog[open]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); controls.finish(); art.undo(); view.request(); changed(); }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (drafts.unsaved) { event.preventDefault(); event.returnValue = ''; } };
    const strokeStarted = (event: PointerEvent) => { if (event.button === 0 && event.isPrimary) drafts.changed(); };
    const target = surface.current!; target.addEventListener('pointerdown', strokeStarted, true);
    window.addEventListener('keydown', key); window.addEventListener('beforeunload', beforeUnload);
    if (import.meta.env.DEV && params.get('test') === '1') window.__studio = { painting: art, renderer: view, draft: drafts, setBrush: b => { setBrush(old => ({ ...old, ...b })); brushRef.current = { ...brushRef.current, ...b }; }, finish: controls.finish, refresh: () => { view.request(); changed(); } };
    return () => { disposed = true; drafts.dispose(); controls.dispose(); view.dispose(); resize.disconnect(); target.removeEventListener('pointerdown', strokeStarted, true); window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', beforeUnload); delete window.__studio; };
  }, []);

  useEffect(() => {
    if (!metadataMounted.current) { metadataMounted.current = true; return; }
    if (restoringDetails.current) { restoringDetails.current = false; return; }
    draft.current?.changed();
  }, [brush, guide, signature]);
  useEffect(() => { if (recoveryOpen) recoveryDialog.current?.showModal(); else recoveryDialog.current?.close(); }, [recoveryOpen]);
  const restore = () => {
    if (!availableDraft || !painting.current) return;
    input.current?.finish(); const art = painting.current;
    art.color.set(availableDraft.color); art.height.set(availableDraft.height); art.history = []; art.invalidate();
    restoringDetails.current = true;
    brushRef.current = availableDraft.brush; guideRef.current = availableDraft.guide; signatureRef.current = availableDraft.signature;
    setBrush(availableDraft.brush); setGuide(availableDraft.guide); setSignature(availableDraft.signature);
    draft.current?.restored(availableDraft); setAvailableDraft(null); setRecoveryOpen(false); renderer.current?.request(); update();
    setStatus('草稿已恢复。撤销从恢复后的新笔开始，旧撤销历史不跨刷新保留。');
  };
  const replaceSavedDraft = () => {
    input.current?.finish(); painting.current?.clear(); setGuide(emptyGuide); setSignature('');
    draft.current?.replace(); setAvailableDraft(null); setRecoveryOpen(false); renderer.current?.request(); update();
    setStatus('已选择新建并替换旧草稿，请等待新草稿保存完成。');
  };

  useEffect(() => { if (confirmClear) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmClear]);
  useEffect(() => { if (newChoice) newDialog.current?.showModal(); else newDialog.current?.close(); }, [newChoice]);
  const startGuide = () => {
    input.current?.finish();
    if (guide.theme) setGuide({ ...guide, open: true });
    else if (painting.current?.color.some(v => v !== 0)) setNewChoice(true);
    else setGuide({ theme: 'sunset', step: 0, open: true, overlay: true });
  };
  const chooseGuide = (fresh: boolean) => {
    if (fresh) { input.current?.finish(); painting.current?.clear(); setSignature(''); renderer.current?.request(); changed(); }
    setGuide({ theme: 'sunset', step: 0, open: true, overlay: true }); setNewChoice(false);
    setStatus(fresh ? '新画布已准备好；清空仍可撤销。' : '在你的画作上继续，原有笔触都保留。');
  };
  const undo = () => { input.current?.finish(); painting.current?.undo(); renderer.current?.request(); changed(); setStatus('已撤回上一笔，慢慢来。'); };
  const clear = () => { input.current?.finish(); painting.current?.clear(); renderer.current?.request(); changed(); setConfirmClear(false); setStatus('一张空白画布，一次新的开始。清空也可以撤销。'); };
  const download = async () => {
    if (!renderer.current || busy) return;
    input.current?.finish(); setBusy(true); setStatus('正在将你的画作装进 PNG…');
    try {
      const blob = await exportArtwork(renderer.current, signature);
      downloadBlob(blob, '慢光-我的小画.png');
      setStatus(renderer.current.mode === 'webgl2' ? 'PNG 已导出。把这段时光留在身边。' : 'PNG 已导出：简化显示，不含局部光照。');
    } catch (error) { setStatus(error instanceof Error ? error.message : '导出失败，请重试。'); }
    finally { setBusy(false); update(); }
  };

  const complete = () => { input.current?.finish(); if (!painting.current?.color.some(v => v !== 0)) { setStatus('先留下至少一笔，再签名完成这幅画。'); return; } setFinishing(true); };
  return <div className="studio">
    <header className="header">
      <div className="wordmark" aria-label="慢光数字油画室"><span className="brand-symbol"><Icon name="sun" size={24}/></span><span className="brand-name">慢光<span className="brand-en">SLOWLIGHT</span></span></div>
      <div className="header-note">留一点时间，给手中的颜色。</div>
      <div className="edition"><span/> 数字油画室 <small>VOL. 01</small><a className="review-shortcut" href={`${import.meta.env.BASE_URL}review/`} target="_blank" rel="noopener">体验与验收 ↗</a></div>
    </header>

    <main className="workspace" inert={saveState.phase === 'loading'}>
      <Guide state={guide} change={setGuide} start={startGuide} recommend={b => setBrush(old => ({ ...old, ...b }))} complete={complete}/>
      <section className="canvas-column" aria-label="创作区">
        <div className="workspace-heading"><div><p className="eyebrow">A LITTLE TIME, A LITTLE PAINT</p><h1>把此刻，慢慢画下来。</h1></div><span className="paper-label">你的画布 <span>01</span></span></div>
        <div className="toolbar" aria-label="绘画工具">
          <div className="toolbar-actions"><button className="icon-button" aria-label="撤销" title="撤销 · Ctrl+Z" disabled={!historyCount || busy} onClick={undo}><Icon name="undo"/></button><button className="icon-button" aria-label="清空画布" title="清空画布" disabled={!hasPaint || busy} onClick={() => setConfirmClear(true)}><Icon name="clear"/></button></div>
          <div className="mode-switch" aria-label="绘画方式"><button aria-pressed={brush.mode === 'cover'} onClick={() => setBrush({ ...brush, mode: 'cover' })}>覆盖</button><button aria-pressed={brush.mode === 'mix'} onClick={() => setBrush({ ...brush, mode: 'mix' })}>混色</button></div>
          <span className="toolbar-caption">{brush.mode === 'cover' ? '让新的颜色，留在画布上' : '让两种颜色，在接触处相遇'}</span>
          <button className="finish-button" onClick={complete} disabled={!hasPaint || busy}>签名与完成</button>
          <button className="export-button" onClick={download} disabled={busy}><Icon name="download" size={17}/>{busy ? '导出中…' : '导出 PNG'}</button>
        </div>
        <div className="canvas-frame">
          <div ref={surface} className="painting-surface" data-testid="painting-surface" aria-label="油画画布，选择颜色后按住鼠标拖动绘画" style={{ pointerEvents: busy ? 'none' : 'auto' }}>
            <canvas ref={canvas} aria-label="油画材质显示"/><canvas ref={flat} aria-label="简化画布显示"/>
            {guide.open && guide.overlay && <GuideOverlay step={guide.step}/>}
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
    <footer className="statusbar"><span className="live-status" role="status">{status}</span><div className="draft-status"><span data-testid="save-state" data-phase={saveState.phase} role="status">{saveState.phase === 'failed' ? '保存失败 · ' : ''}{saveState.message}{saveState.savedAt && saveState.phase === 'saved' ? ` · ${new Date(saveState.savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>{availableDraft && <button onClick={() => setRecoveryOpen(true)}>恢复已有草稿</button>}{saveState.phase === 'failed' && draft.current?.canRetrySave && <button onClick={() => draft.current?.retrySave()}>重试保存</button>}{saveState.phase === 'failed' && <button onClick={() => { void draft.current?.load().then(record => { if (record) { setAvailableDraft(record); setRecoveryOpen(true); } }); }}>重新读取草稿</button>}<small>仅在此浏览器本地保存一个草稿 · 清理浏览器数据会丢失，请导出留存</small></div></footer>
    {fallback && <div className="fallback-notice" role="alert"><strong>已切换简化显示</strong><span>仍可绘画、混色、撤销和导出；局部光照暂不可用。</span><button onClick={() => renderer.current?.retry()}>重试材质显示</button></div>}
    <dialog ref={dialog} className="clear-dialog" onCancel={() => setConfirmClear(false)} onClose={() => setConfirmClear(false)}><p className="eyebrow">A FRESH START</p><h2>回到一张空白画布？</h2><p>当前画面会被清空。你仍然可以撤销这次清空。</p><div><button autoFocus onClick={() => setConfirmClear(false)}>继续画</button><button className="confirm-button" onClick={clear}>确认清空</button></div></dialog>
    <dialog ref={newDialog} className="clear-dialog" onCancel={() => setNewChoice(false)} onClose={() => setNewChoice(false)}><p className="eyebrow">KEEP YOUR MARKS</p><h2>从哪里开始这场日落？</h2><p>画布上已经有你的笔触。可以直接在当前画作上开启提示；新画一张会清空当前画布，这次清空仍可撤销。</p><div className="choice-actions"><button autoFocus onClick={() => setNewChoice(false)}>取消，保留画作</button><button onClick={() => chooseGuide(true)}>新画一张旅行日落</button><button className="confirm-button" onClick={() => chooseGuide(false)}>在当前画作上继续</button></div></dialog>
    <dialog ref={recoveryDialog} className="clear-dialog" onCancel={() => setRecoveryOpen(false)} onClose={() => setRecoveryOpen(false)}><p className="eyebrow">WELCOME BACK</p><h2>上次的日光，还在这里。</h2><p>找到一个本地草稿{availableDraft ? `，保存于 ${new Date(availableDraft.savedAt).toLocaleString('zh-CN')}` : ''}。恢复颜色、厚度与创作步骤后，可以继续绘画。旧撤销历史不会恢复，撤销从接下来的新笔开始。</p>{hasPaint && <p>恢复会替换当前未保存画面；请先导出当前画作。</p>}<p>选择新建会替换这个唯一的已存草稿。暂不恢复时，旧草稿会保留，当前画面只在内存中。</p><div className="choice-actions"><button onClick={() => setRecoveryOpen(false)}>暂不恢复，保留草稿</button>{hasPaint && <button onClick={download}>导出当前画面</button>}<button onClick={replaceSavedDraft}>新建并替换旧草稿</button><button className="confirm-button" autoFocus onClick={restore}>{hasPaint ? '确认恢复并替换当前画面' : '恢复草稿'}</button></div></dialog>
    {finishing && renderer.current && <Completion renderer={renderer.current} signature={signature} changeSignature={setSignature} back={() => { setFinishing(false); setStatus('画作与签名都已保留，可以继续修改。'); }}/>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
