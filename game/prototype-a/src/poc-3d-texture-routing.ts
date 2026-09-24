export type KnifeTriangleMaterial = 'blade' | 'handle';

export function classifyKnifeTriangleMaterial(
  centroidProjection: number,
  minimumProjection: number,
  maximumProjection: number,
  handleEnd: 'minimum' | 'maximum',
): KnifeTriangleMaterial {
  const span = maximumProjection - minimumProjection;
  if (!Number.isFinite(span) || span <= 1e-6) return 'blade';
  const normalized = (centroidProjection - minimumProjection) / span;
  const isHandle = handleEnd === 'minimum' ? normalized <= 0.27 : normalized >= 0.73;
  return isHandle ? 'handle' : 'blade';
}
