// Local geometric priorities, not semantic object or face recognition.
export function structureImportance(source: Uint8ClampedArray, side: number) {
  const weights = new Float32Array(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const i = (y * side + x) * 4;
    let edge = 0;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const j = (Math.max(0, Math.min(side - 1, y + dy)) * side + Math.max(0, Math.min(side - 1, x + dx))) * 4;
      if (source[j + 3] <= 8) continue;
      edge = Math.max(edge, Math.hypot(source[i] - source[j], source[i + 1] - source[j + 1], source[i + 2] - source[j + 2]) / Math.sqrt(3));
    }
    weights[y * side + x] = source[i + 3] > 8 ? 1 + Math.min(2, edge / 24) : 0;
  }
  return weights;
}

export type RegionCandidate = { x: number; y: number; error: number };
/** Order tasks before executing them; real Painting error is checked within each task.
 * Never reorder across stages. A cell is only a bounded work area, not an object. */
export function regionTasks<T extends RegionCandidate>(candidates: T[], material: (p: T) => string): T[] {
  const tasks = new Map<string, T[]>();
  for (const p of candidates) {
    const tx = Math.floor(p.x / 64), ty = Math.floor(p.y / 64);
    const key = `${ty * 8 + (ty % 2 ? 7 - tx : tx)}/${material(p)}`;
    const task = tasks.get(key) ?? []; task.push(p); tasks.set(key, task);
  }
  return [...tasks.entries()].sort(([a], [b]) => {
    const [ar, am] = a.split('/'), [br, bm] = b.split('/');
    return +ar - +br || am.localeCompare(bm);
  }).flatMap(([, task]) => task.sort((a, b) => {
    const rowA = Math.floor(a.y / 8), rowB = Math.floor(b.y / 8);
    return rowA - rowB || (rowA % 2 ? b.x - a.x : a.x - b.x) || a.y - b.y;
  }));
}
