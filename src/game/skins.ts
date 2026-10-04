/**
 * Zone "skins": side-of-road artwork for SPEED mode (neon city, sunrise beach, frozen highway, lava inferno).
 * Sprites are transparent webps in src/assets/race/skins/<zone>_<n>.webp; SIZES holds their natural [w, h].
 * Large pieces line the road edge, small pieces fill the gaps between them.
 */
export type SkinKey = "cyber" | "beach" | "snow" | "lava";

const URLS = import.meta.glob("/src/assets/race/skins/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const SIZES: Record<SkinKey, [number, number][]> = {
  cyber: [
    [115, 202],
    [132, 185],
    [103, 212],
    [96, 144],
    [63, 194],
    [72, 169],
    [74, 108],
    [107, 95],
    [109, 114],
    [117, 89],
    [91, 95],
    [127, 115],
    [56, 79],
    [78, 101],
    [47, 52],
    [31, 111],
    [30, 103],
    [122, 89],
    [69, 77],
  ],
  beach: [
    [133, 159],
    [167, 192],
    [128, 182],
    [92, 111],
    [82, 147],
    [93, 146],
    [67, 109],
    [57, 82],
    [64, 100],
    [80, 103],
    [94, 127],
    [81, 128],
    [79, 141],
    [70, 67],
    [30, 84],
    [30, 66],
    [31, 83],
    [91, 87],
    [81, 86],
    [102, 112],
    [100, 98],
    [51, 62],
    [74, 65],
    [80, 140],
    [64, 47],
    [95, 82],
    [97, 52],
    [71, 48],
    [62, 43],
    [62, 59],
    [64, 60],
    [54, 76],
  ],
  snow: [
    [112, 197],
    [130, 106],
    [100, 101],
    [98, 134],
    [113, 108],
    [67, 103],
    [58, 97],
    [66, 98],
    [98, 102],
    [67, 83],
    [109, 103],
    [101, 82],
    [135, 90],
    [146, 141],
    [82, 62],
    [68, 79],
    [47, 73],
    [84, 96],
    [97, 179],
  ],
  lava: [
    [261, 194],
    [101, 100],
    [149, 126],
    [191, 168],
    [125, 125],
    [125, 120],
    [113, 120],
    [86, 111],
    [153, 111],
    [120, 97],
    [72, 98],
    [71, 90],
    [85, 96],
    [83, 71],
    [65, 85],
    [60, 81],
    [42, 82],
    [35, 81],
    [61, 72],
    [79, 77],
  ],
};

/** Display scale per zone (the source art is small, so it is enlarged to read well next to the cars). */
const SCALE: Record<SkinKey, number> = { cyber: 1.3, beach: 1.35, snow: 1.4, lava: 1.45 };

/** Tallest allowed piece per zone; the beach huts are capped lower so they don't stack into each other. */
const MAXH: Record<SkinKey, number> = { cyber: 270, beach: 175, snow: 270, lava: 270 };

export type SkinSprite = { img: HTMLImageElement; w: number; h: number };
export type SkinSet = { big: SkinSprite[]; small: SkinSprite[] };

let cache: Record<SkinKey, SkinSet> | null = null;

/** Lazily loads every skin sprite once; draw code checks `img.complete` before use. */
export function getSkins(): Record<SkinKey, SkinSet> {
  if (cache) return cache;
  const out = {} as Record<SkinKey, SkinSet>;
  for (const key of Object.keys(SIZES) as SkinKey[]) {
    const set: SkinSet = { big: [], small: [] };
    SIZES[key].forEach(([nw, nh], n) => {
      const url = URLS[`/src/assets/race/skins/${key}_${n}.webp`];
      if (!url) return;
      const img = new Image();
      img.src = url;
      const s = Math.min(SCALE[key], 320 / nw, MAXH[key] / nh); // never let one piece swallow the road side
      const sp = { img, w: nw * s, h: nh * s };
      (nh >= 105 || nw >= 130 ? set.big : set.small).push(sp);
    });
    out[key] = set;
  }
  return (cache = out);
}
