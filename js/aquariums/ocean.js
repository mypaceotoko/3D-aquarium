import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Creature } from '../creatures/Creature.js';
import { initObservation } from '../interaction/observationManager.js';
import { initAquariumAudio } from '../audio-aquarium.js';

// ─────────────────────────────────────────────────────────────────────────────
// Giant Ocean Aquarium — ジャイアントオーシャン水槽
// ─────────────────────────────────────────────────────────────────────────────

const OTANK = {
  minX: -72, maxX: 72,
  minY: -20, maxY: 18,
  minZ: -54, maxZ: 54,
  floorY: -20,
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
  renderer.toneMappingExposure = 1.15;
  if (!isMobile) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  }

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = makeOceanBg();
  scene.fog = new THREE.FogExp2(0x002848, isMobile ? 0.0065 : 0.0085);

  // ── Camera ────────────────────────────────────────────────────────────────
  // Wide FOV + farther back to emphasize scale
  const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.2, 380);
  camera.position.set(0, 6, 78);

  // ── Controls ──────────────────────────────────────────────────────────────
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping   = true;
  orbit.dampingFactor   = 0.07;
  orbit.enablePan       = false;
  orbit.minDistance     = 10;
  orbit.maxDistance     = 170;
  orbit.minPolarAngle   = 0.08;
  orbit.maxPolarAngle   = Math.PI * 0.72;
  orbit.rotateSpeed     = 0.55;
  orbit.zoomSpeed       = 0.70;
  orbit.target.set(0, 0, 0);
  orbit.update();

  // ── Lights ───────────────────────────────────────────────────────────────
  const { caustic, caustic2 } = buildLights(scene, isMobile);

  // ── Environment ──────────────────────────────────────────────────────────
  buildFloor(scene, isMobile);
  const waterSurf  = buildWaterSurface(scene);
  buildSunRays(scene);
  const particles  = buildParticles(scene, isMobile);

  // ── Creatures ────────────────────────────────────────────────────────────
  const creatures = [];
  // `creatures` is the live array — Innocence reads it via `state.creatures`
  // to detect nearby predators and trigger panic-flee reactions.
  const state     = { food: { active: false, position: new THREE.Vector3() }, creatures };
  const addC = (c) => { scene.add(c.mesh); creatures.push(c); };

  const nDolphin = isMobile ? 3 : 5;
  for (let i = 0; i < nDolphin; i++) addC(new Dolphin());

  const nOrca = isMobile ? 1 : 2;
  for (let i = 0; i < nOrca; i++) addC(new Orca());

  addC(new Whale());

  const nShark = isMobile ? 2 : 3;
  for (let i = 0; i < nShark; i++) addC(new Shark());

  addC(new Megalodon());

  // Giant squid — the biggest showpiece of the tank
  addC(new GiantSquid());

  // Innocence — 謎のスーツ姿の遊泳者（スマホを見ながら泳ぐ）
  addC(new Innocence());

  // ── Observation system ───────────────────────────────────────────────────
  const obs = initObservation({ camera, orbit, canvas, getCreatures: () => creatures });

  // ── Audio ─────────────────────────────────────────────────────────────────
  const audio = initAquariumAudio({ theme: 'ocean', getCreatures: () => creatures });

  // ── Food system ───────────────────────────────────────────────────────────
  const foodList = [];
  const O_GRAVITY = 0.35, O_DRAG = 0.55, O_EAT_R = 3.5;

  function refreshFoodTarget() {
    state.food.active = foodList.length > 0;
    if (foodList.length > 0) state.food.position.copy(foodList[0].mesh.position);
  }

  function dropFood(point) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.40, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffd080, roughness: 0.5, metalness: 0,
        emissive: 0xff9040, emissiveIntensity: 0.7 }),
    );
    m.position.copy(point);
    scene.add(m);
    foodList.push({
      mesh: m,
      vel: new THREE.Vector3((Math.random()-.5)*.3, -.25, (Math.random()-.5)*.3),
      life: 20,
    });
    audio.triggerFeed();
    refreshFoodTarget();
  }

  function updateFood(dt) {
    for (let i = foodList.length - 1; i >= 0; i--) {
      const f = foodList[i];
      f.life -= dt;
      f.vel.y -= O_GRAVITY * dt;
      f.vel.multiplyScalar(Math.pow(O_DRAG, dt));
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.y += dt * 0.9;
      f.mesh.rotation.x += dt * 0.6;
      let eaten = false;
      for (const c of creatures) {
        if (!c.cfg.reactsToFood) continue;
        if (c.pos.distanceTo(f.mesh.position) < O_EAT_R) {
          audio.triggerChomp(); eaten = true; break;
        }
      }
      if (!eaten && (f.mesh.position.y < OTANK.floorY + 0.5 || f.life <= 0)) eaten = true;
      if (eaten) {
        scene.remove(f.mesh);
        f.mesh.geometry.dispose(); f.mesh.material.dispose();
        foodList.splice(i, 1);
      }
    }
    refreshFoodTarget();
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  const uiPanel = buildUI(obs, renderer, audio, () => {
    dropFood(new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(OTANK.maxX * 0.6),
      OTANK.maxY - 2,
      THREE.MathUtils.randFloatSpread(OTANK.maxZ * 0.6),
    ));
  });

  // Auto-dim on inactivity (parity with deep-sea)
  let _lastMove = performance.now();
  ['pointermove', 'pointerdown', 'keydown'].forEach(evt =>
    window.addEventListener(evt, () => { _lastMove = performance.now(); uiPanel.classList.remove('dim'); }, { passive: true })
  );

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

    // Caustic shimmer — two offset lights create cross-hatch ripple
    caustic.position.x  = Math.sin(time * 0.22) * 22;
    caustic.position.z  = Math.cos(time * 0.17) * 16;
    caustic.intensity   = 1.1 + Math.sin(time * 1.9) * 0.38;
    caustic2.position.x = Math.cos(time * 0.28) * 18;
    caustic2.position.z = Math.sin(time * 0.21) * 12;
    caustic2.intensity  = 0.45 + Math.sin(time * 2.3 + 1.2) * 0.22;

    animateWater(waterSurf, time);
    animateParticles(particles, dt);
    for (const c of creatures) c.update(dt, time, state);
    updateFood(dt);
    obs.update(dt);
    audio.update(dt, time);
    if (!obs.isObserving) orbit.update();
    if (performance.now() - _lastMove > 5000) uiPanel.classList.add('dim');
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
  // Soft hemisphere: sky blue above, deep navy below
  scene.add(new THREE.HemisphereLight(0x7ab8d8, 0x001830, 0.55));

  // Primary sun — shafts from upper-left
  const sun = new THREE.DirectionalLight(0xd0eeff, 2.10);
  sun.position.set(20, 55, 25);
  sun.target.position.set(0, OTANK.floorY, 0);
  scene.add(sun.target);
  if (!isMobile) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -65;
    sun.shadow.camera.right = sun.shadow.camera.top  =  65;
    sun.shadow.camera.far   = 130;
    sun.shadow.bias         = -0.0005;
  }
  scene.add(sun);

  // Back-light — subtle counter-sun gives creature silhouette depth
  const back = new THREE.DirectionalLight(0x1a4878, 0.55);
  back.position.set(-30, 10, -40);
  scene.add(back);

  // Caustic shimmer — animated per frame; wider range = more drama
  const caustic = new THREE.PointLight(0x20a0d8, 1.2, 110, 1.3);
  caustic.position.set(0, OTANK.floorY + 10, 0);
  scene.add(caustic);

  // Secondary caustic offset — cross-hatch shimmer feel
  const caustic2 = new THREE.PointLight(0x0088bb, 0.55, 80, 1.5);
  caustic2.position.set(20, OTANK.floorY + 6, -15);
  scene.add(caustic2);

  // Deep abyss fill — cold pressure blue rising from floor
  const abyss = new THREE.PointLight(0x001840, 0.45, 140, 1.1);
  abyss.position.set(0, OTANK.floorY + 2, 0);
  scene.add(abyss);

  // Surface rim — simulates light bouncing off the underside of the water
  const rim = new THREE.PointLight(0x50b8f0, 0.52, 160, 0.9);
  rim.position.set(-25, OTANK.maxY - 2, 10);
  scene.add(rim);

  return { caustic, caustic2 };
}

// ─── Ocean floor ──────────────────────────────────────────────────────────

