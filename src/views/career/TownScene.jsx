import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// "Town" design: an isometric career town drawn like the sticky-notes town board (paper, ink outlines,
// taxis). Each phase is a building with one floor per topic; learned topics are filled with the phase
// colour. Props are read every frame through a ref; the scene only rebuilds when phases or topic
// counts change.
const INK = 0x1c2024;
const FLOOR = 0.3;
const GAP = 0.04;

// Up to 6 districts in two rows either side of Career Ave; more phases add a third row behind.
const spot = (k) => [((k % 3) - 1) * 4, k < 3 ? -2.7 : k < 6 ? 2.7 : -6.4 - Math.floor((k - 6) / 3) * 3.7];

export default function TownScene({ phases, hover, now, onPick, onHover, className }) {
  const canvasRef = useRef(null);
  const live = useRef({});
  live.current = { phases, hover, now, onPick, onHover };
  const key = phases.map((p) => `${p.color}:${p.topics.length}`).join();

  useEffect(() => {
    const el = canvasRef.current;
    const host = el.parentNode;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe3da, 2.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 12, 3);
    scene.add(sun);

    const edgeMat = new THREE.LineBasicMaterial({ color: INK });
    const inked = (geo, color, parent) => {
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
      parent.add(m);
      return m;
    };

    const rows = Math.max(1, Math.ceil((phases.length - 6) / 3));
    const depth = phases.length > 6 ? 9 + rows * 3.7 : 9;
    const plate = inked(new THREE.BoxGeometry(13, 0.3, depth), 0xfafbf8, scene);
    plate.position.set(0, -0.15, -(depth - 9) / 2);
    inked(new THREE.BoxGeometry(13, 0.06, 1.5), 0x3a3f45, scene).position.y = 0.03;
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dashGeo = new THREE.BoxGeometry(0.5, 0.02, 0.07);
    const dashes = Array.from({ length: 13 }, () => {
      const m = new THREE.Mesh(dashGeo, dashMat);
      m.position.y = 0.07;
      scene.add(m);
      return m;
    });

    const white = new THREE.Color(0xffffff);
    const buildings = phases.map((ph, k) => {
      const color = new THREE.Color(ph.color), light = white.clone().lerp(color, 0.22), hot = color.clone().lerp(white, 0.45);
      const g = new THREE.Group();
      const [x, z] = spot(k);
      g.position.set(x, 0, z);
      scene.add(g);
      const tile = inked(new THREE.BoxGeometry(3.2, 0.08, 3), light, g);
      tile.position.y = 0.04;
      const tower = new THREE.Group();
      tower.position.y = 0.08;
      g.add(tower);
      const floors = ph.topics.map((_, j) => {
        const f = inked(new THREE.BoxGeometry(1.5, FLOOR, 1.5), 0xffffff, tower);
        f.position.y = FLOOR / 2 + j * (FLOOR + GAP);
        f.userData = { phase: k, pop: 0 };
        return f;
      });
      for (const [tx, tz] of [[-1.1, 0.95], [1.15, -0.9]]) inked(new THREE.ConeGeometry(0.28, 0.7, 6), 0x3bb57c, g).position.set(tx, 0.45, tz);
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 64;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#1c2024';
      ctx.lineWidth = 6;
      ctx.fillRect(8, 8, 112, 48);
      ctx.strokeRect(8, 8, 112, 48);
      ctx.fillStyle = '#1c2024';
      ctx.font = '600 30px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(k + 1).padStart(2, '0'), 64, 33);
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
      sign.scale.set(0.9, 0.45, 1);
      g.add(sign);
      return { tower, floors, color, light, hot, tile, sign, lit: [] };
    });
    const allFloors = buildings.flatMap((b) => b.floors);

    const makeTaxi = () => {
      const t = new THREE.Group();
      inked(new THREE.BoxGeometry(0.9, 0.28, 0.42), 0xffc93c, t).position.y = 0.22;
      inked(new THREE.BoxGeometry(0.42, 0.2, 0.36), INK, t).position.set(-0.05, 0.46, 0);
      scene.add(t);
      return t;
    };
    const taxiA = makeTaxi(), taxiB = makeTaxi();
    taxiA.position.z = -0.38;
    taxiB.position.z = 0.38;
    taxiB.rotation.y = Math.PI;

    // Hover / click a building
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    const pick = (e) => {
      const r = el.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObjects(allFloors, false)[0];
      return hit ? hit.object.userData.phase : -1;
    };
    let hovered = -1;
    const onMove = (e) => {
      const k = pick(e);
      el.style.cursor = k >= 0 ? 'pointer' : 'default';
      if (k !== hovered) live.current.onHover?.((hovered = k));
    };
    const onLeave = () => hovered >= 0 && live.current.onHover?.((hovered = -1));
    const onClick = (e) => {
      const k = pick(e);
      if (k >= 0) live.current.onPick?.(k);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('click', onClick);

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight, s = (w < 520 ? 6.6 : 5.6) * (phases.length > 6 ? 1.3 : 1), a = w / h;
      renderer.setSize(w, h, false);
      Object.assign(camera, { left: -s * a, right: s * a, top: s, bottom: -s });
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let raf = 0;
    const timer = new THREE.Timer();
    const tick = (nowMs) => {
      timer.update(nowMs);
      const time = timer.getElapsed(), { phases: data, hover: hov, now: nowIdx } = live.current;
      buildings.forEach((b, k) => {
        // Floors follow the learned topics; a floor that changes pops.
        b.floors.forEach((f, j) => {
          const on = !!data[k]?.topics[j];
          if (b.lit[j] !== on) {
            f.material.color.set(on ? b.color : 0xffffff);
            if (b.lit[j] !== undefined && !reduce) f.userData.pop = 1;
            b.lit[j] = on;
          }
          if (f.userData.pop) {
            f.userData.pop = Math.max(0, f.userData.pop - 0.06);
            const s = 1 + Math.sin(f.userData.pop * Math.PI) * 0.25;
            f.scale.set(s, 1, s);
          }
        });
        // Rise from the ground on load, staggered
        const grow = reduce ? 1 : Math.min(1, Math.max(0, (time - 0.2 - k * 0.12) / 0.9));
        const e = 1 - (1 - grow) ** 3;
        const active = k === hov;
        const hop = active && !reduce ? Math.abs(Math.sin(time * 5)) * 0.18 : 0;
        b.tower.scale.y = Math.max(0.001, e);
        b.tower.position.y = 0.08 + hop;
        b.tile.material.color.copy(active ? b.hot : b.light);
        const bob = k === nowIdx && !reduce ? Math.sin(time * 3) * 0.08 : 0;
        b.sign.position.y = b.floors.length * (FLOOR + GAP) * e + 0.6 + hop + bob;
      });
      if (!reduce) {
        taxiA.position.x = ((time * 1.6) % 15) - 7.5;
        taxiB.position.x = 7.5 - ((time * 1.1 + 6) % 15);
        dashes.forEach((d, i) => (d.position.x = ((i + time * 0.8) % 13) - 6.5));
      } else {
        taxiA.position.x = -2;
        taxiB.position.x = 3;
        dashes.forEach((d, i) => (d.position.x = i - 6.5));
      }
      camera.position.set(10 + (reduce ? 0 : Math.sin(time * 0.25) * 0.6), 9, 10);
      camera.lookAt(0, 0.6, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('click', onClick);
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material !== edgeMat) {
          o.material?.map?.dispose();
          o.material?.dispose();
        }
      });
      edgeMat.dispose();
      renderer.dispose();
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Career town: one building per roadmap phase, a floor for each topic learned"
      className={className}
    />
  );
}
