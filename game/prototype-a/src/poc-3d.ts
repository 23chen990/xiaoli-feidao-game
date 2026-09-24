import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  BLADE_ASSET,
  BLADE_FEEL,
  CUTTABLE_KINDS,
  OBLIQUE_CAMERA,
  CutPocController,
  sampleFallingPieceMotion,
  FALLING_PIECE_PHYSICS,
  type CutPieceState,
  type CutPocState,
  type CuttableKind,
  type FallingPieceMotion,
} from './cut-poc-3d-core';
import { DIORAMA_SKIN } from './poc-3d-skin';
import { createAStyleTextureSet } from './a-style-texture-runtime';
import { classifyKnifeTriangleMaterial } from './poc-3d-texture-routing';
import './poc-3d.css';

type ExternalAssetStatus = 'loading' | 'loaded' | 'failed';
type FeedbackPhase = 'idle' | 'windup' | 'impact' | 'recovery';

interface CutRuntime {
  startedAt: number;
  pieces: readonly [THREE.Group, THREE.Group];
  states: readonly [CutPieceState, CutPieceState];
  motions: [FallingPieceMotion, FallingPieceMotion];
}

interface ImpactParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotationVelocity: THREE.Vector3;
}

interface FeedbackRuntime {
  startedAt: number;
  impactAt: number;
  kind: CuttableKind;
  impacted: boolean;
  particles: ImpactParticle[];
}

interface CutPocBridgeState extends CutPocState {
  externalAssetStatus: ExternalAssetStatus;
  weaponAssetStatus: ExternalAssetStatus;
  renderedPieceCount: number;
  capMaterialCount: number;
  cameraProjection: 'orthographic';
  feedbackActive: boolean;
  feedbackPhase: FeedbackPhase;
  feedbackLayerCount: number;
  impactCount: number;
  groundedPieceCount: number;
  lowestPieceOffsetY: number;
  skinId: string;
  baseColorTextureCount: number;
  knifeAtlasPartCount: number;
  proceduralTextureCount: number;
  texturedMaterialCount: number;
  environmentLighting: boolean;
}

interface CutPocBridge {
  act(angle?: number): CutPocBridgeState;
  reset(): CutPocBridgeState;
  seekFeedbackForQa(elapsedMs: number): CutPocBridgeState;
  releaseFeedbackQaHold(): CutPocBridgeState;
  getState(): CutPocBridgeState;
  getSceneFacts(): {
    cuttableKinds: readonly CuttableKind[];
    externalAssets: readonly string[];
    cameraPosition: readonly [number, number, number];
    cameraTarget: readonly [number, number, number];
    cameraProjection: 'orthographic';
    weaponAsset: string;
    feedbackLayers: readonly string[];
  };
}

declare global {
  interface Window {
    __CUT_POC__: CutPocBridge;
  }
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`3D POC shell is missing ${selector}`);
  return element;
}

