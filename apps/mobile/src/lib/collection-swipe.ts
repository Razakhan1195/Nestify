/** A horizontal page gesture must not steal ordinary vertical scrolling. */
export function isCollectionSwipe(dx: number, dy: number, touches = 1) {
  return touches === 1 && Math.abs(dx) >= 18 && Math.abs(dx) > Math.abs(dy) * 1.6;
}
export function collectionSwipeTarget(index: number, count: number, dx: number, dy: number, vx = 0) {
  if (!isCollectionSwipe(dx, dy) || !(Math.abs(dx) >= 48 || (Math.abs(dx) >= 24 && Math.abs(vx) >= 0.5))) return index;
  return Math.max(0, Math.min(count - 1, index + (dx < 0 ? 1 : -1)));
}
