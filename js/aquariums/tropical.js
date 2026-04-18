import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TANK } from '../scene.js';
import { Creature } from '../creatures/Creature.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tropical aquarium — bright, warm, reef scene
// ─────────────────────────────────────────────────────────────────────────────

export function launch() {
  const canvas   = document.getElementById('stage');
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
                || window.matchMedia?.('(max-width: 780px)').matches;

  // ── Renderer ─────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false,
    powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  if (!isMobile) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = makeBgTexture();
  scene.fog = new THREE.FogExp2(0x38b8d8, isMobile ? 0.013 : 0.017);

  const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 140);
  camera.position.set(0, 3.5, 32);

  const state = { food: { active: false, position: new THREE.Vector3() } };

  // ── Lights ───────────────────────────────────────────────────────────────
  const caustic = buildLights(scene, isMobile);

  // ── Environment ──────────────────────────────────────────────────────────
  buildFloor(scene);
  buildCorals(scene);
  const waterSurf = buildWaterSurface(scene);
  buildSunRays(scene);
  const seaweeds  = buildSeaweed(scene);

  // ── Creatures ────────────────────────────────────────────────────────────
  const creatures = [];
  const counts = isMobile
    ? { clown: 2, tetra: 6, turtle: 1 }
    : { clown: 3, tetra: 10, turtle: 1 };

  for (let i = 0; i < counts.clown;  i++) creatures.push(add(scene, new Clownfish()));
  for (let i = 0; i < counts.tetra;  i++) creatures.push(add(scene, new NeonTetra()));
  creatures.push(add(scene, new SeaTurtle()));

  // ── Camera controls ──────────────────────────────────────────────────────
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.dampingFactor  = 0.08;
  orbit.enablePan      = false;
  orbit.minDistance    = 6;
  orbit.maxDistance    = 50;
  orbit.minPolarAngle  = 0.15;
  orbit.maxPolarAngle  = Math.PI * 0.62;
  orbit.rotateSpeed    = 0.6;
  orbit.zoomSpeed      = 0.75;

  // ── Minimal UI ───────────────────────────────────────────────────────────
  buildUI();

  // ── Lifecycle ────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
  let paused = false;
  document.addEventListener('visibilitychange', () => { paused = document.hidden; });

  // ── Loop ─────────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    if (paused) return;
    const dt   = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // Animate caustic shimmer
    caustic.position.x = Math.sin(time * 0.38) * 9;
    caustic.position.z = Math.cos(time * 0.27) * 7;
    caustic.intensity  = 1.2 + Math.sin(time * 2.1) * 0.35;
    animateWater(waterSurf, time);
    for (const sw of seaweeds) {
      sw.rotation.z = Math.sin(time * 0.72 + sw.userData.phase) * 0.22;
    }

    for (const c of creatures) c.update(dt, time, state);
    orbit.update();
    renderer.render(scene, camera);
  }
  loop();
}

function add(scene, c) { scene.add(c.mesh); return c; }

// ─── Minimal UI (back button) ─────────────────────────────────────────────

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
    'background:rgba(0,60,80,0.38)',
    'backdrop-filter:blur(14px)',
    '-webkit-backdrop-filter:blur(14px)',
    'border:1px solid rgba(140,220,255,0.18)',
    'box-shadow:0 8px 36px rgba(0,0,0,0.3)',
  ].join(';');

  const back = document.createElement('button');
  back.textContent = '← 水槽選択';
  back.style.cssText = [
    'appearance:none',
    'border:1px solid rgba(140,220,255,0.18)',
    'background:rgba(0,30,50,0.55)',
    'color:#d8f2ff',
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

// ─── Scene environment ────────────────────────────────────────────────────

function makeBgTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#7adaf8');  // surface bright
  grad.addColorStop(0.30, '#29a8d8');  // mid water
  grad.addColorStop(1.00, '#0c4a6a');  // depth
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildLights(scene, isMobile) {
  scene.add(new THREE.AmbientLight(0xc8eeff, 0.88));

  const sun = new THREE.DirectionalLight(0xfff5cc, 2.4);
  sun.position.set(10, 30, 15);
  sun.target.position.set(0, TANK.floorY, 0);
  scene.add(sun.target);
  if (!isMobile) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
    sun.shadow.camera.right = sun.shadow.camera.top = 30;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0006;
  }
  scene.add(sun);

  // Caustic shimmer — animated in loop
  const caustic = new THREE.PointLight(0x40e8c8, 1.4, 42, 1.6);
  caustic.position.set(0, TANK.floorY + 5, 0);
  scene.add(caustic);

  // Warm coral rim from the right
  const rim = new THREE.PointLight(0xff8844, 0.55, 55, 1.8);
  rim.position.set(20, 2, -12);
  scene.add(rim);

  return caustic;
}