const host = requireElement<HTMLDivElement>('#poc-canvas');
const actionButton = requireElement<HTMLButtonElement>('#cut-button');
const targetLabel = requireElement<HTMLParagraphElement>('#target-label');
const impactFlash = requireElement<HTMLDivElement>('#impact-flash');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(host.clientWidth, host.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.append(renderer.domElement);
const aStyleTextures = createAStyleTextureSet(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc8e8de);
scene.fog = new THREE.Fog(0xc8e8de, 16, 32);
const environmentGenerator = new THREE.PMREMGenerator(renderer);
const roomEnvironment = new RoomEnvironment();
scene.environment = environmentGenerator.fromScene(roomEnvironment, 0.045).texture;
roomEnvironment.dispose();
environmentGenerator.dispose();

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
const baseCameraPosition = new THREE.Vector3().fromArray(OBLIQUE_CAMERA.position);
const baseCameraTarget = new THREE.Vector3().fromArray(OBLIQUE_CAMERA.target);
camera.position.copy(baseCameraPosition);
camera.lookAt(baseCameraTarget);

const ambient = new THREE.HemisphereLight(0xeaf8ff, 0x5f7651, 1.35);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffedcf, 3.25);
sun.position.set(3, 11, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -11;
sun.shadow.camera.right = 11;
sun.shadow.camera.top = 11;
sun.shadow.camera.bottom = -11;
sun.shadow.bias = -0.0008;
scene.add(sun);

const worldRoot = new THREE.Group();
worldRoot.name = 'world-root';
scene.add(worldRoot);

const targetRoot = new THREE.Group();
targetRoot.name = 'active-cuttable';
worldRoot.add(targetRoot);

const externalRoot = new THREE.Group();
externalRoot.name = 'pinned-online-assets';
worldRoot.add(externalRoot);

const weaponPivot = new THREE.Group();
weaponPivot.name = 'selected-cc0-curved-blade';
worldRoot.add(weaponPivot);

const feedbackRoot = new THREE.Group();
feedbackRoot.name = 'cut-feedback';
worldRoot.add(feedbackRoot);

const controller = new CutPocController();
let externalAssetStatus: ExternalAssetStatus = 'loading';
let weaponAssetStatus: ExternalAssetStatus = 'loading';
let cutRuntime: CutRuntime | null = null;
let feedbackRuntime: FeedbackRuntime | null = null;
let impactCount = 0;
let feedbackQaHoldElapsed: number | null = null;
let knifeAtlasPartCount = 0;

const targetPosition = new THREE.Vector3(4.2, 1.48, 0);
const labels: Record<CuttableKind, { intact: string; cut: string }> = {
  crate: { intact: '木箱 · 点击切开', cut: '木层截面 · 两半都已封口' },
  log: { intact: '原木 · 点击切开', cut: '年轮截面 · 可从斜侧看见' },
  crystal: { intact: '水晶 · 点击切开', cut: '发光内核 · 截面独立材质' },
};

function makeCanvasTexture(
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  size = 256,
  repeat?: readonly [number, number],
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  draw(context, canvas.width);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

function stableNoise(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

const grassTexture = makeCanvasTexture((context, size) => {
  context.fillStyle = '#79b978';
  context.fillRect(0, 0, size, size);
  for (let fleck = 0; fleck < 900; fleck += 1) {
    const x = stableNoise(fleck * 3 + 1) * size;
    const y = stableNoise(fleck * 3 + 2) * size;
    const light = stableNoise(fleck * 3 + 3) > 0.52;
    context.strokeStyle = light ? 'rgba(190,222,136,0.34)' : 'rgba(47,102,61,0.28)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y + 2);
    context.lineTo(x + stableNoise(fleck + 810) * 3 - 1.5, y - 2);
    context.stroke();
  }
}, 256, [12, 8]);

const limestoneTexture = makeCanvasTexture((context, size) => {
  context.fillStyle = '#eee5d4';
  context.fillRect(0, 0, size, size);
  for (let speck = 0; speck < 420; speck += 1) {
    const x = stableNoise(speck * 2 + 12) * size;
    const y = stableNoise(speck * 2 + 13) * size;
    const alpha = 0.05 + stableNoise(speck + 940) * 0.12;
    context.fillStyle = `rgba(116,101,83,${alpha})`;
    context.fillRect(x, y, 1 + stableNoise(speck + 22) * 2.2, 1 + stableNoise(speck + 64) * 1.5);
  }
  context.strokeStyle = 'rgba(139,121,99,0.16)';
  context.lineWidth = 1.5;
  for (let vein = 0; vein < 7; vein += 1) {
    context.beginPath();
    const y = stableNoise(vein + 1_200) * size;
    context.moveTo(0, y);
    context.bezierCurveTo(size * 0.3, y - 18, size * 0.66, y + 22, size, y - 7);
    context.stroke();
  }
}, 256, [5.5, 1.4]);

const crateOuter = new THREE.MeshStandardMaterial({
  ...DIORAMA_SKIN.materials.crate,
  map: aStyleTextures.maps.crate.outer,
  envMapIntensity: 0.55,
});
crateOuter.name = 'outer:crate';
const crateCap = new THREE.MeshStandardMaterial({
  ...DIORAMA_SKIN.materials.woodCap,
  map: aStyleTextures.maps.crate.cap,
  emissive: 0x2a1305,
  emissiveIntensity: 0.16,
  envMapIntensity: 0.35,
});
crateCap.name = 'cap:layered-wood';
const crateBand = new THREE.MeshStandardMaterial({
  color: 0x75412d,
  map: aStyleTextures.maps.crate.band,
  roughness: 0.84,
  envMapIntensity: 0.35,
});
crateBand.name = 'outer:crate-band';
const barkMaterial = new THREE.MeshStandardMaterial({
  ...DIORAMA_SKIN.materials.bark,
  map: aStyleTextures.maps.log.bark,
  envMapIntensity: 0.25,
});
barkMaterial.name = 'outer:bark';
const logEnd = new THREE.MeshStandardMaterial({
  ...DIORAMA_SKIN.materials.woodCap,
  map: aStyleTextures.maps.log.end,
  envMapIntensity: 0.3,
});
logEnd.name = 'outer:log-end';
const logCap = new THREE.MeshStandardMaterial({
  ...DIORAMA_SKIN.materials.woodCap,
  map: aStyleTextures.maps.log.cap,
  emissive: 0x3b1c08,
  emissiveIntensity: 0.12,
  envMapIntensity: 0.35,
});
logCap.name = 'cap:growth-rings';
const crystalOuter = new THREE.MeshPhysicalMaterial({
  ...DIORAMA_SKIN.materials.crystal,
  map: aStyleTextures.maps.crystal.outer,
  clearcoatRoughness: 0.13,
  iridescence: 0.28,
  iridescenceIOR: 1.3,
  envMapIntensity: 1.35,
});
crystalOuter.name = 'outer:crystal';
const crystalEnd = new THREE.MeshStandardMaterial({
  color: 0x8f8cf8,
  map: aStyleTextures.maps.crystal.frost,
  emissive: 0x252354,
  emissiveIntensity: 0.32,
  roughness: 0.3,
  envMapIntensity: 0.9,
});
crystalEnd.name = 'outer:crystal-end';
const crystalCap = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  map: aStyleTextures.maps.crystal.cap,
  emissive: 0x32dce6,
  emissiveIntensity: 0.58,
  roughness: 0.32,
  envMapIntensity: 1,
});
crystalCap.name = 'cap:luminous-core';

const groundMaterial = new THREE.MeshStandardMaterial({
  ...DIORAMA_SKIN.materials.ground,
  map: grassTexture,
  envMapIntensity: 0.32,
});
groundMaterial.name = 'skin:grass';
const platformMaterial = new THREE.MeshStandardMaterial({
  ...DIORAMA_SKIN.materials.platform,
  map: limestoneTexture,
  envMapIntensity: 0.45,
});
platformMaterial.name = 'skin:limestone';
const platformEdgeMaterial = new THREE.MeshStandardMaterial({
  color: 0xb8aa94,
  map: limestoneTexture,
  roughness: 0.9,
  metalness: 0,
  envMapIntensity: 0.28,
});
platformEdgeMaterial.name = 'skin:limestone-edge';
const hillMaterial = new THREE.MeshStandardMaterial({
  color: 0x5f9b68,
  map: grassTexture,
  roughness: 1,
  envMapIntensity: 0.2,
});
hillMaterial.name = 'skin:distant-grass';

const skinnedMaterials: readonly THREE.Material[] = [
  crateOuter,
  crateCap,
  crateBand,
  barkMaterial,
  logEnd,
  logCap,
  crystalOuter,
  crystalEnd,
  crystalCap,
  groundMaterial,
  platformMaterial,
  platformEdgeMaterial,
  hillMaterial,
];

const slashTexture = makeCanvasTexture((context, size) => {
  context.clearRect(0, 0, size, size);
  const gradient = context.createLinearGradient(0, size / 2, size, size / 2);
  gradient.addColorStop(0, 'rgba(74, 216, 255, 0)');
  gradient.addColorStop(0.28, 'rgba(87, 231, 255, 0.55)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.strokeStyle = gradient;
  context.lineCap = 'round';
  context.lineWidth = 27;
  context.beginPath();
  context.moveTo(10, size * 0.72);
  context.quadraticCurveTo(size * 0.55, size * 0.08, size - 10, size * 0.43);
  context.stroke();
  context.globalAlpha = 0.55;
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(size * 0.12, size * 0.8);
  context.quadraticCurveTo(size * 0.58, size * 0.23, size * 0.94, size * 0.47);
  context.stroke();
});

const slashMaterial = new THREE.MeshBasicMaterial({
  map: slashTexture,
  color: 0xc9faff,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});
const slashTrail = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 1.25), slashMaterial);
slashTrail.name = 'cut-trail';
slashTrail.visible = false;
slashTrail.position.copy(targetPosition).add(new THREE.Vector3(0.15, 0.28, 1.1));
feedbackRoot.add(slashTrail);

