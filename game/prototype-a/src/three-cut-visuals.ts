import * as THREE from 'three';
import {
  FORMAL_CUT_ASSET_CONTRACT,
  type CutHalfPresentation,
  type CuttablePresentation,
  type PresentationFrame,
  type Vec3Tuple,
} from './three-presentation';
import { MECHANICS_DEMO_THEME } from './theme';
import type { AStyleTextureSet } from './a-style-texture-runtime';

const WORLD_THEME = MECHANICS_DEMO_THEME.world;

export interface ScreenProjection {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
}

export interface CutCapFacts {
  half: 'halfA' | 'halfB';
  materialId: string;
  meshName: string;
  worldNormal: Vec3Tuple;
  cameraFacingScore: number;
  projection: ScreenProjection | null;
}

export interface CutVisualFacts {
  id: string;
  phase: 'intact' | 'cut';
  skinKind: CuttablePresentation['skinKind'];
  lifecycle: 'intact' | 'falling' | 'landed';
  visibleHalves: number;
  capMaterialIds: string[];
  capMeshNames: string[];
  caps: CutCapFacts[];
  targetProjection: ScreenProjection | null;
}

function projectMesh(mesh: THREE.Mesh, camera: THREE.Camera, viewport: { width: number; height: number }): ScreenProjection | null {
  const geometry = mesh.geometry;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return null;
  mesh.updateWorldMatrix(true, false);
  const point = new THREE.Vector3();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        point.set(x, y, z).applyMatrix4(mesh.matrixWorld).project(camera);
        const screenX = (point.x * 0.5 + 0.5) * viewport.width;
        const screenY = (-point.y * 0.5 + 0.5) * viewport.height;
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

export interface SharedCutResources {
  unitBox: THREE.BoxGeometry;
  unitSphere: THREE.SphereGeometry;
  unitCylinder: THREE.CylinderGeometry;
  unitLog: THREE.CylinderGeometry;
  dessertBase: THREE.ExtrudeGeometry;
  dessertHalfA: THREE.ExtrudeGeometry;
  dessertHalfB: THREE.ExtrudeGeometry;
  halfSigilA: THREE.ExtrudeGeometry;
  halfSigilB: THREE.ExtrudeGeometry;
  halfBoxA: THREE.BoxGeometry;
  halfBoxB: THREE.BoxGeometry;
  halfLogA: THREE.CylinderGeometry;
  halfLogB: THREE.CylinderGeometry;
  capPlane: THREE.PlaneGeometry;
  capCircle: THREE.CircleGeometry;
  blockMaterial: THREE.MeshStandardMaterial;
  sigilMaterial: THREE.MeshStandardMaterial;
  skinMaterials: Record<CuttablePresentation['skinKind'], {
    outer: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
    secondary: THREE.MeshStandardMaterial;
    cap: THREE.MeshStandardMaterial;
  }>;
}

export interface CutVisualProvider {
  readonly kind: 'PROGRAMMATIC_ORIGINAL';
  readonly formalAssetContract: typeof FORMAL_CUT_ASSET_CONTRACT;
  readonly baseColorTextureIds: readonly string[];
  readonly texturedMaterialCount: number;
  createSharedResources(): SharedCutResources;
  createEntity(visual: CuttablePresentation, resources: SharedCutResources): CutVisualEntity;
  disposeSharedResources(resources: SharedCutResources): void;
}

function makeHalfSigilGeometry(side: -1 | 1): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  if (side < 0) {
    shape.moveTo(0, -1);
    shape.absarc(0, 0, 1, -Math.PI / 2, -Math.PI * 1.5, true);
  } else {
    shape.moveTo(0, -1);
    shape.absarc(0, 0, 1, -Math.PI / 2, Math.PI / 2, false);
  }
  shape.lineTo(0, -1);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1, curveSegments: 10 });
  geometry.translate(0, 0, -0.5);
  geometry.computeVertexNormals();
  return geometry;
}

function makeHalfBoxGeometry(side: -1 | 1): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(0.5, 1, 1);
  geometry.translate(side * 0.25, 0, 0);
  return geometry;
}

