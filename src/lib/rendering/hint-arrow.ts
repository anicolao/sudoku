export interface CandidateBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Both boxes and ellipses meet their left/right boundary at mid-height.
// Horizontal tangents keep diagonal and vertical links outside the glyphs.
export function candidateArrowPath(from: CandidateBounds, to: CandidateBounds): string {
  const fromY = (from.top + from.bottom) / 2;
  const toY = (to.top + to.bottom) / 2;
  let fromX: number, toX: number, fromDirection: number, toDirection: number;
  if (from.right <= to.left) {
    fromX = from.right; toX = to.left; fromDirection = 1; toDirection = -1;
  } else if (to.right <= from.left) {
    fromX = from.left; toX = to.right; fromDirection = -1; toDirection = 1;
  } else {
    // Stack-aligned candidates connect around the side facing the board centre.
    const right = (from.left + from.right + to.left + to.right) / 4 < 4.5;
    fromX = right ? from.right : from.left;
    toX = right ? to.right : to.left;
    fromDirection = toDirection = right ? 1 : -1;
  }
  const bend = fromDirection === toDirection
    ? Math.min(.6, Math.max(.18, Math.abs(toY - fromY) / 3))
    : Math.min(.7, Math.abs(toX - fromX) / 3);
  return `M ${fromX} ${fromY} C ${fromX + fromDirection * bend} ${fromY}, ${toX + toDirection * bend} ${toY}, ${toX} ${toY}`;
}
