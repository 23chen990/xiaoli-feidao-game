export const DIORAMA_SKIN = {
  id: 'fresh-a-bitmap-v1',
  provenance: 'ai-generated-original',
  textures: [
    { id: 'a-crate-basecolor', size: 512, uvLayout: 'quadrant-2x2' },
    { id: 'a-log-basecolor', size: 512, uvLayout: 'quadrant-2x2' },
    { id: 'a-knife-basecolor', size: 512, uvLayout: 'quadrant-2x2' },
    { id: 'a-crystal-basecolor', size: 512, uvLayout: 'quadrant-2x2' },
  ],
  materials: {
    bark: { color: 0x9a5737, roughness: 0.94, metalness: 0 },
    blade: { color: 0xdff5f7, roughness: 0.22, metalness: 0.92 },
    crate: { color: 0xf1b25f, roughness: 0.7, metalness: 0 },
    crystal: { color: 0x8a79f7, roughness: 0.16, metalness: 0.04, clearcoat: 0.92 },
    ground: { color: 0x72b878, roughness: 0.98, metalness: 0 },
    platform: { color: 0xf2ead9, roughness: 0.8, metalness: 0 },
    woodCap: { color: 0xffdc91, roughness: 0.76, metalness: 0 },
  },
} as const;
