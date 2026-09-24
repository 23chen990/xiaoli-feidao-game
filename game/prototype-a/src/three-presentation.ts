import type { FinishOption, FoodStyle, SliceState } from './game-core';

export type Vec3Tuple = readonly [number, number, number];

export const FORMAL_CUT_ASSET_CONTRACT = Object.freeze({
  sourceBlend: null,
  lowPolyGlb: null,
  intact: null,
  halfA: null,
  halfB: null,
  capMaterial: null,
  status: 'NOT_PRODUCED' as const,
});

export const MAIN_3D_RESOURCE_CONTRACT = Object.freeze({
  runtimeKind: 'PROGRAMMATIC_ORIGINAL' as const,
  externalAssets: [] as readonly string[],
  glbLoadedAtRuntime: false,
  dracoLoadedAtRuntime: false,
  futureFormalAssetContract: 'Blender source + low-poly GLB + intact + halfA + halfB + capMaterial',
  platformScope: 'web-lite development and QA only',
});

export const PRESENTATION_SCALE = 1 / 100;
export const SIMULATION_FLOOR_Y = 700;
/** World-space top surface of the rendered ground, aligned to simulation y=700. */
export const GROUND_VISUAL_TOP_Y = 0;

export interface CameraSpec {
  projection: 'perspective';
  fov: number;
  aspect: number;
  near: number;
  far: number;
  position: Vec3Tuple;
  target: Vec3Tuple;
}

/**
 * Keep the opening knife in frame on portrait screens without changing the
 * desktop reaction corridor. This is a game-specific framing constraint for
 * the default mobile journey, not a general multi-mode camera requirement.
 */
export function cameraLeadSimulation(width: number, height: number): number {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  return safeWidth / safeHeight < 0.75 ? 120 : 255;
}

export interface FogSpec {
  near: number;
  far: number;
}

export interface KnifeTransform {
  position: Vec3Tuple;
  rotationZ: number;
  depth: number;
}

export interface CutHalfPresentation {
  id: 'halfA' | 'halfB';
  position: Vec3Tuple;
  rotationZ: number;
  rotationDepth: number;
  capMaterialId: string;
  closedGeometry: true;
}

export interface CuttablePresentation {
  id: string;
  kind: 'sigil' | 'block';
  skinKind: 'crate' | 'log' | 'crystal' | 'dessert';
  foodStyle: FoodStyle;
  phase: 'intact' | 'cut';
  position: Vec3Tuple;
  width: number;
  height: number;
  depth: number;
  radius: number | null;
  falling: boolean;
  rotationZ: number;
  halves: readonly CutHalfPresentation[];
}

export function cuttableSkinKind(kind: CuttablePresentation['kind'], width: number, height: number): CuttablePresentation['skinKind'] {
  if (kind === 'sigil') return 'crystal';
  return width >= height * 1.6 ? 'log' : 'crate';
}

export function skinKindForFoodStyle(style: FoodStyle, kind: CuttablePresentation['kind'], width: number, height: number): CuttablePresentation['skinKind'] {
  if (style === 'cake' || style === 'pastry' || style === 'cheesecake') return 'dessert';
  if (style === 'banana' || style === 'roast' || style === 'skewer') return 'log';
  if (style === 'dumpling' || style === 'jade-bun' || style === 'coconut') return 'crate';
  return cuttableSkinKind(kind, width, height);
}

export function sigilCutMotion(ageSeconds: number, side: -1 | 1): {
  position: Vec3Tuple;
  rotationZ: number;
  rotationDepth: number;
} {
  const age = Math.max(0, Number.isFinite(ageSeconds) ? ageSeconds : 0);
  const ease = 1 - Math.exp(-4.8 * age);
  const lateral = side * (0.1 + 0.34 * ease);
  const arc = 0.72 * age - 2.4 * age * age;
  const vertical = age >= 0.9 ? 0 : Math.max(-1.1, arc);
  const depth = side * (0.16 + 0.2 * ease);
  return {
    position: [lateral, vertical, depth],
    rotationZ: side * Math.min(0.8, age * 1.35),
    rotationDepth: side * Math.min(0.72, age * 1.1),
  };
}

