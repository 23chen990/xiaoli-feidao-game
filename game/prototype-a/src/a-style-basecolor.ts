import { z } from 'zod';

export const A_STYLE_MODEL_KINDS = ['crate', 'log', 'knife', 'crystal'] as const;
export type AStyleModelKind = typeof A_STYLE_MODEL_KINDS[number];

const BASECOLOR_ENTRY_SCHEMA = z.object({
  id: z.string().regex(/^a-(crate|log|knife|crystal)-basecolor$/),
  model: z.enum(A_STYLE_MODEL_KINDS),
  source: z.literal('ai-generated-original'),
  styleDirection: z.literal('A'),
  format: z.literal('png'),
  width: z.literal(512),
  height: z.literal(512),
  opaque: z.literal(true),
  colorSpace: z.literal('srgb'),
  uvLayout: z.literal('quadrant-2x2'),
  localPath: z.string().regex(/^src\/assets\/a-style\/[a-z-]+\.png$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const A_STYLE_BASECOLOR_MANIFEST_SCHEMA = z.array(BASECOLOR_ENTRY_SCHEMA).length(4).superRefine((entries, context) => {
  if (new Set(entries.map(({ model }) => model)).size !== A_STYLE_MODEL_KINDS.length) {
    context.addIssue({ code: 'custom', message: 'every A-style model must have exactly one Base Color atlas' });
  }
});

export const A_STYLE_BASECOLOR_MANIFEST = Object.freeze(A_STYLE_BASECOLOR_MANIFEST_SCHEMA.parse([
  {
    id: 'a-crate-basecolor', model: 'crate', source: 'ai-generated-original', styleDirection: 'A', format: 'png',
    width: 512, height: 512, opaque: true, colorSpace: 'srgb', uvLayout: 'quadrant-2x2',
    localPath: 'src/assets/a-style/crate-basecolor.png', sha256: '36284f8d5c5092dbb73c08877ea22855cc844614514a036736c86e985d2788da',
  },
  {
    id: 'a-log-basecolor', model: 'log', source: 'ai-generated-original', styleDirection: 'A', format: 'png',
    width: 512, height: 512, opaque: true, colorSpace: 'srgb', uvLayout: 'quadrant-2x2',
    localPath: 'src/assets/a-style/log-basecolor.png', sha256: 'bca83ae3309698385d0e79611430d18dbd324d2ffbe7706ef2c73c3521ee588a',
  },
  {
    id: 'a-knife-basecolor', model: 'knife', source: 'ai-generated-original', styleDirection: 'A', format: 'png',
    width: 512, height: 512, opaque: true, colorSpace: 'srgb', uvLayout: 'quadrant-2x2',
    localPath: 'src/assets/a-style/knife-basecolor.png', sha256: 'c85a3f77a9e7c40eee3c5530788261bcd86baca4adf9125e56f4d0a73fef7287',
  },
  {
    id: 'a-crystal-basecolor', model: 'crystal', source: 'ai-generated-original', styleDirection: 'A', format: 'png',
    width: 512, height: 512, opaque: true, colorSpace: 'srgb', uvLayout: 'quadrant-2x2',
    localPath: 'src/assets/a-style/crystal-basecolor.png', sha256: '02c811c9de4601b24b59deee3fcbcaf2ea3f190f3c88bf3b8572a25416490603',
  },
]));

export const A_STYLE_BASECOLOR_TEXTURE_IDS = Object.freeze(A_STYLE_BASECOLOR_MANIFEST.map(({ id }) => id));