function makeHalfLogGeometry(side: -1 | 1): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(1, 1, 0.5, 16, 1, false);
  geometry.rotateZ(Math.PI / 2);
  geometry.translate(side * 0.25, 0, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function makeDessertBaseGeometry(): THREE.ExtrudeGeometry {
  // A short, layered cake slice reads as pastry at gameplay distance; it is
  // intentionally not a recolored circular sigil/crystal.
  const shape = new THREE.Shape();
  shape.moveTo(-1, -0.68);
  shape.lineTo(0.72, -0.68);
  shape.quadraticCurveTo(1, -0.68, 1, -0.38);
  shape.lineTo(0.82, 0.68);
  shape.lineTo(-1, 0.68);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.05, bevelSegments: 1, curveSegments: 4 });
  geometry.translate(0, 0, -0.5);
  geometry.computeVertexNormals();
  return geometry;
}

function makeDessertHalfGeometry(side: -1 | 1): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  if (side < 0) {
    shape.moveTo(-1, -0.68); shape.lineTo(0, -0.68); shape.lineTo(0, 0.68); shape.lineTo(-1, 0.68);
  } else {
    shape.moveTo(0, -0.68); shape.lineTo(0.72, -0.68); shape.quadraticCurveTo(1, -0.68, 1, -0.38); shape.lineTo(0.82, 0.68); shape.lineTo(0, 0.68);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 4 });
  geometry.translate(0, 0, -0.5);
  geometry.computeVertexNormals();
  return geometry;
}

export function createSharedCutResources(textures?: AStyleTextureSet): SharedCutResources {
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false);
  unitCylinder.rotateX(Math.PI / 2);
  const unitLog = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false);
  unitLog.rotateZ(Math.PI / 2);
  const withMap = (map: THREE.Texture | undefined): { map?: THREE.Texture } => map ? { map } : {};
  const skinMaterials: SharedCutResources['skinMaterials'] = {
    crate: {
      outer: new THREE.MeshStandardMaterial({ color: textures ? 0xffffff : WORLD_THEME.cuttableBlock, ...withMap(textures?.maps.crate.outer), roughness: 0.72, metalness: 0 }),
      secondary: new THREE.MeshStandardMaterial({ color: textures ? 0xffffff : WORLD_THEME.cuttableSigil, ...withMap(textures?.maps.crate.band), roughness: 0.8, metalness: 0 }),
      cap: new THREE.MeshStandardMaterial({ color: textures ? 0xffffff : WORLD_THEME.capA, ...withMap(textures?.maps.crate.cap), roughness: 0.68, metalness: 0 }),
    },
    log: {
      outer: new THREE.MeshStandardMaterial({ color: textures ? 0xffffff : 0x775038, ...withMap(textures?.maps.log.bark), roughness: 0.9, metalness: 0 }),
      secondary: new THREE.MeshStandardMaterial({ color: textures ? 0xffffff : WORLD_THEME.capB, ...withMap(textures?.maps.log.end), roughness: 0.76, metalness: 0 }),
      cap: new THREE.MeshStandardMaterial({ color: textures ? 0xffffff : WORLD_THEME.capA, ...withMap(textures?.maps.log.cap), roughness: 0.7, metalness: 0 }),
    },
    crystal: {
      outer: new THREE.MeshPhysicalMaterial({ color: textures ? 0xffffff : WORLD_THEME.cuttableSigil, ...withMap(textures?.maps.crystal.outer), roughness: 0.24, metalness: 0.02, clearcoat: 0.72, clearcoatRoughness: 0.2 }),
      secondary: new THREE.MeshStandardMaterial({ color: textures ? 0xffffff : WORLD_THEME.cuttableSigil, ...withMap(textures?.maps.crystal.frost), roughness: 0.34, metalness: 0.02 }),
      cap: new THREE.MeshStandardMaterial({ color: textures ? 0xffffff : WORLD_THEME.capA, ...withMap(textures?.maps.crystal.cap), emissive: 0x155b78, emissiveIntensity: 0.32, roughness: 0.3, metalness: 0.02 }),
    },
    dessert: {
      outer: new THREE.MeshStandardMaterial({ color: 0xffc48f, roughness: 0.62, metalness: 0 }),
      secondary: new THREE.MeshStandardMaterial({ color: 0xfff0d4, roughness: 0.7, metalness: 0 }),
      cap: new THREE.MeshStandardMaterial({ color: 0xffe0a8, roughness: 0.58, metalness: 0 }),
    },
  };
  return {
    unitBox: new THREE.BoxGeometry(1, 1, 1),
    unitSphere: new THREE.SphereGeometry(1, 12, 8),
    unitCylinder,
    unitLog,
    dessertBase: makeDessertBaseGeometry(),
    dessertHalfA: makeDessertHalfGeometry(-1),
    dessertHalfB: makeDessertHalfGeometry(1),
    halfSigilA: makeHalfSigilGeometry(-1),
    halfSigilB: makeHalfSigilGeometry(1),
    halfBoxA: makeHalfBoxGeometry(-1),
    halfBoxB: makeHalfBoxGeometry(1),
    halfLogA: makeHalfLogGeometry(-1),
    halfLogB: makeHalfLogGeometry(1),
    capPlane: new THREE.PlaneGeometry(1, 2),
    capCircle: new THREE.CircleGeometry(1, 18),
    blockMaterial: new THREE.MeshStandardMaterial({ color: WORLD_THEME.cuttableBlock, roughness: 0.7, metalness: 0.04 }),
    sigilMaterial: new THREE.MeshStandardMaterial({ color: WORLD_THEME.cuttableSigil, roughness: 0.38, metalness: 0.08, emissive: WORLD_THEME.cuttableSigilEmissive, emissiveIntensity: 0.6 }),
    skinMaterials,
  };
}