function buildFloor(scene) {
  const mat = new THREE.MeshStandardMaterial({
    map: makeSandTexture(), color: 0xffffff, roughness: 0.90, metalness: 0,
  });
  const geo = new THREE.PlaneGeometry(64, 44, 22, 16);
  // Gentle sandy undulation (Z = world Y after rotation)
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, (Math.random() - 0.5) * 0.20
                + Math.sin(x * 0.38) * 0.14 + Math.cos(y * 0.28) * 0.10);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const floor = new THREE.Mesh(geo, mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y  = TANK.floorY;
  floor.receiveShadow = true;
  scene.add(floor);
}

function buildCorals(scene) {
  const defs = [
    { pos: [ 7,  4],  color: 0xff5555, h: 2.4, r: 0.38 },
    { pos: [-9, -2],  color: 0xff8820, h: 1.8, r: 0.30 },
    { pos: [13, -6],  color: 0xcc40cc, h: 3.0, r: 0.42 },
    { pos: [-15, 7],  color: 0xff4488, h: 2.1, r: 0.34 },
    { pos: [ 1, -9],  color: 0x44c8ff, h: 2.6, r: 0.38 },
    { pos: [19,  5],  color: 0xffaa22, h: 1.5, r: 0.26 },
    { pos: [-19,-5],  color: 0xff4466, h: 2.2, r: 0.33 },
    { pos: [ 5, 12],  color: 0x88ddff, h: 1.7, r: 0.28 },
    { pos: [-5,-12],  color: 0xff6688, h: 2.0, r: 0.30 },
  ];
  for (const d of defs) {
    const g = new THREE.Group();
    g.position.set(d.pos[0], TANK.floorY, d.pos[1]);
    makeCoral(g, d.color, d.h, d.r);
    scene.add(g);
  }
}

function makeCoral(group, color, h, r) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    emissive: new THREE.Color(color).multiplyScalar(0.10),
  });
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r * 0.58, h, 8), mat);
  stalk.position.y = h * 0.5;
  stalk.castShadow = true;
  group.add(stalk);

  const top = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
  top.position.y = h;
  top.castShadow = true;
  group.add(top);

  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + Math.random() * 0.6;
    const bh  = h * THREE.MathUtils.randFloat(0.28, 0.62);
    const br  = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.28, h * 0.52, 6), mat);
    br.position.set(Math.cos(ang) * r * 1.1, bh, Math.sin(ang) * r * 1.1);
    br.rotation.z = Math.cos(ang) * 0.48;
    br.rotation.x = Math.sin(ang) * 0.48;
    group.add(br);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.52, 8, 6), mat);
    tip.position.set(Math.cos(ang) * r * 1.55, bh + h * 0.28, Math.sin(ang) * r * 1.55);
    group.add(tip);
  }
}

// ─── Clownfish (クマノミ) ─────────────────────────────────────────────────

class Clownfish extends Creature {
  constructor() {
    super({
      species: 'clownfish',
      mesh: makeClownfishMesh(),
      cfg: {
        speed: 1.8, maxAccel: 1.5, turnRate: 1.7,
        depthMin: TANK.floorY + 1.5, depthMax: TANK.floorY + 9,
        wanderMin: 3, wanderMax: 7, wallMargin: 5,
        facesVelocity: true,
      },
    });
    this._phase = Math.random() * Math.PI * 2;
  }
  onUpdate(dt, time) {
    this.mesh.rotation.y = Math.sin(time * 4.2 + this._phase) * 0.16 * (0.5 + this.speedNorm * 0.5);
  }
}