const impactLight = new THREE.PointLight(0xbff9ff, 0, 5.5, 2);
impactLight.position.copy(targetPosition).add(new THREE.Vector3(0, 0.4, 1));
feedbackRoot.add(impactLight);
const bladeEdgeMaterial = new THREE.MeshBasicMaterial({
  color: 0xd8fbff,
  transparent: true,
  opacity: 0.66,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

function configureMesh(mesh: THREE.Mesh): void {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

function addCrateBands(group: THREE.Group, depth: number): void {
  const dimensions: readonly [number, number, number][] = [
    [2.04, 0.18, depth + 0.05],
    [0.18, 1.54, depth + 0.05],
  ];
  for (const [width, height, bandDepth] of dimensions) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(width, height, bandDepth), crateBand);
    band.position.z = 0;
    configureMesh(band);
    group.add(band);
  }
}

function createCrateIntact(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 1.6), crateOuter);
  configureMesh(body);
  group.add(body);
  addCrateBands(group, 1.6);
  return group;
}

function createCrateHalf(side: 'negative' | 'positive'): THREE.Group {
  const group = new THREE.Group();
  const materials = [crateOuter, crateOuter, crateOuter, crateOuter, crateOuter, crateOuter];
  materials[side === 'negative' ? 4 : 5] = crateCap;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 0.8), materials);
  configureMesh(body);
  group.add(body);
  return group;
}

function createLogSegment(length: number, capSide?: 'negative' | 'positive'): THREE.Group {
  const group = new THREE.Group();
  const materials = [barkMaterial, logEnd, logEnd];
  if (capSide === 'negative') materials[1] = logCap;
  if (capSide === 'positive') materials[2] = logCap;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.76, length, 18, 2, false), materials);
  body.rotation.x = Math.PI / 2;
  configureMesh(body);
  group.add(body);
  for (const sign of [-1, 1]) {
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), barkMaterial);
    knot.scale.set(1.4, 0.8, 0.65);
    knot.position.set(sign * 0.38, 0.2, 0);
    configureMesh(knot);
    group.add(knot);
  }
  return group;
}

function createCrystalSegment(length: number, capSide?: 'negative' | 'positive'): THREE.Group {
  const group = new THREE.Group();
  const materials = [crystalOuter, crystalEnd, crystalEnd];
  if (capSide === 'negative') materials[1] = crystalCap;
  if (capSide === 'positive') materials[2] = crystalCap;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.72, length, 6, 1, false), materials);
  body.rotation.x = Math.PI / 2;
  body.rotation.z = Math.PI / 6;
  configureMesh(body);
  group.add(body);
  return group;
}

function createIntactTarget(kind: CuttableKind): THREE.Group {
  if (kind === 'crate') return createCrateIntact();
  if (kind === 'log') return createLogSegment(1.8);
  return createCrystalSegment(1.8);
}

function createCutHalf(kind: CuttableKind, side: 'negative' | 'positive'): THREE.Group {
  if (kind === 'crate') return createCrateHalf(side);
  if (kind === 'log') return createLogSegment(0.9, side);
  return createCrystalSegment(0.9, side);
}

