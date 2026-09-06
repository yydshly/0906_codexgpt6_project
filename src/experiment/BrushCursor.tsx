import { useId } from 'react';
import type { PlanPlayer } from './player';

export const brushName = (size: number) => size >= 40 ? '宽扁刷' : size >= 14 ? '中扁刷' : '细扁刷';

/** A view of the Painting contact, never an input to painting or PNG export. */
export function BrushCursor({ tip }: { tip: PlanPlayer['tip'] }) {
  const id = useId().replaceAll(':', '');
  const width = tip.down ? tip.width : tip.size * .82, half = width / 2;
  const neck = Math.max(2, Math.min(half * .75, 19)), length = Math.min(34, 18 + width * .18);
  return <svg className="experiment-pen" viewBox="0 0 1024 1024" aria-hidden="true" data-testid="experiment-pen" data-down={tip.down} data-width={tip.width} data-angle={tip.angle} data-size={tip.size}>
    <defs>
      <linearGradient id={`${id}-wood`}><stop stopColor="#423325"/><stop offset=".4" stopColor="#a4885c"/><stop offset=".65" stopColor="#796043"/><stop offset="1" stopColor="#46372a"/></linearGradient>
      <linearGradient id={`${id}-metal`}><stop stopColor="#756f60"/><stop offset=".3" stopColor="#ece4cd"/><stop offset=".6" stopColor="#a9a38f"/><stop offset="1" stopColor="#666658"/></linearGradient>
    </defs>
    <g transform={`translate(${tip.x} ${tip.y}) rotate(${tip.angle * 180 / Math.PI - 90})`}>
      <g transform={`translate(0 ${tip.down ? 0 : -9})`}>
        <path d={`M${-neck * .6} ${-length - 18} L-3 ${-length - 86} Q0 ${-length - 96} 3 ${-length - 86} L${neck * .6} ${-length - 18}Z`} fill={`url(#${id}-wood)`} stroke="#f3ead2" strokeWidth="1"/>
        <path d={`M${-neck * .7} ${-length - 25} L${neck * .7} ${-length - 25} L${neck} ${-length} L${-neck} ${-length}Z`} fill={`url(#${id}-metal)`} stroke="#665f50" strokeWidth=".8"/>
        <path d={`M${-neck} ${-length} L${neck} ${-length} Q${half} -8 ${half} 0 Q0 ${tip.down ? 5 : 1} ${-half} 0 Q${-half} -8 ${-neck} ${-length}Z`} fill="#c8ad78" stroke="#685b41" strokeWidth=".8"/>
        <path d={`M${-half * .92} ${-length * tip.load * .8} Q0 ${-length * tip.load} ${half * .92} ${-length * tip.load * .8} L${half} 0 Q0 ${tip.down ? 5 : 1} ${-half} 0Z`} fill={tip.color}/>
        {Array.from({ length: 9 }, (_, i) => {
          const f = (i - 4) / 4;
          return <path key={i} d={`M${f * neck * .9} ${-length + 2} Q${f * half * .85} -10 ${f * half * .94} ${i % 2 ? -1 : 1}`} fill="none" stroke={i % 2 ? '#fff4da' : '#443d30'} strokeOpacity=".32" strokeWidth={Math.max(.35, width / 100)}/>;
        })}
      </g>
    </g>
  </svg>;
}