function buildFloor(scene, isMobile) {
  const W = 170, D = 125;
  const segX = isMobile ? 28 : 44;
  const segZ = isMobile ? 20 : 30;
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
  buildBoulders(scene, isMobile);
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

function buildBoulders(scene, isMobile) {
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
  const geo = new THREE.PlaneGeometry(170, 125, 22, 16);
  const mat = new THREE.MeshPhysicalMaterial({
    color:              0x60c8e8,
    roughness:          0.04,
    metalness:          0.0,
    reflectivity:       0.85,
    clearcoat:          1.0,
    clearcoatRoughness: 0.08,
    transparent:        true,
    opacity:            0.22,
    side:               THREE.FrontSide,
    depthWrite:         false,
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
    color:       0xa0d8f8,
    size:        isMobile ? 0.28 : 0.22,
    transparent: true,
    opacity:     0.48,
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

// ─── Full UI panel ────────────────────────────────────────────────────────

function buildUI(obs, renderer, audio, onFeed) {
  const panel = document.createElement('div');
  panel.className = 'ui';

  const body = document.createElement('div');
  body.className = 'ui-body';

  // Species buttons
  const sGroup = document.createElement('div');
  sGroup.className = 'group species';
  const SPECIES = [
    { id: 'dolphin',   label: 'イルカ' },
    { id: 'orca',      label: 'シャチ' },
    { id: 'whale',     label: 'クジラ' },
    { id: 'shark',     label: 'サメ' },
    { id: 'megalodon', label: 'メガロドン' },
    { id: 'squid',     label: 'ダイオウイカ' },
    { id: 'innocence', label: 'イノセンス' },
  ];
  for (const sp of SPECIES) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = sp.label;
    b.addEventListener('click', () => obs.selectSpecies(sp.id));
    sGroup.appendChild(b);
  }
  body.appendChild(sGroup);

  // Controls: brightness + back
  const cGroup = document.createElement('div');
  cGroup.className = 'group';
  const BRIGHT = [{ label: '暗め', v: 0.75 }, { label: '標準', v: 1.15 }, { label: '明るめ', v: 1.65 }];
  let bIdx = 1;
  const btnB = document.createElement('button');
  btnB.className = 'btn';
  btnB.textContent = `明 ${BRIGHT[bIdx].label}`;
  btnB.addEventListener('click', () => {
    bIdx = (bIdx + 1) % BRIGHT.length;
    renderer.toneMappingExposure = BRIGHT[bIdx].v;
    btnB.textContent = `明 ${BRIGHT[bIdx].label}`;
  });
  cGroup.appendChild(btnB);

  // Sound toggle
  let soundOn = false;
  const btnSound = document.createElement('button');
  btnSound.className = 'btn';
  btnSound.textContent = '音 OFF';
  btnSound.setAttribute('aria-pressed', 'false');
  btnSound.addEventListener('click', () => {
    if (soundOn) {
      audio.disable();
      soundOn = false;
      btnSound.textContent = '音 OFF';
      btnSound.setAttribute('aria-pressed', 'false');
    } else {
      if (audio.enable()) {
        soundOn = true;
        btnSound.textContent = '音 ON';
        btnSound.setAttribute('aria-pressed', 'true');
      }
    }
  });
  cGroup.appendChild(btnSound);

  const pickAmbient = () => obs.selectSpecies(SPECIES[Math.floor(Math.random() * SPECIES.length)].id);
  let ambientOn = true;
  let ambientTimer = setInterval(pickAmbient, 15000);
  pickAmbient();
  const btnAmbient = document.createElement('button');
  btnAmbient.className = 'btn';
  btnAmbient.textContent = '鑑賞 ON';
  btnAmbient.setAttribute('aria-pressed', 'true');
  btnAmbient.addEventListener('click', () => {
    ambientOn = !ambientOn;
    if (ambientOn) {
      pickAmbient();
      ambientTimer = setInterval(pickAmbient, 15000);
      btnAmbient.textContent = '鑑賞 ON';
      btnAmbient.setAttribute('aria-pressed', 'true');
    } else {
      clearInterval(ambientTimer);
      btnAmbient.textContent = '鑑賞 OFF';
      btnAmbient.setAttribute('aria-pressed', 'false');
    }
  });
  cGroup.appendChild(btnAmbient);

  const btnFeed = document.createElement('button');
  btnFeed.className = 'btn accent';
  btnFeed.textContent = '餌';
  btnFeed.title = '餌を与える';
  btnFeed.addEventListener('click', () => onFeed?.());
  cGroup.appendChild(btnFeed);
  body.appendChild(cGroup);

  panel.appendChild(body);

  const toggle = document.createElement('button');
  toggle.className = 'btn btn-toggle';
  toggle.textContent = '▾';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '▴' : '▾';
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });
  panel.appendChild(toggle);

  document.body.appendChild(panel);
  return panel;
}

// ─── OceanCreature base ───────────────────────────────────────────────────
// Extends Creature but uses OTANK bounds for wall-avoidance and target picks.

class OceanCreature extends Creature {
  constructor(args) {
    super(args);
    // Re-spawn inside the larger ocean bounds
    this.pos.set(
      THREE.MathUtils.randFloatSpread(OTANK.maxX * 1.5),
      THREE.MathUtils.randFloat(this.cfg.depthMin, this.cfg.depthMax),
      THREE.MathUtils.randFloatSpread(OTANK.maxZ * 1.5),
    );
    this.mesh.position.copy(this.pos);
  }

  pickTarget(state) {
    const { cfg } = this;
    this.target.set(
      THREE.MathUtils.randFloat(OTANK.minX + cfg.wallMargin, OTANK.maxX - cfg.wallMargin),
      THREE.MathUtils.randFloat(cfg.depthMin, cfg.depthMax),
      THREE.MathUtils.randFloat(OTANK.minZ + cfg.wallMargin, OTANK.maxZ - cfg.wallMargin),
    );
    this.onPickTarget?.(this.target, state);
    this.wanderT = THREE.MathUtils.randFloat(cfg.wanderMin, cfg.wanderMax);
  }

  avoidWalls(desired) {
    const { pos, cfg } = this;
    const mx = cfg.wallMargin;
    if (pos.x >  OTANK.maxX - mx) desired.x -= (pos.x - (OTANK.maxX - mx)) * 0.9;
    if (pos.x <  OTANK.minX + mx) desired.x += ((OTANK.minX + mx) - pos.x) * 0.9;
    if (pos.z >  OTANK.maxZ - mx) desired.z -= (pos.z - (OTANK.maxZ - mx)) * 0.9;
    if (pos.z <  OTANK.minZ + mx) desired.z += ((OTANK.minZ + mx) - pos.z) * 0.9;
    if (pos.y >  cfg.depthMax)    desired.y -= (pos.y - cfg.depthMax) * 1.2;
    if (pos.y <  cfg.depthMin)    desired.y += (cfg.depthMin - pos.y) * 1.2;
  }
}

// ─── Dolphin (イルカ) ─────────────────────────────────────────────────────

class Dolphin extends OceanCreature {
  constructor() {
    super({
      species: 'dolphin',
      mesh: makeDolphinMesh(),
      cfg: {
        speed: 4.2, maxAccel: 3.0, turnRate: 1.8,
        depthMin: OTANK.floorY + 6, depthMax: OTANK.maxY - 2,
        wanderMin: 8, wanderMax: 18, wallMargin: 10,
        facesVelocity: true, reactsToFood: true,
      },
    });
    this._phase = Math.random() * Math.PI * 2;
  }
  onUpdate(dt, time) {
    const t = time * 3.4 + this._phase;
    const tail = this.mesh.userData.tail;
    // Energetic tail — fastest stroke of all species
    if (tail) tail.rotation.x = Math.sin(t) * (0.32 + this.speedNorm * 0.24);
    // Lively banking, snappy turns
    this.mesh.rotation.z = -this.turnSignal * 0.40 + Math.sin(t + 0.7) * 0.055;
    // Active nose pitch
    this.mesh.rotation.x = Math.sin(t * 0.55) * 0.10;
    // Pronounced porpoising — signature dolphin motion
    this.mesh.position.y = this.pos.y + Math.sin(t * 0.72) * 1.0;
  }
}

function makeDolphinMesh() {
  const g       = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x4a6882, roughness: 0.42, metalness: 0.10, clearcoat: 0.55, clearcoatRoughness: 0.22 });
  const bellyMat= new THREE.MeshPhysicalMaterial({ color: 0xb0c8d8, roughness: 0.38, metalness: 0.06, clearcoat: 0.45, clearcoatRoughness: 0.25 });

  // Body
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 9), bodyMat);
  body.scale.set(2.9, 1.0, 0.82);
  g.add(body);

  // Belly
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.44, 10, 7), bellyMat);
  belly.scale.set(2.5, 0.55, 0.72);
  belly.position.y = -0.14;
  g.add(belly);

  // Rostrum
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.20, 0.72, 8), bodyMat);
  snout.rotation.z = Math.PI / 2;
  snout.position.x = 1.52;
  g.add(snout);

  // Dorsal fin
  const dFin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.50, 6), bodyMat);
  dFin.position.set(0.0, 0.46, 0);
  g.add(dFin);

  // Pectoral fins
  for (const s of [-1, 1]) {
    const pFin = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.52, 5), bodyMat);
    pFin.rotation.z = s * 1.25;
    pFin.position.set(0.55, -0.08, s * 0.40);
    g.add(pFin);
  }

  // Tail group (pivot for animation)
  const tail = new THREE.Group();
  tail.position.x = -1.45;
  for (const s of [-1, 1]) {
    const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.52, 5), bodyMat);
    fluke.rotation.z = Math.PI / 2;
    fluke.rotation.y = s * 0.52;
    fluke.position.set(-0.28, 0, s * 0.26);
    tail.add(fluke);
  }
  g.add(tail);
  g.userData.tail = tail;

  g.scale.setScalar(1.4);
  return g;
}

// ─── Orca (シャチ) ────────────────────────────────────────────────────────

class Orca extends OceanCreature {
  constructor() {
    super({
      species: 'orca',
      mesh: makeOrcaMesh(),
      cfg: {
        speed: 2.0, maxAccel: 1.2, turnRate: 0.75,
        depthMin: OTANK.floorY + 4, depthMax: OTANK.maxY - 3,
        wanderMin: 14, wanderMax: 28, wallMargin: 12,
        facesVelocity: true,
      },
    });
    this._phase = Math.random() * Math.PI * 2;
  }
  onUpdate(dt, time) {
    const t = time * 1.6 + this._phase;
    const tail = this.mesh.userData.tail;
    if (tail) tail.rotation.x = Math.sin(t) * (0.24 + this.speedNorm * 0.16);
    // Heavy whole-body roll into turns — unmistakably massive
    this.mesh.rotation.z = -this.turnSignal * 0.46 + Math.sin(t + 0.6) * 0.040;
    // Slow deliberate pitch — purpose over speed
    this.mesh.rotation.x = Math.sin(t * 0.38) * 0.055;
  }
}

