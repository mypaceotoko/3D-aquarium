import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─────────────────────────────────────────────────────────────────────────────
// Giant Ocean Aquarium — ジャイアントオーシャン水槽
// ─────────────────────────────────────────────────────────────────────────────

const OTANK = {
  minX: -55, maxX: 55,
  minY: -18, maxY: 16,
  minZ: -40, maxZ: 40,
  floorY: -18,
};

export function launch() {
  const canvas   = document.getElementById('stage');
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
                || window.matchMedia?.('(max-width: 780px)').matches;

  // ── Renderer ─────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping      = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (!isMobile) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  }

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = makeOceanBg();
  scene.fog = new THREE.FogExp2(0x001e3c, isMobile ? 0.007 : 0.009);

  // ── Camera ────────────────────────────────────────────────────────────────
  // Wide FOV + farther back to emphasize scale
  const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.2, 320);
  camera.position.set(0, 5, 60);

  // ── Controls ──────────────────────────────────────────────────────────────
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping   = true;
  orbit.dampingFactor   = 0.07;
  orbit.enablePan       = false;
  orbit.minDistance     = 10;
  orbit.maxDistance     = 140;
  orbit.minPolarAngle   = 0.08;
  orbit.maxPolarAngle   = Math.PI * 0.72;
  orbit.rotateSpeed     = 0.55;
  orbit.zoomSpeed       = 0.70;
  orbit.target.set(0, 0, 0);
  orbit.update();

  // ── Lights ───────────────────────────────────────────────────────────────
  const { caustic } = buildLights(scene, isMobile);

  // ── Environment ──────────────────────────────────────────────────────────
  buildFloor(scene, isMobile);
  const waterSurf  = buildWaterSurface(scene);
  buildSunRays(scene);
  const particles  = buildParticles(scene, isMobile);

  // ── UI ────────────────────────────────────────────────────────────────────
  buildUI();

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
  let paused = false;
  document.addEventListener('visibilitychange', () => { paused = document.hidden; });

  // ── Loop ──────────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    if (paused) return;
    const dt   = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // Caustic shimmer
    caustic.position.x  = Math.sin(time * 0.22) * 18;
    caustic.position.z  = Math.cos(time * 0.17) * 14;
    caustic.intensity   = 0.9 + Math.sin(time * 1.8) * 0.28;

    animateWater(waterSurf, time);
    animateParticles(particles, dt);

    orbit.update();
    renderer.render(scene, camera);
  }
  loop();
}

// ─── Background ───────────────────────────────────────────────────────────

function makeOceanBg() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const g    = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.00, '#1a7ab8');   // surface bright
  grad.addColorStop(0.18, '#0d5588');   // upper mid
  grad.addColorStop(0.55, '#072844');   // deep mid
  grad.addColorStop(1.00, '#010d1c');   // abyss
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Lights ───────────────────────────────────────────────────────────────

function buildLights(scene, isMobile) {
  scene.add(new THREE.AmbientLight(0x9ac8e8, 0.50));

  const sun = new THREE.DirectionalLight(0xc8e8ff, 1.80);
  sun.position.set(15, 50, 20);
  sun.target.position.set(0, OTANK.floorY, 0);
  scene.add(sun.target);
  if (!isMobile) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
    sun.shadow.camera.right = sun.shadow.camera.top  =  60;
    sun.shadow.camera.far   = 120;
    sun.shadow.bias         = -0.0006;
  }
  scene.add(sun);

  // Caustic shimmer — animated per frame
  const caustic = new THREE.PointLight(0x2090c8, 0.9, 90, 1.4);
  caustic.position.set(0, OTANK.floorY + 8, 0);
  scene.add(caustic);

  // Deep cold fill — makes far darkness feel oceanic
  const deep = new THREE.PointLight(0x002244, 0.35, 120, 1.2);
  deep.position.set(0, OTANK.floorY + 4, 0);
  scene.add(deep);

  // Side fill from the "surface" direction
  const rim = new THREE.PointLight(0x40aaee, 0.42, 150, 1.0);
  rim.position.set(-30, 14, -20);
  scene.add(rim);

  return { caustic };
}

