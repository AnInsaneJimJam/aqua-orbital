'use client';

import {useEffect, useRef, useState} from 'react';
import {ORBIT_PERIOD_MS, PLANET_DIAMETER, SATURN_HEIGHT, SATURN_WIDTH, TOKEN_COLORS, TOKEN_TEXTURES, orbitTiles, planetCells, tilePosition} from './saturnScene';
import styles from './Saturn.module.css';

export default function Saturn() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const tiles = orbitTiles();
    const textures = TOKEN_TEXTURES.map(name => {
      const texture = new Image();
      texture.src = `/brand/tokens/${name}.svg`;
      return texture;
    });
    const planet = document.createElement('canvas');
    planet.width = planet.height = PLANET_DIAMETER * 2;
    const planetContext = planet.getContext('2d');
    if (!planetContext) return;
    planetContext.scale(2, 2);
    planetContext.fillStyle = '#050505';
    planetContext.beginPath();
    planetContext.arc(190, 190, 190, 0, Math.PI * 2);
    planetContext.fill();
    planetContext.fillStyle = '#F5F5F2';
    for (const cell of planetCells()) {
      planetContext.globalAlpha = cell.opacity;
      planetContext.fillRect(cell.x, cell.y, 4.5, 4.5);
    }
    let disposed = false, loaded = false, visible = false, constrained = false;
    let request = 0, elapsed = 0, previous: number | undefined;

    const draw = () => {
      if (!loaded || disposed) return;
      context.setTransform(canvas.width / SATURN_WIDTH, 0, 0, canvas.height / SATURN_HEIGHT, 0, 0);
      context.clearRect(0, 0, SATURN_WIDTH, SATURN_HEIGHT);
      const frame = tiles.filter((_, index) => !constrained || index % 2 === 0).map(tile => ({tile, position: tilePosition(tile, elapsed)}));
      const layer = (front: boolean) => {
        for (const {tile, position: p} of frame) {
          if (p.front !== front) continue;
          context.globalAlpha = p.opacity;
          context.fillStyle = TOKEN_COLORS[tile.token]!;
          context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          context.drawImage(textures[tile.token]!, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      };
      layer(false);
      context.globalAlpha = 1;
      context.drawImage(planet, (SATURN_WIDTH - PLANET_DIAMETER) / 2, (SATURN_HEIGHT - PLANET_DIAMETER) / 2, PLANET_DIAMETER, PLANET_DIAMETER);
      layer(true);
      context.globalAlpha = 1;
    };
    const animate = (time: number) => {
      if (previous !== undefined) elapsed = (elapsed + time - previous) % ORBIT_PERIOD_MS;
      previous = time;
      draw();
      request = window.requestAnimationFrame(animate);
    };
    const sync = () => {
      if (disposed) return;
      const run = loaded && visible && !document.hidden && !preference.matches;
      if (run && !request) request = window.requestAnimationFrame(animate);
      if (!run) {
        window.cancelAnimationFrame(request);
        request = 0;
        previous = undefined;
        draw();
      }
    };
    const resize = () => {
      const width = canvas.getBoundingClientRect().width;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(width * ratio * SATURN_HEIGHT / SATURN_WIDTH));
      constrained = width < 600 || navigator.hardwareConcurrency <= 4;
      draw();
    };
    const observer = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; sync(); }, {threshold: 0.05});
    observer.observe(canvas);
    const resizer = new ResizeObserver(resize);
    resizer.observe(canvas);
    preference.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    resize();
    sync();
    void Promise.all(textures.map(texture => texture.decode())).then(() => {
      if (disposed) return;
      loaded = true;
      draw();
      setReady(true);
      sync();
    }).catch(() => { /* The complete static SVG remains visible if textures cannot load. */ });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(request);
      observer.disconnect();
      resizer.disconnect();
      preference.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return <figure className={`${styles.scene} ${ready ? styles.ready : ''}`} aria-label="Abstract stablecoin orbit">
    <img className={styles.fallback} src="/brand/saturn-static.svg" width={960} height={400} alt="" aria-hidden="true"/>
    <canvas ref={canvasRef} className={styles.canvas} width={960} height={400} aria-hidden="true"/>
  </figure>;
}