function makeClownfishMesh() {
  const g = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xff5808, roughness: 0.55, metalness: 0.08 });
  const white  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.08 });
  const dark   = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 9), orange);
  body.scale.set(1.55, 1.0, 0.80);
  g.add(body);

  for (const x of [-0.04, 0.30]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.11, 14), white);
    s.rotation.z = Math.PI / 2;
    s.position.x = x;
    g.add(s);
  }

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.34, 8), orange);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.74;
  g.add(tail);

  // Dorsal fin
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 6), orange);
  fin.position.set(0.05, 0.44, 0);
  g.add(fin);

  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 7, 6), dark);
  eye.position.set(0.54, 0.14, 0.28);
  g.add(eye);

  g.scale.setScalar(0.65);
  return g;
}

// ─── Neon Tetra (ネオンテトラ) ─────────────────────────────────────────────

class NeonTetra extends Creature {
  constructor() {
    super({
      species: 'neon-tetra',
      mesh: makeNeonTetraMesh(),
      cfg: {
        speed: 2.5, maxAccel: 2.2, turnRate: 2.4,
        depthMin: TANK.floorY + 3, depthMax: TANK.maxY - 3,
        wanderMin: 4, wanderMax: 10, wallMargin: 5,
        facesVelocity: true,
      },
    });
    this._phase = Math.random() * Math.PI * 2;
  }
  onUpdate(dt, time) {
    this.mesh.rotation.y = Math.sin(time * 6.0 + this._phase) * 0.13 * (0.4 + this.speedNorm * 0.6);
  }
}

function makeNeonTetraMesh() {
  const g = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xb8dcc8, roughness: 0.5, metalness: 0.18 });
  const blue   = new THREE.MeshStandardMaterial({
    color: 0x0088ff, roughness: 0.4,
    emissive: new THREE.Color(0x003acc), emissiveIntensity: 0.55,
  });
  const red    = new THREE.MeshStandardMaterial({
    color: 0xff1818, roughness: 0.4,
    emissive: new THREE.Color(0x880000), emissiveIntensity: 0.38,
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 7), silver);
  body.scale.set(2.5, 1.0, 0.68);
  g.add(body);

  const blueBar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.065, 0.34), blue);
  blueBar.position.set(0, 0.065, 0);
  g.add(blueBar);

  const redBar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.075, 0.34), red);
  redBar.position.set(-0.20, 0, 0);
  g.add(redBar);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.20, 6), silver);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.52;
  g.add(tail);

  g.scale.setScalar(0.5);
  return g;
}

// ─── Sea Turtle (ウミガメ) ────────────────────────────────────────────────

class SeaTurtle extends Creature {
  constructor() {
    const mesh = makeSeaTurtleMesh();
    super({
      species: 'sea-turtle',
      mesh,
      cfg: {
        speed: 0.85, maxAccel: 0.45, turnRate: 0.55,
        depthMin: TANK.floorY + 2, depthMax: TANK.maxY - 2,
        wanderMin: 12, wanderMax: 22, wallMargin: 7,
        facesVelocity: true,
      },
    });
    this._phase    = Math.random() * Math.PI * 2;
    this._flippers = mesh.userData.flippers;
  }
  onUpdate(dt, time) {
    const flap = Math.sin(time * 1.4 + this._phase) * 0.28;
    for (const fl of this._flippers) fl.rotation.z = fl.userData.rz + flap;
  }
}

function makeSeaTurtleMesh() {
  const g       = new THREE.Group();
  const shell   = new THREE.MeshStandardMaterial({ color: 0x2d7040, roughness: 0.78, metalness: 0.04 });
  const skin    = new THREE.MeshStandardMaterial({ color: 0x3c8852, roughness: 0.68, metalness: 0.04 });
  const plate   = new THREE.MeshStandardMaterial({ color: 0x1e4a2c, roughness: 0.82 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.82, 12, 9), shell);
  body.scale.set(1.4, 0.58, 1.08);
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 9, 7), skin);
  head.position.set(1.15, 0.04, 0);
  head.scale.set(1.2, 0.9, 0.85);
  g.add(head);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 7), skin);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-1.24, -0.04, 0);
  g.add(tail);

  // Decorative shell plates
  for (let i = 0; i < 5; i++) {
    const ang  = (i / 5) * Math.PI * 2;
    const pl   = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.30), plate);
    pl.position.set(Math.cos(ang) * 0.44, 0.42, Math.sin(ang) * 0.35);
    pl.rotation.y = ang;
    g.add(pl);
  }

  // Flippers
  const flippers = [];
  for (const [sx, sz, rz] of [
    [ 0.28,  0.88, -0.48],
    [ 0.28, -0.88,  0.48],
    [-0.28,  0.88, -0.38],
    [-0.28, -0.88,  0.38],
  ]) {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.22, 0.72, 8), skin);
    fl.rotation.x = Math.PI / 2;
    fl.rotation.z = rz;
    fl.position.set(sx, -0.10, sz);
    fl.userData.rz = rz;
    g.add(fl);
    flippers.push(fl);
  }

  g.scale.setScalar(0.92);
  g.userData.flippers = flippers;
  return g;
}