// ─── Ocean floor ──────────────────────────────────────────────────────────

function buildFloor(scene, isMobile) {
  const W = 130, D = 90;
  const segX = isMobile ? 24 : 36;
  const segZ = isMobile ? 16 : 24;
  const geo = new THREE.PlaneGeometry(W, D, segX, segZ);

  // Gentle rock undulation
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i,
      (Math.random() - 0.5) * 0.55
      + Math.sin(x * 0.18) * 0.45
      + Math.cos(y * 0.14) * 0.38
      + Math.sin(x * 0.07 + y * 0.09) * 0.60,
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map:       makeRockTexture(),
    color:     0xffffff,
    roughness: 0.94,
    metalness: 0.0,
  });

  const floor = new THREE.Mesh(geo, mat);
  floor.rotation.x   = -Math.PI / 2;
  floor.position.y   = OTANK.floorY;
  floor.receiveShadow = !isMobile;
  scene.add(floor);

  // A few rock boulders for foreground depth
  buildBoulders(scene);
}

function makeRockTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // Dark stone base
  ctx.fillStyle = '#1a2535';
  ctx.fillRect(0, 0, W, H);

  // Rock strata / cracks
  for (let i = 0; i < 30; i++) {
    const y0 = Math.random() * H;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${30 + Math.random()*20},${45 + Math.random()*20},${65 + Math.random()*20},${0.12 + Math.random() * 0.18})`;
    ctx.lineWidth   = 0.5 + Math.random() * 2.5;
    ctx.moveTo(0, y0);
    for (let x = 0; x <= W; x += 8) {
      ctx.lineTo(x, y0 + Math.sin(x * 0.022) * 9 + (Math.random() - 0.5) * 4);
    }
    ctx.stroke();
  }

  // Sediment patches — lighter sandy deposits
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const r = 4 + Math.random() * 18;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(50,70,80,${0.12 + Math.random() * 0.12})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // Noise grain
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    d[i]   = Math.max(0, Math.min(255, d[i]   + n));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n * 0.92));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n * 0.80));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 7);
  return tex;
}

function buildBoulders(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.92, metalness: 0 });
  const defs = [
    { p: [18, -3], r: 2.8 }, { p: [-24, 5],  r: 3.5 }, { p: [40, -8],  r: 4.2 },
    { p: [-38, 2], r: 2.4 }, { p: [8,  -10], r: 1.9 }, { p: [-12, 8],  r: 2.2 },
  ];
  for (const d of defs) {
    const geo  = new THREE.SphereGeometry(d.r, isMobile ? 6 : 8, isMobile ? 5 : 6);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(d.p[0], OTANK.floorY + d.r * 0.55, d.p[1]);
    mesh.scale.set(1, 0.62 + Math.random() * 0.28, 1.1 + Math.random() * 0.4);
    mesh.rotation.y = Math.random() * Math.PI;
    scene.add(mesh);
  }
}

// ─── Water surface ────────────────────────────────────────────────────────

function buildWaterSurface(scene) {
  const geo = new THREE.PlaneGeometry(130, 90, 18, 12);
  const mat = new THREE.MeshStandardMaterial({
    color:       0x4ab8e8,
    roughness:   0.02,
    metalness:   0.28,
    transparent: true,
    opacity:     0.18,
    side:        THREE.FrontSide,
    depthWrite:  false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y  = OTANK.maxY - 0.1;
  scene.add(mesh);
  return mesh;
}

function animateWater(mesh, time) {
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i,
      Math.sin(x * 0.14 + time * 0.90) * 0.45
      + Math.sin(y * 0.18 + time * 0.72) * 0.35
      + Math.cos(x * 0.07 + y * 0.10 + time * 0.55) * 0.25,
    );
  }
  pos.needsUpdate = true;
}

// ─── Sun rays ─────────────────────────────────────────────────────────────

function buildSunRays(scene) {
  const mat = new THREE.MeshBasicMaterial({
    color:     0xaaddff,
    transparent: true,
    opacity:   0.028,
    side:      THREE.BackSide,
    depthWrite: false,
    blending:  THREE.AdditiveBlending,
  });
  // 12 rays spread across the wide tank
  const positions = [
    [-20, -10], [-5, 8], [12, -5], [28, 10], [-35, 4], [40, -12],
    [0, -18], [18, 15], [-12, -8], [35, 5], [-28, 12], [8, -2],
  ];
  for (const [x, z] of positions) {
    const m = mat.clone();
    m.opacity = 0.018 + Math.random() * 0.026;
    const len  = 30 + Math.random() * 18;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(4.5 + Math.random() * 4.0, len, 7), m,
    );
    cone.rotation.z = Math.PI;          // tip points down
    cone.position.set(x, OTANK.maxY - len * 0.45, z);
    scene.add(cone);
  }
}

// ─── Floating particles (plankton / bubbles) ──────────────────────────────

function buildParticles(scene, isMobile) {
  const count = isMobile ? 180 : 350;
  const geo   = new THREE.BufferGeometry();
  const pos   = new Float32Array(count * 3);
  const vel   = new Float32Array(count);      // upward drift speed per particle

  for (let i = 0; i < count; i++) {
    pos[i * 3]     = THREE.MathUtils.randFloatSpread(OTANK.maxX * 1.8);
    pos[i * 3 + 1] = THREE.MathUtils.randFloat(OTANK.floorY, OTANK.maxY);
    pos[i * 3 + 2] = THREE.MathUtils.randFloatSpread(OTANK.maxZ * 1.8);
    vel[i]         = 0.06 + Math.random() * 0.14;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    color:       0x88ccff,
    size:        isMobile ? 0.22 : 0.18,
    transparent: true,
    opacity:     0.35,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, vel };
}

function animateParticles({ points, vel }, dt) {
  const pos = points.geometry.attributes.position;
  const n   = pos.count;
  for (let i = 0; i < n; i++) {
    let y = pos.getY(i) + vel[i] * dt;
    if (y > OTANK.maxY + 1) {
      y = OTANK.floorY - 0.5;
      pos.setX(i, THREE.MathUtils.randFloatSpread(OTANK.maxX * 1.8));
      pos.setZ(i, THREE.MathUtils.randFloatSpread(OTANK.maxZ * 1.8));
    }
    pos.setY(i, y);
  }
  pos.needsUpdate = true;
}

// ─── Minimal UI ───────────────────────────────────────────────────────────

function buildUI() {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed',
    'bottom:max(18px,env(safe-area-inset-bottom))',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:100',
    'display:flex',
    'gap:8px',
    'padding:10px',
    'border-radius:18px',
    'background:rgba(0,20,40,0.42)',
    'backdrop-filter:blur(14px)',
    '-webkit-backdrop-filter:blur(14px)',
    'border:1px solid rgba(80,180,255,0.18)',
    'box-shadow:0 8px 36px rgba(0,0,0,0.45)',
  ].join(';');

  const back = document.createElement('button');
  back.textContent = '← 水槽選択';
  back.style.cssText = [
    'appearance:none',
    'border:1px solid rgba(80,180,255,0.22)',
    'background:rgba(0,15,35,0.60)',
    'color:#b8e0ff',
    'padding:8px 14px',
    'border-radius:12px',
    'font:inherit',
    'font-size:12px',
    'letter-spacing:0.04em',
    'cursor:pointer',
    'white-space:nowrap',
  ].join(';');
  back.addEventListener('click', () => location.reload());
  panel.appendChild(back);
  document.body.appendChild(panel);
}
