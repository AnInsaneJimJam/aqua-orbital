import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ORBIT_PERIOD_MS, SATURN_HEIGHT, SATURN_WIDTH, TILE_SIZE, TOKEN_TEXTURES, orbitTiles, staticSaturnSvg, tilePosition} from '../src/components/saturnScene';

test('orbit tiles keep a continuous clockwise loop, equal upright size, and front/back depth', () => {
  const tiles = orbitTiles();
  assert.deepEqual(tiles, orbitTiles());
  assert.equal(tiles.length, 480);
  assert.deepEqual([...new Set(tiles.map(tile => tile.token))].sort(), [0, 1, 2]);
  for (const tile of tiles) {
    const start = tilePosition(tile, 0), end = tilePosition(tile, ORBIT_PERIOD_MS);
    assert.deepEqual(end, start);
    const before = tilePosition(tile, ORBIT_PERIOD_MS - 1), after = tilePosition(tile, 1);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 0.2);
    for (let time = 0; time < ORBIT_PERIOD_MS; time += 500) {
      const position = tilePosition(tile, time);
      assert.equal(position.size, TILE_SIZE);
      assert.ok(position.x - TILE_SIZE / 2 >= 0 && position.x + TILE_SIZE / 2 <= SATURN_WIDTH);
      assert.ok(position.y - TILE_SIZE / 2 >= 0 && position.y + TILE_SIZE / 2 <= SATURN_HEIGHT);
    }
  }
  const sample = {...tiles[0]!, phase: 0};
  assert.ok(tilePosition(sample, 100).y > tilePosition(sample, 0).y);
  assert.equal(tilePosition(sample, 10000).front, true);
  assert.equal(tilePosition(sample, 30000).front, false);
});

test('the static fallback uses the same planet, equal-size textures and occlusion order', () => {
  const publicUrl = new URL('../public/brand/', import.meta.url);
  const textures = TOKEN_TEXTURES.map(name => readFileSync(new URL(`tokens/${name}.svg`, publicUrl), 'utf8'));
  assert.equal(readFileSync(new URL('saturn-static.svg', publicUrl), 'utf8'), staticSaturnSvg(textures));
});
