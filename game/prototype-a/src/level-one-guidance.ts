export type GuidanceState = 'ready' | 'airborne' | 'anchored' | 'failed' | 'won';

/** Original, compact prompts for the six observed Level 1 teaching beats. */
export function levelOnePrompt(levelNumber: number, playerX: number, status: GuidanceState): string | null {
  if (levelNumber !== 1 || status === 'failed' || status === 'won') return null;
  if (playerX < 520) return '轻触起跳；空中再次轻触翻转';
  if (playerX < 1200) return '连续轻触，保持前进节奏';
  if (playerX < 1900) return '观察彩色阶梯，选择上下路线';
  if (playerX < 2450) return '留意前方尖刺，及时翻转';
  return '靠近终点，选择倍率或安全落点';
}
