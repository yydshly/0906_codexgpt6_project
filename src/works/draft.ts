import { Painting, SIZE, MAX_HEIGHT, type Brush } from '../painting/engine';
import type { GuideState } from '../guidance/sunset';

export const DRAFT_DB = 'slowlight-current-draft';
export type WorkDetails = { brush: Brush; guide: GuideState; signature: string };
export type DraftRecord = WorkDetails & { formatVersion: 1; brushVersion: 1; canvasSeed: 906; size: 1024; id: string; savedAt: number; color: Uint8ClampedArray; height: Uint16Array; checksums: string[] };
export type SaveState = { phase: 'loading' | 'ready' | 'saving' | 'saved' | 'failed' | 'paused'; message: string; savedAt?: number };
const header = (r: Omit<DraftRecord, 'checksums'>) => JSON.stringify({ formatVersion: r.formatVersion, brushVersion: r.brushVersion, canvasSeed: r.canvasSeed, size: r.size, id: r.id, savedAt: r.savedAt, brush: r.brush, guide: r.guide, signature: r.signature });
const hash = async (bytes: Uint8Array | Uint8ClampedArray | Uint16Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer))).map(v => v.toString(16).padStart(2, '0')).join('');
async function checksums(record: Omit<DraftRecord, 'checksums'>) {
  return Promise.all([hash(record.color), hash(record.height), hash(new TextEncoder().encode(header(record)))]);
}

export async function validateDraft(value: unknown): Promise<DraftRecord> {
  const r = value as DraftRecord;
  const b = r?.brush, g = r?.guide;
  if (!r || r.formatVersion !== 1 || r.brushVersion !== 1 || r.canvasSeed !== 906 || r.size !== SIZE || typeof r.id !== 'string' || !Number.isFinite(r.savedAt)
    || !(r.color instanceof Uint8ClampedArray) || r.color.length !== SIZE * SIZE * 4 || r.color.byteOffset !== 0 || r.color.buffer.byteLength !== r.color.byteLength
    || !(r.height instanceof Uint16Array) || r.height.length !== SIZE * SIZE || r.height.byteOffset !== 0 || r.height.buffer.byteLength !== r.height.byteLength || r.height.some(v => v > MAX_HEIGHT)
    || !b || !/^#[\da-f]{6}$/i.test(b.color) || !Number.isFinite(b.size) || b.size < 8 || b.size > 96 || !Number.isFinite(b.load) || b.load < .15 || b.load > 1 || !['cover', 'mix'].includes(b.mode) || !Number.isInteger(b.seed)
    || !g || ![null, 'sunset'].includes(g.theme) || !Number.isInteger(g.step) || g.step < 0 || g.step > 3 || typeof g.open !== 'boolean' || typeof g.overlay !== 'boolean'
    || typeof r.signature !== 'string' || r.signature.length > 40 || !Array.isArray(r.checksums) || r.checksums.length !== 3) throw new Error('草稿格式或版本无法读取，原存储数据未改动。');
  const actual = await checksums(r);
  if (!actual.every((v, i) => v === r.checksums[i])) throw new Error('草稿校验未通过，可能已损坏。原存储数据未改动。');
  return r;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(DRAFT_DB, 1);
    const timer = setTimeout(() => { settled = true; reject(new Error('本地存储没有响应，请关闭其他画室页面后重试。')); }, 5000);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts'); };
    request.onsuccess = () => { clearTimeout(timer); if (settled) request.result.close(); else { settled = true; resolve(request.result); } };
    request.onerror = () => { clearTimeout(timer); settled = true; reject(request.error ?? new Error('本地存储不可用')); };
  });
}
async function readDraft(): Promise<unknown> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly'), request = tx.objectStore('drafts').get('current');
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error('草稿读取失败'));
      tx.onerror = () => {}; // onabort is the final transaction result.
    });
  } finally { db.close(); }
}
async function writeDraft(record: DraftRecord, expectedId: string | null) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts');
      let conflict = false;
      const current = store.get('current');
      current.onsuccess = () => {
        // Read and compare within the SAME write transaction: another tab cannot
        // silently replace a newer draft with this tab's stale editing session.
        if ((current.result?.id ?? null) !== expectedId) { conflict = true; tx.abort(); return; }
        try { store.put(record, 'current'); } catch (error) { tx.abort(); reject(error); }
      };
      tx.oncomplete = () => resolve(); // A successful put request alone is insufficient.
      tx.onabort = () => reject(new Error(conflict ? '另一个页面已更新草稿，已停止覆盖。请先导出当前画作，再刷新恢复。' : '本地写入失败，可能空间不足或存储被限制。'));
      tx.onerror = () => {};
    });
  } finally { db.close(); }
}

