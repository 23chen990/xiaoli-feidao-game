import type { FeedbackType, SliceState } from './game-core';
import { z } from 'zod';

export interface ThemeAssetEntry {
  id: string;
  role: 'knife' | 'cuttable' | 'terrain' | 'hazard' | 'feedback';
  source: 'programmatic-original';
  implementation: 'three-geometry' | 'three-material' | 'css';
  externalUri: null;
  replaceable: true;
}

const THEME_ASSET_ENTRY_SCHEMA = z.object({
  id: z.string().min(1),
  role: z.enum(['knife', 'cuttable', 'terrain', 'hazard', 'feedback']),
  source: z.literal('programmatic-original'),
  implementation: z.enum(['three-geometry', 'three-material', 'css']),
  externalUri: z.null(),
  replaceable: z.literal(true),
}).strict();

export const MECHANICS_DEMO_ASSET_MANIFEST_SCHEMA = z.array(THEME_ASSET_ENTRY_SCHEMA).length(5);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export const MECHANICS_DEMO_ASSET_MANIFEST: readonly ThemeAssetEntry[] = deepFreeze(MECHANICS_DEMO_ASSET_MANIFEST_SCHEMA.parse([
  { id: 'demo-knife-rig', role: 'knife', source: 'programmatic-original', implementation: 'three-geometry', externalUri: null, replaceable: true },
  { id: 'demo-cuttable-set', role: 'cuttable', source: 'programmatic-original', implementation: 'three-material', externalUri: null, replaceable: true },
  { id: 'demo-course-kit', role: 'terrain', source: 'programmatic-original', implementation: 'three-geometry', externalUri: null, replaceable: true },
  { id: 'demo-hazard-kit', role: 'hazard', source: 'programmatic-original', implementation: 'three-geometry', externalUri: null, replaceable: true },
  { id: 'demo-feedback-kit', role: 'feedback', source: 'programmatic-original', implementation: 'css', externalUri: null, replaceable: true },
]));

const cssTokens = Object.freeze({
  colorScheme: 'dark',
  fontFamily: 'ui-rounded, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  background: '#071126',
  panel: 'rgb(5 12 31 / 78%)',
  panelStrong: 'rgb(4 11 29 / 91%)',
  border: 'rgb(162 213 255 / 12%)',
  borderStrong: 'rgb(255 231 151 / 35%)',
  title: '#fff7dc',
  accent: '#63f2d5',
  secondary: '#aebddd',
  direction: '#ffe292',
  gate: '#a9c3ff',
  instruction: '#e9f2ff',
  feedback: '#fff0a2',
  feedbackCut: '#96ffe9',
  feedbackFail: '#ff81bb',
  shadow: 'rgb(0 0 0 / 42%)',
  panelShadow: 'rgb(0 0 0 / 18%)',
  textShadow: '#061023',
  impact: 'rgb(255 237 153 / 19%)',
});

const worldTokens = Object.freeze({
  background: 0xaedff4,
  skyLight: 0xf2fbff,
  groundLight: 0x78966c,
  keyLight: 0xffefd2,
  road: 0x7fca68,
  skyline: 0x8fc5a1,
  support: 0xf7f0dc,
  supportActive: 0xffd86e,
  spike: 0xf45b76,
  spikeEmissive: 0x5c1520,
  finishMultiply: 0x4f8de8,
  finishDivide: 0xf06d84,
  finishSafe: 0x55c99b,
  finishBonus: 0xf7b94c,
  finishBonusEmissive: 0x5b3104,
  particle: 0xffc957,
  blade: 0xe5f4fb,
  bladeEmissive: 0x16485b,
  spine: 0x526d80,
  handle: 0xe55f38,
  cuttableBlock: 0xe8a248,
  cuttableSigil: 0x4fbdf0,
  cuttableSigilEmissive: 0x0c5574,
  capA: 0xffdc86,
  capB: 0xffbf63,
  capEmissiveA: 0x7a3100,
  capEmissiveB: 0x692000,
});

