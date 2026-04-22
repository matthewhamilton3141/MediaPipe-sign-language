export const ALPHABET_GROUPS = {
  FIST:  ['A', 'S', 'M', 'N', 'T'],
  FLAT:  ['B', 'D', 'F', 'H', 'K'],
  CURVE: ['C', 'O', 'E', 'Q', 'U'],
  POINT: ['I', 'J', 'L', 'P', 'R'],
  WIDE:  ['G', 'V', 'W', 'X', 'Y', 'Z']
};

export function getDistance(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

export function getHandType(hand) {
  const tips = [8, 12, 16, 20], knuckles = [5, 9, 13, 17];
  let extended = 0;
  tips.forEach((t, i) => { if (hand[t].y < hand[knuckles[i]].y) extended++; });

  if (extended >= 4) return 'FLAT';
  if (extended === 0) return 'FIST';
  if (extended === 1 && hand[8].y < hand[5].y) return 'POINT';
  if (getDistance(hand[4], hand[8]) < 0.12) return 'CURVE';
  return 'WIDE';
}