export class DraftSession {
  state: SaveState = { phase: 'loading', message: '正在读取本地草稿…' };
  readonly metrics = { snapshots: 0, copiedBytes: 0, maxCopyMs: 0, writes: 0, maxWriteMs: 0, capturesDuringStroke: 0 };
  private enabled = false;
  private disposed = false;
  private loading = true;
  private serial = 0;
  private savedSerial = 0;
  private expectedId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing = false;
  constructor(private painting: Painting, private details: () => WorkDetails, private notify: (state: SaveState) => void) {}
  private set(state: SaveState) { this.state = state; if (!this.disposed) this.notify(state); }
  async load() {
    this.loading = true; this.enabled = false; clearTimeout(this.timer);
    this.set({ phase: 'loading', message: '正在读取本地草稿…' });
    try {
      const raw = await readDraft();
      const record = raw === undefined ? null : await validateDraft(raw);
      if (this.disposed) return null;
      this.expectedId = record?.id ?? null; this.loading = false;
      if (record) this.pause();
      else { this.enabled = true; this.set({ phase: 'ready', message: '落笔后自动保存当前草稿' }); }
      return record;
    } catch (error) {
      this.loading = false; this.enabled = false;
      this.set({ phase: 'failed', message: `${error instanceof Error ? error.message : '无法读取草稿。'} 当前画面仍可绘制和导出。` });
      return null;
    }
  }
  pause() { this.enabled = false; clearTimeout(this.timer); this.set({ phase: 'paused', message: '旧草稿已保留，当前画面暂不自动保存。可随时导出。' }); }
  restored(record: DraftRecord) {
    this.expectedId = record.id; this.enabled = true; this.serial = this.savedSerial = 0;
    this.set({ phase: 'saved', message: '已保存', savedAt: record.savedAt });
  }
  replace() { this.enabled = true; this.changed(); }
  changed() {
    this.serial++;
    if (!this.enabled || this.loading || this.disposed) return;
    this.set({ phase: 'saving', message: '保存中… 请等到“已保存”再离开' }); this.schedule();
  }
  private schedule(delay = 650) { clearTimeout(this.timer); if (!this.disposed) this.timer = setTimeout(() => void this.flush(), delay); }
  async flush() {
    if (!this.enabled || this.loading || this.writing || this.disposed || this.serial === this.savedSerial) return;
    if (this.painting.active) { this.schedule(250); return; }
    this.writing = true;
    const serial = this.serial;
    try {
      const started = performance.now();
      const metadata = this.details();
      const base: Omit<DraftRecord, 'checksums'> = { formatVersion: 1, brushVersion: 1, canvasSeed: 906, size: 1024, id: crypto.randomUUID(), savedAt: Date.now(), brush: { ...metadata.brush }, guide: { ...metadata.guide }, signature: metadata.signature, color: this.painting.color.slice(), height: this.painting.height.slice() };
      this.metrics.snapshots++; this.metrics.copiedBytes += base.color.byteLength + base.height.byteLength;
      this.metrics.maxCopyMs = Math.max(this.metrics.maxCopyMs, performance.now() - started);
      if (this.painting.active) this.metrics.capturesDuringStroke++;
      const record = { ...base, checksums: await checksums(base) };
      // Hashing is asynchronous. If a new stroke started, wait for a pause before
      // handing the independent snapshot to IndexedDB's structured clone.
      while (this.painting.active && !this.disposed) await new Promise(resolve => setTimeout(resolve, 100));
      if (this.disposed) return;
      const writeStarted = performance.now();
      await writeDraft(record, this.expectedId);
      this.metrics.writes++; this.metrics.maxWriteMs = Math.max(this.metrics.maxWriteMs, performance.now() - writeStarted);
      this.expectedId = record.id; this.savedSerial = serial;
      if (serial === this.serial && !this.painting.active) this.set({ phase: 'saved', message: '已保存', savedAt: record.savedAt });
      else this.schedule();
    } catch (error) {
      this.set({ phase: 'failed', message: `${error instanceof Error ? error.message : '保存失败。'} 当前画作仍在，请导出 PNG。` });
    } finally { this.writing = false; }
  }
  get unsaved() { return this.serial !== this.savedSerial || this.painting.active; }
  get canRetrySave() { return this.enabled && !this.loading; }
  retrySave() { if (this.canRetrySave) { this.set({ phase: 'saving', message: '保存中… 请等到“已保存”再离开' }); void this.flush(); } }
  dispose() { this.disposed = true; clearTimeout(this.timer); }
}