const copy = Object.freeze({
  title: '小李飞刀',
  canvasLabel: '小李飞刀：单键切割闯关',
  instruction: '轻触：起跳或空中翻转；切中可切物得分，误触硬物或失足即失败。',
  gateLegend: '×4  ·  ÷3  ·  ×3  ·  ×2',
  phase: Object.freeze({ ordinary: '关卡', bonus: '附加挑战' }),
  counter: Object.freeze({ cuts: '切割', score: '分数' }),
  level: Object.freeze({ current: '关卡', select: '选关', locked: '未解锁', replay: '重玩', next: '下一关', complete: '完成' }),
  status: Object.freeze<Record<SliceState['status'], string>>({
    ready: '准备',
    airborne: '空中翻转',
    anchored: '锐端附着 · 点击脱离',
    failed: '本轮失败',
    won: '到达终点',
  }),
  recovery: Object.freeze({ reverse: '反向碰撞 · 立即点击恢复', forward: '钝端反弹 · 可再次翻转' }),
  stage: Object.freeze<Record<string, string>>({
    'stage.teach': '阶段 1 · 观察与切割',
    'stage.develop': '阶段 2 · 判断与恢复',
    'stage.test': '阶段 3 · 结构与终点',
    'stage.bonus': '附加挑战',
  }),
  finishDistance: '距离',
  fallbackStage: '终点门',
  terminal: Object.freeze({
    spike: '碰到危险物',
    fall: '跌出路线',
    ordinaryWin: '关卡完成',
    bonusWin: '附加挑战完成',
    score: '分数',
    restart: '再次轻触 · 重新开始',
  }),
  feedback: Object.freeze<Partial<Record<FeedbackType, string>>>({
    bounce: '反弹',
    anchor: '附着',
    spike: '失败',
    bonus: '附加挑战',
  }),
});

const cssSchema = z.object({
  colorScheme: z.string(), fontFamily: z.string(), background: z.string(), panel: z.string(), panelStrong: z.string(),
  border: z.string(), borderStrong: z.string(), title: z.string(), accent: z.string(), secondary: z.string(),
  direction: z.string(), gate: z.string(), instruction: z.string(), feedback: z.string(), feedbackCut: z.string(),
  feedbackFail: z.string(), shadow: z.string(), panelShadow: z.string(), textShadow: z.string(), impact: z.string(),
}).strict();

const worldSchema = z.object({
  background: z.number().int(), skyLight: z.number().int(), groundLight: z.number().int(), keyLight: z.number().int(),
  road: z.number().int(), skyline: z.number().int(), support: z.number().int(), supportActive: z.number().int(),
  spike: z.number().int(), spikeEmissive: z.number().int(), finishMultiply: z.number().int(), finishDivide: z.number().int(),
  finishSafe: z.number().int(), finishBonus: z.number().int(), finishBonusEmissive: z.number().int(), particle: z.number().int(),
  blade: z.number().int(), bladeEmissive: z.number().int(), spine: z.number().int(), handle: z.number().int(),
  cuttableBlock: z.number().int(), cuttableSigil: z.number().int(), cuttableSigilEmissive: z.number().int(),
  capA: z.number().int(), capB: z.number().int(), capEmissiveA: z.number().int(), capEmissiveB: z.number().int(),
}).strict();

const copySchema = z.object({
  title: z.string(), canvasLabel: z.string(), instruction: z.string(), gateLegend: z.string(),
  phase: z.object({ ordinary: z.string(), bonus: z.string() }).strict(),
  counter: z.object({ cuts: z.string(), score: z.string() }).strict(),
  level: z.object({ current: z.string(), select: z.string(), locked: z.string(), replay: z.string(), next: z.string(), complete: z.string() }).strict(),
  status: z.object({ ready: z.string(), airborne: z.string(), anchored: z.string(), failed: z.string(), won: z.string() }).strict(),
  recovery: z.object({ reverse: z.string(), forward: z.string() }).strict(),
  stage: z.record(z.string(), z.string()),
  finishDistance: z.string(), fallbackStage: z.string(),
  terminal: z.object({ spike: z.string(), fall: z.string(), ordinaryWin: z.string(), bonusWin: z.string(), score: z.string(), restart: z.string() }).strict(),
  feedback: z.partialRecord(z.enum(['launch', 'flip', 'cut', 'bounce', 'anchor', 'spike', 'fall', 'finish', 'bonus']), z.string()),
}).strict();