function makeOrcaMesh() {
  const g       = new THREE.Group();
  const blackMat= new THREE.MeshPhysicalMaterial({ color: 0x0e1418, roughness: 0.45, metalness: 0.08, clearcoat: 0.70, clearcoatRoughness: 0.18 });
  const whiteMat= new THREE.MeshPhysicalMaterial({ color: 0xdce8f0, roughness: 0.40, metalness: 0.04, clearcoat: 0.55, clearcoatRoughness: 0.22 });

  // Body
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), blackMat);
  body.scale.set(3.0, 1.0, 0.92);
  g.add(body);

  // White belly patch
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.64, 10, 8), whiteMat);
  belly.scale.set(2.2, 0.48, 0.76);
  belly.position.y = -0.28;
  g.add(belly);

  // White eye patches
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), whiteMat);
    eye.scale.set(0.9, 0.62, 0.28);
    eye.position.set(1.0, 0.26, s * 0.66);
    g.add(eye);
  }

  // Tall dorsal fin
  const dFin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.10, 6), blackMat);
  dFin.position.set(-0.1, 0.88, 0);
  g.add(dFin);

  // Pectoral fins
  for (const s of [-1, 1]) {
    const pFin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.80, 5), blackMat);
    pFin.rotation.z = s * 1.15;
    pFin.position.set(0.70, -0.18, s * 0.62);
    g.add(pFin);
  }

  // Tail group
  const tail = new THREE.Group();
  tail.position.x = -2.22;
  for (const s of [-1, 1]) {
    const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.72, 5), blackMat);
    fluke.rotation.z = Math.PI / 2;
    fluke.rotation.y = s * 0.50;
    fluke.position.set(-0.36, 0, s * 0.36);
    tail.add(fluke);
  }
  g.add(tail);
  g.userData.tail = tail;

  g.scale.setScalar(2.8);
  return g;
}

// ─── Whale (クジラ) ───────────────────────────────────────────────────────

class Whale extends OceanCreature {
  constructor() {
    super({
      species: 'whale',
      mesh: makeWhaleMesh(),
      cfg: {
        speed: 0.55, maxAccel: 0.28, turnRate: 0.30,
        depthMin: OTANK.floorY + 5, depthMax: OTANK.maxY - 4,
        wanderMin: 22, wanderMax: 40, wallMargin: 18,
        facesVelocity: true,
      },
    });
    this._phase = Math.random() * Math.PI * 2;
  }
  onUpdate(dt, time) {
    const t = time * 0.85 + this._phase;
    const tail = this.mesh.userData.tail;
    // Deepest, most powerful tail stroke of any species
    if (tail) tail.rotation.x = Math.sin(t) * (0.36 + this.speedNorm * 0.18);
    // Ponderous bank — turns take forever for this mass
    this.mesh.rotation.z = -this.turnSignal * 0.24 + Math.sin(t * 0.44) * 0.032;
    // Slow full-body undulation through the water column
    this.mesh.rotation.x = Math.sin(t * 0.30) * 0.030;
    // Subtle depth-glide — the whole body shifts gently
    this.mesh.position.y = this.pos.y + Math.sin(t * 0.25) * 0.65;
  }
}

function makeWhaleMesh() {
  const g      = new THREE.Group();
  const mat    = new THREE.MeshPhysicalMaterial({ color: 0x2e4258, roughness: 0.58, metalness: 0.06, clearcoat: 0.40, clearcoatRoughness: 0.30 });
  const belly  = new THREE.MeshPhysicalMaterial({ color: 0x4a6278, roughness: 0.55, metalness: 0.04, clearcoat: 0.35, clearcoatRoughness: 0.30 });

  // Main body — very elongated
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.90, 14, 10), mat);
  body.scale.set(4.6, 1.0, 1.0);
  g.add(body);

  // Lighter belly underside
  const bel = new THREE.Mesh(new THREE.SphereGeometry(0.82, 10, 8), belly);
  bel.scale.set(4.0, 0.42, 0.86);
  bel.position.y = -0.38;
  g.add(bel);

  // Rostrum (blunt head)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), mat);
  head.scale.set(1.15, 0.82, 0.88);
  head.position.x = 4.2;
  g.add(head);

  // Small dorsal fin bump (blue whale style)
  const dFin = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.38, 6), mat);
  dFin.position.set(-1.4, 0.88, 0);
  g.add(dFin);

  // Long pectoral flippers
  for (const s of [-1, 1]) {
    const flip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 1.60, 7), mat);
    flip.rotation.z = s * 1.0;
    flip.rotation.x = 0.25;
    flip.position.set(2.0, -0.22, s * 0.84);
    g.add(flip);
  }

  // Tail group — wide flukes
  const tail = new THREE.Group();
  tail.position.x = -4.2;
  for (const s of [-1, 1]) {
    const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.05, 5), mat);
    fluke.rotation.z = Math.PI / 2;
    fluke.rotation.y = s * 0.44;
    fluke.position.set(-0.52, 0, s * 0.52);
    tail.add(fluke);
  }
  g.add(tail);
  g.userData.tail = tail;

  g.scale.setScalar(5.5);
  return g;
}

// ─── Shark (サメ) ─────────────────────────────────────────────────────────

class Shark extends OceanCreature {
  constructor() {
    super({
      species: 'shark',
      mesh: makeSharkMesh(),
      cfg: {
        speed: 2.4, maxAccel: 1.4, turnRate: 0.85,
        depthMin: OTANK.floorY + 3, depthMax: OTANK.maxY - 5,
        wanderMin: 12, wanderMax: 24, wallMargin: 10,
        facesVelocity: true,
      },
    });
    this._phase      = Math.random() * Math.PI * 2;
    this._baseSpeed  = 2.4;
    this._rushing    = false;
    this._rushTimer  = 5 + Math.random() * 8; // seconds until next state change
  }
  onUpdate(dt, time) {
    const t = time * 2.1 + this._phase;
    const tail = this.mesh.userData.tail;

    // Tension burst: irregular speed spikes mimic predatory hunting
    this._rushTimer -= dt;
    if (this._rushTimer <= 0) {
      this._rushing = !this._rushing;
      this._rushTimer = this._rushing
        ? 1.5 + Math.random() * 2.5   // burst: 1.5–4s
        : 5   + Math.random() * 10;   // rest: 5–15s
      this.cfg.speed = this._baseSpeed * (this._rushing ? 1.55 : 1.0);
    }

    const rushMul = this._rushing ? 1.35 : 1.0;
    if (tail) tail.rotation.y = Math.sin(t * rushMul) * (0.30 + this.speedNorm * 0.22);
    // Tense angular lean — knifes through water
    this.mesh.rotation.z = this.turnSignal * 0.30 + Math.sin(t * 0.55) * 0.035;
    // Hunting arcs — rises and dives constantly
    this.mesh.rotation.x = Math.sin(t * 0.42) * 0.052;
  }
}

function makeSharkMesh() {
  const g      = new THREE.Group();
  const top    = new THREE.MeshPhysicalMaterial({ color: 0x4a5060, roughness: 0.48, metalness: 0.08, clearcoat: 0.50, clearcoatRoughness: 0.20 });
  const btm    = new THREE.MeshPhysicalMaterial({ color: 0xb8bec8, roughness: 0.45, metalness: 0.06, clearcoat: 0.45, clearcoatRoughness: 0.22 });

  // Body
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 9), top);
  body.scale.set(2.8, 0.72, 0.68);
  g.add(body);

  // Lighter underside
  const under = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 7), btm);
  under.scale.set(2.4, 0.30, 0.58);
  under.position.y = -0.18;
  g.add(under);

  // Pointed snout
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.60, 8), top);
  snout.rotation.z = -Math.PI / 2;
  snout.position.x = 1.58;
  g.add(snout);

  // First dorsal fin (tall, iconic)
  const d1 = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.62, 5), top);
  d1.position.set(0.15, 0.50, 0);
  g.add(d1);

  // Second dorsal fin (small)
  const d2 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 5), top);
  d2.position.set(-0.85, 0.34, 0);
  g.add(d2);

  // Pectoral fins (wide, swept back)
  for (const s of [-1, 1]) {
    const pec = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.72, 5), top);
    pec.rotation.z = s * 1.35;
    pec.rotation.x = s * 0.20;
    pec.position.set(0.60, -0.12, s * 0.46);
    g.add(pec);
  }

  // Caudal fin (heterocercal — upper lobe bigger)
  const tail = new THREE.Group();
  tail.position.x = -1.48;
  const upper = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.72, 5), top);
  upper.rotation.z = Math.PI / 2;
  upper.rotation.y = 0.32;
  upper.position.set(-0.36, 0.18, 0);
  tail.add(upper);
  const lower = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.44, 5), top);
  lower.rotation.z = Math.PI / 2;
  lower.rotation.y = -0.22;
  lower.position.set(-0.22, -0.12, 0);
  tail.add(lower);
  g.add(tail);
  g.userData.tail = tail;

  g.scale.setScalar(2.2);
  return g;
}

// ─── Megalodon (メガロドン) ───────────────────────────────────────────────

class Megalodon extends OceanCreature {
  constructor() {
    super({
      species: 'megalodon',
      mesh: makeMegalodonMesh(),
      cfg: {
        speed: 0.72, maxAccel: 0.38, turnRate: 0.28,
        depthMin: OTANK.floorY + 2, depthMax: OTANK.floorY + 16,
        wanderMin: 22, wanderMax: 48, wallMargin: 16,
        facesVelocity: true,
      },
    });
    this._phase = Math.random() * Math.PI * 2;
  }
  // 25% chance: surge shallower on each new waypoint — ominous sudden appearance
  onPickTarget(target) {
    if (Math.random() < 0.25) {
      target.y = THREE.MathUtils.randFloat(OTANK.floorY + 4, OTANK.floorY + 20);
    }
  }
  onUpdate(dt, time) {
    const t = time * 1.15 + this._phase;
    const tail = this.mesh.userData.tail;
    // Massive inexorable tail — slower period, higher amplitude than shark
    if (tail) tail.rotation.y = Math.sin(t) * (0.25 + this.speedNorm * 0.15);
    // Crushing weight in every turn — absolute, not agile
    this.mesh.rotation.z = this.turnSignal * 0.26 + Math.sin(t * 0.40) * 0.028;
    // Always searching the abyss — nose tilts as it hunts depth
    this.mesh.rotation.x = Math.sin(t * 0.28) * 0.040;
    // Slow vertical drift — predator adjusting depth with gravity-like weight
    this.mesh.position.y = this.pos.y + Math.sin(t * 0.18) * 0.40;
  }
}