export interface PresentationFrame {
  knife: KnifeTransform;
  cuttables: CuttablePresentation[];
  newCutIds: string[];
}

export interface PerformanceResult {
  frames: number;
  medianMs: number;
  p95Ms: number;
  over50Percent: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  dpr: number;
  withinTargets: boolean;
}

export function worldPointFromSimulation(x: number, y: number, depth = 0): Vec3Tuple {
  return [x * PRESENTATION_SCALE, (SIMULATION_FLOOR_Y - y) * PRESENTATION_SCALE, depth];
}

export function createCameraSpec(width: number, height: number, targetX = 3.2, finishOptions: readonly FinishOption[] = []): CameraSpec {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspect = safeWidth / safeHeight;
  const wallX = finishOptions[0]?.x;
  const approach = wallX === undefined ? 0 : Math.max(0, Math.min(1, (targetX - wallX * PRESENTATION_SCALE + 8) / 4));
  const blend = approach * approach * (3 - 2 * approach);
  const portraitDistance = Math.max(1 + blend * 0.6, 0.95 / aspect);
  // Keep the whole result wall in view before a choice, then stop following
  // beyond it. Opening framing is unchanged and approach zoom is continuous.
  if (wallX !== undefined) targetX = Math.min(targetX, wallX * PRESENTATION_SCALE - 1.2);
  const target: Vec3Tuple = [targetX, 3.1, 0];
  return {
    projection: 'perspective',
    fov: 24,
    aspect,
    near: 0.1,
    far: 90,
    position: [targetX + 3.8 * portraitDistance, 3.1 + 5.1 * portraitDistance, 13.2 * portraitDistance],
    target,
  };
}

export function createFogSpec(width: number, height: number): FogSpec {
  const camera = createCameraSpec(width, height);
  const near = Math.max(20, camera.position[2] + 4);
  return { near, far: near + 40 };
}

export function knifeTransformFromState(state: SliceState): KnifeTransform {
  return {
    position: worldPointFromSimulation(state.player.x, state.player.y),
    rotationZ: -state.player.angle,
    depth: 0.24,
  };
}

export function capFacingScore(camera: CameraSpec, capNormal: Vec3Tuple): number {
  const view: Vec3Tuple = [
    camera.position[0] - camera.target[0],
    camera.position[1] - camera.target[1],
    camera.position[2] - camera.target[2],
  ];
  const viewLength = Math.hypot(...view);
  const normalLength = Math.hypot(...capNormal);
  if (viewLength === 0 || normalLength === 0) return 0;
  return Math.abs((view[0] * capNormal[0] + view[1] * capNormal[1] + view[2] * capNormal[2]) / (viewLength * normalLength));
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))]!;
}

function rounded(value: number, decimals = 3): number {
  const power = 10 ** decimals;
  return Math.round(value * power) / power;
}

export function summarizePerformance(
  frameTimes: readonly number[],
  rendererInfo: { drawCalls: number; triangles: number; geometries?: number; textures?: number },
  dpr: number,
): PerformanceResult {
  const samples = frameTimes.filter((sample) => Number.isFinite(sample) && sample >= 0);
  const sorted = [...samples].sort((left, right) => left - right);
  const median = sorted.length % 2 === 0 && sorted.length > 0
    ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
    : percentile(sorted, 0.5);
  const over50Percent = samples.length === 0 ? 0 : samples.filter((sample) => sample > 50).length / samples.length * 100;
  const result = {
    frames: samples.length,
    medianMs: rounded(median),
    p95Ms: rounded(percentile(sorted, 0.95)),
    over50Percent: rounded(over50Percent),
    drawCalls: Math.max(0, Math.floor(rendererInfo.drawCalls)),
    triangles: Math.max(0, Math.floor(rendererInfo.triangles)),
    geometries: Math.max(0, Math.floor(rendererInfo.geometries ?? 0)),
    textures: Math.max(0, Math.floor(rendererInfo.textures ?? 0)),
    dpr: rounded(dpr),
  };
  return {
    ...result,
    withinTargets: result.frames >= 600
      && result.medianMs <= 20
      && result.p95Ms <= 33.4
      && result.over50Percent <= 1
      && result.drawCalls <= 90
      && result.triangles <= 75_000,
  };
}

