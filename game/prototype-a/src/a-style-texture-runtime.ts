import * as THREE from 'three';
import crateAtlasUrl from './assets/a-style/crate-basecolor.png?inline';
import crystalAtlasUrl from './assets/a-style/crystal-basecolor.png?inline';
import knifeAtlasUrl from './assets/a-style/knife-basecolor.png?inline';
import logAtlasUrl from './assets/a-style/log-basecolor.png?inline';
import { A_STYLE_BASECOLOR_TEXTURE_IDS, type AStyleModelKind } from './a-style-basecolor';

type AtlasQuadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface AStyleTextureSet {
  readonly ids: typeof A_STYLE_BASECOLOR_TEXTURE_IDS;
  readonly maps: {
    readonly crate: { readonly outer: THREE.Texture; readonly band: THREE.Texture; readonly cap: THREE.Texture };
    readonly log: { readonly bark: THREE.Texture; readonly end: THREE.Texture; readonly cap: THREE.Texture };
    readonly knife: { readonly blade: THREE.Texture; readonly spine: THREE.Texture; readonly handle: THREE.Texture; readonly pommel: THREE.Texture };
    readonly crystal: { readonly outer: THREE.Texture; readonly frost: THREE.Texture; readonly cap: THREE.Texture };
  };
  readonly texturedMaterialCount: 13;
  dispose(): void;
}

const ATLAS_URLS: Record<AStyleModelKind, string> = {
  crate: crateAtlasUrl,
  log: logAtlasUrl,
  knife: knifeAtlasUrl,
  crystal: crystalAtlasUrl,
};

const QUADRANT_OFFSETS: Record<AtlasQuadrant, readonly [number, number]> = {
  'top-left': [0, 0.5],
  'top-right': [0.5, 0.5],
  'bottom-left': [0, 0],
  'bottom-right': [0.5, 0],
};

function atlasView(atlas: THREE.Texture, quadrant: AtlasQuadrant, name: string): THREE.Texture {
  const texture = atlas.clone();
  const [x, y] = QUADRANT_OFFSETS[quadrant];
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(0.5, 0.5);
  texture.offset.set(x, y);
  texture.needsUpdate = true;
  return texture;
}

export function createAStyleTextureSet(maxAnisotropy = 1): AStyleTextureSet {
  const loader = new THREE.TextureLoader();
  const atlases = Object.fromEntries((Object.keys(ATLAS_URLS) as AStyleModelKind[]).map((model) => {
    const texture = loader.load(ATLAS_URLS[model]);
    texture.name = `atlas:a-${model}-basecolor`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
    return [model, texture];
  })) as Record<AStyleModelKind, THREE.Texture>;
  const maps = {
    crate: {
      outer: atlasView(atlases.crate, 'top-left', 'a-crate:outer'),
      band: atlasView(atlases.crate, 'top-right', 'a-crate:band'),
      cap: atlasView(atlases.crate, 'bottom-left', 'a-crate:cap'),
    },
    log: {
      bark: atlasView(atlases.log, 'top-left', 'a-log:bark'),
      end: atlasView(atlases.log, 'top-right', 'a-log:end'),
      cap: atlasView(atlases.log, 'bottom-left', 'a-log:cap'),
    },
    knife: {
      blade: atlasView(atlases.knife, 'top-left', 'a-knife:blade'),
      spine: atlasView(atlases.knife, 'top-right', 'a-knife:spine'),
      handle: atlasView(atlases.knife, 'bottom-left', 'a-knife:handle'),
      pommel: atlasView(atlases.knife, 'bottom-right', 'a-knife:pommel'),
    },
    crystal: {
      outer: atlasView(atlases.crystal, 'top-left', 'a-crystal:outer'),
      frost: atlasView(atlases.crystal, 'top-right', 'a-crystal:frost'),
      cap: atlasView(atlases.crystal, 'bottom-left', 'a-crystal:cap'),
    },
  } as const;
  const owned = [...Object.values(atlases), ...Object.values(maps).flatMap((group) => Object.values(group))];
  return {
    ids: A_STYLE_BASECOLOR_TEXTURE_IDS,
    maps,
    texturedMaterialCount: 13,
    dispose: () => owned.forEach((texture) => texture.dispose()),
  };
}
