import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TANK } from '../scene.js';
import { MoonJellyfish }    from '../creatures/jellies/MoonJellyfish.js';
import { RedJellyfish }     from '../creatures/jellies/RedJellyfish.js';
import { NomuraJellyfish }  from '../creatures/jellies/NomuraJellyfish.js';
import { SpottedJellyfish } from '../creatures/jellies/SpottedJellyfish.js';
import { CrystalJellyfish } from '../creatures/jellies/CrystalJellyfish.js';
import { initObservation }  from '../interaction/observationManager.js';
import { initAquariumAudio } from '../audio-aquarium.js';

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

  // ── Floor (暗い砂底 — 紫がかった陰影) ────────────────────────────────────
  buildFloor(scene);

  // ── Background rocks (奥の岩シルエット) ─────────────────────────────────
  buildBackgroundRocks(scene, isMobile);

  // ── Plankton (漂う光の粒) ───────────────────────────────────────────────
  const plankton = buildPlankton(isMobile ? 700 : 1400);
  scene.add(plankton.object);

  // ── Bubbles (まばらな小さな泡) ──────────────────────────────────────────
  const bubbles = buildBubbles(isMobile ? 30 : 60);
  scene.add(bubbles.object);

  // ── Water surface (天井の薄い揺らぎ) ────────────────────────────────────
  const waterSurf = buildWaterSurface(scene);

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

  // ── Audio ─────────────────────────────────────────────────────────────────
  const audio = initAquariumAudio({ theme: 'jellyfish', getCreatures: () => creatures });

  // ── UI panel ─────────────────────────────────────────────────────────────
  const uiPanel = buildUI(obs, renderer, audio);

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
  const state = { food: { active: false, position: new THREE.Vector3() } };
  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    if (paused) return;
    const dt   = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    for (const c of creatures) c.update(dt, time, state);
    animateRays(rays, dt, time);
    plankton.update(dt, time);
    bubbles.update(dt, time);
    animateWater(waterSurf, time);
    obs.update(dt);
    audio.update(dt, time);
    if (!obs.isObserving) orbit.update();
    if (performance.now() - _lastMove > 5000) uiPanel.classList.add('dim');
    renderer.render(scene, camera);
  }
  loop();
}

function addCreature(scene, c) { scene.add(c.mesh); return c; }

// ─── UI panel (種類ボタン / 鑑賞 / 音 / 明るさ) ────────────────────────────
function buildUI(obs, renderer, audio) {
  const panel = document.createElement('div');
  panel.className = 'ui';

  const body = document.createElement('div');
  body.className = 'ui-body';

  const SPECIES = [
    { id: 'moon-jelly',    label: 'ミズクラゲ' },
    { id: 'red-jelly',     label: 'アカクラゲ' },
    { id: 'nomura-jelly',  label: 'エチゼンクラゲ' },
    { id: 'spotted-jelly', label: 'タコクラゲ' },
    { id: 'crystal-jelly', label: 'オワンクラゲ' },
  ];
  const sGroup = document.createElement('div');
  sGroup.className = 'group species';
  for (const sp of SPECIES) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = sp.label;
    b.addEventListener('click', () => obs.selectSpecies(sp.id));
    sGroup.appendChild(b);
  }
  body.appendChild(sGroup);

  const cGroup = document.createElement('div');
  cGroup.className = 'group';

  const BRIGHT = [{ label: '暗め', v: 0.85 }, { label: '標準', v: 1.10 }, { label: '明るめ', v: 1.45 }];
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

  let soundOn = false;
  const btnSound = document.createElement('button');
  btnSound.className = 'btn';
  btnSound.textContent = '音 OFF';
  btnSound.setAttribute('aria-pressed', 'false');
  btnSound.addEventListener('click', () => {
    if (soundOn) {
      audio.disable(); soundOn = false;
      btnSound.textContent = '音 OFF';
      btnSound.setAttribute('aria-pressed', 'false');
    } else if (audio.enable()) {
      soundOn = true;
      btnSound.textContent = '音 ON';
      btnSound.setAttribute('aria-pressed', 'true');
    }
  });
  cGroup.appendChild(btnSound);

  const pickAmbient = () => obs.selectSpecies(SPECIES[Math.floor(Math.random() * SPECIES.length)].id);
  let ambientOn = true;
  let ambientTimer = setInterval(pickAmbient, 16000);
  pickAmbient();
  const btnAmbient = document.createElement('button');
  btnAmbient.className = 'btn';
  btnAmbient.textContent = '鑑賞 ON';
  btnAmbient.setAttribute('aria-pressed', 'true');
  btnAmbient.addEventListener('click', () => {
    ambientOn = !ambientOn;
    if (ambientOn) {
      pickAmbient();
      ambientTimer = setInterval(pickAmbient, 16000);
      btnAmbient.textContent = '鑑賞 ON';
      btnAmbient.setAttribute('aria-pressed', 'true');
    } else {
      clearInterval(ambientTimer);
      obs.stopObserving();
      btnAmbient.textContent = '鑑賞 OFF';
      btnAmbient.setAttribute('aria-pressed', 'false');
    }
  });
  cGroup.appendChild(btnAmbient);

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