export function disposeSharedCutResources(resources: SharedCutResources): void {
  resources.unitBox.dispose();
  resources.unitSphere.dispose();
  resources.unitCylinder.dispose();
  resources.unitLog.dispose();
  resources.dessertBase.dispose();
  resources.dessertHalfA.dispose();
  resources.dessertHalfB.dispose();
  resources.halfSigilA.dispose();
  resources.halfSigilB.dispose();
  resources.halfBoxA.dispose();
  resources.halfBoxB.dispose();
  resources.halfLogA.dispose();
  resources.halfLogB.dispose();
  resources.capPlane.dispose();
  resources.capCircle.dispose();
  resources.blockMaterial.dispose();
  resources.sigilMaterial.dispose();
  for (const materialSet of Object.values(resources.skinMaterials)) {
    materialSet.outer.dispose();
    materialSet.secondary.dispose();
    materialSet.cap.dispose();
  }
}

export class CutVisualEntity {
  readonly root = new THREE.Group();
  private readonly intact: THREE.Mesh;
  private readonly halfRoots: readonly [THREE.Group, THREE.Group];
  private readonly capMaterials: readonly [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  private readonly capMeshes: readonly [THREE.Mesh, THREE.Mesh];
  private readonly styleMaterials: THREE.Material[] = [];
  private phase: 'intact' | 'cut' = 'intact';

  constructor(private visual: CuttablePresentation, resources: SharedCutResources) {
    this.root.name = `cuttable:${visual.id}`;
    const baseMaterialSet = resources.skinMaterials[visual.skinKind];
    const tint: Record<CuttablePresentation['foodStyle'], number> = {
      apple: 0xef5b4d, banana: 0xf4c64b, coconut: 0x4dbb6d,
      cake: 0xf0b38b, pastry: 0xd58b4d, cheesecake: 0xffd6a0,
      dumpling: 0xe8d0b0, roast: 0xa85d3e, skewer: 0x8e4b32,
      'moon-fruit': 0x8d7df0, 'jade-bun': 0x43c9a0, 'spirit-orb': 0x55c6e8,
    };
    const cloneTint = <T extends THREE.Material>(material: T): T => {
      const copy = material.clone() as T;
      if ('color' in copy) (copy as unknown as THREE.MeshStandardMaterial).color.setHex(tint[visual.foodStyle]);
      this.styleMaterials.push(copy);
      return copy;
    };
    const materialSet = { outer: cloneTint(baseMaterialSet.outer), secondary: cloneTint(baseMaterialSet.secondary), cap: cloneTint(baseMaterialSet.cap) };
    // Level 1 reads as low-poly fruit on a bright runway. Keep authored
    // textures for later structural blocks, while fruit-like targets use
    // matte palette colors that survive the small mobile viewport.
    if (visual.kind === 'block') {
      materialSet.outer.map = null;
      materialSet.secondary.map = null;
      materialSet.cap.map = null;
    }
    const intactGeometry = visual.skinKind === 'crate' ? resources.unitBox : visual.skinKind === 'log' ? resources.unitLog : visual.skinKind === 'dessert' ? resources.dessertBase : resources.unitSphere;
    // SphereGeometry has no material groups. Array materials submit only
    // grouped faces, so using the cylinder's material array hides the whole
    // intact sphere even though its bounds and cut halves remain visible.
    const bodyMaterial: THREE.Material | THREE.Material[] = visual.skinKind === 'crate' || visual.skinKind === 'crystal'
      ? materialSet.outer
      : [materialSet.outer, materialSet.secondary, materialSet.secondary];
    this.intact = new THREE.Mesh(intactGeometry, bodyMaterial);
    this.intact.name = `intact:${visual.id}`;
    if (visual.skinKind === 'crate') {
      const horizontalBand = new THREE.Mesh(resources.unitBox, materialSet.secondary);
      horizontalBand.name = `crate-band-horizontal:${visual.id}`;
      horizontalBand.scale.set(1.04, 0.16, 1.04);
      const verticalBand = new THREE.Mesh(resources.unitBox, materialSet.secondary);
      verticalBand.name = `crate-band-vertical:${visual.id}`;
      verticalBand.scale.set(0.15, 1.04, 1.04);
      this.intact.add(horizontalBand, verticalBand);
    }
    if (visual.skinKind === 'dessert') {
      const icing = new THREE.Mesh(resources.unitCylinder, materialSet.secondary);
      icing.name = `dessert-icing:${visual.id}`;
      icing.scale.set(0.84, 0.84, 1.12);
      icing.position.z = 0.06;
      const cream = new THREE.Mesh(resources.unitCylinder, materialSet.cap);
      cream.name = `dessert-cream:${visual.id}`;
      cream.scale.set(0.58, 0.58, 1.18);
      cream.position.z = 0.11;
      this.intact.add(icing, cream);
    }
    this.root.add(this.intact);

    const makeHalf = (half: 'halfA' | 'halfB', index: 0 | 1): { root: THREE.Group; cap: THREE.Mesh; material: THREE.MeshStandardMaterial } => {
      const halfRoot = new THREE.Group();
      halfRoot.name = `${half}:${visual.id}`;
      const bodyGeometry = visual.skinKind === 'crystal'
        ? (index === 0 ? resources.halfSigilA : resources.halfSigilB)
        : visual.skinKind === 'dessert'
          ? (index === 0 ? resources.dessertHalfA : resources.dessertHalfB)
        : visual.skinKind === 'log'
          ? (index === 0 ? resources.halfLogA : resources.halfLogB)
          : (index === 0 ? resources.halfBoxA : resources.halfBoxB);
      const halfBodyMaterial: THREE.Material | THREE.Material[] = visual.skinKind === 'log' || visual.skinKind === 'dessert'
        ? [materialSet.outer, materialSet.secondary, materialSet.cap]
        : materialSet.outer;
      const body = new THREE.Mesh(bodyGeometry, halfBodyMaterial);
      body.name = `closed-body:${visual.id}:${half}`;
      halfRoot.add(body);
      if (visual.skinKind === 'dessert') {
        // The icing must share the exact same half-slice silhouette as the
        // body; using the generic circular sigil halves makes the dropped
        // piece visibly change shape after cutting.
        const icing = new THREE.Mesh(index === 0 ? resources.dessertHalfA : resources.dessertHalfB, materialSet.secondary);
        icing.name = `dessert-icing:${visual.id}:${half}`;
        icing.scale.set(0.72, 0.56, 0.18);
        icing.position.z = 0.08;
        halfRoot.add(icing);
      }
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: materialSet.cap.map,
        emissive: visual.skinKind === 'crystal' ? 0x155b78 : 0x4d1f08,
        emissiveIntensity: visual.skinKind === 'crystal' ? 0.38 : 0.06,
        roughness: visual.skinKind === 'crystal' ? 0.3 : 0.6,
        side: THREE.DoubleSide,
      });
      const cap = new THREE.Mesh(visual.skinKind === 'log' ? resources.capCircle : resources.capPlane, material);
      cap.name = `capMaterial:${visual.id}:${half}`;
      // Cant the sealed cut face toward the oblique gameplay camera while preserving
      // a real transformed normal for each independently rotating half.
      // Match the cap plane to the actual model cut axis: logs run along X,
      // crates are split across X, while the extruded crystal's cut face is +Z.
      cap.rotation.y = visual.skinKind === 'log'
        ? -Math.PI / 2
        : visual.skinKind === 'crate' || visual.skinKind === 'dessert' ? Math.PI / 2 : 0;
      cap.renderOrder = 3;
      // Dessert bodies already carry their shaped cut face through the
      // extruded half geometry. The generic rectangular cap plane reads as a
      // square/coin pasted onto the pastry, so keep the cap fact for QA but do
      // not render that mismatched fallback surface.
      // Log and dessert half geometries already include their authored end
      // face. Rendering the generic cap overlay on either skin creates a
      // detached circular/square decal (the savory failure mode seen in QA).
      if (visual.skinKind === 'dessert' || visual.skinKind === 'log') cap.visible = false;
      halfRoot.add(cap);
      halfRoot.visible = false;
      this.root.add(halfRoot);
      return { root: halfRoot, cap, material };
    };
    const halfA = makeHalf('halfA', 0);
    const halfB = makeHalf('halfB', 1);
    this.halfRoots = [halfA.root, halfB.root];
    this.capMaterials = [halfA.material, halfB.material];
    this.capMeshes = [halfA.cap, halfB.cap];
    this.sync(visual);
  }

  sync(visual: CuttablePresentation): void {
    this.visual = visual;
    this.phase = visual.phase;
    this.intact.visible = visual.phase === 'intact';
    this.intact.position.fromArray(visual.position);
    this.intact.rotation.set(0, 0, visual.rotationZ);
    if (visual.skinKind === 'crystal') {
      const radius = visual.radius ?? visual.width / 2;
      const squash = visual.foodStyle === 'spirit-orb' ? 1.18 : visual.foodStyle === 'moon-fruit' ? 0.88 : 1;
      this.intact.scale.set(radius * squash, radius, visual.depth);
    } else if (visual.skinKind === 'dessert') {
      this.intact.scale.set(visual.width * 0.92, visual.height * 0.82, visual.depth);
    } else if (visual.skinKind === 'log') {
      const bend = visual.foodStyle === 'banana' ? 1.22 : visual.foodStyle === 'skewer' ? 0.72 : 1;
      this.intact.scale.set(visual.width * bend, visual.height / 2, visual.depth / 2);
    } else {
      const tier = visual.foodStyle === 'cake' || visual.foodStyle === 'cheesecake' ? 1.12 : visual.foodStyle === 'dumpling' ? 0.86 : 1;
      this.intact.scale.set(visual.width * tier, visual.height, visual.depth);
    }
    visual.halves.forEach((half, index) => this.syncHalf(half, index as 0 | 1, visual));
    if (visual.phase === 'intact') this.halfRoots.forEach((root) => { root.visible = false; });
  }

  private syncHalf(half: CutHalfPresentation, index: 0 | 1, visual: CuttablePresentation): void {
    const root = this.halfRoots[index];
    const body = root.children[0] as THREE.Mesh;
    const cap = this.capMeshes[index];
    root.visible = true;
    root.position.fromArray(half.position);
    root.rotation.set(half.rotationDepth * 0.35, half.rotationDepth, half.rotationZ);
    this.capMaterials[index].name = half.capMaterialId;
    cap.name = `capMaterial:${half.capMaterialId}`;
    if (visual.skinKind === 'crystal') {
      const radius = visual.radius ?? visual.width / 2;
      body.scale.set(radius, radius, visual.depth);
      cap.scale.set(visual.depth, radius, 1);
      cap.position.set(0, 0, 0);
      const icing = root.children.find((child) => child.name.startsWith('dessert-icing:')) as THREE.Mesh | undefined;
      if (icing) {
        icing.scale.set(radius * 0.72, radius * 0.56, visual.depth * 0.42);
        icing.position.set(0, 0.02, visual.depth * 0.2);
      }
    } else if (visual.skinKind === 'dessert') {
      body.scale.set(visual.width * 0.92, visual.height * 0.82, visual.depth);
      body.position.set(0, 0, 0);
      cap.scale.set(visual.depth, visual.height * 0.41, 1);
      cap.position.set(0, 0, 0);
    } else if (visual.skinKind === 'log') {
      body.scale.set(visual.width, visual.height / 2, visual.depth / 2);
      body.position.set(0, 0, 0);
      cap.scale.set(visual.height / 2, visual.depth / 2, 1);
      cap.position.set(0, 0, 0);
    } else {
      body.scale.set(visual.width, visual.height, visual.depth);
      body.position.set(0, 0, 0);
      cap.scale.set(visual.depth, visual.height / 2, 1);
      cap.position.set(0, 0, 0);
    }
  }

  facts(camera?: THREE.Camera, viewport?: { width: number; height: number }): CutVisualFacts {
    this.root.updateWorldMatrix(true, true);
    const cameraPosition = camera?.getWorldPosition(new THREE.Vector3());
    const capPosition = new THREE.Vector3();
    const capQuaternion = new THREE.Quaternion();
    const capNormal = new THREE.Vector3();
    const toCamera = new THREE.Vector3();
    const caps = this.capMeshes.map((cap, index): CutCapFacts => {
      cap.getWorldPosition(capPosition);
      cap.getWorldQuaternion(capQuaternion);
      capNormal.set(0, 0, 1).applyQuaternion(capQuaternion).normalize();
      const cameraFacingScore = cameraPosition
        ? Math.abs(toCamera.copy(cameraPosition).sub(capPosition).normalize().dot(capNormal))
        : 0;
      return {
        half: index === 0 ? 'halfA' : 'halfB',
        materialId: this.capMaterials[index]!.name,
        meshName: cap.name,
        worldNormal: [capNormal.x, capNormal.y, capNormal.z],
        cameraFacingScore,
        projection: camera && viewport ? projectMesh(cap, camera, viewport) : null,
      };
    });
    return {
      id: this.visual.id,
      phase: this.phase,
      skinKind: this.visual.skinKind,
      lifecycle: this.phase === 'intact' ? 'intact' : this.visual.falling ? 'falling' : 'landed',
      visibleHalves: this.halfRoots.filter((root) => root.visible).length,
      capMaterialIds: this.capMaterials.map((material) => material.name),
      capMeshNames: this.capMeshes.map((mesh) => mesh.name),
      caps,
      targetProjection: camera && viewport ? projectMesh(this.intact, camera, viewport) : null,
    };
  }

  dispose(): void {
    this.capMaterials.forEach((material) => material.dispose());
    this.styleMaterials.forEach((material) => material.dispose());
    this.root.removeFromParent();
  }
}

