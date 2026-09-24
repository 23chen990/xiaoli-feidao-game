import * as THREE from 'three';
import type { FinishOption, SafeSupport, SliceState, SpikeField } from './game-core';
import { ProgrammaticOriginalProvider, ThreeCutVisualManager, type CutVisualFacts, type ScreenProjection } from './three-cut-visuals';
import { createAStyleTextureSet, type AStyleTextureSet } from './a-style-texture-runtime';
import {
  MAIN_3D_RESOURCE_CONTRACT,
  GROUND_VISUAL_TOP_Y,
  PRESENTATION_SCALE,
  cameraLeadSimulation,
  createCameraSpec,
  createFogSpec,
  type PerformanceResult,
  type PresentationFrame,
  type Vec3Tuple,
  worldPointFromSimulation,
} from './three-presentation';
import { MECHANICS_DEMO_THEME } from './theme';

const WORLD_THEME = MECHANICS_DEMO_THEME.world;

interface ParticleState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
}

export interface ThreeRendererFacts {
  renderer: 'WebGLRenderer';
  cameraProjection: 'perspective';
  fov: number;
  canvasCount: number;
  dpr: number;
  shadows: false;
  lightTypes: readonly ['HemisphereLight', 'DirectionalLight'];
  resourceContract: typeof MAIN_3D_RESOURCE_CONTRACT;
  drawCalls: number;
  triangles: number;
  cameraScrollX: number;
  knifePosition: Vec3Tuple;
  knifeRotationZ: number;
  cutVisuals: CutVisualFacts[];
  capFacingScores: number[];
  knifeProjection: ScreenProjection | null;
  resourceCounts: { geometries: number; textures: number };
  baseColorTextureIds: readonly string[];
  texturedMaterialCount: number;
  routeOpeningCount: number;
  finishHighlightedCount: number;
}