export const MECHANICS_DEMO_THEME_SCHEMA = z.object({
  id: z.literal('mechanics-demo-placeholder-v1'),
  status: z.literal('placeholder'),
  styleLock: z.literal(false),
  copy: copySchema,
  css: cssSchema,
  world: worldSchema,
  typography: z.object({ family: z.string() }).strict(),
  hud: z.object({ placement: z.literal('top-left'), safeInsetPx: z.number().int().nonnegative(), compactWidthPx: z.number().int().positive() }).strict(),
  icons: z.object({ input: z.string(), sharp: z.string(), blunt: z.string() }).strict(),
  assets: MECHANICS_DEMO_ASSET_MANIFEST_SCHEMA,
}).strict();

const parsedTheme = MECHANICS_DEMO_THEME_SCHEMA.parse({
  id: 'mechanics-demo-placeholder-v1',
  status: 'placeholder' as const,
  styleLock: false as const,
  copy,
  css: cssTokens,
  world: worldTokens,
  typography: Object.freeze({ family: cssTokens.fontFamily }),
  hud: Object.freeze({ placement: 'top-left' as const, safeInsetPx: 12, compactWidthPx: 215 }),
  icons: Object.freeze({ input: 'TAP', sharp: '▲', blunt: '■' }),
  assets: MECHANICS_DEMO_ASSET_MANIFEST,
});

export const MECHANICS_DEMO_THEME = deepFreeze({ ...parsedTheme, assets: MECHANICS_DEMO_ASSET_MANIFEST });

export interface ThemeContractFacts {
  id: typeof MECHANICS_DEMO_THEME.id;
  status: typeof MECHANICS_DEMO_THEME.status;
  styleLock: typeof MECHANICS_DEMO_THEME.styleLock;
  assetCount: number;
}

export function themeContractFacts(): ThemeContractFacts {
  return {
    id: MECHANICS_DEMO_THEME.id,
    status: MECHANICS_DEMO_THEME.status,
    styleLock: MECHANICS_DEMO_THEME.styleLock,
    assetCount: MECHANICS_DEMO_ASSET_MANIFEST.length,
  };
}

export function applyThemeTokens(root: HTMLElement, theme = MECHANICS_DEMO_THEME): void {
  const variableMap: Record<string, string | number> = {
    '--theme-font-family': theme.css.fontFamily,
    '--theme-background': theme.css.background,
    '--theme-panel': theme.css.panel,
    '--theme-panel-strong': theme.css.panelStrong,
    '--theme-border': theme.css.border,
    '--theme-border-strong': theme.css.borderStrong,
    '--theme-title': theme.css.title,
    '--theme-accent': theme.css.accent,
    '--theme-secondary': theme.css.secondary,
    '--theme-direction': theme.css.direction,
    '--theme-gate': theme.css.gate,
    '--theme-instruction': theme.css.instruction,
    '--theme-feedback': theme.css.feedback,
    '--theme-feedback-cut': theme.css.feedbackCut,
    '--theme-feedback-fail': theme.css.feedbackFail,
    '--theme-shadow': theme.css.shadow,
    '--theme-panel-shadow': theme.css.panelShadow,
    '--theme-text-shadow': theme.css.textShadow,
    '--theme-impact': theme.css.impact,
    '--theme-hud-safe-inset': `${theme.hud.safeInsetPx}px`,
    '--theme-hud-compact-width': `${theme.hud.compactWidthPx}px`,
  };
  root.style.colorScheme = theme.css.colorScheme;
  for (const [name, value] of Object.entries(variableMap)) root.style.setProperty(name, String(value));
  root.dataset.theme = theme.id;
  root.dataset.themeStatus = theme.status;
}