export class ProgrammaticOriginalProvider implements CutVisualProvider {
  readonly kind = 'PROGRAMMATIC_ORIGINAL' as const;
  readonly formalAssetContract = FORMAL_CUT_ASSET_CONTRACT;

  constructor(private readonly textures?: AStyleTextureSet) {}

  get baseColorTextureIds(): readonly string[] {
    return this.textures?.ids ?? [];
  }

  get texturedMaterialCount(): number {
    return this.textures?.texturedMaterialCount ?? 0;
  }

  createSharedResources(): SharedCutResources {
    return createSharedCutResources(this.textures);
  }

  createEntity(visual: CuttablePresentation, resources: SharedCutResources): CutVisualEntity {
    return new CutVisualEntity(visual, resources);
  }

  disposeSharedResources(resources: SharedCutResources): void {
    disposeSharedCutResources(resources);
    this.textures?.dispose();
  }
}

export class ThreeCutVisualManager {
  readonly root = new THREE.Group();
  private readonly resources: SharedCutResources;
  private readonly entities = new Map<string, CutVisualEntity>();

  constructor(private readonly provider: CutVisualProvider = new ProgrammaticOriginalProvider()) {
    this.root.name = 'programmatic-original-cuttables';
    this.resources = provider.createSharedResources();
  }

  sync(frame: PresentationFrame): void {
    const live = new Set(frame.cuttables.map((visual) => visual.id));
    for (const [id, entity] of this.entities) {
      if (live.has(id)) continue;
      entity.dispose();
      this.entities.delete(id);
    }
    for (const visual of frame.cuttables) {
      let entity = this.entities.get(visual.id);
      if (!entity) {
        entity = this.provider.createEntity(visual, this.resources);
        this.entities.set(visual.id, entity);
        this.root.add(entity.root);
      }
      entity.sync(visual);
    }
  }

  facts(camera?: THREE.Camera, viewport?: { width: number; height: number }): CutVisualFacts[] {
    return [...this.entities.values()].map((entity) => entity.facts(camera, viewport));
  }

  baseColorFacts(): { ids: readonly string[]; texturedMaterialCount: number } {
    return { ids: this.provider.baseColorTextureIds, texturedMaterialCount: this.provider.texturedMaterialCount };
  }

  dispose(): void {
    for (const entity of this.entities.values()) entity.dispose();
    this.entities.clear();
    this.provider.disposeSharedResources(this.resources);
    this.root.removeFromParent();
  }
}
