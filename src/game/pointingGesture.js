const FINGERS = [
  { mcp: 5, pip: 6, dip: 7, tip: 8 },
  { mcp: 9, pip: 10, dip: 11, tip: 12 },
  { mcp: 13, pip: 14, dip: 15, tip: 16 },
  { mcp: 17, pip: 18, dip: 19, tip: 20 },
];

function vector(from, to) {
  return {
    x: to.x - from.x,
    y: to.y - from.y,
    z: (Number.isFinite(to.z) ? to.z : 0) - (Number.isFinite(from.z) ? from.z : 0),
  };
}

function cosine(first, second) {
  const firstLength = Math.hypot(first.x, first.y, first.z);
  const secondLength = Math.hypot(second.x, second.y, second.z);
  if (firstLength < 0.003 || secondLength < 0.003) return -1;
  return (first.x * second.x + first.y * second.y + first.z * second.z) / (firstLength * secondLength);
}

function isFingerExtended(landmarks, finger) {
  const points = [finger.mcp, finger.pip, finger.dip, finger.tip].map((index) => landmarks[index]);
  if (points.some((point) =>
    !Number.isFinite(point?.x) || !Number.isFinite(point?.y) ||
    point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1
  )) return false;

  const proximal = vector(points[0], points[1]);
  const middle = vector(points[1], points[2]);
  const distal = vector(points[2], points[3]);
  return cosine(proximal, middle) > 0.45 && cosine(middle, distal) > 0.1;
}

export function isPointingPose(hand) {
  const landmarks = hand?.landmarks;
  if (!landmarks || landmarks.length < 21) return false;
  return isFingerExtended(landmarks, FINGERS[0]) &&
    FINGERS.slice(1).every((finger) => !isFingerExtended(landmarks, finger));
}