function capMaterialId(targetId: string, half: 'halfA' | 'halfB'): string {
  return `PROGRAMMATIC_ORIGINAL:cap:${targetId}:${half}`;
}

export class ThreePresentationModel {
  private readonly cutLedger = new Set<string>();

  reset(): void {
    this.cutLedger.clear();
  }

  sync(state: SliceState): PresentationFrame {
    const newCutIds: string[] = [];
    const cuttables: CuttablePresentation[] = [];
    for (const sigil of state.sigils) {
      if (sigil.cut && !this.cutLedger.has(sigil.id)) {
        this.cutLedger.add(sigil.id);
        newCutIds.push(sigil.id);
      }
      const phase = sigil.cut ? 'cut' : 'intact';
      const position = worldPointFromSimulation(sigil.x, sigil.y);
      const negativeMotion = sigilCutMotion(sigil.splitAge, -1);
      const positiveMotion = sigilCutMotion(sigil.splitAge, 1);
      cuttables.push({
        id: sigil.id,
        kind: 'sigil',
        skinKind: skinKindForFoodStyle(sigil.foodStyle, 'sigil', sigil.radius * 2, sigil.radius * 2),
        foodStyle: sigil.foodStyle,
        phase,
        position,
        width: sigil.radius * 2 * PRESENTATION_SCALE,
        height: sigil.radius * 2 * PRESENTATION_SCALE,
        depth: 0.28,
        radius: sigil.radius * PRESENTATION_SCALE,
        falling: sigil.cut && sigil.vy !== 0,
        rotationZ: 0,
        halves: phase === 'cut' ? [
          {
            id: 'halfA',
            position: [position[0] + negativeMotion.position[0], position[1] + negativeMotion.position[1], negativeMotion.position[2]],
            rotationZ: negativeMotion.rotationZ,
            rotationDepth: negativeMotion.rotationDepth,
            capMaterialId: capMaterialId(sigil.id, 'halfA'),
            closedGeometry: true,
          },
          {
            id: 'halfB',
            position: [position[0] + positiveMotion.position[0], position[1] + positiveMotion.position[1], positiveMotion.position[2]],
            rotationZ: positiveMotion.rotationZ,
            rotationDepth: positiveMotion.rotationDepth,
            capMaterialId: capMaterialId(sigil.id, 'halfB'),
            closedGeometry: true,
          },
        ] : [],
      });
    }
    for (const block of state.blocks) {
      if (block.cut && !this.cutLedger.has(block.id)) {
        this.cutLedger.add(block.id);
        newCutIds.push(block.id);
      }
      const phase = block.cut ? 'cut' : 'intact';
      const position = worldPointFromSimulation(block.x, block.y);
      const fragments = state.fragments.filter((fragment) => fragment.sourceId === block.id).slice(0, 2);
      const fallbackAge = block.cut ? 0.08 : 0;
      const halves: CutHalfPresentation[] = phase === 'cut' ? (['halfA', 'halfB'] as const).map((half, index) => {
        const fragment = fragments[index];
        const age = fragment?.age ?? fallbackAge;
        const fragmentPosition = fragment ? worldPointFromSimulation(fragment.x, fragment.y) : position;
        const depthSide = index === 0 ? -1 : 1;
        return {
          id: half,
          position: [fragmentPosition[0], fragmentPosition[1], depthSide * (0.2 + age * 0.2)],
          rotationZ: -(fragment?.angle ?? block.angle),
          rotationDepth: depthSide * Math.min(1.1, age * 1.6),
          capMaterialId: capMaterialId(block.id, half),
          closedGeometry: true,
        };
      }) : [];
      cuttables.push({
        id: block.id,
        kind: 'block',
        skinKind: skinKindForFoodStyle(block.foodStyle, 'block', block.width, block.height),
        foodStyle: block.foodStyle,
        phase,
        position,
        width: block.width * PRESENTATION_SCALE,
        height: block.height * PRESENTATION_SCALE,
        depth: block.thin ? 0.3 : 0.5,
        radius: null,
        falling: block.falling,
        rotationZ: -block.angle,
        halves,
      });
    }
    return { knife: knifeTransformFromState(state), cuttables, newCutIds };
  }
}