function makeMegalodonMesh() {
  const g   = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x1e2530, roughness: 0.52, metalness: 0.12,
    clearcoat: 0.60, clearcoatRoughness: 0.18,
    emissive: new THREE.Color(0x050810), emissiveIntensity: 0.5,
  });
  const btm = new THREE.MeshPhysicalMaterial({ color: 0x3a424e, roughness: 0.50, metalness: 0.06, clearcoat: 0.45, clearcoatRoughness: 0.22 });

  // Massive body — stockier than shark
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), mat);
  body.scale.set(2.9, 0.85, 0.88);
  g.add(body);

  // Belly — slightly lighter
  const under = new THREE.Mesh(new THREE.SphereGeometry(0.64, 10, 7), btm);
  under.scale.set(2.5, 0.32, 0.74);
  under.position.y = -0.24;
  g.add(under);

  // Blunt powerful snout
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.68, 8), mat);
  snout.rotation.z = -Math.PI / 2;
  snout.position.x = 2.12;
  g.add(snout);

  // Huge first dorsal fin
  const d1 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.90, 6), mat);
  d1.position.set(0.10, 0.72, 0);
  g.add(d1);

  // Second dorsal fin
  const d2 = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.40, 5), mat);
  d2.position.set(-1.0, 0.48, 0);
  g.add(d2);

  // Wide, powerful pectoral fins
  for (const s of [-1, 1]) {
    const pec = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.0, 5), mat);
    pec.rotation.z = s * 1.30;
    pec.rotation.x = s * 0.18;
    pec.position.set(0.80, -0.15, s * 0.60);
    g.add(pec);
  }

  // Caudal fin
  const tail = new THREE.Group();
  tail.position.x = -2.10;
  const upper = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.0, 5), mat);
  upper.rotation.z = Math.PI / 2;
  upper.rotation.y = 0.30;
  upper.position.set(-0.50, 0.22, 0);
  tail.add(upper);
  const lower = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.58, 5), mat);
  lower.rotation.z = Math.PI / 2;
  lower.rotation.y = -0.20;
  lower.position.set(-0.32, -0.16, 0);
  tail.add(lower);
  g.add(tail);
  g.userData.tail = tail;

  // Eyes — cold, predatory amber glow
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.072, 7, 6),
      new THREE.MeshStandardMaterial({
        color: 0x201008,
        emissive: new THREE.Color(0x5a2800),
        emissiveIntensity: 1.2,
        roughness: 0.2,
      }),
    );
    eye.position.set(1.80, 0.18, s * 0.60);
    g.add(eye);
  }

  g.scale.setScalar(5.2);
  return g;
}

// ─── Giant Squid (ダイオウイカ) ───────────────────────────────────────────
// The hero of the tank. Whale-scale mantle, 8 undulating arms, 2 long
// whipping tentacles with paddle clubs, jet-propulsion pulse, and
// chromatophore bioluminescent shimmer.

class GiantSquid extends OceanCreature {
  constructor() {
    super({
      species: 'squid',
      mesh: makeGiantSquidMesh(),
      cfg: {
        speed: 0.85, maxAccel: 0.48, turnRate: 0.34,
        depthMin: OTANK.floorY + 4, depthMax: OTANK.maxY - 4,
        wanderMin: 18, wanderMax: 36, wallMargin: 22,
        facesVelocity: true,
      },
    });
    this._phase  = Math.random() * Math.PI * 2;
    this._jetT   = 0;
    this._jetPhase = Math.random() * Math.PI * 2;
    this._speedBase = 0.85;
  }

  // Prefer wide-open mid-water pathways where silhouettes read best.
  onPickTarget(target) {
    // Occasional vertical surge — giant squid rising from the deep
    if (Math.random() < 0.35) {
      target.y = THREE.MathUtils.randFloat(OTANK.floorY + 3, OTANK.floorY + 10);
    }
  }

  onUpdate(dt, time) {
    const ud = this.mesh.userData;
    const t  = time * 0.9 + this._phase;

    // ── Jet propulsion cycle ─────────────────────────────────────────
    // Slow inhale (mantle expands), sharp contraction (thrust), glide.
    // Period ~3.4s.  `jet` is unipolar 0..1.
    const jetT   = time * 1.85 + this._jetPhase;
    const rawJet = (Math.sin(jetT) * 0.5 + 0.5);
    const jet    = Math.pow(rawJet, 2.2);                 // sharpen contraction
    const squash = 1.0 - jet * 0.18;                      // mantle narrows when thrusting
    const elong  = 1.0 + jet * 0.08;
    if (ud.mantle) {
      // Lathe local Y = length axis; X/Z = radial.
      // Narrow radially (squash) and extend lengthwise (elong) on contraction.
      ud.mantle.scale.set(ud.mantleBase.x * squash, ud.mantleBase.y * elong, ud.mantleBase.z * squash);
    }
    if (ud.head) {
      // Subtle expansion — head stays roughly spherical through the cycle
      const hs = 0.98 + (1 - rawJet) * 0.05;
      ud.head.scale.set(ud.headBase.x * hs, ud.headBase.y * hs, ud.headBase.z * hs);
    }

    // ── Fins — slow undulating wave, snaps harder during jet thrust ──
    const finPhase = t * 1.4;
    const finAmp   = 0.38 + jet * 0.22 + this.speedNorm * 0.18;
    if (ud.finL) {
      ud.finL.rotation.x = Math.sin(finPhase)            * finAmp;
      ud.finL.rotation.z =  0.10 + Math.sin(finPhase+.4) * 0.12;
    }
    if (ud.finR) {
      ud.finR.rotation.x = Math.sin(finPhase + Math.PI)  * finAmp;
      ud.finR.rotation.z = -0.10 - Math.sin(finPhase+.4) * 0.12;
    }

    // ── Chromatophore / bioluminescent pulse ─────────────────────────
    // Emissive crawls through red → magenta → deep violet, subtle ~4s cycle.
    const chroma = (Math.sin(time * 1.1 + this._phase) + 1) * 0.5;   // 0..1
    if (ud.chromaColor) {
      ud.chromaColor.setHSL(0.97 - chroma * 0.10, 0.85, 0.18 + chroma * 0.14);
      if (ud.mantleMat) {
        ud.mantleMat.emissive.copy(ud.chromaColor);
        ud.mantleMat.emissiveIntensity = 0.55 + jet * 0.65 + chroma * 0.15;
      }
      if (ud.armMat) {
        ud.armMat.emissive.copy(ud.chromaColor).multiplyScalar(0.75);
        ud.armMat.emissiveIntensity = 0.45 + chroma * 0.30;
      }
    }
    // Club tip photophores pulse brighter — signature deep-sea lure look
    const clubGlow = 0.8 + Math.sin(time * 2.3 + this._phase) * 0.35 + jet * 0.30;
    if (ud.clubMat) ud.clubMat.emissiveIntensity = clubGlow;

    // ── Body-level motion: gentle banking, depth drift ───────────────
    this.mesh.rotation.z = -this.turnSignal * 0.22 + Math.sin(t * 0.32) * 0.030;
    this.mesh.rotation.x =  Math.sin(t * 0.24) * 0.045;
    this.mesh.position.y = this.pos.y + Math.sin(t * 0.22) * 0.45;

    // Jet thrusts temporarily boost speed — pulsing forward glide
    const targetSpeed = this._speedBase * (1.0 + jet * 0.50);
    this.cfg.speed = targetSpeed;

    // ── Arms: propagating sine wave root→tip, per-arm phase offset ──
    const arms = ud.arms;
    if (arms) {
      const armFreq = 1.35;
      const armDecay = 0.35;
      for (let i = 0; i < arms.length; i++) {
        const a   = arms[i];
        const ph  = a.phase;
        const ang = a.restAngle;
        // Radial unfurl during thrust — arms streamline back, splay on glide
        const unfurl = 0.75 - jet * 0.55;
        for (let j = 0; j < a.segs.length; j++) {
          const k = j / (a.segs.length - 1);
          const wave = Math.sin(t * armFreq - j * 0.55 + ph);
          const roll = Math.cos(t * armFreq * 0.88 - j * 0.48 + ph);
          a.segs[j].rotation.y = wave * (0.18 * (1 - k * armDecay));
          a.segs[j].rotation.z = roll * (0.14 * (1 - k * armDecay))
                                + (j === 0 ? Math.sin(ang) * unfurl * 0.12 : 0);
          // Slight radial flare on j=0 so arms splay out from head when drifting
          if (j === 0) {
            a.segs[j].rotation.x = Math.cos(ang) * unfurl * 0.12
                                 + Math.sin(t * 0.7 + ph) * 0.06;
          }
        }
      }
    }

    // ── Tentacles: slower, deeper wave; clubs whip behind with inertia ──
    const tents = ud.tentacles;
    if (tents) {
      for (const tt of tents) {
        for (let j = 0; j < tt.segs.length; j++) {
          const k = j / (tt.segs.length - 1);
          const wave = Math.sin(t * 0.95 - j * 0.42 + tt.phase);
          const roll = Math.cos(t * 0.72 - j * 0.38 + tt.phase);
          // Turning propagates into the tentacles — they whip outward on turns
          const turnCurl = this.turnSignal * (0.10 + k * 0.12);
          tt.segs[j].rotation.y = wave * (0.17 * (1 - k * 0.30)) + turnCurl;
          tt.segs[j].rotation.z = roll * (0.13 * (1 - k * 0.30));
        }
      }
    }
  }
}

