import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TANK } from '../scene.js';
import { Creature } from '../creatures/Creature.js';
import { initObservation } from '../interaction/observationManager.js';
import { initAquariumAudio } from '../audio-aquarium.js';

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
    ? { clown: 2, tetra: 5, turtle: 1, guppy: 4, shrimp: 3, seahorse: 1, eel: 6 }
    : { clown: 3, tetra: 8,  turtle: 1, guppy: 6, shrimp: 5, seahorse: 2, eel: 10 };

  for (let i = 0; i < counts.clown;    i++) creatures.push(add(scene, new Clownfish()));
  for (let i = 0; i < counts.tetra;    i++) creatures.push(add(scene, new NeonTetra()));
  for (let i = 0; i < counts.guppy;    i++) creatures.push(add(scene, new Guppy()));
  for (let i = 0; i < counts.shrimp;   i++) creatures.push(add(scene, new Shrimp()));
  for (let i = 0; i < counts.seahorse; i++) creatures.push(add(scene, new Seahorse()));
  creatures.push(add(scene, new SeaTurtle()));
  const gardenEels = buildGardenEels(scene, counts.eel);

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

  // ── Observation system ───────────────────────────────────────────────────
  const obs = initObservation({ camera, orbit, canvas, getCreatures: () => creatures });

  // ── Audio ─────────────────────────────────────────────────────────────────
  const audio = initAquariumAudio({ theme: 'tropical', getCreatures: () => creatures });

  // ── Food system ───────────────────────────────────────────────────────────
  const foodList = [];
  const T_GRAVITY = 0.45, T_DRAG = 0.55, T_EAT_R = 1.1;

  function refreshFoodTarget() {
    state.food.active = foodList.length > 0;
    if (foodList.length > 0) state.food.position.copy(foodList[0].mesh.position);
  }

  function dropFood(point) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffd080, roughness: 0.5, metalness: 0,
        emissive: 0xff9040, emissiveIntensity: 0.7 }),
    );
    m.position.copy(point);
    scene.add(m);
    foodList.push({
      mesh: m,
      vel: new THREE.Vector3((Math.random()-.5)*.18, -.2, (Math.random()-.5)*.18),
      life: 12,
    });
    audio.triggerFeed();
    refreshFoodTarget();
  }

  function updateFood(dt) {
    for (let i = foodList.length - 1; i >= 0; i--) {
      const f = foodList[i];
      f.life -= dt;
      f.vel.y -= T_GRAVITY * dt;
      f.vel.multiplyScalar(Math.pow(T_DRAG, dt));
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.y += dt * 1.2;
      f.mesh.rotation.x += dt * 0.9;
      let eaten = false;
      for (const c of creatures) {
        if (!c.cfg.reactsToFood) continue;
        if (c.pos.distanceTo(f.mesh.position) < T_EAT_R) {
          audio.triggerChomp(); eaten = true; break;
        }
      }
      if (!eaten && (f.mesh.position.y < TANK.floorY + 0.25 || f.life <= 0)) eaten = true;
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
      THREE.MathUtils.randFloatSpread(TANK.maxX * 0.7),
      TANK.maxY - 2,
      THREE.MathUtils.randFloatSpread(TANK.maxZ * 0.7),
    ));
  });

  // Auto-dim on inactivity (parity with deep-sea)
  let _lastMove = performance.now();
  ['pointermove', 'pointerdown', 'keydown'].forEach(evt =>
    window.addEventListener(evt, () => { _lastMove = performance.now(); uiPanel.classList.remove('dim'); }, { passive: true })
  );

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
    for (const el of gardenEels) {
      el.rotation.z = Math.sin(time * el.userData.spd + el.userData.phase) * 0.24;
      el.rotation.x = Math.cos(time * el.userData.spd * 0.65 + el.userData.phase) * 0.12;
    }

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

function add(scene, c) { scene.add(c.mesh); return c; }

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
    { id: 'clownfish',  label: 'クマノミ' },
    { id: 'neon-tetra', label: 'ネオンテトラ' },
    { id: 'sea-turtle', label: 'ウミガメ' },
    { id: 'guppy',      label: 'グッピー' },
    { id: 'shrimp',     label: '小エビ' },
    { id: 'seahorse',   label: 'タツノオトシゴ' },
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
  const BRIGHT = [{ label: '暗め', v: 0.80 }, { label: '標準', v: 1.35 }, { label: '明るめ', v: 1.90 }];
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
        facesVelocity: true, reactsToFood: true,
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
        facesVelocity: true, reactsToFood: true,
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