function clearTargetRoot(): void {
  while (targetRoot.children.length > 0) targetRoot.remove(targetRoot.children[0]!);
  cutRuntime = null;
}

function clearFeedback(): void {
  if (feedbackRuntime) {
    for (const particle of feedbackRuntime.particles) {
      feedbackRoot.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      const materials = Array.isArray(particle.mesh.material) ? particle.mesh.material : [particle.mesh.material];
      for (const material of materials) material.dispose();
    }
  }
  feedbackRuntime = null;
  feedbackQaHoldElapsed = null;
  slashTrail.visible = false;
  slashMaterial.opacity = 0;
  impactLight.intensity = 0;
  impactFlash.style.opacity = '0';
}

function createImpactParticles(kind: CuttableKind): ImpactParticle[] {
  const colors: Record<CuttableKind, readonly number[]> = {
    crate: [0xffd27d, 0xd87b34, 0xfff0b2],
    log: [0xf4c36d, 0x9b512d, 0xffdda0],
    crystal: [0xbdfbff, 0x74ddec, 0x786de7],
  };
  const kindSeed = CUTTABLE_KINDS.indexOf(kind) * 0.77;
  return Array.from({ length: BLADE_FEEL.particleCount }, (_, index) => {
    const angle = index * 2.399 + kindSeed;
    const speed = 1.25 + (index % 5) * 0.22;
    const mesh = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.065 + (index % 3) * 0.018, 0),
      new THREE.MeshStandardMaterial({
        color: colors[kind][index % colors[kind].length],
        emissive: kind === 'crystal' ? 0x165b72 : 0x2c1105,
        emissiveIntensity: kind === 'crystal' ? 1.3 : 0.22,
        roughness: 0.42,
      }),
    );
    mesh.position.copy(targetPosition).add(new THREE.Vector3(0, 0.15, 0.75));
    mesh.visible = false;
    feedbackRoot.add(mesh);
    return {
      mesh,
      velocity: new THREE.Vector3(
        Math.cos(angle) * speed,
        0.8 + (index % 6) * 0.22,
        Math.sin(angle) * speed * 0.72 + 0.4,
      ),
      rotationVelocity: new THREE.Vector3(3.2 + index * 0.11, 4.4 - index * 0.08, 2.6 + index * 0.13),
    };
  });
}

function startFeedback(kind: CuttableKind): void {
  clearFeedback();
  const startedAt = performance.now();
  feedbackRuntime = {
    startedAt,
    impactAt: startedAt + BLADE_FEEL.windupMs + BLADE_FEEL.strikeMs,
    kind,
    impacted: false,
    particles: createImpactParticles(kind),
  };
}

function feedbackPhase(now = performance.now()): FeedbackPhase {
  if (!feedbackRuntime) return 'idle';
  const elapsed = now - feedbackRuntime.startedAt;
  const impactStart = BLADE_FEEL.windupMs + BLADE_FEEL.strikeMs;
  if (elapsed < impactStart) return 'windup';
  if (elapsed < impactStart + BLADE_FEEL.hitStopMs + BLADE_FEEL.flashMs) return 'impact';
  const end = impactStart + BLADE_FEEL.hitStopMs + Math.max(BLADE_FEEL.recoveryMs, BLADE_FEEL.trailMs);
  return elapsed < end ? 'recovery' : 'idle';
}

function renderState(state: CutPocState): void {
  clearTargetRoot();
  targetLabel.textContent = labels[state.kind][state.phase];
  actionButton.textContent = state.phase === 'intact' ? '切开' : '下一个';
  if (state.phase === 'intact' || !state.cut) {
    const target = createIntactTarget(state.kind);
    target.position.copy(targetPosition);
    target.name = `${state.kind}:intact`;
    targetRoot.add(target);
    return;
  }

  const negative = createCutHalf(state.kind, 'negative');
  const positive = createCutHalf(state.kind, 'positive');
  const halfDepth = state.kind === 'crate' ? 0.4 : 0.45;
  negative.position.copy(targetPosition).add(new THREE.Vector3(0, 0, -halfDepth));
  positive.position.copy(targetPosition).add(new THREE.Vector3(0, 0, halfDepth));
  negative.name = `${state.kind}:negative:cut-cap`;
  positive.name = `${state.kind}:positive:cut-cap`;
  negative.userData.origin = negative.position.clone();
  positive.userData.origin = positive.position.clone();
  targetRoot.add(negative, positive);
  cutRuntime = {
    startedAt: performance.now(),
    pieces: [negative, positive],
    states: state.cut.pieces,
    motions: [
      sampleFallingPieceMotion(state.kind, state.cut.pieces[0], 0),
      sampleFallingPieceMotion(state.kind, state.cut.pieces[1], 0),
    ],
  };
}

function capMaterialCount(): number {
  let count = 0;
  targetRoot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => material.name.startsWith('cap:'))) count += 1;
  });
  return count;
}