function makeGiantSquidMesh() {
  const g = new THREE.Group();

  // ── Materials ────────────────────────────────────────────────────────
  const chromaColor = new THREE.Color(0x2a0816);

  const mantleMat = new THREE.MeshPhysicalMaterial({
    color:             0x7e1c2e,          // deep blood-red
    roughness:         0.38,
    metalness:         0.14,
    clearcoat:         0.85,
    clearcoatRoughness:0.16,
    emissive:          chromaColor.clone(),
    emissiveIntensity: 0.65,
    sheen:             0.80,
    sheenColor:        new THREE.Color(0xff5078),
    sheenRoughness:    0.42,
  });

  const armMat = new THREE.MeshPhysicalMaterial({
    color:             0xa4324a,
    roughness:         0.44,
    metalness:         0.10,
    clearcoat:         0.65,
    clearcoatRoughness:0.22,
    emissive:          chromaColor.clone().multiplyScalar(0.75),
    emissiveIntensity: 0.50,
    sheen:             0.55,
    sheenColor:        new THREE.Color(0xff6488),
  });

  const underMat = new THREE.MeshPhysicalMaterial({
    color:             0xe8c0cc,           // pale countershaded belly
    roughness:         0.52,
    metalness:         0.04,
    clearcoat:         0.45,
    clearcoatRoughness:0.28,
  });

  const clubMat = new THREE.MeshPhysicalMaterial({
    color:             0xc84866,
    roughness:         0.36,
    metalness:         0.16,
    clearcoat:         0.70,
    clearcoatRoughness:0.18,
    emissive:          new THREE.Color(0x581020),
    emissiveIntensity: 0.95,
  });

  // ── Mantle (tapered torpedo, tip forward at +X) ─────────────────────
  // Lathe profile: rounded head at origin → pointed tip at +X.
  const mantlePts = [];
  const MANTLE_LEN = 3.6;
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    const y = t * MANTLE_LEN;                           // along axis
    // profile: plump near head (t=0), taper to point at tip (t=1)
    const r = Math.sin(Math.pow(1 - t, 0.85) * Math.PI * 0.5) * 0.92
            * (0.96 - t * 0.04);
    mantlePts.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  const mantleGeo = new THREE.LatheGeometry(mantlePts, 22);
  const mantle = new THREE.Mesh(mantleGeo, mantleMat);
  mantle.rotation.z = -Math.PI / 2;                     // axis → +X
  mantle.position.x = 0.0;
  g.add(mantle);
  g.userData.mantle = mantle;
  g.userData.mantleBase = mantle.scale.clone();

  // Rounded head lobe at the front of the mantle (covers the lathe hole)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.92, 16, 12),
    mantleMat,
  );
  head.scale.set(0.95, 0.95, 0.95);
  head.position.set(-0.05, 0, 0);
  g.add(head);
  g.userData.head     = head;
  g.userData.headBase = head.scale.clone();

  // Pale countershaded belly stripe — iconic squid chromatophore pattern
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.82, 14, 10),
    underMat,
  );
  belly.scale.set(3.1, 0.42, 0.88);
  belly.position.set(1.35, -0.42, 0);
  g.add(belly);

  // Darker dorsal ridge — stripe of contrast along the top
  const ridge = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 12, 8),
    new THREE.MeshPhysicalMaterial({
      color:             0x3a0a18,
      roughness:         0.45,
      metalness:         0.18,
      clearcoat:         0.70,
      clearcoatRoughness:0.20,
      emissive:          new THREE.Color(0x180004),
      emissiveIntensity: 0.6,
    }),
  );
  ridge.scale.set(3.3, 0.22, 0.42);
  ridge.position.set(1.55, 0.52, 0);
  g.add(ridge);

  // ── Lateral fins (diamond-shaped, at the tail end of the mantle) ────
  // Modelled as flattened ovoids, rotated outward, animated on .rotation.x
  for (const s of [-1, 1]) {
    const fin = new THREE.Group();
    fin.position.set(2.95, 0.10, s * 0.55);

    const blade = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 12, 8),
      mantleMat,
    );
    blade.scale.set(1.75, 0.14, 1.20);
    blade.position.set(0.10, 0, s * 0.60);
    fin.add(blade);

    // Leading-edge darker flash — makes the fin read as diamond-shaped
    const edge = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 10, 6),
      new THREE.MeshPhysicalMaterial({
        color:             0x4a0a16,
        roughness:         0.44,
        metalness:         0.14,
        clearcoat:         0.55,
        clearcoatRoughness:0.20,
      }),
    );
    edge.scale.set(1.55, 0.10, 0.65);
    edge.position.set(0.55, 0.02, s * 0.85);
    fin.add(edge);

    g.add(fin);
    g.userData[s > 0 ? 'finR' : 'finL'] = fin;
  }

  // ── Eyes (huge, iconic — giant squid has the largest eyes in nature) ─
  for (const s of [-1, 1]) {
    // Outer socket rim
    const socket = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 14, 10),
      new THREE.MeshPhysicalMaterial({
        color:             0x280510,
        roughness:         0.36,
        metalness:         0.20,
        clearcoat:         0.50,
        clearcoatRoughness:0.28,
      }),
    );
    socket.scale.set(1.05, 1.05, 0.55);
    socket.position.set(-0.42, 0.28, s * 0.78);
    g.add(socket);

    // Eyeball — mirror-polished black with a faint cyan inner glow
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.40, 18, 14),
      new THREE.MeshPhysicalMaterial({
        color:             0x020308,
        roughness:         0.04,
        metalness:         0.92,
        clearcoat:         1.00,
        clearcoatRoughness:0.02,
        emissive:          new THREE.Color(0x0a2030),
        emissiveIntensity: 0.85,
      }),
    );
    eye.position.set(-0.55, 0.28, s * 0.88);
    g.add(eye);

    // W-shaped pupil hint — shallow dark disc inset
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    pupil.scale.set(1.0, 0.38, 0.18);
    pupil.position.set(-0.78, 0.28, s * 1.00);
    g.add(pupil);

    // Highlight — tiny catch-light, makes eyes feel alive
    const glint = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xf0f8ff }),
    );
    glint.position.set(-0.88, 0.40, s * 0.98);
    g.add(glint);

    // Faint bioluminescent ring around the socket
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.04, 8, 18),
      new THREE.MeshBasicMaterial({
        color:       0x60c8ff,
        transparent: true,
        opacity:     0.55,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
      }),
    );
    ring.rotation.y = s * Math.PI / 2;
    ring.position.set(-0.52, 0.28, s * 0.90);
    g.add(ring);
  }

  // ── Funnel (siphon, under the head — the jet exhaust) ───────────────
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.26, 0.80, 12),
    mantleMat,
  );
  funnel.rotation.z =  Math.PI / 2 + 0.22;
  funnel.position.set(-0.35, -0.68, 0);
  g.add(funnel);

  // ── 8 Arms (around the mouth, segmented for wave animation) ─────────
  const ARM_COUNT = 8;
  const ARM_SEG   = 9;
  const ARM_LEN   = 3.2;
  const ARM_STEP  = ARM_LEN / ARM_SEG;
  const arms = [];
  for (let i = 0; i < ARM_COUNT; i++) {
    // Distribute around a ring at the mouth; skip the two slots occupied
    // by long tentacles (top-sides) by offsetting the angle a touch.
    const ang = (i / ARM_COUNT) * Math.PI * 2 + Math.PI * 0.06;
    const root = new THREE.Group();
    root.position.set(
      -0.85,
       Math.sin(ang) * 0.38,
       Math.cos(ang) * 0.56,
    );
    // Initial splay — arms fan outward from the mouth
    root.rotation.y = Math.cos(ang) * 0.25;
    root.rotation.z = Math.sin(ang) * 0.28;

    let parent = root;
    const segs = [];
    for (let j = 0; j < ARM_SEG; j++) {
      const k   = j / (ARM_SEG - 1);
      const r   = 0.20 * (1 - k * 0.88) + 0.015;
      const seg = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 8, 6),
        armMat,
      );
      mesh.scale.set(1.45, 1.0, 1.0);
      mesh.position.x = -ARM_STEP * 0.5;
      seg.add(mesh);

      // Tiny sucker hint on larger segments — two light dots
      if (j < ARM_SEG - 2 && j % 2 === 0) {
        const suck = new THREE.Mesh(
          new THREE.SphereGeometry(r * 0.22, 6, 5),
          new THREE.MeshBasicMaterial({ color: 0xfff4e4 }),
        );
        suck.position.set(-ARM_STEP * 0.5, -r * 0.75, 0);
        seg.add(suck);
      }

      parent.add(seg);
      seg.position.x = j === 0 ? 0 : -ARM_STEP;
      segs.push(seg);
      parent = seg;
    }
    g.add(root);
    arms.push({
      root,
      segs,
      phase: i * (Math.PI * 2 / ARM_COUNT) + Math.random() * 0.3,
      restAngle: ang,
    });
  }
  g.userData.arms = arms;

  // ── 2 Long tentacles with paddle clubs at the tips ──────────────────
  const tentacles = [];
  const TENT_SEG  = 16;
  const TENT_LEN  = 9.6;
  const TENT_STEP = TENT_LEN / TENT_SEG;
  for (const s of [-1, 1]) {
    const root = new THREE.Group();
    root.position.set(-0.85, -0.05, s * 0.20);
    root.rotation.y = s * 0.16;
    root.rotation.z = -0.05;

    let parent = root;
    const segs = [];
    for (let j = 0; j < TENT_SEG; j++) {
      const k   = j / (TENT_SEG - 1);
      // thin shaft — fattens again slightly near the club
      const base = 0.14 * (1 - k * 0.92) + 0.022;
      const bump = Math.exp(-Math.pow((k - 0.92) / 0.10, 2)) * 0.05;
      const r   = base + bump;
      const seg = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 7, 5),
        armMat,
      );
      mesh.scale.set(1.4, 1.0, 1.0);
      mesh.position.x = -TENT_STEP * 0.5;
      seg.add(mesh);
      parent.add(seg);
      seg.position.x = j === 0 ? 0 : -TENT_STEP;
      segs.push(seg);
      parent = seg;
    }

    // Club (manus) at the tip — paddle-like, glows via clubMat
    const club = new THREE.Group();
    const clubBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      clubMat,
    );
    clubBody.scale.set(2.0, 0.85, 0.72);
    clubBody.position.x = -0.22;
    club.add(clubBody);

    // Two rows of photophore dots on the club
    for (let r = -1; r <= 1; r += 2) {
      for (let d = 0; d < 5; d++) {
        const photo = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 6, 5),
          new THREE.MeshBasicMaterial({
            color:       0x80e4ff,
            transparent: true,
            opacity:     0.85,
            blending:    THREE.AdditiveBlending,
            depthWrite:  false,
          }),
        );
        photo.position.set(-0.08 - d * 0.08, r * 0.08, 0.06);
        club.add(photo);
      }
    }
    club.position.x = -0.04;
    parent.add(club);

    g.add(root);
    tentacles.push({
      root,
      segs,
      phase: s > 0 ? 0.0 : Math.PI * 0.75,
    });
  }
  g.userData.tentacles = tentacles;

  // Stash materials + cycling color so onUpdate can pulse them
  g.userData.mantleMat  = mantleMat;
  g.userData.armMat     = armMat;
  g.userData.clubMat    = clubMat;
  g.userData.chromaColor = chromaColor;

  // Final scale — whale-tier presence
  g.scale.setScalar(6.4);
  return g;
}

