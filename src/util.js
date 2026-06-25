export function getDistance(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