// ─── Floor — 暗く沈んだ砂底、紫青の陰影 ───────────────────────────────────
function buildFloor(scene) {
  const geo = new THREE.PlaneGeometry(120, 120, 48, 48);
  geo.rotateX(-Math.PI / 2);
  // ゆるやかな丘陵
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = Math.sin(x * 0.10) * 0.30
            + Math.cos(z * 0.08) * 0.35
            + Math.sin((x + z) * 0.04) * 0.55;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a1830,
    map: makeFloorTexture(),
    roughness: 0.92,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(geo, mat);
  floor.position.y = TANK.floorY;
  floor.receiveShadow = false;
  scene.add(floor);
}

// ─── 背景の岩シルエット (奥行きの輪郭、暗い影) ────────────────────────────
function buildBackgroundRocks(scene, isMobile) {
  const count = isMobile ? 9 : 16;
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x140f30, roughness: 0.95, metalness: 0.0,
    emissive: 0x2a1c50, emissiveIntensity: 0.08,
  });
  for (let i = 0; i < count; i++) {
    const geo = new THREE.IcosahedronGeometry(1.6 + Math.random() * 2.4, 0);
    const p = geo.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const n = 0.7 + Math.random() * 0.5;
      p.setXYZ(j, p.getX(j) * n, p.getY(j) * (n * 0.65), p.getZ(j) * n);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    const ang = Math.random() * Math.PI * 2;
    const r = 19 + Math.random() * 14;
    m.position.set(
      Math.cos(ang) * r,
      TANK.floorY + 0.3 + Math.random() * 1.4,
      Math.sin(ang) * r,
    );
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.setScalar(0.9 + Math.random() * 1.5);
    group.add(m);
  }
  scene.add(group);
  return group;
}