function getBridgeState(): CutPocBridgeState {
  const state = controller.getState();
  const currentFeedbackPhase = feedbackPhase();
  const pieceMotions = cutRuntime?.motions ?? [];
  const settledFloor = FALLING_PIECE_PHYSICS.platformFloorOffset[state.kind];
  return {
    ...state,
    externalAssetStatus,
    weaponAssetStatus,
    renderedPieceCount: state.phase === 'cut' ? targetRoot.children.length : 1,
    capMaterialCount: capMaterialCount(),
    cameraProjection: 'orthographic',
    feedbackActive: currentFeedbackPhase !== 'idle',
    feedbackPhase: currentFeedbackPhase,
    feedbackLayerCount: currentFeedbackPhase === 'idle' ? 0 : BLADE_FEEL.feedbackLayers.length,
    impactCount,
    groundedPieceCount: pieceMotions.filter((motion) => (
      motion.groundedSurface !== null
      // The bridge reports a landing once the piece is within the authored floor
      // tolerance; the fixed-step integrator will clamp and damp it on the next tick.
      || (motion.position[1] <= settledFloor + 0.6 && Math.abs(motion.velocity[1]) < 3)
    )).length,
    lowestPieceOffsetY: Math.min(0, ...pieceMotions.map((motion) => motion.position[1])),
    skinId: DIORAMA_SKIN.id,
    baseColorTextureCount: DIORAMA_SKIN.textures.length,
    knifeAtlasPartCount,
    proceduralTextureCount: 3,
    texturedMaterialCount: skinnedMaterials.filter((material) => (
      material instanceof THREE.MeshStandardMaterial && material.map !== null
    )).length,
    environmentLighting: scene.environment !== null,
  };
}

function act(angle = 0): CutPocBridgeState {
  const state = controller.act(angle);
  renderState(state);
  if (state.phase === 'cut') startFeedback(state.kind);
  else clearFeedback();
  return getBridgeState();
}

function reset(): CutPocBridgeState {
  const state = controller.reset();
  impactCount = 0;
  clearFeedback();
  renderState(state);
  return getBridgeState();
}

function seekFeedbackForQa(elapsedMs: number): CutPocBridgeState {
  if (!feedbackRuntime || !Number.isFinite(elapsedMs) || elapsedMs < 0) return getBridgeState();
  const now = performance.now();
  feedbackRuntime.startedAt = now - elapsedMs;
  feedbackRuntime.impactAt = feedbackRuntime.startedAt + BLADE_FEEL.windupMs + BLADE_FEEL.strikeMs;
  feedbackRuntime.impacted = false;
  feedbackQaHoldElapsed = elapsedMs;
  for (const particle of feedbackRuntime.particles) particle.mesh.visible = false;
  updateWeaponMotion(now);
  updateFeedback(now);
  renderer.render(scene, camera);
  return getBridgeState();
}

function releaseFeedbackQaHold(): CutPocBridgeState {
  feedbackQaHoldElapsed = null;
  return getBridgeState();
}

window.__CUT_POC__ = {
  act,
  reset,
  seekFeedbackForQa,
  releaseFeedbackQaHold,
  getState: getBridgeState,
  getSceneFacts: () => ({
    cuttableKinds: CUTTABLE_KINDS,
    externalAssets: [
      'Kenney Nature Kit/tree_simple.glb',
      'Kenney Nature Kit/log_stack.glb',
      'OpenGameArt CC0 Low-Poly Swords/Sword6.glb',
    ],
    cameraPosition: OBLIQUE_CAMERA.position,
    cameraTarget: OBLIQUE_CAMERA.target,
    cameraProjection: OBLIQUE_CAMERA.projection,
    weaponAsset: BLADE_ASSET.id,
    feedbackLayers: BLADE_FEEL.feedbackLayers,
  }),
};

function addEnvironment(): void {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 30),
    groundMaterial,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(4, -0.05, 0);
  ground.receiveShadow = true;
  worldRoot.add(ground);

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(12.5, 0.42, 3.1),
    platformMaterial,
  );
  platform.position.set(3.35, 0.16, 0);
  configureMesh(platform);
  worldRoot.add(platform);

  const platformEdge = new THREE.Mesh(
    new THREE.BoxGeometry(12.65, 0.18, 3.22),
    platformEdgeMaterial,
  );
  platformEdge.position.set(3.35, -0.02, 0);
  platformEdge.receiveShadow = true;
  worldRoot.add(platformEdge);

  for (const [x, y, z, scale] of [
    [-6, 1.25, -8, 3.8],
    [1, 1.1, -10, 4.4],
    [8, 1.55, -8, 4.1],
    [14, 1.1, -5, 3.6],
  ] as const) {
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hillMaterial);
    hill.position.set(x, y, z);
    hill.scale.set(scale, scale * 0.72, scale);
    hill.receiveShadow = true;
    worldRoot.add(hill);
  }
}

addEnvironment();
weaponPivot.position.set(2.4, 0.85, 0.45);
weaponPivot.rotation.set(0.04, 0.18, -0.3);
const bladeRimLight = new THREE.PointLight(0xd7fbff, 2.4, 4.2, 2);
bladeRimLight.position.set(0.3, 2.25, 0.8);
weaponPivot.add(bladeRimLight);
renderState(controller.getState());

function normalizeAsset(object: THREE.Group, targetHeight: number): THREE.Group {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) configureMesh(child);
  });
  const initialBounds = new THREE.Box3().setFromObject(object);
  const size = initialBounds.getSize(new THREE.Vector3());
  const scale = targetHeight / Math.max(size.y, 0.001);
  object.scale.multiplyScalar(scale);
  const scaledBounds = new THREE.Box3().setFromObject(object);
  object.position.y -= scaledBounds.min.y;
  return object;
}

