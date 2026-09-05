import { useEffect, useRef, useState } from 'react';
import type { StudioRenderer } from '../rendering/renderer';
import { downloadBlob, exportArtwork } from './export';

export function Completion({ renderer, signature, changeSignature, back }: { renderer: StudioRenderer; signature: string; changeSignature: (value: string) => void; back: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; signature: string } | null>(null);
  const [pending, setPending] = useState(true), [error, setError] = useState(''), [exported, setExported] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let alive = true, url = '';
    setPending(true); setError(''); setExported(false);
    const timer = setTimeout(() => {
      void exportArtwork(renderer, signature).then(blob => {
        if (!alive) return;
        url = URL.createObjectURL(blob); setPreview({ url, blob, signature }); setPending(false);
      }).catch(e => { if (alive) { setError(e instanceof Error ? e.message : '预览生成失败，请重试。'); setPending(false); } });
    }, 180);
    return () => { alive = false; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [renderer, signature, retry]);
  return <dialog className="completion-dialog" ref={dialog} aria-labelledby="completion-heading" onCancel={back} onClose={back}>
    <div className="completion-preview">{preview && <img data-testid="work-preview" data-signature={preview.signature} src={preview.url} alt="包含实际画作与签名的导出预览"/>}{pending && <span className="preview-progress" role="status">正在准备真实作品预览…</span>}</div>
    <div className="completion-notes"><p className="eyebrow">A LITTLE LIGHT, YOURS TO KEEP</p><h2 id="completion-heading">把这段日光，<br/>带回家。</h2><p>每一处留下的颜色，<br/>都有你的选择。</p><label htmlFor="signature">给这幅画签名 <small>可留空</small></label><input id="signature" maxLength={40} value={signature} placeholder="你的名字，或旅行的日期" onChange={e => changeSignature(e.target.value)}/><p className="completion-caption">签名会印在 PNG 右下角。<br/>1024 × 1024 · 仅含你的画作与签名<br/>{renderer.mode === 'canvas2d' ? '当前为简化材质，不含局部光照。' : '参考轮廓与工具不会出现在作品里。'}</p>{error && <p role="alert">{error}<button onClick={() => setRetry(v => v + 1)}>重试预览</button></p>}<button className="completion-export" disabled={pending || !!error || !preview || preview.signature !== signature} onClick={() => { if (preview) { downloadBlob(preview.blob, '慢光-旅行日落.png'); setExported(true); } }}>保存这幅画 · PNG</button><button className="completion-back" onClick={back}>返回修改</button>{exported && <p role="status">PNG 已导出。画作仍保留，可返回继续修改。</p>}<p className="completion-caption">浏览器草稿不是永久备份，<br/>把导出的文件也留在身边。</p></div>
  </dialog>;
}