// ─── Innocence (スーツ姿の遊泳者) ─────────────────────────────────────────
// A fully suited businessman swimming horizontally through the tank while
// staring at his smartphone. Wet-hair clearcoat, wool-suit roughness,
// polished leather shoes, glowing phone screen, ID badge on a lanyard,
// thin earphone cable tracing from ear to device.

const PREDATOR_SPECIES = new Set(['megalodon', 'shark', 'orca']);
// Species-specific "about to get eaten" radius — megalodon's mouth is huge.
const PREDATOR_DANGER_R = { megalodon: 28, orca: 16, shark: 11 };

class Innocence extends OceanCreature {
  constructor() {
    super({
      species: 'innocence',
      mesh: makeInnocenceMesh(),
      cfg: {
        speed: 1.7, maxAccel: 1.2, turnRate: 1.1,
        depthMin: OTANK.floorY + 6, depthMax: OTANK.maxY - 3,
        wanderMin: 10, wanderMax: 22, wallMargin: 12,
        facesVelocity: true,
      },
    });
    this._phase       = Math.random() * Math.PI * 2;
    this._baseSpeed   = 1.7;
    this._baseAccel   = 1.2;
    this._baseTurn    = 1.1;

    // Comical state machine:
    //   'normal'  — calm swim, eyes on phone
    //   'panic'   — flee from nearby predator, arms flailing
    //   'relief'  — brief breath-catch after a panic escape
    //   'spin'    — somersault gag while still staring at phone
    //   'fumble'  — nearly drops the phone, scrambles to grab it
    this._stateName   = 'normal';
    this._stateT      = 0;
    this._nextGagT    = 7 + Math.random() * 9;
    this._spinRot     = 0;
    this._fleeDir     = new THREE.Vector3(1, 0, 0);
    this._dangerVec   = new THREE.Vector3();
  }

  // While panicking, wander targets flee from the last known danger vector.
  onPickTarget(target) {
    if (this._stateName === 'panic') {
      target.copy(this.pos).addScaledVector(this._fleeDir, 28);
      target.x = THREE.MathUtils.clamp(target.x, OTANK.minX + this.cfg.wallMargin, OTANK.maxX - this.cfg.wallMargin);
      target.z = THREE.MathUtils.clamp(target.z, OTANK.minZ + this.cfg.wallMargin, OTANK.maxZ - this.cfg.wallMargin);
      target.y = THREE.MathUtils.clamp(target.y, this.cfg.depthMin, this.cfg.depthMax);
    }
  }

  _enterPanic(dir) {
    this._stateName = 'panic';
    this._stateT    = 2.0 + Math.random() * 1.6;
    this._fleeDir.copy(dir).normalize();
    this.cfg.speed    = this._baseSpeed * 3.1;
    this.cfg.maxAccel = this._baseAccel * 3.0;
    this.cfg.turnRate = this._baseTurn  * 2.6;
    // Re-seek a flee target immediately
    this.target.copy(this.pos).addScaledVector(this._fleeDir, 28);
    this.target.x = THREE.MathUtils.clamp(this.target.x, OTANK.minX + this.cfg.wallMargin, OTANK.maxX - this.cfg.wallMargin);
    this.target.z = THREE.MathUtils.clamp(this.target.z, OTANK.minZ + this.cfg.wallMargin, OTANK.maxZ - this.cfg.wallMargin);
    this.target.y = THREE.MathUtils.clamp(this.target.y, this.cfg.depthMin, this.cfg.depthMax);
    this.wanderT  = this._stateT;
  }

  _enterRelief() {
    this._stateName = 'relief';
    this._stateT    = 0.9 + Math.random() * 0.6;
    this.cfg.speed    = this._baseSpeed * 0.35;
    this.cfg.maxAccel = this._baseAccel;
    this.cfg.turnRate = this._baseTurn;
  }

  _enterNormal() {
    this._stateName = 'normal';
    this._stateT    = 0;
    this.cfg.speed    = this._baseSpeed;
    this.cfg.maxAccel = this._baseAccel;
    this.cfg.turnRate = this._baseTurn;
  }

  _pickGag() {
    const r = Math.random();
    if (r < 0.45) {
      this._stateName = 'spin';
      this._stateT    = 1.1 + Math.random() * 0.5;
      this._spinRot   = 0;
    } else if (r < 0.80) {
      this._stateName = 'fumble';
      this._stateT    = 0.9 + Math.random() * 0.4;
    } else {
      // Sudden double-take — realizes where he is, then shrugs it off
      this._stateName = 'fumble';   // reuse the wobble state
      this._stateT    = 0.6;
    }
    this._nextGagT = 8 + Math.random() * 12;
  }

  onUpdate(dt, time, state) {
    const ud = this.mesh.userData;
    const t  = time * 1.2 + this._phase;

    // ── Predator scan (every frame; short list, cheap) ────────────────
    let nearestPred = null, nearestD = Infinity;
    const list = state?.creatures;
    if (list) {
      for (const c of list) {
        if (!PREDATOR_SPECIES.has(c.species)) continue;
        const d = c.pos.distanceTo(this.pos);
        if (d < nearestD) { nearestD = d; nearestPred = c; }
      }
    }
    if (nearestPred) {
      const threshold = PREDATOR_DANGER_R[nearestPred.species] ?? 14;
      if (nearestD < threshold && this._stateName !== 'panic') {
        this._dangerVec.subVectors(this.pos, nearestPred.pos);
        if (this._dangerVec.lengthSq() < 1e-4) this._dangerVec.set(0, 1, 0);
        this._enterPanic(this._dangerVec);
      }
    }

    // ── State countdown + transitions ────────────────────────────────
    this._stateT -= dt;
    if (this._stateName === 'panic' && this._stateT <= 0) this._enterRelief();
    else if (this._stateName === 'relief' && this._stateT <= 0) this._enterNormal();
    else if ((this._stateName === 'spin' || this._stateName === 'fumble') && this._stateT <= 0) this._enterNormal();

    if (this._stateName === 'normal') {
      this._nextGagT -= dt;
      if (this._nextGagT <= 0) this._pickGag();
    }

    // ── Base swim motion (calm) ───────────────────────────────────────
    const kick = Math.sin(t * 2.6);
    let hipBase = -0.04, hipAmp = 0.22, kneeBase = 0.10, kneeAmp = 0.28;
    let freeShoulderZ = -0.18, freeShoulderZAmp = 0.12, freeShoulderXAmp = 0.10;
    let freeElbowY = 0.20, freeElbowYAmp = 0.10;
    let phoneShoulderX = -0.05, phoneShoulderXAmp = 0.03;
    let headZ = -0.30, headZAmp = 0.02, headYAmp = 0.025;
    let bodyRollExtra = 0, bodyPitchExtra = 0, bodyYawExtra = 0, bodyBob = 0.25;

    // ── State-specific overrides ─────────────────────────────────────
    if (this._stateName === 'panic') {
      // Wild flutter kick + flailing arms + wide-eyed head snap back
      const p = time * 9.5;
      hipBase = 0.0;
      hipAmp  = 0.55;
      kneeAmp = 0.65;
      // Both arms flail like a cartoon — even the phone arm
      freeShoulderZ     = -0.9 + Math.sin(p) * 0.8;
      freeShoulderZAmp  = 0.0;
      freeShoulderXAmp  = 0.0;
      ud.shoulderFree && (ud.shoulderFree.rotation.z = freeShoulderZ);
      ud.shoulderFree && (ud.shoulderFree.rotation.x = Math.sin(p * 1.3 + 1.1) * 0.9);
      if (ud.elbowFree) ud.elbowFree.rotation.y = 0.4 + Math.sin(p * 1.7) * 0.9;
      phoneShoulderX    = -1.1 + Math.sin(p * 1.2 + 0.4) * 0.5;
      phoneShoulderXAmp = 0.0;
      // Head snaps up and looks backward toward the predator
      headZ    = 0.35 + Math.sin(p * 0.8) * 0.10;
      headZAmp = 0.0;
      headYAmp = 0.0;
      if (ud.head) ud.head.rotation.y = Math.sin(p * 0.6) * 0.6;
      // Body streaks forward pitched down + wobbling
      bodyPitchExtra = -0.25 + Math.sin(p * 0.9) * 0.12;
      bodyRollExtra  = Math.sin(p * 1.4) * 0.18;
      bodyBob        = 0.05;
      // Eye-glint isn't controllable, but screen dims (distracted)
      if (ud.screenMat) ud.screenMat.emissiveIntensity = 0.25;
    } else if (this._stateName === 'relief') {
      // Heaving breath — slow wobble, head still tilted up, phone forgotten
      hipAmp   = 0.08;
      kneeAmp  = 0.12;
      headZ    = 0.05;
      headZAmp = 0.0;
      if (ud.head) ud.head.rotation.y = 0;
      // Chest heave
      bodyBob = 0.08 + Math.sin(time * 4.2) * 0.22;
      bodyPitchExtra = Math.sin(time * 3.8) * 0.05;
      if (ud.screenMat) ud.screenMat.emissiveIntensity = 0.6;
    } else if (this._stateName === 'spin') {
      // Full-body somersault while still staring at phone — classic gag
      this._spinRot += dt * Math.PI * 2.2;
      bodyPitchExtra = this._spinRot;
      // Limbs tuck in
      hipAmp   = 0.08;
      kneeBase = 0.25;
      kneeAmp  = 0.10;
      freeShoulderZ    = -0.1;
      freeShoulderZAmp = 0.05;
      if (ud.screenMat) ud.screenMat.emissiveIntensity = 1.4;
    } else if (this._stateName === 'fumble') {
      // Head twitches, free arm windmills, phone arm almost drops
      const p = time * 7.0;
      headZ = -0.30 + Math.sin(p * 1.3) * 0.35;
      headYAmp = 0.0;
      if (ud.head) ud.head.rotation.y = Math.sin(p * 1.8) * 0.45;
      freeShoulderZ = -0.2 + Math.sin(p) * 0.7;
      freeShoulderZAmp = 0.0;
      freeShoulderXAmp = 0.0;
      if (ud.elbowFree) ud.elbowFree.rotation.y = 0.6 + Math.sin(p * 2.3) * 0.9;
      phoneShoulderX = -0.05 + Math.sin(p * 1.5 + 0.7) * 0.45;
      phoneShoulderXAmp = 0.0;
      bodyRollExtra = Math.sin(p * 0.9) * 0.15;
      if (ud.screenMat) ud.screenMat.emissiveIntensity = 1.7 + Math.sin(p * 4) * 0.5;
    }

    // ── Apply (with guards so state-override branches don't double up) ─
    if (ud.hipL)  ud.hipL.rotation.z  = hipBase + kick * hipAmp;
    if (ud.hipR)  ud.hipR.rotation.z  = hipBase - kick * hipAmp;
    if (ud.kneeL) ud.kneeL.rotation.z = kneeBase - kick * kneeAmp;
    if (ud.kneeR) ud.kneeR.rotation.z = kneeBase + kick * kneeAmp;

    if (this._stateName === 'normal' || this._stateName === 'relief' || this._stateName === 'spin') {
      if (ud.shoulderFree) {
        ud.shoulderFree.rotation.z = freeShoulderZ + Math.sin(t * 0.8)      * freeShoulderZAmp;
        ud.shoulderFree.rotation.x =                  Math.cos(t * 0.75)   * freeShoulderXAmp;
      }
      if (ud.elbowFree) ud.elbowFree.rotation.y = freeElbowY + Math.sin(t * 0.9 + 0.6) * freeElbowYAmp;
      if (ud.shoulderPhone) ud.shoulderPhone.rotation.x = phoneShoulderX + Math.sin(t * 0.5) * phoneShoulderXAmp;
    }

    if (this._stateName === 'normal' || this._stateName === 'spin') {
      if (ud.head) {
        ud.head.rotation.z = headZ + Math.sin(t * 0.55) * headZAmp;
        ud.head.rotation.y =         Math.sin(t * 0.38) * headYAmp;
      }
    }

    if (ud.badge) {
      const badgeAmp = this._stateName === 'panic' ? 0.9 : (this._stateName === 'fumble' ? 0.6 : 0.18);
      ud.badge.rotation.z = Math.sin(t * 1.4) * badgeAmp - 0.05;
      ud.badge.rotation.x = Math.cos(t * 1.2) * badgeAmp * 0.6;
    }

    if (ud.hairTufts) {
      for (let i = 0; i < ud.hairTufts.length; i++) {
        const h = ud.hairTufts[i];
        h.rotation.z = h.userData.rz0 + Math.sin(t * 1.8 + i * 0.7) * 0.08;
      }
    }

    if (this._stateName === 'normal' && ud.screenMat) {
      ud.screenMat.emissiveIntensity = 1.25 + Math.sin(time * 2.4) * 0.25;
    }

    // ── Body-level motion ────────────────────────────────────────────
    this.mesh.rotation.z = -this.turnSignal * 0.22 + Math.sin(t * 0.35) * 0.025 + bodyRollExtra;
    this.mesh.rotation.x =  Math.sin(t * 0.28) * 0.030 + bodyPitchExtra;
    this.mesh.rotation.y += bodyYawExtra;
    this.mesh.position.y =  this.pos.y + Math.sin(t * 0.45) * bodyBob;
  }
}