// ─── Plankton (漂う光の粒、薄紫〜シアンの混色) ────────────────────────────
function buildPlankton(count) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const phases    = new Float32Array(count);
  const sizes     = new Float32Array(count);
  const tints     = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i*3]   = (Math.random() - 0.5) * 76;
    positions[i*3+1] = TANK.floorY + 0.5 + Math.random() * (TANK.maxY - TANK.floorY);
    positions[i*3+2] = (Math.random() - 0.5) * 56;
    phases[i] = Math.random() * Math.PI * 2;
    sizes[i]  = 0.18 + Math.random() * 0.85;
    tints[i]  = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aTint',    new THREE.BufferAttribute(tints, 1));

  const uniforms = {
    uTime:  { value: 0 },
    uTex:   { value: makePlanktonSprite() },
    uPixel: { value: window.innerHeight },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aPhase;
      attribute float aSize;
      attribute float aTint;
      uniform float uTime;
      uniform float uPixel;
      varying float vAlpha;
      varying float vTint;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.28 + aPhase) * 0.7;
        p.y += sin(uTime * 0.20 + aPhase * 1.3) * 0.4;
        p.z += cos(uTime * 0.24 + aPhase * 0.7) * 0.55;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float depthFade = clamp(1.0 + mv.z / 64.0, 0.0, 1.0);
        float tw = 0.55 + 0.45 * sin(uTime * 1.8 + aPhase * 2.3);
        vAlpha = depthFade * (0.25 + 0.75 * aSize) * tw;
        vTint  = aTint;
        gl_PointSize = aSize * uPixel * 0.026 / max(-mv.z, 0.1);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      varying float vAlpha;
      varying float vTint;
      void main(){
        vec4 c = texture2D(uTex, gl_PointCoord);
        vec3 violet = vec3(0.72, 0.55, 1.00);
        vec3 cyan   = vec3(0.55, 0.92, 1.00);
        vec3 col = mix(violet, cyan, smoothstep(0.0, 1.0, vTint));
        gl_FragColor = vec4(col * c.rgb, c.a * vAlpha * 0.9);
      }
    `,
  });
  const object = new THREE.Points(geo, mat);
  object.frustumCulled = false;
  return {
    object,
    update(dt, t) {
      uniforms.uTime.value = t;
      uniforms.uPixel.value = window.innerHeight;
    }
  };
}

function makePlanktonSprite() {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(220,210,255,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

// ─── Bubbles (まばらな小さな泡) ────────────────────────────────────────────
function buildBubbles(maxCount) {
  const geo = new THREE.SphereGeometry(0.08, 8, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc8d8ff, transparent: true, opacity: 0.45,
    roughness: 0.18, metalness: 0.0,
    emissive: 0x9080ff, emissiveIntensity: 0.18,
  });
  const inst = new THREE.InstancedMesh(geo, mat, maxCount);
  inst.frustumCulled = false;
  const state = [];
  for (let i = 0; i < maxCount; i++) state.push(reset({}, true));
  function reset(b, initial) {
    b.x = (Math.random() - 0.5) * 46;
    b.z = (Math.random() - 0.5) * 32;
    b.y = initial ? TANK.floorY + Math.random() * 14 : TANK.floorY + 0.3;
    b.vy = 0.30 + Math.random() * 0.85;
    b.scale = 0.4 + Math.random() * 1.0;
    b.phase = Math.random() * Math.PI * 2;
    b.wobble = 0.20 + Math.random() * 0.45;
    return b;
  }
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  return {
    object: inst,
    update(dt, t) {
      for (let i = 0; i < state.length; i++) {
        const b = state[i];
        b.y += b.vy * dt;
        if (b.y > TANK.maxY + 1) reset(b, false);
        v.set(
          b.x + Math.sin(t * 1.1 + b.phase) * b.wobble,
          b.y,
          b.z + Math.cos(t * 0.85 + b.phase) * b.wobble * 0.8,
        );
        const s = b.scale * (0.6 + 0.4 * Math.min(1, (b.y - TANK.floorY) / 10));
        m.makeScale(s, s, s); m.setPosition(v);
        inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
  };
}

// ─── Water surface (天井の薄い揺らぎ層) ────────────────────────────────────
function buildWaterSurface(scene) {
  const geo = new THREE.PlaneGeometry(80, 60, 24, 18);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x5040a0, transparent: true, opacity: 0.10,
    roughness: 0.30, metalness: 0.0,
    emissive: 0x3060a0, emissiveIntensity: 0.10,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = TANK.maxY - 0.6;
  scene.add(mesh);
  mesh.userData.basePos = geo.attributes.position.array.slice();
  return mesh;
}

function animateWater(mesh, time) {
  const pos = mesh.geometry.attributes.position;
  const base = mesh.userData.basePos;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i*3], z = base[i*3+2];
    pos.setY(i, Math.sin(x * 0.16 + time * 0.95) * 0.16
              + Math.cos(z * 0.20 + time * 0.75) * 0.14);
  }
  pos.needsUpdate = true;
}

function makeFloorTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  // 紫〜深青のベース
  g.fillStyle = '#1c1638';
  g.fillRect(0, 0, s, s);
  // ノイズ
  const img = g.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 30;
    d[i]   = Math.max(0, Math.min(255, d[i]   + n * 0.7));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n * 0.6));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
  }
  g.putImageData(img, 0, 0);
  // まばらな小石
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 1 + Math.random() * 3;
    g.fillStyle = `rgba(${20+Math.random()*40|0},${15+Math.random()*30|0},${50+Math.random()*60|0},${0.3+Math.random()*0.3})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // 微かな光る粒（生物発光の名残）
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 0.6 + Math.random() * 1.4;
    g.fillStyle = `rgba(160,140,255,${0.20+Math.random()*0.25})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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
