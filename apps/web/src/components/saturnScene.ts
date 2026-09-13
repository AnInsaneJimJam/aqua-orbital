export const SATURN_WIDTH = 960;
export const SATURN_HEIGHT = 400;
export const PLANET_DIAMETER = 380;
export const ORBIT_PERIOD_MS = 40_000;
export const TILE_SIZE = 11;
export const TOKEN_TEXTURES = ['usdc', 'ousd6', 'ousd18'] as const;
export const TOKEN_COLORS = ['#0B53BF', '#7ED2C8', '#E6D3A2'] as const;
const TAU = Math.PI * 2;
const TILT = -0.245;

export type OrbitTile = {phase: number; radius: number; spread: number; offset: number; token: number};

/** Fixed scatter travels with each tile; no per-frame noise or perspective scaling. */
export function orbitTiles(count = 480): OrbitTile[] {
  let seed = 17;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  return Array.from({length: count}, (_, index) => ({
    phase: ((index + random()) / count) * TAU,
    radius: 452 + (random() - 0.5) * 60,
    spread: 76 + (random() - 0.5) * 80,
    offset: (random() - 0.5) * 40,
    token: index % TOKEN_TEXTURES.length,
  }));
}

export function tilePosition(tile: OrbitTile, elapsedMs: number) {
  const angle = tile.phase + ((elapsedMs % ORBIT_PERIOD_MS) / ORBIT_PERIOD_MS) * TAU;
  const depth = Math.sin(angle);
  const x = Math.cos(angle) * tile.radius;
  const y = depth * tile.spread + tile.offset;
  return {
    x: SATURN_WIDTH / 2 + x * Math.cos(TILT) - y * Math.sin(TILT),
    y: SATURN_HEIGHT / 2 + x * Math.sin(TILT) + y * Math.cos(TILT),
    size: TILE_SIZE,
    front: depth >= 0,
    opacity: 0.7 + (depth + 1) * 0.15,
  };
}

/** Ordered square-cell dither, cached once: the planet never rotates. */
export function planetCells() {
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cells: {x: number; y: number; opacity: number}[] = [];
  const radius = PLANET_DIAMETER / 2;
  for (let row = 0; row < 48; row++) {
    for (let column = 0; column < 48; column++) {
      const x = column * 8 + 2, y = row * 8 + 2;
      const nx = (x + 2.25 - radius) / radius, ny = (y + 2.25 - radius) / radius;
      const distance = nx * nx + ny * ny;
      if (distance > 0.985) continue;
      const shade = Math.max(0.04, Math.min(1, 0.2 + 0.9 * (-nx * 0.6 - ny * 0.48 + Math.sqrt(1 - distance) * 0.45)));
      const threshold = (bayer[(row % 4) * 4 + column % 4]! + 0.5) / 16;
      cells.push({x, y, opacity: shade > threshold ? 0.93 : 0.12 + shade * 0.18 + 0.24 * Math.sqrt(Math.max(0, nx) * Math.max(0, ny))});
    }
  }
  return cells;
}

/** Also used by the regression check to keep the no-JavaScript fallback in sync. */
export function staticSaturnSvg(textures: string[]) {
  const definitions = textures.map((texture, index) => `<symbol id="token-${index}" viewBox="0 0 96 96" fill="none">${texture.replace(/<\/?svg[^>]*>/g, '')}</symbol>`).join('');
  const tiles = orbitTiles().map(tile => ({tile, position: tilePosition(tile, 0)}));
  const layer = (front: boolean) => tiles.filter(({position}) => position.front === front).map(({tile, position: p}) => `<g opacity="${p.opacity.toFixed(3)}"><rect x="${(p.x - p.size / 2).toFixed(2)}" y="${(p.y - p.size / 2).toFixed(2)}" width="11" height="11" fill="${TOKEN_COLORS[tile.token]}"/><use href="#token-${tile.token}" x="${(p.x - p.size / 2).toFixed(2)}" y="${(p.y - p.size / 2).toFixed(2)}" width="11" height="11"/></g>`).join('');
  const planet = `<g transform="translate(290 10)"><circle cx="190" cy="190" r="190" fill="#050505"/>${planetCells().map(cell => `<rect x="${cell.x}" y="${cell.y}" width="4.5" height="4.5" fill="#F5F5F2" opacity="${cell.opacity.toFixed(3)}"/>`).join('')}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="400" viewBox="0 0 960 400"><defs>${definitions}</defs>${layer(false)}${planet}${layer(true)}</svg>\n`;
}