function makeInnocenceMesh() {
  const g = new THREE.Group();

  // ── Materials ────────────────────────────────────────────────────────
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: 0xdcb293, roughness: 0.58, metalness: 0.0,
    clearcoat: 0.25, clearcoatRoughness: 0.55,
    sheen: 0.35, sheenColor: new THREE.Color(0xffe4d2), sheenRoughness: 0.5,
  });
  const hairMat = new THREE.MeshPhysicalMaterial({
    color: 0x0e0c0a, roughness: 0.32, metalness: 0.05,
    clearcoat: 0.85, clearcoatRoughness: 0.18,            // wet-hair gloss
  });
  const suitMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0b11, roughness: 0.58, metalness: 0.04,
    clearcoat: 0.18, clearcoatRoughness: 0.55,
    sheen: 0.50, sheenColor: new THREE.Color(0x30384a), sheenRoughness: 0.7,
  });
  const shirtMat = new THREE.MeshPhysicalMaterial({
    color: 0xf2f1ec, roughness: 0.64, metalness: 0.0,
    clearcoat: 0.10, clearcoatRoughness: 0.7,
  });
  const shoeMat = new THREE.MeshPhysicalMaterial({
    color: 0x05060a, roughness: 0.22, metalness: 0.08,
    clearcoat: 0.95, clearcoatRoughness: 0.08,            // polished leather
  });
  const phoneBodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0b10, roughness: 0.16, metalness: 0.88,
    clearcoat: 0.85, clearcoatRoughness: 0.10,
  });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x6a8fbc, roughness: 0.08, metalness: 0.0,
    emissive: new THREE.Color(0x4a78c8), emissiveIntensity: 1.3,
  });
  const badgeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf6f6f2, roughness: 0.45, metalness: 0.02,
    clearcoat: 0.55, clearcoatRoughness: 0.25,
  });
  const lanyardMat = new THREE.MeshStandardMaterial({
    color: 0x1c2734, roughness: 0.75, metalness: 0.0,
  });
  const cableMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8e6, roughness: 0.55, metalness: 0.0,
  });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xfbf6ee, roughness: 0.30, metalness: 0.0,
  });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x05060a });
  const lipMat = new THREE.MeshStandardMaterial({
    color: 0x8a4a44, roughness: 0.55,
  });

  // Convention: +X = forward (head direction), +Y = up (his back),
  // character is face-down-horizontal. Head sits at +X, feet trail at -X.

  // ── Torso (suit jacket) ──────────────────────────────────────────────
  // Use a tapered box-like sphere for the chest
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 14), suitMat);
  torso.scale.set(1.60, 0.80, 1.05);
  torso.position.set(-0.10, -0.02, 0);
  g.add(torso);

  // Lower back / waistline — slightly narrower
  const waist = new THREE.Mesh(new THREE.SphereGeometry(0.40, 14, 10), suitMat);
  waist.scale.set(1.00, 0.68, 0.95);
  waist.position.set(-0.90, -0.05, 0);
  g.add(waist);

  // White shirt V at the collar — peeks out of the open jacket
  const shirtV = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), shirtMat);
  shirtV.scale.set(0.85, 0.35, 0.90);
  shirtV.position.set(0.30, 0.22, 0);
  g.add(shirtV);

  // Open shirt collar points (two small lapels)
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), shirtMat);
    col.rotation.z =  Math.PI / 2;
    col.rotation.x =  s * 0.35;
    col.position.set(0.36, 0.18, s * 0.14);
    g.add(col);
  }

  // Jacket lapels — dark peaked lapels angled inward from the collar
  for (const s of [-1, 1]) {
    const lap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.58, 4), suitMat);
    lap.rotation.z =  Math.PI / 2;
    lap.rotation.x =  s * 0.55;
    lap.position.set(0.10, 0.12, s * 0.24);
    g.add(lap);
  }

  // ── Neck ─────────────────────────────────────────────────────────────
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.24, 12), skinMat);
  neck.rotation.z =  Math.PI / 2;
  neck.position.set(0.50, 0.04, 0);
  g.add(neck);

  // ── Head group (pivots on neck for look-down pose) ──────────────────
  const head = new THREE.Group();
  head.position.set(0.62, 0.04, 0);
  g.add(head);
  g.userData.head = head;

  // Skull
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), skinMat);
  skull.scale.set(1.05, 1.08, 0.98);
  head.add(skull);

  // Jawline — slightly narrower chin
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), skinMat);
  jaw.scale.set(0.85, 0.55, 0.95);
  jaw.position.set(0.12, -0.14, 0);
  head.add(jaw);

  // Ears
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
    ear.scale.set(0.55, 1.15, 0.75);
    ear.position.set(-0.05, 0.02, s * 0.23);
    head.add(ear);
  }

  // Nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 5), skinMat);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(0.22, -0.02, 0);
  head.add(nose);

  // Brow ridges (eyebrows) — concentrated brow for intent gaze
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.018, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 0.5 }));
    brow.rotation.y =  s * 0.12;
    brow.position.set(0.18, 0.09, s * 0.10);
    head.add(brow);
  }

  // Eyes (looking slightly down toward the phone)
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), eyeWhiteMat);
    eye.position.set(0.195, 0.04, s * 0.095);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), pupilMat);
    pupil.position.set(0.220, 0.028, s * 0.095);
    head.add(pupil);
    // Tiny specular glint — makes eyes feel alive
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(0.235, 0.034, s * 0.090);
    head.add(glint);
  }

  // Mouth — small slightly parted focus-mouth
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.055), lipMat);
  mouth.position.set(0.22, -0.10, 0);
  head.add(mouth);

  // ── Wet spiky hair — a ring of flattened tufts on the crown ─────────
  const hairTufts = [];
  // Scalp cap
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.245, 18, 12), hairMat);
  cap.scale.set(1.02, 0.72, 1.02);
  cap.position.set(-0.02, 0.10, 0);
  head.add(cap);
  // Front fringe — wet strands pushed forward and up
  const tuftDefs = [
    { x:  0.14, y: 0.22, z:  0.02, rx: -0.20, rz:  0.45, s: 1.0 },
    { x:  0.12, y: 0.26, z: -0.11, rx: -0.10, rz:  0.35, s: 0.85 },
    { x:  0.12, y: 0.26, z:  0.13, rx: -0.30, rz:  0.55, s: 0.85 },
    { x:  0.03, y: 0.31, z:  0.00, rx:  0.00, rz:  0.15, s: 1.05 },
    { x:  0.05, y: 0.29, z: -0.17, rx:  0.15, rz:  0.25, s: 0.80 },
    { x:  0.05, y: 0.29, z:  0.17, rx: -0.15, rz:  0.25, s: 0.80 },
    { x: -0.08, y: 0.30, z:  0.00, rx:  0.10, rz: -0.08, s: 0.95 },
    { x: -0.12, y: 0.26, z: -0.14, rx:  0.22, rz: -0.20, s: 0.80 },
    { x: -0.12, y: 0.26, z:  0.14, rx: -0.22, rz: -0.20, s: 0.80 },
    { x: -0.20, y: 0.20, z:  0.00, rx:  0.30, rz: -0.35, s: 0.75 },
  ];
  for (const td of tuftDefs) {
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(0.052, 0.20 * td.s, 5),
      hairMat,
    );
    tuft.rotation.x = td.rx;
    tuft.rotation.z = td.rz;
    tuft.position.set(td.x, td.y, td.z);
    tuft.userData.rz0 = td.rz;
    head.add(tuft);
    hairTufts.push(tuft);
  }
  g.userData.hairTufts = hairTufts;

  // ── ID badge on lanyard — hangs from neck, sways in the current ─────
  const badge = new THREE.Group();
  badge.position.set(0.40, -0.12, 0);
  g.add(badge);
  g.userData.badge = badge;
  // Lanyard strings (two thin cords going up to the back of the neck)
  for (const s of [-1, 1]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 5), lanyardMat);
    cord.rotation.z = -s * 0.12;
    cord.position.set(-0.02, 0.16, s * 0.05);
    badge.add(cord);
  }
  // Badge card
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.012), badgeMat);
  card.position.set(0.0, 0.0, 0);
  badge.add(card);
  // Blue header stripe on the badge
  const cardHdr = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.013),
    new THREE.MeshStandardMaterial({ color: 0x2a5a9a, roughness: 0.5 }));
  cardHdr.position.set(0.0, 0.042, 0);
  badge.add(cardHdr);
  // Text-ish detail lines
  for (let i = 0; i < 2; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.008, 0.013),
      new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 }));
    line.position.set(-0.01, -0.005 - i * 0.022, 0);
    badge.add(line);
  }

  // ── Arms ─────────────────────────────────────────────────────────────
  // Right arm (his right = -Z side) extends forward holding the phone.
  // Left arm drifts free.
  const armRadius = 0.085;

  // Helper to build a 2-segment arm (shoulder → elbow → wrist → hand).
  // Returns { shoulder, elbow } pivots.
  function buildArm(sideZ, mode) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.34, 0.08, sideZ * 0.32);
    g.add(shoulder);

    // Upper arm — suit sleeve
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.085, 0.50, 10), suitMat,
    );
    upper.rotation.z = Math.PI / 2;
    upper.position.x = 0.22;
    shoulder.add(upper);

    // Sleeve cuff ring — slightly darker band
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.088, 0.05, 10),
      new THREE.MeshPhysicalMaterial({ color: 0x05060a, roughness: 0.5 }),
    );
    cuff.rotation.z = Math.PI / 2;
    cuff.position.x = 0.47;
    shoulder.add(cuff);

    // Elbow pivot
    const elbow = new THREE.Group();
    elbow.position.set(0.50, 0, 0);
    shoulder.add(elbow);

    if (mode === 'phone') {
      // Forearm bends inward toward center (elbow rotation.y swings
      // forearm across the chest to meet the other hand at the phone).
      elbow.rotation.y = -sideZ * 1.05;
      elbow.rotation.z = -0.35;
    } else {
      elbow.rotation.y = -sideZ * 0.40;
      elbow.rotation.z = -0.15;
    }

    // Shirt cuff (white) — peeks out between jacket and hand
    const shirtCuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.082, 0.082, 0.05, 8), shirtMat,
    );
    shirtCuff.rotation.z = Math.PI / 2;
    shirtCuff.position.x = 0.04;
    elbow.add(shirtCuff);

    // Forearm — skin-tone (rolled-up sleeve feel)? Actually suited:
    // keep dark sleeve, shorter visible wrist
    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(armRadius, 0.088, 0.46, 10), suitMat,
    );
    forearm.rotation.z = Math.PI / 2;
    forearm.position.x = 0.29;
    elbow.add(forearm);

    // Wrist — small skin ring
    const wrist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.04, 8), skinMat,
    );
    wrist.rotation.z = Math.PI / 2;
    wrist.position.x = 0.52;
    elbow.add(wrist);

    // Hand — palm-down grip
    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.07, 0.11), skinMat,
    );
    hand.position.set(0.60, -0.01, 0);
    elbow.add(hand);

    // Fingers — subtle bumps for grip silhouette
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.03, 0.022), skinMat,
      );
      finger.position.set(0.70, -0.028, -0.04 + i * 0.025);
      elbow.add(finger);
    }

    return { shoulder, elbow, hand };
  }

  // His right arm (negative Z) holds the phone
  const rightArm = buildArm(-1, 'phone');
  g.userData.shoulderPhone = rightArm.shoulder;

  // Phone — parented to the hand so it moves with the arm
  const phone = new THREE.Group();
  phone.position.set(0.62, 0.05, 0.02);
  // Tilt so screen faces the user's (character's) eyes
  phone.rotation.z =  0.20;
  phone.rotation.y =  0.30;
  rightArm.elbow.add(phone);

  const phoneBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.30, 0.014, 0.15), phoneBodyMat,
  );
  phone.add(phoneBody);
  // Screen — slightly inset, emissive so it glows in the water
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.004, 0.13), screenMat,
  );
  screen.position.y = 0.010;
  phone.add(screen);
  // Tiny dark camera dot
  const cam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.010, 0.010, 0.006, 8),
    new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.3, metalness: 0.8 }),
  );
  cam.position.set(-0.12, -0.009, -0.05);
  phone.add(cam);
  g.userData.screenMat = screenMat;

  // His left arm (positive Z) drifts free
  const leftArm = buildArm(+1, 'free');
  g.userData.shoulderFree = leftArm.shoulder;
  g.userData.elbowFree    = leftArm.elbow;

  // ── Legs — horizontal swim pose, flutter-kick animated ──────────────
  function buildLeg(sideZ) {
    const hip = new THREE.Group();
    hip.position.set(-1.20, -0.08, sideZ * 0.13);
    hip.rotation.y = Math.PI;            // thigh points -X (trailing)
    g.add(hip);

    // Thigh — wool trouser
    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.135, 0.115, 0.70, 10), suitMat,
    );
    thigh.rotation.z = Math.PI / 2;
    thigh.position.x = 0.35;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0.70, 0, 0);
    hip.add(knee);

    // Shin — continues the trouser
    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.095, 0.68, 10), suitMat,
    );
    shin.rotation.z = Math.PI / 2;
    shin.position.x = 0.34;
    knee.add(shin);

    // Trouser hem — slight flare
    const hem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.100, 0.06, 10), suitMat,
    );
    hem.rotation.z = Math.PI / 2;
    hem.position.x = 0.66;
    knee.add(hem);

    // Shoe — polished leather, pointed toe
    const shoe = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 8), shoeMat,
    );
    shoe.scale.set(1.85, 0.65, 0.85);
    shoe.position.set(0.84, -0.04, 0);
    knee.add(shoe);

    // Shoe sole hint — darker thin slab underneath
    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.018, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.6 }),
    );
    sole.position.set(0.84, -0.095, 0);
    knee.add(sole);

    return { hip, knee };
  }

  const legL = buildLeg(-1); g.userData.hipL = legL.hip; g.userData.kneeL = legL.knee;
  const legR = buildLeg(+1); g.userData.hipR = legR.hip; g.userData.kneeR = legR.knee;

  // ── Earphones & cable ────────────────────────────────────────────────
  // Earbud in the left (visible) ear — white-ish capsule
  const budMat = new THREE.MeshPhysicalMaterial({
    color: 0xf0f0ec, roughness: 0.35, metalness: 0.05, clearcoat: 0.6,
  });
  const bud = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), budMat);
  bud.position.set(-0.04, 0.02, 0.24);
  head.add(bud);
  // Cable — a curved tube from ear down toward the phone
  const cablePts = [];
  const start = new THREE.Vector3(0.58, -0.02, 0.22);   // near ear in world frame
  const mid   = new THREE.Vector3(0.45, -0.20, 0.12);
  const near  = new THREE.Vector3(0.58, -0.10, 0.00);
  const end   = new THREE.Vector3(0.68, -0.06, -0.04);  // into phone area
  for (let i = 0; i <= 18; i++) {
    const k = i / 18;
    const p = new THREE.Vector3();
    // quadratic-ish blend across the 4 points
    if (k < 0.5) {
      const u = k / 0.5;
      p.lerpVectors(start, mid, u);
    } else {
      const u = (k - 0.5) / 0.5;
      p.lerpVectors(mid, near, u).lerp(end, u * 0.55);
    }
    // Add gentle droop
    p.y += Math.sin(k * Math.PI) * -0.06;
    cablePts.push(p);
  }
  const cableCurve = new THREE.CatmullRomCurve3(cablePts);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(cableCurve, 32, 0.006, 5, false),
    cableMat,
  );
  g.add(cable);

  // ── A few rising bubbles from the face — adds life, reads as breath ─
  const bubbleMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfe8ff, roughness: 0.04, metalness: 0.0,
    transmission: 0.9, transparent: true, opacity: 0.55,
    clearcoat: 1.0, clearcoatRoughness: 0.05,
  });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.03 + Math.random() * 0.025, 8, 6),
      bubbleMat,
    );
    b.position.set(0.80 + i * 0.08, 0.18 + i * 0.10, -0.05 + Math.random() * 0.10);
    g.add(b);
  }

  // Final scale — deliberately tiny; he reads as a comically small figure
  // lost in a giant ocean tank, which makes the near-misses with sharks
  // and megalodon feel all the more perilous.
  g.scale.setScalar(0.55);
  return g;
}
