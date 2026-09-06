import type { Materials } from './materials';
import type { PlanPlayer } from './player';
import { BrushCursor } from './BrushCursor';

// Keep the large Painting buffers out of React props and development profiling.
export function MaterialBoard({ materials, heldBrushId, dishId, action }: { materials?: Materials; heldBrushId?: string | null; dishId?: string; action?: PlanPlayer['action'] }) {
  return <aside className="prepared-materials" aria-label="备色板与笔架">
    <div className="prepared-material-heading"><h2>为这一幅备好的颜色</h2><small>THE PALETTE</small></div>
    <section className="prepared-board" data-testid="paint-palette" data-action={action ?? 'idle'} aria-label="固定色盘">
      <span className="prepared-engraving">SLOWLIGHT · OILS</span><span className="prepared-hole" aria-hidden="true"/>
      {materials ? <div className="prepared-dishes">{materials.dishes.map(d => <div key={d.id} className="prepared-dish" data-dish-id={d.id} data-color={d.color} data-active={dishId === d.id} aria-label={`${d.id} ${d.color}`}><span className="prepared-well" style={{ backgroundColor: d.color }}/><span>{d.id}</span></div>)}</div> : <p className="materials-empty">先确认构图<br/>再为这幅图准备颜色</p>}
    </section>
    <div className="prepared-material-heading brush-rack-heading"><h2>按需取用的笔</h2><small>{materials ? `${materials.brushes.length} 支 · 固定规格` : '用后归位'}</small></div>
    <div className="prepared-brushes" style={{ gridTemplateColumns: `repeat(${materials?.brushes.length || 1}, minmax(0, 1fr))` }}>{materials ? materials.brushes.map(b => <div key={b.id} className="prepared-brush" data-brush-id={b.id} data-away={heldBrushId === b.id} aria-label={`${b.id} ${b.size} 像素${heldBrushId === b.id ? '已取出' : '在笔架'}`}>
      <BrushCursor rack tip={{ x: 0, y: 0, size: b.size, width: b.size, angle: -Math.PI / 2, color: '#c8ad78', load: 0, down: false, visible: true }}/>
      <span>{b.id}<small>{b.size} px</small></span>
    </div>) : <p className="materials-empty">根据实际笔触准备笔具</p>}</div>
    <div className="prepared-rest"><span className="prepared-cloth" data-wipe-station/><span>擦拭 / 临时搁笔</span></div>
    {materials && <p className="prepared-count">{materials.dishes.length} 盘颜色已固定 · 本地准备<br/>不同图片的用色不同，复杂细节可能失真</p>}
  </aside>;
}