// ─── Guppy (グッピー) ─────────────────────────────────────────────────────

const GUPPY_COLORS = [0x2266ff, 0xff6622, 0x22cc55, 0xaa22ff, 0xff2266, 0x00cccc];

class Guppy extends Creature {
  constructor() {
    const color = GUPPY_COLORS[Math.floor(Math.random() * GUPPY_COLORS.length)];
    super({
      species: 'guppy',
      mesh: makeGuppyMesh(color),
      cfg: {
        speed: 2.1, maxAccel: 1.9, turnRate: 2.2,
        depthMin: TANK.floorY + 2, depthMax: TANK.maxY - 2,
        wanderMin: 3, wanderMax: 8, wallMargin: 5,
        facesVelocity: true,
      },
    });
    this._phase = Math.random() * Math.PI * 2;
  }
  onUpdate(dt, time) {
    this.mesh.rotation.y = Math.sin(time * 5.0 + this._phase) * 0.14 * (0.4 + this.speedNorm * 0.6);
  }
}

function makeGuppyMesh(tailColor) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc8d8b8, roughness: 0.50, metalness: 0.12 });
  const tailMat = new THREE.MeshStandardMaterial({
    color: tailColor, roughness: 0.38, side: THREE.DoubleSide,
    transparent: true, opacity: 0.80,
    emissive: new THREE.Color(tailColor).multiplyScalar(0.14),
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 7), bodyMat);
  body.scale.set(2.0, 1.0, 0.70);
  g.add(body);

  // Large fan tail
  const ts = new THREE.Shape();
  ts.moveTo(0, 0);
  ts.quadraticCurveTo(-0.22,  0.28, -0.44,  0.38);
  ts.quadraticCurveTo(-0.54,  0.0,  -0.44, -0.38);
  ts.quadraticCurveTo(-0.22, -0.28,  0.0,   0.0);
  const tail = new THREE.Mesh(new THREE.ShapeGeometry(ts, 8), tailMat);
  tail.position.x = -0.30;
  g.add(tail);

  // Dorsal fin
  const ds = new THREE.Shape();
  ds.moveTo(0, 0); ds.lineTo(-0.18, 0.22); ds.lineTo(-0.36, 0); ds.lineTo(0, 0);
  const dors = new THREE.Mesh(new THREE.ShapeGeometry(ds, 4), tailMat.clone());
  dors.position.set(-0.04, 0.16, 0);
  g.add(dors);

  g.scale.setScalar(0.54);
  return g;
}

// ─── Shrimp (小エビ) ──────────────────────────────────────────────────────

class Shrimp extends Creature {
  constructor() {
    super({
      species: 'shrimp',
      mesh: makeShrimpMesh(),
      cfg: {
        speed: 3.2, maxAccel: 4.2, turnRate: 3.8,
        depthMin: TANK.floorY + 0.5, depthMax: TANK.floorY + 5,
        wanderMin: 1.5, wanderMax: 4, wallMargin: 4,
        facesVelocity: true,
      },
    });
    this._phase = Math.random() * Math.PI * 2;
  }
  onUpdate(dt, time) {
    this.mesh.rotation.y = Math.sin(time * 8.0 + this._phase) * 0.12;
  }
}

function makeShrimpMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff8888, roughness: 0.42, metalness: 0.10,
    transparent: true, opacity: 0.74,
  });
  const antMat = new THREE.MeshStandardMaterial({ color: 0xff7070, transparent: true, opacity: 0.55 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat);
  body.scale.set(1.85, 0.78, 0.62);
  g.add(body);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.20, 6), mat);
  tailCone.rotation.z = Math.PI / 2;
  tailCone.position.x = -0.25;
  g.add(tailCone);

  const rostrum = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 6), mat);
  rostrum.rotation.z = -Math.PI / 2;
  rostrum.position.x = 0.28;
  g.add(rostrum);

  for (const side of [-1, 1]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.28, 4), antMat);
    ant.rotation.z = -0.8;
    ant.position.set(0.22, 0.06, 0.04 * side);
    g.add(ant);
  }

  g.scale.setScalar(0.44);
  return g;
}

// ─── Seahorse (タツノオトシゴ) ────────────────────────────────────────────