function routeSingleMeshKnifeGeometry(
  geometry: THREE.BufferGeometry,
  handleEnd: 'minimum' | 'maximum',
): number {
  const position = geometry.getAttribute('position');
  if (!(position instanceof THREE.BufferAttribute) || position.count < 3) return 0;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return 0;
  const size = bounds.getSize(new THREE.Vector3());
  const longAxis = size.x >= size.y && size.x >= size.z
    ? new THREE.Vector3(1, 0, 0)
    : size.y >= size.z
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
  let minimumProjection = Number.POSITIVE_INFINITY;
  let maximumProjection = Number.NEGATIVE_INFINITY;
  const projectionAt = (index: number): number => (
    position.getX(index) * longAxis.x + position.getY(index) * longAxis.y + position.getZ(index) * longAxis.z
  );
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const projection = projectionAt(vertex);
    minimumProjection = Math.min(minimumProjection, projection);
    maximumProjection = Math.max(maximumProjection, projection);
  }
  const index = geometry.getIndex();
  const elementCount = index?.count ?? position.count;
  geometry.clearGroups();
  const materialIndices = new Set<number>();
  let groupMaterial = -1;
  let groupStart = 0;
  for (let start = 0; start + 2 < elementCount; start += 3) {
    const a = index?.getX(start) ?? start;
    const b = index?.getX(start + 1) ?? start + 1;
    const c = index?.getX(start + 2) ?? start + 2;
    const centroid = (projectionAt(a) + projectionAt(b) + projectionAt(c)) / 3;
    const nextMaterial = classifyKnifeTriangleMaterial(
      centroid,
      minimumProjection,
      maximumProjection,
      handleEnd,
    ) === 'handle' ? 1 : 0;
    materialIndices.add(nextMaterial);
    if (groupMaterial === -1) {
      groupMaterial = nextMaterial;
      groupStart = start;
    } else if (nextMaterial !== groupMaterial) {
      geometry.addGroup(groupStart, start - groupStart, groupMaterial);
      groupMaterial = nextMaterial;
      groupStart = start;
    }
  }
  if (groupMaterial !== -1) geometry.addGroup(groupStart, elementCount - groupStart, groupMaterial);
  return materialIndices.size;
}

function prepareSelectedBlade(model: THREE.Group): THREE.Group {
  const wrapper = new THREE.Group();
  wrapper.name = BLADE_ASSET.id;
  wrapper.add(model);
  const initialSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const longestAxis = initialSize.x >= initialSize.y && initialSize.x >= initialSize.z
    ? new THREE.Vector3(1, 0, 0)
    : initialSize.z >= initialSize.y
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0);
  model.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(longestAxis, new THREE.Vector3(0, 1, 0)));
  const alignedBounds = new THREE.Box3().setFromObject(model);
  const alignedSize = alignedBounds.getSize(new THREE.Vector3());
  const scale = 3.15 / Math.max(alignedSize.y, 0.001);
  model.scale.setScalar(scale);
  const scaledBounds = new THREE.Box3().setFromObject(model);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= scaledBounds.min.y;
  model.position.z -= center.z;
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    configureMesh(child);
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const tunedMaterials = sourceMaterials.map((sourceMaterial) => {
      const material = sourceMaterial.clone();
      if (material instanceof THREE.MeshStandardMaterial) {
        const partName = `${child.name} ${sourceMaterial.name}`.toLowerCase();
        const isHandle = /handle|grip|hilt|pommel/.test(partName);
        material.map = isHandle ? aStyleTextures.maps.knife.handle : aStyleTextures.maps.knife.blade;
        material.color.set(0xffffff);
        material.metalness = Math.max(DIORAMA_SKIN.materials.blade.metalness, material.metalness);
        material.roughness = isHandle ? 0.56 : DIORAMA_SKIN.materials.blade.roughness;
        material.envMapIntensity = 1.4;
        material.emissive.set(0x102c32);
        material.emissiveIntensity = 0.16;
      }
      return material;
    });
    if (sourceMaterials.length === 1 && tunedMaterials[0] instanceof THREE.MeshStandardMaterial) {
      const bladeMaterial = tunedMaterials[0];
      bladeMaterial.map = aStyleTextures.maps.knife.blade;
      const handleMaterial = bladeMaterial.clone();
      handleMaterial.map = aStyleTextures.maps.knife.handle;
      handleMaterial.metalness = 0.18;
      handleMaterial.roughness = 0.56;
      knifeAtlasPartCount = Math.max(
        knifeAtlasPartCount,
        routeSingleMeshKnifeGeometry(child.geometry, 'maximum'),
      );
      child.material = [bladeMaterial, handleMaterial];
    } else {
      knifeAtlasPartCount = Math.max(knifeAtlasPartCount, new Set(tunedMaterials.map((material) => (
        material instanceof THREE.MeshStandardMaterial && material.map === aStyleTextures.maps.knife.handle
          ? 'handle'
          : 'blade'
      ))).size);
      child.material = tunedMaterials;
    }
  });
  const edgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.17, 0.86, 0.13),
    new THREE.Vector3(-0.04, 1.55, 0.14),
    new THREE.Vector3(0.14, 2.28, 0.14),
    new THREE.Vector3(0.06, 3.02, 0.12),
  ]);
  const edgeGlow = new THREE.Mesh(new THREE.TubeGeometry(edgeCurve, 24, 0.009, 5, false), bladeEdgeMaterial);
  edgeGlow.name = BLADE_ASSET.edgeTreatment;
  edgeGlow.renderOrder = 4;
  wrapper.add(edgeGlow);
  return wrapper;
}

