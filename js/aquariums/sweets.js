import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TANK } from '../scene.js';
import { Taiyaki } from '../creatures/sweets/Taiyaki.js';

// ─────────────────────────────────────────────────────────────────────────────
// Sweets Aquarium — pastel, dreamy soda-water scene
// Step 3: base environment — sugar floor, soda bubbles, god rays, candy corals,
// sparkle particles. Creatures come in step 4+.
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
  renderer.toneMappingExposure = 1.30;
  if (!isMobile) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = makeBgTexture();
  scene.fog = new THREE.FogExp2(0xf0d8ee, isMobile ? 0.011 : 0.015);

  const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 140);
  camera.position.set(0, 3.5, 32);

  // ── Lights ───────────────────────────────────────────────────────────────
  const shimmer = buildLights(scene, isMobile);

  // ── Environment ──────────────────────────────────────────────────────────
  buildFloor(scene);
  const candies   = buildCandyCorals(scene);
  const rays      = buildSunRays(scene, isMobile);
  const bubbles   = buildSodaBubbles(isMobile ? 60 : 120);
  scene.add(bubbles.object);
  const sparkles  = buildSparkles(isMobile ? 600 : 1200);
  scene.add(sparkles.object);
  const waterSurf = buildWaterSurface(scene);

  // ── Creatures ────────────────────────────────────────────────────────────
  const creatures = [];
  const state = { food: { active: false, position: new THREE.Vector3() } };
  const counts = isMobile ? { taiyaki: 2 } : { taiyaki: 3 };
  for (let i = 0; i < counts.taiyaki; i++) creatures.push(addCreature(scene, new Taiyaki()));

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

    shimmer.position.x = Math.sin(time * 0.4) * 10;
    shimmer.position.z = Math.cos(time * 0.28) * 7;
    shimmer.intensity  = 0.9 + Math.sin(time * 2.2) * 0.25;

    animateCandies(candies, time);
    animateWater(waterSurf, time);
    animateRays(rays, dt, time);
    bubbles.update(dt, time);
    sparkles.update(dt, time);

    for (const c of creatures) c.update(dt, time, state);

    orbit.update();
    renderer.render(scene, camera);
  }
  loop();
}

function addCreature(scene, c) { scene.add(c.mesh); return c; }

// ─── Background (pastel soda-water gradient) ──────────────────────────────
function makeBgTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#ffe8f4');
  grad.addColorStop(0.35, '#d8ecff');
  grad.addColorStop(0.75, '#a8d4ff');
  grad.addColorStop(1.00, '#6898c8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Lights (soft pastel key + colored rim + shimmer) ─────────────────────
function buildLights(scene, isMobile) {
  scene.add(new THREE.AmbientLight(0xffe8f4, 0.95));

  const sun = new THREE.DirectionalLight(0xfff4dc, 2.1);
  sun.position.set(8, 26, 12);
  sun.target.position.set(0, TANK.floorY, 0);
  scene.add(sun.target);
  if (!isMobile) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -28;
    sun.shadow.camera.right = sun.shadow.camera.top = 28;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0006;
  }
  scene.add(sun);

  const pinkRim = new THREE.PointLight(0xff9cc8, 0.9, 60, 1.7);
  pinkRim.position.set(-18, 4, -8);
  scene.add(pinkRim);

  const mintRim = new THREE.PointLight(0x9ce8d8, 0.75, 60, 1.7);
  mintRim.position.set(18, 2, 10);
  scene.add(mintRim);

  const shimmer = new THREE.PointLight(0xfff0c8, 1.1, 45, 1.6);
  shimmer.position.set(0, TANK.floorY + 6, 0);
  scene.add(shimmer);
  return shimmer;
}

// ─── Sugar floor (pale sand) ──────────────────────────────────────────────
function buildFloor(scene) {
  const mat = new THREE.MeshStandardMaterial({
    map: makeSugarTexture(), color: 0xfff4e8, roughness: 0.85, metalness: 0,
  });
  const geo = new THREE.PlaneGeometry(64, 44, 22, 16);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, (Math.random() - 0.5) * 0.16
              + Math.sin(x * 0.32) * 0.12 + Math.cos(y * 0.26) * 0.10);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const floor = new THREE.Mesh(geo, mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y  = TANK.floorY;
  floor.receiveShadow = true;
  scene.add(floor);
}

function makeSugarTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#fff4e8';
  g.fillRect(0, 0, s, s);
  const img = g.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 28;
    d[i]   = Math.max(0, Math.min(255, d[i]   + n));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n * 0.9));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n * 0.7));
  }
  g.putImageData(img, 0, 0);
  // sugar-crystal sparkle dots
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 0.7 + Math.random() * 1.6;
    g.fillStyle = `rgba(255,${230+Math.random()*25|0},${240+Math.random()*15|0},${0.45+Math.random()*0.4})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI*2); g.fill();
  }
  // pastel pebbles (rainbow sugar)
  const pastel = ['#ffc8dc','#c8e4ff','#fff0b8','#d8f4d0','#e8d0ff'];
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 1.5 + Math.random() * 3;
    g.fillStyle = pastel[i % pastel.length] + 'b0';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI*2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Candy "corals" — lollipops, macarons, wafer sticks ───────────────────
function buildCandyCorals(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const defs = [
    { type: 'lolli',   pos: [ 8,  4], color: 0xff88b4, h: 2.8 },
    { type: 'macaron', pos: [-9, -3], color: 0xffd080, h: 0 },
    { type: 'wafer',   pos: [13, -6], color: 0xe8c48a, h: 2.1 },
    { type: 'lolli',   pos: [-15, 6], color: 0xa8d8ff, h: 2.4 },
    { type: 'macaron', pos: [ 2, -10], color: 0xff9cc8, h: 0 },
    { type: 'lolli',   pos: [19,  5], color: 0xc8f0b0, h: 1.8 },
    { type: 'macaron', pos: [-19,-5], color: 0xd8b4ff, h: 0 },
    { type: 'wafer',   pos: [ 5, 12], color: 0xffc090, h: 1.6 },
    { type: 'lolli',   pos: [-4,-12], color: 0xffcc66, h: 2.0 },
  ];
  const items = [];
  for (const d of defs) {
    let m;
    if (d.type === 'lolli')   m = makeLollipop(d.color, d.h);
    else if (d.type === 'macaron') m = makeMacaron(d.color);
    else                      m = makeWafer(d.color, d.h);
    m.position.set(d.pos[0], TANK.floorY, d.pos[1]);
    m.userData.phase = Math.random() * Math.PI * 2;
    m.userData.baseY = m.position.y;
    group.add(m);
    items.push(m);
  }
  return items;
}

function makeLollipop(color, h) {
  const g = new THREE.Group();
  const stickMat = new THREE.MeshStandardMaterial({ color: 0xfff8ee, roughness: 0.55 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, h, 8), stickMat);
  stick.position.y = h * 0.5;
  stick.castShadow = true;
  g.add(stick);
  const swirlMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.35, metalness: 0.05,
    emissive: new THREE.Color(color).multiplyScalar(0.12),
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 18, 14), swirlMat);
  head.scale.set(1, 1, 0.28);
  head.position.y = h + 0.1;
  head.castShadow = true;
  g.add(head);
  // swirl stripe
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 8, 20), stripeMat);
  stripe.position.y = h + 0.1;
  stripe.rotation.y = Math.PI * 0.5;
  g.add(stripe);
  return g;
}

function makeMacaron(color) {
  const g = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.6, metalness: 0,
  });
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, roughness: 0.45 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), shellMat);
  top.scale.set(1, 0.32, 1);
  top.position.y = 0.55;
  top.castShadow = true;
  g.add(top);
  const cream = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.18, 16), creamMat);
  cream.position.y = 0.36;
  g.add(cream);
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), shellMat);
  bot.scale.set(1, 0.32, 1);
  bot.position.y = 0.15;
  bot.castShadow = true;
  g.add(bot);
  return g;
}

function makeWafer(color, h) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
  for (let i = 0; i < 3; i++) {
    const layer = new THREE.Mesh(new THREE.BoxGeometry(0.55, h / 3 * 0.9, 0.55), mat);
    layer.position.y = (i + 0.5) * (h / 3);
    layer.castShadow = true;
    g.add(layer);
  }
  return g;
}

function animateCandies(items, time) {
  for (const m of items) {
    m.position.y = m.userData.baseY + Math.sin(time * 0.7 + m.userData.phase) * 0.06;
    m.rotation.y = Math.sin(time * 0.3 + m.userData.phase) * 0.2;
  }
}

// ─── Sun rays (soft, warm) ────────────────────────────────────────────────
function buildSunRays(scene, isMobile) {
  const rayCount = isMobile ? 4 : 7;
  const tex = makeRayTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: 0.32, color: 0xfff0dc, side: THREE.DoubleSide, fog: true,
  });
  const group = new THREE.Group();
  const rays = [];
  for (let i = 0; i < rayCount; i++) {
    const geo = new THREE.PlaneGeometry(8, 40);
    const m = new THREE.Mesh(geo, mat);
    const ang = (i / rayCount) * Math.PI * 2 + Math.random() * 0.6;
    const r = 6 + Math.random() * 14;
    m.position.set(Math.cos(ang) * r, 5, Math.sin(ang) * r);
    m.rotation.y = Math.random() * Math.PI;
    m.rotation.z = (Math.random() - 0.5) * 0.22;
    m.userData.phase = Math.random() * Math.PI * 2;
    m.userData.baseX = m.position.x;
    m.userData.baseZ = m.position.z;
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
  grad.addColorStop(0, 'rgba(255,250,230,0.95)');
  grad.addColorStop(0.4, 'rgba(255,220,235,0.35)');
  grad.addColorStop(1.0, 'rgba(200,220,255,0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

function animateRays(rays, dt, time) {
  for (const r of rays) {
    r.position.x = r.userData.baseX + Math.sin(time * 0.13 + r.userData.phase) * 0.8;
    r.position.z = r.userData.baseZ + Math.cos(time * 0.11 + r.userData.phase) * 0.7;
    r.rotation.y += dt * 0.04;
  }
}

// ─── Soda bubbles (carbonation) ───────────────────────────────────────────
function buildSodaBubbles(maxCount) {
  const geo = new THREE.SphereGeometry(0.11, 8, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.58,
    roughness: 0.15, metalness: 0, emissive: 0xffe8f4, emissiveIntensity: 0.2,
  });
  const inst = new THREE.InstancedMesh(geo, mat, maxCount);
  inst.frustumCulled = false;

  const state = [];
  for (let i = 0; i < maxCount; i++) state.push(reset({}, true));

  function reset(b, initial) {
    b.x = (Math.random() - 0.5) * 44;
    b.z = (Math.random() - 0.5) * 32;
    b.y = initial ? TANK.floorY + Math.random() * 14 : TANK.floorY + 0.25;
    b.vy = 0.45 + Math.random() * 1.1;
    b.scale = 0.35 + Math.random() * 1.2;
    b.phase = Math.random() * Math.PI * 2;
    b.wobble = 0.18 + Math.random() * 0.5;
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
        if (b.y > TANK.maxY + 0.8) reset(b, false);
        v.set(
          b.x + Math.sin(t * 1.3 + b.phase) * b.wobble,
          b.y,
          b.z + Math.cos(t * 0.95 + b.phase) * b.wobble * 0.8
        );
        const s = b.scale * (0.6 + 0.4 * Math.min(1, (b.y - TANK.floorY) / 10));
        m.makeScale(s, s, s);
        m.setPosition(v);
        inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
  };
}

// ─── Sparkle particles (candy glitter) ────────────────────────────────────
function buildSparkles(count) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const tints = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i*3]   = (Math.random() - 0.5) * 72;
    positions[i*3+1] = TANK.floorY + 0.5 + Math.random() * (TANK.maxY - TANK.floorY);
    positions[i*3+2] = (Math.random() - 0.5) * 52;
    phases[i] = Math.random() * Math.PI * 2;
    sizes[i]  = 0.2 + Math.random() * 0.9;
    tints[i]  = Math.random(); // 0..1 → pink..mint..cream
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aTint',    new THREE.BufferAttribute(tints, 1));

  const uniforms = {
    uTime: { value: 0 },
    uTex:  { value: makeSparkleSprite() },
    uPixel:{ value: window.innerHeight },
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
        p.x += sin(uTime * 0.3 + aPhase) * 0.7;
        p.y += sin(uTime * 0.22 + aPhase * 1.3) * 0.4;
        p.z += cos(uTime * 0.27 + aPhase * 0.7) * 0.55;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float depthFade = clamp(1.0 + mv.z / 62.0, 0.0, 1.0);
        float tw = 0.6 + 0.4 * sin(uTime * 2.4 + aPhase * 3.0);
        vAlpha = depthFade * (0.25 + 0.75 * aSize) * tw;
        vTint  = aTint;
        gl_PointSize = aSize * uPixel * 0.028 / max(-mv.z, 0.1);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      varying float vAlpha;
      varying float vTint;
      void main(){
        vec4 c = texture2D(uTex, gl_PointCoord);
        vec3 pink = vec3(1.00, 0.82, 0.92);
        vec3 mint = vec3(0.82, 0.98, 0.92);
        vec3 cream= vec3(1.00, 0.96, 0.82);
        vec3 col = mix(mix(pink, mint, smoothstep(0.0, 0.5, vTint)), cream, smoothstep(0.5, 1.0, vTint));
        gl_FragColor = vec4(col * c.rgb, c.a * vAlpha * 0.85);
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

function makeSparkleSprite() {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,240,255,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

// ─── Gentle water surface overlay ─────────────────────────────────────────
function buildWaterSurface(scene) {
  const geo = new THREE.PlaneGeometry(80, 60, 24, 18);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xfff0f8, transparent: true, opacity: 0.14,
    roughness: 0.25, metalness: 0, emissive: 0xa8d4ff, emissiveIntensity: 0.08,
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
    pos.setY(i, Math.sin(x * 0.18 + time * 1.1) * 0.18
              + Math.cos(z * 0.22 + time * 0.85) * 0.14);
  }
  pos.needsUpdate = true;
}