// ─── Water surface ────────────────────────────────────────────────────────

function buildWaterSurface(scene) {
  // Coarse grid so per-vertex wave animation stays cheap
  const geo = new THREE.PlaneGeometry(68, 46, 14, 10);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x88ddff, roughness: 0.02, metalness: 0.22,
    transparent: true, opacity: 0.16,
    side: THREE.FrontSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y  = TANK.maxY - 0.05;
  scene.add(mesh);
  return mesh;
}

function animateWater(mesh, time) {
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i,
      Math.sin(x * 0.24 + time * 1.3) * 0.20 +
      Math.sin(y * 0.30 + time * 1.0) * 0.15 +
      Math.cos(x * 0.12 + y * 0.18 + time * 0.75) * 0.10,
    );
  }
  pos.needsUpdate = true;
}

// ─── Sun rays ─────────────────────────────────────────────────────────────

function buildSunRays(scene) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffeeaa, transparent: true, opacity: 0.032,
    side: THREE.BackSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const positions = [
    [-9, 4], [0, 2], [11, -4], [-14, -8],
    [5, 10], [17, 5], [-3, -12], [8, -6],
  ];
  for (const [x, z] of positions) {
    const m = mat.clone();
    m.opacity = 0.022 + Math.random() * 0.024;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(3.0 + Math.random() * 2.5, 22, 7), m,
    );
    cone.rotation.z = Math.PI;  // tip points down
    cone.position.set(x, TANK.maxY - 10, z);
    scene.add(cone);
  }
}

// ─── Seaweed ──────────────────────────────────────────────────────────────

function buildSeaweed(scene) {
  const colors = [0x28a848, 0x1e8838, 0x3ab858, 0x209040];
  const blades  = [];
  for (let i = 0; i < 16; i++) {
    const h   = THREE.MathUtils.randFloat(1.6, 3.8);
    const geo = new THREE.PlaneGeometry(0.26 + Math.random() * 0.18, h, 1, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: colors[i % colors.length],
      roughness: 0.75,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82 + Math.random() * 0.12,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      THREE.MathUtils.randFloatSpread(44),
      TANK.floorY + h * 0.5,
      THREE.MathUtils.randFloatSpread(30),
    );
    mesh.rotation.y    = Math.random() * Math.PI;
    mesh.userData.phase = Math.random() * Math.PI * 2;
    scene.add(mesh);
    blades.push(mesh);
  }
  return blades;
}

// ─── Sand texture ─────────────────────────────────────────────────────────

function makeSandTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // Base warm sand
  ctx.fillStyle = '#f0d870';
  ctx.fillRect(0, 0, W, H);

  // Ripple lines
  for (let i = 0; i < 24; i++) {
    const y0 = i * 22 + Math.random() * 8;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(155,115,35,${0.07 + Math.random() * 0.09})`;
    ctx.lineWidth   = 0.7 + Math.random() * 1.5;
    ctx.moveTo(0, y0);
    for (let x = 0; x <= W; x += 6) {
      ctx.lineTo(x, y0 + Math.sin(x * 0.038) * 4.5 + Math.sin(x * 0.016) * 2.8);
    }
    ctx.stroke();
  }

  // Shell / pebble dots
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const r = 0.8 + Math.random() * 2.8;
    ctx.globalAlpha = 0.14 + Math.random() * 0.14;
    ctx.fillStyle   = Math.random() < 0.5 ? '#c8a040' : '#e8c870';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Subtle noise grain
  const img = ctx.getImageData(0, 0, W, H);
  const d   = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i]   = Math.max(0, Math.min(255, d[i]   + n));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n * 0.88));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n * 0.52));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 5);
  return tex;
}