function applyDioramaSkinToKenneyAsset(object: THREE.Group): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const materials = sourceMaterials.map((sourceMaterial) => {
      const name = sourceMaterial.name.toLowerCase();
      if (name.includes('leaf')) {
        const leaves = new THREE.MeshStandardMaterial({
          color: 0x4d9c68,
          map: grassTexture,
          roughness: 0.92,
          metalness: 0,
          envMapIntensity: 0.32,
        });
        leaves.name = 'skin:kenney-leaves';
        return leaves;
      }
      if (name.includes('inner')) return logEnd;
      if (name.includes('wood') || name.includes('bark')) return barkMaterial;
      return new THREE.MeshStandardMaterial({ color: 0xb6a58e, roughness: 0.86, metalness: 0 });
    });
    child.material = Array.isArray(child.material) ? materials : materials[0]!;
  });
}

async function loadSelectedBlade(): Promise<void> {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('./assets/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  try {
    const sceneRoot = await new Promise<THREE.Group>((resolve, reject) => {
      loader.load(BLADE_ASSET.localPath, (gltf) => resolve(gltf.scene), undefined, reject);
    });
    weaponPivot.add(prepareSelectedBlade(sceneRoot));
    weaponAssetStatus = 'loaded';
  } catch (error) {
    weaponAssetStatus = 'failed';
    console.error('Selected CC0 sword GLB failed to load', error);
  } finally {
    dracoLoader.dispose();
  }
}

async function loadPinnedEnvironmentAssets(): Promise<void> {
  const loader = new GLTFLoader();
  const load = (path: string): Promise<THREE.Group> => new Promise((resolve, reject) => {
    loader.load(path, (gltf) => resolve(gltf.scene), undefined, reject);
  });
  try {
    const [treeSource, logStackSource] = await Promise.all([
      load('./assets/kenney-nature/tree_simple.glb'),
      load('./assets/kenney-nature/log_stack.glb'),
    ]);
    applyDioramaSkinToKenneyAsset(treeSource);
    applyDioramaSkinToKenneyAsset(logStackSource);
    for (const [x, z, scale] of [
      [-2.8, -3.2, 2.45],
      [8.7, -3.5, 2.8],
      [11.6, -1.8, 2.2],
    ] as const) {
      const tree = normalizeAsset(treeSource.clone(true), scale);
      tree.position.x = x;
      tree.position.z = z;
      tree.rotation.y = x * 0.23;
      externalRoot.add(tree);
    }
    const logs = normalizeAsset(logStackSource.clone(true), 1.1);
    logs.position.set(-0.65, 0.38, -0.82);
    logs.rotation.y = -0.18;
    externalRoot.add(logs);
    externalAssetStatus = 'loaded';
  } catch (error) {
    externalAssetStatus = 'failed';
    console.error('Pinned Kenney GLB assets failed to load', error);
  }
}

void loadPinnedEnvironmentAssets();
void loadSelectedBlade();

function resize(): void {
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  const aspect = width / height;
  const vertical = OBLIQUE_CAMERA.verticalSize;
  camera.left = -(vertical * aspect) / 2;
  camera.right = (vertical * aspect) / 2;
  camera.top = vertical / 2;
  camera.bottom = -vertical / 2;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
}

window.addEventListener('resize', resize);
resize();

actionButton.addEventListener('click', (event) => {
  event.stopPropagation();
  act();
});
host.addEventListener('pointerdown', () => act());
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault();
    act();
  }
});

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function easeInCubic(value: number): number {
  return value ** 3;
}

function updateWeaponMotion(now: number): void {
  const idle = now * 0.001;
  const restPosition = new THREE.Vector3(2.4, 0.85, 0.45);
  const restRotation = -0.3;
  const runtime = feedbackRuntime;
  if (!runtime) {
    weaponPivot.position.copy(restPosition).add(new THREE.Vector3(0, Math.sin(idle * 1.7) * 0.035, 0));
    weaponPivot.rotation.z = restRotation + Math.sin(idle * 1.35) * 0.025;
    bladeRimLight.intensity = 2.4;
    bladeEdgeMaterial.opacity = 0.62 + Math.sin(idle * 2.4) * 0.06;
    return;
  }

  const elapsed = now - runtime.startedAt;
  const strikeStart = BLADE_FEEL.windupMs;
  const impactStart = strikeStart + BLADE_FEEL.strikeMs;
  const recoveryStart = impactStart + BLADE_FEEL.hitStopMs;
  if (elapsed < strikeStart) {
    const progress = easeOutCubic(Math.max(0, elapsed / strikeStart));
    weaponPivot.rotation.z = THREE.MathUtils.lerp(restRotation, 0.08, progress);
    weaponPivot.position.copy(restPosition).add(new THREE.Vector3(-0.14 * progress, 0.12 * progress, 0));
  } else if (elapsed < impactStart) {
    const progress = easeInCubic((elapsed - strikeStart) / BLADE_FEEL.strikeMs);
    weaponPivot.rotation.z = THREE.MathUtils.lerp(0.08, -1.08, progress);
    weaponPivot.position.copy(restPosition).add(new THREE.Vector3(0.28 * progress, -0.12 * progress, 0.18 * progress));
  } else if (elapsed < recoveryStart) {
    weaponPivot.rotation.z = -1.08;
    weaponPivot.position.copy(restPosition).add(new THREE.Vector3(0.28, -0.12, 0.18));
  } else {
    const progress = easeOutCubic(Math.min(1, (elapsed - recoveryStart) / BLADE_FEEL.recoveryMs));
    weaponPivot.rotation.z = THREE.MathUtils.lerp(-1.08, restRotation, progress);
    weaponPivot.position.copy(restPosition).add(new THREE.Vector3(
      THREE.MathUtils.lerp(0.28, 0, progress),
      THREE.MathUtils.lerp(-0.12, 0, progress),
      THREE.MathUtils.lerp(0.18, 0, progress),
    ));
  }
  bladeRimLight.intensity = elapsed < impactStart ? 3.4 : 5.2 * Math.max(0.45, 1 - (elapsed - impactStart) / 360);
  bladeEdgeMaterial.opacity = elapsed < impactStart ? 0.9 : Math.max(0.72, 1.25 - (elapsed - impactStart) / 360);
}

