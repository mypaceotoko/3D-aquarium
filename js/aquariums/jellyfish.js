import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TANK } from '../scene.js';
import { MoonJellyfish }    from '../creatures/jellies/MoonJellyfish.js';
import { RedJellyfish }     from '../creatures/jellies/RedJellyfish.js';
import { NomuraJellyfish }  from '../creatures/jellies/NomuraJellyfish.js';
import { SpottedJellyfish } from '../creatures/jellies/SpottedJellyfish.js';
import { CrystalJellyfish } from '../creatures/jellies/CrystalJellyfish.js';
import { initObservation }  from '../interaction/observationManager.js';

// ─────────────────────────────────────────────────────────────────────────────
// クラゲ幻想水槽 — まず動く最低限のシーン
// 環境演出 (caustics / god rays / plankton / bubbles / 水面) は後続実装。
// 観測UI / 音声 / 餌 も後続。
// ─────────────────────────────────────────────────────────────────────────────

export function launch() {
  const canvas   = document.getElementById('stage');
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
                || window.matchMedia?.('(max-width: 780px)').matches;

  // ── Renderer ─────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: !isMobile, alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace      = THREE.SRGBColorSpace;
  renderer.toneMapping           = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure   = 1.10;

  // ── Scene ────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = makeBgTexture();
  scene.fog = new THREE.FogExp2(0x0a0820, isMobile ? 0.024 : 0.030);

  const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 140);
  camera.position.set(0, 2.5, 30);

  // ── Lights (仮) ──────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x405078, 0.65));

  const key = new THREE.DirectionalLight(0xc8d8ff, 0.8);
  key.position.set(4, 22, 6);
  scene.add(key);

  const fillViolet = new THREE.PointLight(0x8050d0, 1.0, 70, 1.6);
  fillViolet.position.set(-14, 4, -8);
  scene.add(fillViolet);

  const fillCyan = new THREE.PointLight(0x40c8e0, 0.8, 70, 1.7);
  fillCyan.position.set(16, -2, 10);
  scene.add(fillCyan);

  // ── God rays (上から差し込む薄紫〜シアンの光柱) ──────────────────────────
  const rays = buildGodRays(scene, isMobile);

  // ── Creatures ────────────────────────────────────────────────────────────
  const creatures = [];
  const counts = isMobile
    ? { moon: 4, red: 2, nomura: 1, spotted: 4, crystal: 4 }
    : { moon: 6, red: 3, nomura: 2, spotted: 6, crystal: 6 };
  for (let i = 0; i < counts.moon;    i++) creatures.push(addCreature(scene, new MoonJellyfish()));
  for (let i = 0; i < counts.red;     i++) creatures.push(addCreature(scene, new RedJellyfish()));
  for (let i = 0; i < counts.nomura;  i++) creatures.push(addCreature(scene, new NomuraJellyfish()));
  for (let i = 0; i < counts.spotted; i++) creatures.push(addCreature(scene, new SpottedJellyfish()));
  for (let i = 0; i < counts.crystal; i++) creatures.push(addCreature(scene, new CrystalJellyfish()));

  // ── Camera controls ──────────────────────────────────────────────────────
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.enablePan     = false;
  orbit.minDistance   = 6;
  orbit.maxDistance   = 50;
  orbit.minPolarAngle = 0.15;
  orbit.maxPolarAngle = Math.PI * 0.62;

  // ── Observation system (タップで種名・追従) ───────────────────────────────
  const obs = initObservation({ camera, orbit, canvas, getCreatures: () => creatures });

  // ── Lifecycle ────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
  let paused = false;
  document.addEventListener('visibilitychange', () => { paused = document.hidden; });

  // ── Loop ─────────────────────────────────────────────────────────────────
  const state = { food: { active: false, position: new THREE.Vector3() } };
  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    if (paused) return;
    const dt   = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    for (const c of creatures) c.update(dt, time, state);
    animateRays(rays, dt, time);
    obs.update(dt);
    if (!obs.isObserving) orbit.update();
    renderer.render(scene, camera);
  }
  loop();
}

function addCreature(scene, c) { scene.add(c.mesh); return c; }

// ─── God rays — 紫とシアンを混ぜた幻想的な光柱 ────────────────────────────
function buildGodRays(scene, isMobile) {
  const rayCount = isMobile ? 5 : 9;
  const tex = makeRayTexture();
  // 2色をランダム配分: 薄紫 / 淡シアン
  const tints = [0xb088ff, 0x88c8ff, 0xc098ff, 0x70b8e8];
  const group = new THREE.Group();
  const rays = [];
  for (let i = 0; i < rayCount; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.22 + Math.random() * 0.18,
      color: tints[i % tints.length], side: THREE.DoubleSide, fog: true,
    });
    const geo = new THREE.PlaneGeometry(7 + Math.random() * 5, 44);
    const m = new THREE.Mesh(geo, mat);
    const ang = (i / rayCount) * Math.PI * 2 + Math.random() * 0.5;
    const r = 5 + Math.random() * 16;
    m.position.set(Math.cos(ang) * r, 6, Math.sin(ang) * r);
    m.rotation.y = Math.random() * Math.PI;
    m.rotation.z = (Math.random() - 0.5) * 0.20;
    m.userData.phase = Math.random() * Math.PI * 2;
    m.userData.baseX = m.position.x;
    m.userData.baseZ = m.position.z;
    m.userData.baseOpacity = mat.opacity;
    rays.push(m);
    group.add(m);
  }
  scene.add(group);
  return rays;
}

function makeRayTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  grad.addColorStop(0.00, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.40, 'rgba(200,180,255,0.40)');
  grad.addColorStop(1.00, 'rgba(40,20,80,0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

function animateRays(rays, dt, time) {
  for (const r of rays) {
    r.position.x = r.userData.baseX + Math.sin(time * 0.10 + r.userData.phase) * 0.9;
    r.position.z = r.userData.baseZ + Math.cos(time * 0.08 + r.userData.phase) * 0.7;
    r.rotation.y += dt * 0.03;
    // 緩やかな明滅
    r.material.opacity = r.userData.baseOpacity * (0.85 + 0.15 * Math.sin(time * 0.5 + r.userData.phase));
  }
}

// 仮の背景 — 紫〜深青のグラデーション
function makeBgTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#1a0a3a');
  grad.addColorStop(0.35, '#0a1850');
  grad.addColorStop(0.75, '#040820');
  grad.addColorStop(1.00, '#01030a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