class Seahorse extends Creature {
  constructor() {
    super({
      species: 'seahorse',
      mesh: makeSeahorseMesh(),
      cfg: {
        speed: 0.55, maxAccel: 0.28, turnRate: 0.38,
        depthMin: TANK.floorY + 3, depthMax: TANK.maxY - 3,
        wanderMin: 8, wanderMax: 18, wallMargin: 6,
        facesVelocity: false,
      },
    });
    this._phase = Math.random() * Math.PI * 2;
  }
  onUpdate(dt, time) {
    if (this.vel.lengthSq() > 0.0005) {
      const ang = Math.atan2(-this.vel.z, this.vel.x);
      const cur = this.mesh.rotation.y;
      this.mesh.rotation.y = cur + (ang - cur) * Math.min(1, dt * 0.45);
    }
    this.mesh.rotation.z = Math.sin(time * 0.85 + this._phase) * 0.10;
  }
}

function makeSeahorseMesh() {
  const g   = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf0a030, roughness: 0.62, metalness: 0.06 });
  const dk  = new THREE.MeshStandardMaterial({ color: 0xb87020, roughness: 0.72 });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0xffcc44, roughness: 0.42, side: THREE.DoubleSide, transparent: true, opacity: 0.70,
  });

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 9, 7), mat);
  head.position.set(0, 0.86, 0);
  head.scale.set(0.88, 1.0, 0.72);
  g.add(head);

  // Snout
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.038, 0.30, 7), mat);
  snout.rotation.z = -0.35;
  snout.position.set(0.22, 0.90, 0);
  g.add(snout);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.21, 0.28, 9), mat);
  neck.position.set(0, 0.55, 0);
  g.add(neck);

  // Body
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat);
  body.scale.set(0.86, 1.18, 0.70);
  body.position.set(0, 0.14, 0);
  g.add(body);

  // Curled tail (5 segments)
  for (let i = 0; i < 5; i++) {
    const t   = i / 4;
    const ang = t * 1.9;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 - t * 0.072, 0.15 - t * 0.072, 0.22, 7), dk,
    );
    seg.position.set(Math.sin(ang) * 0.20, -0.22 - t * 0.32, 0);
    seg.rotation.z = ang * 0.58;
    g.add(seg);
  }

  // Crown spines
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 5), dk);
    sp.position.set(-0.04 + i * 0.04, 1.08 - i * 0.055, Math.sin(i * 1.2) * 0.07);
    g.add(sp);
  }

  // Dorsal fin
  const fs = new THREE.Shape();
  fs.moveTo(0, 0); fs.lineTo(0.20, 0.15); fs.lineTo(0, 0.28); fs.lineTo(-0.07, 0.13); fs.lineTo(0, 0);
  const fin = new THREE.Mesh(new THREE.ShapeGeometry(fs, 6), finMat);
  fin.position.set(0, 0.08, 0.25);
  fin.rotation.y = Math.PI / 2;
  g.add(fin);

  g.scale.setScalar(0.82);
  return g;
}

// ─── Garden Eels (チンアナゴ) ─────────────────────────────────────────────

function buildGardenEels(scene, count) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc8b880, roughness: 0.65, metalness: 0.04 });
  const dotMat  = new THREE.MeshStandardMaterial({ color: 0x706050, roughness: 0.70 });
  const eels    = [];
  for (let i = 0; i < count; i++) {
    const h   = THREE.MathUtils.randFloat(1.4, 2.5);
    const geo = new THREE.CylinderGeometry(0.042, 0.072, h, 8, 1);
    geo.translate(0, h / 2, 0);   // pivot at base so rotation swings the tip
    const eel = new THREE.Mesh(geo, bodyMat.clone());
    eel.position.set(
      THREE.MathUtils.randFloat(-22, 22),
      TANK.floorY + 0.06,
      THREE.MathUtils.randFloat(-16, 16),
    );
    eel.userData.phase = Math.random() * Math.PI * 2;
    eel.userData.spd   = 0.33 + Math.random() * 0.30;

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.064, 8, 6), bodyMat.clone());
    head.position.y = h + 0.022;
    head.scale.set(0.88, 1.08, 0.82);
    eel.add(head);

    // Spot markings
    for (let j = 0; j < 3; j++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.024, 5, 4), dotMat);
      dot.position.set(0.052, h * (0.22 + j * 0.22), 0);
      eel.add(dot);
    }

    scene.add(eel);
    eels.push(eel);
  }
  return eels;
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
