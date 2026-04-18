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
  const state     = { food: { active: false, position: new THREE.Vector3() } };
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
