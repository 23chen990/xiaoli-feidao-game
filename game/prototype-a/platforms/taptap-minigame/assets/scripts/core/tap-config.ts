const PLACEHOLDER_IDS = new Set(['000000', 'your-app-id', 'test', 'demo']);

export function validateTapAppId(value: string): string {
  const normalized = value.trim();
  if (!/^\d{5,}$/.test(normalized) || PLACEHOLDER_IDS.has(normalized)) {
    throw new Error('TapTap AppID must be a reviewed numeric AppID');
  }
  return normalized;
}

export const TAP_GAME = Object.freeze({
  name: '疯狂切割',
  appId: validateTapAppId('928932'),
  version: '1.0.0',
  orientation: 'portrait' as const,
});