function triggerImpact(runtime: FeedbackRuntime): void {
  runtime.impacted = true;
  impactCount += 1;
  slashTrail.visible = true;
  slashTrail.scale.set(0.45, 0.72, 1);
  for (const particle of runtime.particles) particle.mesh.visible = true;
}

function updateFeedback(now: number): void {
  const runtime = feedbackRuntime;
  camera.position.copy(baseCameraPosition);
  camera.lookAt(baseCameraTarget);
  if (!runtime) return;
  if (!runtime.impacted && now >= runtime.impactAt) triggerImpact(runtime);
  if (!runtime.impacted) return;

  const afterImpact = now - runtime.impactAt;
  const trailProgress = Math.min(1, Math.max(0, afterImpact / BLADE_FEEL.trailMs));
  slashTrail.visible = trailProgress < 1;
  slashMaterial.opacity = (1 - trailProgress) ** 1.7 * 0.96;
  slashTrail.scale.set(0.45 + easeOutCubic(trailProgress) * 0.75, 0.72 + trailProgress * 0.35, 1);
  slashTrail.quaternion.copy(camera.quaternion);
  slashTrail.rotateZ(-0.18);

  const flashProgress = Math.min(1, Math.max(0, afterImpact / BLADE_FEEL.flashMs));
  impactFlash.style.opacity = String((1 - flashProgress) ** 2 * 0.9);
  impactLight.intensity = (1 - flashProgress) * 8.5;

  const particleElapsed = Math.max(0, afterImpact - BLADE_FEEL.hitStopMs);
  const seconds = particleElapsed / 1_000;
  runtime.particles.forEach((particle, index) => {
    particle.mesh.visible = particleElapsed < 720;
    particle.mesh.position.set(
      targetPosition.x + particle.velocity.x * seconds,
      targetPosition.y + 0.15 + particle.velocity.y * seconds - 4.8 * seconds ** 2,
      targetPosition.z + 0.75 + particle.velocity.z * seconds,
    );
    particle.mesh.rotation.set(
      particle.rotationVelocity.x * seconds,
      particle.rotationVelocity.y * seconds,
      particle.rotationVelocity.z * seconds + index * 0.2,
    );
  });

  const traumaProgress = Math.min(1, Math.max(0, afterImpact / 250));
  const trauma = BLADE_FEEL.cameraTrauma * (1 - traumaProgress) ** 2;
  if (trauma > 0) {
    const shakeX = Math.sin(afterImpact * 0.11) * trauma * 0.3;
    const shakeY = Math.sin(afterImpact * 0.16 + 1.4) * trauma * 0.22;
    camera.position.copy(baseCameraPosition).add(new THREE.Vector3(shakeX, shakeY, 0));
    camera.lookAt(baseCameraTarget.clone().add(new THREE.Vector3(shakeX * 0.24, shakeY * 0.24, 0)));
  }
}

function animate(now: number): void {
  requestAnimationFrame(animate);

  const visualNow = feedbackRuntime && feedbackQaHoldElapsed !== null
    ? feedbackRuntime.startedAt + feedbackQaHoldElapsed
    : now;
  updateWeaponMotion(visualNow);
  updateFeedback(visualNow);

  if (cutRuntime) {
    const state = controller.getState();
    const separationStart = feedbackRuntime?.impactAt ?? cutRuntime.startedAt;
    const separationElapsed = Math.max(0, visualNow - separationStart - BLADE_FEEL.hitStopMs);
    cutRuntime.pieces.forEach((piece, index) => {
      const pieceState = cutRuntime!.states[index]!;
      const origin = piece.userData.origin as THREE.Vector3;
      const motion = sampleFallingPieceMotion(state.kind, pieceState, separationElapsed / 1_000);
      cutRuntime!.motions[index] = motion;
      piece.position.set(
        origin.x + motion.position[0],
        origin.y + motion.position[1],
        origin.z + motion.position[2],
      );
      piece.rotation.set(
        motion.rotation[0],
        motion.rotation[1],
        motion.rotation[2],
      );
    });
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