export class ThreeWorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly ownedGeometries = new Set<THREE.BufferGeometry>();
  private readonly ownedMaterials = new Set<THREE.Material>();
  private readonly unitBox = this.ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  private readonly hillGeometry = this.ownGeometry(new THREE.SphereGeometry(1, 12, 8));
  private readonly treeGeometry = this.ownGeometry(new THREE.ConeGeometry(1, 2.2, 7));
  private readonly unitCone = this.ownGeometry(new THREE.ConeGeometry(0.11, 0.42, 5));
  private readonly supportMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: WORLD_THEME.support, roughness: 0.72, metalness: 0.03 }));
  private readonly supportActiveMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: WORLD_THEME.supportActive, roughness: 0.58, metalness: 0.06 }));
  private readonly supportBaseMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xe6eef2, roughness: 0.84, metalness: 0.01, flatShading: true }));
  private readonly spikeMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: WORLD_THEME.spike, roughness: 0.46, metalness: 0.02, emissive: WORLD_THEME.spikeEmissive, emissiveIntensity: 0.5 }));
  private readonly finishMultiplyMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: WORLD_THEME.finishMultiply, roughness: 0.48 }));
  private readonly finishDivideMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: WORLD_THEME.finishDivide, roughness: 0.48 }));
  private readonly finishSafeMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: WORLD_THEME.finishSafe, roughness: 0.48 }));
  private readonly finishBonusMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: WORLD_THEME.finishBonus, roughness: 0.4, emissive: WORLD_THEME.finishBonusEmissive, emissiveIntensity: 0.46 }));
  private readonly finishHighlightMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xfff0a6, roughness: 0.32, emissive: 0xffa62b, emissiveIntensity: 1.15 }));
  private readonly routeOpeningMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0x15223b, roughness: 0.9, emissive: 0x0b1020, emissiveIntensity: 0.32, transparent: true, opacity: 0.92 }));
  private readonly textureSet: AStyleTextureSet;
  private readonly cutVisuals: ThreeCutVisualManager;
  private readonly supports = new Map<string, THREE.Mesh>();
  private readonly supportBases = new Map<string, THREE.Mesh>();
  private readonly routeOpenings = new Map<string, THREE.Mesh>();
  private readonly openedRouteIds = new Set<string>();
  private readonly spikes = new Map<string, THREE.Group>();
  private readonly finishGates = new Map<string, THREE.Mesh>();
  private readonly backdrop = new THREE.Group();
  private readonly knife = new THREE.Group();
  private readonly particleGeometry = this.ownGeometry(new THREE.BufferGeometry());
  private readonly particles: ParticleState[] = [];
  private groundMaterial!: THREE.MeshStandardMaterial;
  private readonly particlePoints: THREE.Points;
  private readonly tempProjection = new THREE.Vector3();
  private readonly tempLookTarget = new THREE.Vector3();
  private readonly tempBounds = new THREE.Box3();
  private cameraTargetX = 3.2;
  private cameraInitialized = false;
  private impactPulse = 0;
  private lastKnifePosition: Vec3Tuple = [0, 0, 0];
  private lastKnifeRotationZ = 0;
  private disposed = false;

  private ownGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.ownedGeometries.add(geometry);
    return geometry;
  }

  private ownMaterial<T extends THREE.Material>(material: T): T {
    this.ownedMaterials.add(material);
    return material;
  }

  private finishMaterial(option: FinishOption): THREE.Material {
    if (option.kind === 'bonus') return this.finishBonusMaterial;
    if (option.operation === 'divide') return this.finishDivideMaterial;
    if (option.kind === 'safe') return this.finishSafeMaterial;
    return this.finishMultiplyMaterial;
  }

  constructor(private readonly host: HTMLElement) {
    // The runtime scene uses low-poly meshes and already has a mobile-safe
    // resolution cap; disabling MSAA keeps the default browser journey from
    // introducing long compositor frames on constrained/headless GPUs.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.domElement.dataset.renderer = 'three-main';
    this.renderer.domElement.setAttribute('aria-label', MECHANICS_DEMO_THEME.copy.canvasLabel);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = false;
    this.host.append(this.renderer.domElement);
    this.textureSet = createAStyleTextureSet(this.renderer.capabilities.getMaxAnisotropy());
    this.cutVisuals = new ThreeCutVisualManager(new ProgrammaticOriginalProvider(this.textureSet));

    const initialSpec = createCameraSpec(this.host.clientWidth, this.host.clientHeight);
    this.camera = new THREE.PerspectiveCamera(initialSpec.fov, initialSpec.aspect, initialSpec.near, initialSpec.far);
    this.camera.position.fromArray(initialSpec.position);
    this.camera.lookAt(new THREE.Vector3().fromArray(initialSpec.target));

    this.scene.background = new THREE.Color(WORLD_THEME.background);
    const fog = createFogSpec(this.host.clientWidth, this.host.clientHeight);
    this.scene.fog = new THREE.Fog(WORLD_THEME.background, fog.near, fog.far);
    const hemisphere = new THREE.HemisphereLight(WORLD_THEME.skyLight, WORLD_THEME.groundLight, 2.1);
    hemisphere.name = 'programmatic-hemisphere';
    const direction = new THREE.DirectionalLight(WORLD_THEME.keyLight, 3.2);
    direction.name = 'programmatic-direction';
    direction.position.set(-2, 9, 8);
    direction.castShadow = false;
    this.scene.add(hemisphere, direction);
    this.scene.add(this.cutVisuals.root);
    this.createBackdrop();
    this.createKnifeRig();

    const particlePositions = new Float32Array(80 * 3);
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    this.particleGeometry.setDrawRange(0, 0);
    const particleMaterial = this.ownMaterial(new THREE.PointsMaterial({ color: WORLD_THEME.particle, size: 0.085, transparent: true, opacity: 0.94, sizeAttenuation: true }));
    this.particlePoints = new THREE.Points(this.particleGeometry, particleMaterial);
    this.particlePoints.name = 'cut-particle-pool';
    this.particlePoints.frustumCulled = false;
    this.scene.add(this.particlePoints);
    this.resize();
  }

  private createBackdrop(): void {
    this.backdrop.name = 'programmatic-backdrop';
    this.scene.add(this.backdrop);
    const groundMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xf8faf4, roughness: 0.82, metalness: 0.02, flatShading: true }));
    this.groundMaterial = groundMaterial;
    const ground = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(42, 0.3, 7)), groundMaterial);
    ground.name = 'programmatic-white-runway-floor';
    // Keep the road's top face coincident with the simulation floor (y=700 -> 0).
    ground.position.set(18, GROUND_VISUAL_TOP_Y - 0.15, -0.8);
    this.scene.add(ground);
    const landscapeMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0x8fd477, roughness: 1, flatShading: true }));
    const landscape = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(42, 3.6, 0.45)), landscapeMaterial);
    landscape.name = 'programmatic-green-horizon';
    landscape.position.set(18, -1.72, -4.6);
    this.backdrop.add(landscape);
    const hillPalette = [0x86c878, 0x9bd986, 0x73b968, 0xa4df8c];
    for (let index = 0; index < 9; index += 1) {
      const hillMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: hillPalette[index % hillPalette.length]!, roughness: 1, flatShading: true }));
      const hill = new THREE.Mesh(this.hillGeometry, hillMaterial);
      hill.name = `programmatic-low-poly-hill:${index}`;
      hill.scale.set(2.4 + (index % 3) * 0.55, 1.25 + (index % 2) * 0.35, 1.2);
      hill.position.set(index * 4.9 - 4, 1.2 + (index % 3) * 0.18, -4.2 - (index % 2) * 0.4);
      this.backdrop.add(hill);
    }
    const treeMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0x5db66f, roughness: 1, flatShading: true }));
    for (let index = 0; index < 10; index += 1) {
      const tree = new THREE.Mesh(this.treeGeometry, treeMaterial);
      tree.name = `programmatic-horizon-tree:${index}`;
      tree.scale.setScalar(0.45 + (index % 3) * 0.1);
      tree.position.set(index * 4.1 - 3.5, 0.8, -3.55);
      this.backdrop.add(tree);
    }
  }

  private createKnifeRig(): void {
    this.knife.name = 'programmatic-original-knife-rig';
    const bladeMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.textureSet.maps.knife.blade, roughness: 0.2, metalness: 0.78, emissive: WORLD_THEME.bladeEmissive, emissiveIntensity: 0.15 }));
    const spineMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.textureSet.maps.knife.spine, roughness: 0.42, metalness: 0.5 }));
    const handleMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.textureSet.maps.knife.handle, roughness: 0.82, metalness: 0.02 }));
    const pommelMaterial = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.textureSet.maps.knife.pommel, roughness: 0.28, metalness: 0.7 }));
    const blade = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(0.66, 0.1, 0.24)), bladeMaterial);
    blade.name = 'knife-thick-blade';
    blade.position.x = 0.27;
    const tip = new THREE.Mesh(this.ownGeometry(new THREE.ConeGeometry(0.12, 0.24, 4)), bladeMaterial);
    tip.name = 'knife-tip';
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.69;
    const spine = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(0.52, 0.17, 0.2)), spineMaterial);
    spine.name = 'knife-spine';
    spine.position.x = -0.22;
    const handle = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.11, 0.1, 0.48, 8)), handleMaterial);
    handle.name = 'knife-handle';
    handle.rotation.z = Math.PI / 2;
    handle.position.x = -0.57;
    const pommel = new THREE.Mesh(this.ownGeometry(new THREE.SphereGeometry(0.13, 10, 7)), pommelMaterial);
    pommel.name = 'knife-pommel';
    pommel.position.x = -0.83;
    this.knife.add(blade, tip, spine, handle, pommel);
    this.scene.add(this.knife);
  }

  resize(): void {
    const width = Math.max(1, this.host.clientWidth || window.innerWidth);
    const height = Math.max(1, this.host.clientHeight || window.innerHeight);
    const dpr = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const fog = createFogSpec(width, height);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = fog.near;
      this.scene.fog.far = fog.far;
    }
  }

  sync(state: SliceState, frame: PresentationFrame): void {
    if (state.worldTime === 0 && state.elapsed === 0) this.openedRouteIds.clear();
    const background = state.phase === 'bonus' ? 0x24104a : WORLD_THEME.background;
    this.scene.background = new THREE.Color(background);
    if (this.scene.fog) this.scene.fog.color.setHex(background);
    this.groundMaterial.color.setHex(state.phase === 'bonus' ? 0xefe8ff : 0xf8faf4);
    this.backdrop.visible = state.phase !== 'bonus';
    this.cutVisuals.sync(frame);
    this.syncSupports(state.supports, state.anchorId);
    this.syncSpikes(state.spikes);
    this.syncFinish(state.finishOptions, state.finishPhase, state.finishGateId);
    this.knife.position.fromArray(frame.knife.position);
    this.knife.rotation.set(0, 0, frame.knife.rotationZ);
    this.knife.scale.setScalar(1 + this.impactPulse * 0.055);
    this.lastKnifePosition = frame.knife.position;
    this.lastKnifeRotationZ = frame.knife.rotationZ;
    for (const cutId of frame.newCutIds) {
      const visual = frame.cuttables.find((candidate) => candidate.id === cutId);
      if (visual) this.spawnCutFeedback(visual.position);
    }
  }

  private syncSupports(supports: SafeSupport[], anchorId: string | null): void {
    const live = new Set(supports.filter((support) => support.active).map((support) => support.id));
    for (const [id, mesh] of this.supports) {
      if (live.has(id)) continue;
      mesh.removeFromParent();
      this.supports.delete(id);
    }
    for (const [id, mesh] of this.supportBases) {
      if (live.has(id)) continue;
      mesh.removeFromParent();
      this.supportBases.delete(id);
    }
    const openingIds = new Set(supports.filter((support) => !support.active && support.sourceBlockId).map((support) => support.id));
    for (const [id, mesh] of this.routeOpenings) {
      if (openingIds.has(id)) continue;
      mesh.removeFromParent();
      this.routeOpenings.delete(id);
    }
    for (const support of supports) {
      if (!support.active) continue;
      let mesh = this.supports.get(support.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.unitBox, this.supportMaterial);
        mesh.name = `support:${support.id}`;
        this.supports.set(support.id, mesh);
        this.scene.add(mesh);
      }
      mesh.material = support.id === anchorId ? this.supportActiveMaterial : this.supportMaterial;
      mesh.position.fromArray(worldPointFromSimulation(support.x, support.y));
      mesh.scale.set(support.width * PRESENTATION_SCALE, support.height * PRESENTATION_SCALE, 0.48);

      // Level 1's visible tables are thick grounded plinths, not floating
      // cards. The thin support remains the exact collision/top surface; this
      // presentation-only base runs from its underside to the shared ground
      // plane, making the contact chain readable in both wide and portrait
      // framing without changing gameplay collision.
      if (this.isGroundedTabletop(support.id)) {
        const highForegroundPlinth = support.id === 'white-bumper' || support.id === 'white-branch';
        let base = this.supportBases.get(support.id);
        if (!base) {
          base = new THREE.Mesh(this.unitBox, this.supportBaseMaterial);
          base.name = `support-base:${support.id}`;
          this.supportBases.set(support.id, base);
          this.scene.add(base);
        }
        // Every authored base in this branch reaches the actual floor, not
        // the background terrain band, which has no supporting collision.
        const openingTable = support.id === 'opening-table-a' || support.id === 'opening-table-b';
        const groundY = 700;
        const supportBottom = support.y + support.height / 2;
        const baseHeight = Math.max(12, groundY - supportBottom);
        const baseCenter = (supportBottom + groundY) / 2;
        base.position.fromArray(worldPointFromSimulation(support.x, baseCenter, openingTable ? 0 : highForegroundPlinth ? -0.16 : 0.04));
        base.scale.set(
          support.width * PRESENTATION_SCALE * (highForegroundPlinth ? 0.88 : 0.96),
          baseHeight * PRESENTATION_SCALE,
          openingTable ? 0.48 : highForegroundPlinth ? 0.42 : 0.72,
        );
      }
    }
    for (const support of supports) {
      if (support.active || !support.sourceBlockId) continue;
      let opening = this.routeOpenings.get(support.id);
      if (!opening) {
        opening = new THREE.Mesh(this.unitBox, this.routeOpeningMaterial);
        opening.name = `route-opening:${support.id}`;
        this.routeOpenings.set(support.id, opening);
        this.openedRouteIds.add(support.id);
        this.scene.add(opening);
      }
      opening.position.fromArray(worldPointFromSimulation(support.x, support.y, -0.18));
      opening.scale.set(support.width * PRESENTATION_SCALE, support.height * PRESENTATION_SCALE, 0.14);
    }
  }

  private isGroundedTabletop(id: string): boolean {
    return id === 'level1-runway-main'
      || id === 'white-bumper'
      || id === 'white-branch'
      || id === 'opening-table-a'
      || id === 'opening-table-b'
      || id === 'level1-reward-shelf'
      || id === 'white-landing'
      || id === 'white-recovery-shelf'
      || id === 'tower-approach'
      || id === 'bridge-table'
      || id === 'lift-table'
      || id === 'tower-table'
      || id === 'late-table';
  }

  private createSpikeGroup(spike: SpikeField): THREE.Group {
    const group = new THREE.Group();
    group.name = `spike:${spike.id}`;
    const count = Math.max(2, Math.min(7, Math.round(spike.width / 26)));
    for (let index = 0; index < count; index += 1) {
      const cone = new THREE.Mesh(this.unitCone, this.spikeMaterial);
      cone.position.x = (index - (count - 1) / 2) * spike.width * PRESENTATION_SCALE / count;
      cone.scale.setScalar(Math.min(1.7, spike.height * PRESENTATION_SCALE / 0.42));
      group.add(cone);
    }
    return group;
  }

  private syncSpikes(spikes: SpikeField[]): void {
    const live = new Set(spikes.map((spike) => spike.id));
    for (const [id, group] of this.spikes) {
      if (live.has(id)) continue;
      group.removeFromParent();
      this.spikes.delete(id);
    }
    for (const spike of spikes) {
      let group = this.spikes.get(spike.id);
      if (!group) {
        group = this.createSpikeGroup(spike);
        this.spikes.set(spike.id, group);
        this.scene.add(group);
      }
      group.position.fromArray(worldPointFromSimulation(spike.x, spike.y));
      group.position.z = 0.02;
      group.rotation.z = spike.y < 400 ? Math.PI : 0;
    }
  }

  private syncFinish(options: FinishOption[], finishPhase: SliceState['finishPhase'], finishGateId: string | null): void {
    const live = new Set(options.map((option) => option.id));
    for (const [id, mesh] of this.finishGates) {
      if (live.has(id)) continue;
      mesh.removeFromParent();
      this.finishGates.delete(id);
    }
    for (const option of options) {
      let mesh = this.finishGates.get(option.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.unitBox, this.finishMaterial(option));
        mesh.name = `finish-gate:${option.id}`;
        this.finishGates.set(option.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.fromArray(worldPointFromSimulation(option.x, option.y));
      const selected = finishGateId === option.id && finishPhase !== 'idle';
      mesh.material = selected ? this.finishHighlightMaterial : this.finishMaterial(option);
      mesh.position.z = selected ? -0.3 : -0.24;
      const emphasis = selected ? 1.08 + Math.min(0.04, Math.max(0, Math.sin(Date.now() / 110) * 0.02)) : 1;
      mesh.scale.set(option.width * PRESENTATION_SCALE * emphasis, option.height * PRESENTATION_SCALE * emphasis, selected ? 0.34 : 0.28);
    }
  }

  private spawnCutFeedback(position: Vec3Tuple): void {
    this.impactPulse = 1;
    for (let index = 0; index < 10; index += 1) {
      const angle = index / 10 * Math.PI * 2;
      this.particles.push({
        position: new THREE.Vector3().fromArray(position),
        velocity: new THREE.Vector3(Math.cos(angle) * (0.7 + index % 3 * 0.22), Math.sin(angle) * 0.58 + 0.55, (index % 2 === 0 ? -1 : 1) * 0.55),
        life: 0.42 + index % 3 * 0.04,
      });
    }
    if (this.particles.length > 80) this.particles.splice(0, this.particles.length - 80);
  }

  render(state: SliceState, deltaSeconds: number): void {
    this.updateParticles(Math.min(0.05, Math.max(0, deltaSeconds)));
    this.impactPulse = Math.max(0, this.impactPulse - deltaSeconds * 8);
    const cameraLead = cameraLeadSimulation(this.host.clientWidth, this.host.clientHeight);
    const desiredTargetX = worldPointFromSimulation(state.player.x + cameraLead, state.player.y)[0];
    if (!this.cameraInitialized) {
      // The first render is invoked with delta=0 during level load. Snap to
      // the actual player/viewport target so portrait startup cannot begin
      // with the knife outside the left edge while the camera eases in.
      this.cameraTargetX = desiredTargetX;
      this.cameraInitialized = true;
    } else {
      this.cameraTargetX += (desiredTargetX - this.cameraTargetX) * Math.min(1, deltaSeconds * 8);
    }
    const spec = createCameraSpec(this.host.clientWidth, this.host.clientHeight, this.cameraTargetX,
      state.levelNumber === 1 && state.phase === 'ordinary' ? state.finishOptions : []);
    this.camera.position.fromArray(spec.position);
    this.camera.lookAt(this.tempLookTarget.fromArray(spec.target));
    this.renderer.render(this.scene, this.camera);
  }

  private updateParticles(deltaSeconds: number): void {
    const positions = this.particleGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]!;
      particle.life -= deltaSeconds;
      if (particle.life <= 0) {
        this.particles.splice(index, 1);
        continue;
      }
      particle.velocity.y -= 3.4 * deltaSeconds;
      particle.position.addScaledVector(particle.velocity, deltaSeconds);
    }
    this.particles.forEach((particle, index) => {
      positions.setXYZ(index, particle.position.x, particle.position.y, particle.position.z);
    });
    positions.needsUpdate = true;
    this.particleGeometry.setDrawRange(0, this.particles.length);
  }

  worldToScreen(position: Vec3Tuple): { x: number; y: number } {
    this.tempProjection.fromArray(position).project(this.camera);
    return {
      x: (this.tempProjection.x * 0.5 + 0.5) * this.host.clientWidth,
      y: (-this.tempProjection.y * 0.5 + 0.5) * this.host.clientHeight,
    };
  }

  private projectObject(object: THREE.Object3D): ScreenProjection | null {
    object.updateWorldMatrix(true, true);
    this.tempBounds.setFromObject(object, true);
    if (this.tempBounds.isEmpty()) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const x of [this.tempBounds.min.x, this.tempBounds.max.x]) {
      for (const y of [this.tempBounds.min.y, this.tempBounds.max.y]) {
        for (const z of [this.tempBounds.min.z, this.tempBounds.max.z]) {
          this.tempProjection.set(x, y, z).project(this.camera);
          const screenX = (this.tempProjection.x * 0.5 + 0.5) * this.host.clientWidth;
          const screenY = (-this.tempProjection.y * 0.5 + 0.5) * this.host.clientHeight;
          minX = Math.min(minX, screenX);
          maxX = Math.max(maxX, screenX);
          minY = Math.min(minY, screenY);
          maxY = Math.max(maxY, screenY);
        }
      }
    }
    const width = Math.max(0, maxX - minX);
    const height = Math.max(0, maxY - minY);
    return { x: minX, y: minY, width, height, area: width * height };
  }

  facts(): ThreeRendererFacts {
    const viewport = { width: this.host.clientWidth, height: this.host.clientHeight };
    const cutVisuals = this.cutVisuals.facts(this.camera, viewport);
    const baseColor = this.cutVisuals.baseColorFacts();
    return {
      renderer: 'WebGLRenderer',
      cameraProjection: 'perspective',
      fov: this.camera.fov,
      canvasCount: this.host.querySelectorAll('canvas').length,
      dpr: this.renderer.getPixelRatio(),
      shadows: false,
      lightTypes: ['HemisphereLight', 'DirectionalLight'],
      resourceContract: MAIN_3D_RESOURCE_CONTRACT,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      cameraScrollX: this.cameraTargetX / PRESENTATION_SCALE,
      knifePosition: this.lastKnifePosition,
      knifeRotationZ: this.lastKnifeRotationZ,
      cutVisuals,
      capFacingScores: cutVisuals.flatMap((visual) => visual.phase === 'cut' ? visual.caps.map((cap) => cap.cameraFacingScore) : []),
      knifeProjection: this.projectObject(this.knife),
      resourceCounts: {
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
      },
      baseColorTextureIds: baseColor.ids,
      texturedMaterialCount: baseColor.texturedMaterialCount + 4,
      // Cumulative per-run evidence: a route opening is player-visible at
      // the cut event even if the transient mesh is later cleaned up.
      routeOpeningCount: this.openedRouteIds.size,
      finishHighlightedCount: [...this.finishGates.values()].filter((mesh) => mesh.material === this.finishHighlightMaterial).length,
    };
  }

  performanceInfo(): Pick<PerformanceResult, 'drawCalls' | 'triangles' | 'geometries' | 'textures' | 'dpr'> {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      dpr: this.renderer.getPixelRatio(),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cutVisuals.dispose();
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedGeometries.clear();
    this.ownedMaterials.clear();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
