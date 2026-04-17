import * as THREE from 'three';

export const TANK = {
  minX: -26, maxX: 26,
  minY: -8,  maxY: 10,
  minZ: -18, maxZ: 18,
  floorY: -8,
};

export function buildScene(scene, { isMobile }) {
  scene.fog = new THREE.FogExp2(0x06283a, isMobile ? 0.028 : 0.034);
  scene.background = makeGradientTexture();

  const updaters = [];

  // Lights ---------------------------------------------------------------
  const ambient = new THREE.AmbientLight(0x20506a, 0.55);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xd8f2ff, 0.95);
  key.position.set(6, 24, 8);
  key.target.position.set(0, TANK.floorY, 0);
  scene.add(key.target);
  if (!isMobile) {
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.left = -30;
    key.shadow.camera.right = 30;
    key.shadow.camera.top = 30;
    key.shadow.camera.bottom = -30;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 80;
    key.shadow.bias = -0.0008;
  }
  scene.add(key);

  const fillCyan = new THREE.PointLight(0x38b0d6, 0.9, 80, 1.6);
  fillCyan.position.set(-14, 8, 10);
  scene.add(fillCyan);

  const fillEmerald = new THREE.PointLight(0x46d6a8, 0.6, 70, 1.7);
  fillEmerald.position.set(16, -2, -8);
  scene.add(fillEmerald);

  // Seafloor + caustics --------------------------------------------------
  const floorGeo = new THREE.PlaneGeometry(120, 120, 64, 64);
  floorGeo.rotateX(-Math.PI / 2);
  // Gentle dunes
  const pos = floorGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = Math.sin(x * 0.12) * 0.35 + Math.cos(z * 0.09) * 0.4 + Math.sin((x + z) * 0.05) * 0.6;
    pos.setY(i, h);
  }
  floorGeo.computeVertexNormals();

  const sandTex = makeSandTexture();
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x9f8466,
    roughness: 0.95,
    metalness: 0.0,
    map: sandTex,
  });
  // Inject caustics into the floor shader
  const causticsUniforms = { uTime: { value: 0 } };
  floorMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = causticsUniforms.uTime;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\nvarying vec3 vWPos;`
    ).replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>\nvWPos = worldPosition.xyz;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\nuniform float uTime;\nvarying vec3 vWPos;
      float caustic(vec2 p){
        float t = uTime * 0.35;
        vec2 a = p * 0.35;
        vec2 b = mat2(0.87,-0.5,0.5,0.87) * p * 0.5 + vec2(t*0.6, -t*0.4);
        vec2 c = mat2(0.5,0.87,-0.87,0.5) * p * 0.7 + vec2(-t*0.3, t*0.5);
        float s = sin(a.x + cos(a.y + t)) + sin(a.y*1.3 - t*0.7);
        float s2 = sin(b.x*1.1 + cos(b.y*0.9));
        float s3 = sin(c.x + cos(c.y*1.2 - t));
        float v = s + s2 + s3;
        v = pow(max(v*0.22, 0.0), 3.0);
        return v;
      }`
    ).replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      float c = caustic(vWPos.xz);
      gl_FragColor.rgb += vec3(0.35, 0.85, 0.95) * c * 0.9;`
    );
  };

  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = TANK.floorY;
  floor.receiveShadow = !isMobile;
  scene.add(floor);

  updaters.push((dt, t) => { causticsUniforms.uTime.value = t; });

  // God rays ------------------------------------------------------------
  const rayCount = isMobile ? 3 : 6;
  const rayTex = makeGodRayTexture();
  const rayMat = new THREE.MeshBasicMaterial({
    map: rayTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.28,
    color: 0xbfe8ff,
    side: THREE.DoubleSide,
    fog: true,
  });
  const rayGroup = new THREE.Group();
  const rays = [];
  for (let i = 0; i < rayCount; i++) {
    const geo = new THREE.PlaneGeometry(10, 42);
    const m = new THREE.Mesh(geo, rayMat);
    const ang = (i / rayCount) * Math.PI * 2 + Math.random() * 0.6;
    const r = 8 + Math.random() * 14;
    m.position.set(Math.cos(ang) * r, 5, Math.sin(ang) * r);
    m.rotation.y = Math.random() * Math.PI;
    m.rotation.z = (Math.random() - 0.5) * 0.25;
    m.userData.phase = Math.random() * Math.PI * 2;
    m.userData.baseX = m.position.x;
    m.userData.baseZ = m.position.z;
    rays.push(m);
    rayGroup.add(m);
  }
  scene.add(rayGroup);
  updaters.push((dt, t) => {
    for (const r of rays) {
      r.position.x = r.userData.baseX + Math.sin(t * 0.12 + r.userData.phase) * 0.8;
      r.position.z = r.userData.baseZ + Math.cos(t * 0.1 + r.userData.phase) * 0.6;
      r.rotation.y += dt * 0.04;
    }
  });

  // Plankton particles --------------------------------------------------
  const planktonCount = isMobile ? 800 : 1500;
  const plankton = makePlankton(planktonCount);
  scene.add(plankton.object);
  updaters.push((dt, t) => plankton.update(dt, t));

  // Bubble vents -------------------------------------------------------
  const bubbles = makeBubbles(isMobile ? 40 : 80);
  scene.add(bubbles.object);
  updaters.push((dt, t) => bubbles.update(dt, t));

  // Back silhouettes (rocks) -------------------------------------------
  const rocks = makeRocks(isMobile ? 8 : 14);
  scene.add(rocks);

  return {
    update(dt, t) {
      for (const fn of updaters) fn(dt, t);
    },
    bubbles,
  };
}

// ---------------------------------------------------------------------
// Textures (procedural)
// ---------------------------------------------------------------------

function makeGradientTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#0b3a56');
  grad.addColorStop(0.35, '#07263a');
  grad.addColorStop(0.75, '#03131e');
  grad.addColorStop(1.0, '#010609');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSandTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#b4997a';
  g.fillRect(0, 0, s, s);
  const img = g.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 40;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n * 0.9));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n * 0.6));
  }
  g.putImageData(img, 0, 0);
  // sprinkle pebbles
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 1 + Math.random() * 2.5;
    g.fillStyle = `rgba(${60+Math.random()*70|0},${50+Math.random()*60|0},${40+Math.random()*50|0},${0.25+Math.random()*0.4})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI*2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = 4;
  return tex;
}

function makeGodRayTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(200,240,255,0.35)');
  grad.addColorStop(1.0, 'rgba(0,20,40,0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function makePlanktonSprite() {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  grad.addColorStop(0, 'rgba(220,255,255,1)');
  grad.addColorStop(0.35, 'rgba(160,220,255,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------------
// Plankton
// ---------------------------------------------------------------------
function makePlankton(count) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i*3] = (Math.random() - 0.5) * 70;
    positions[i*3+1] = TANK.floorY + 0.5 + Math.random() * (TANK.maxY - TANK.floorY);
    positions[i*3+2] = (Math.random() - 0.5) * 50;
    phases[i] = Math.random() * Math.PI * 2;
    sizes[i] = 0.25 + Math.random() * 0.9;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const uniforms = {
    uTime: { value: 0 },
    uTex:  { value: makePlanktonSprite() },
    uPixel:{ value: window.innerHeight },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      uniform float uPixel;
      varying float vAlpha;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.3 + aPhase) * 0.6;
        p.y += sin(uTime * 0.22 + aPhase * 1.3) * 0.35;
        p.z += cos(uTime * 0.27 + aPhase * 0.7) * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float depthFade = clamp(1.0 + mv.z / 60.0, 0.0, 1.0);
        vAlpha = depthFade * (0.25 + 0.75 * aSize);
        gl_PointSize = aSize * uPixel * 0.025 / max(-mv.z, 0.1);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      varying float vAlpha;
      void main(){
        vec4 c = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(c.rgb, c.a * vAlpha * 0.75);
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

// ---------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------
function makeBubbles(maxCount) {
  const geo = new THREE.SphereGeometry(0.09, 8, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd8f2ff,
    transparent: true,
    opacity: 0.55,
    roughness: 0.15,
    metalness: 0.0,
    emissive: 0x88c8e0,
    emissiveIntensity: 0.15,
  });
  const inst = new THREE.InstancedMesh(geo, mat, maxCount);
  inst.frustumCulled = false;
  const state = [];
  for (let i = 0; i < maxCount; i++) {
    state.push(resetBubble({}, true));
  }
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();

  function resetBubble(b, initial) {
    b.x = (Math.random() - 0.5) * 44;
    b.z = (Math.random() - 0.5) * 32;
    b.y = initial ? TANK.floorY + Math.random() * 12 : TANK.floorY + 0.3;
    b.vy = 0.4 + Math.random() * 1.1;
    b.scale = 0.4 + Math.random() * 1.1;
    b.phase = Math.random() * Math.PI * 2;
    b.wobble = 0.2 + Math.random() * 0.5;
    return b;
  }

  return {
    object: inst,
    spawnAt(x, y, z, n = 8) {
      for (let k = 0; k < n; k++) {
        const b = state[Math.floor(Math.random() * state.length)];
        b.x = x + (Math.random() - 0.5) * 0.6;
        b.z = z + (Math.random() - 0.5) * 0.6;
        b.y = y;
        b.vy = 0.7 + Math.random() * 1.2;
      }
    },
    update(dt, t) {
      for (let i = 0; i < state.length; i++) {
        const b = state[i];
        b.y += b.vy * dt;
        if (b.y > TANK.maxY + 1) resetBubble(b, false);
        v.set(
          b.x + Math.sin(t * 1.2 + b.phase) * b.wobble,
          b.y,
          b.z + Math.cos(t * 0.9 + b.phase) * b.wobble * 0.8
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

// ---------------------------------------------------------------------
// Background rocks (cheap silhouettes)
// ---------------------------------------------------------------------
function makeRocks(count) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a3440,
    roughness: 0.95,
    metalness: 0.0,
  });
  for (let i = 0; i < count; i++) {
    const geo = new THREE.IcosahedronGeometry(1.6 + Math.random() * 2.2, 0);
    // distort
    const p = geo.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const n = 0.8 + Math.random() * 0.4;
      p.setXYZ(j, p.getX(j) * n, p.getY(j) * (n * 0.7), p.getZ(j) * n);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    const ang = Math.random() * Math.PI * 2;
    const r = 18 + Math.random() * 14;
    m.position.set(Math.cos(ang) * r, TANK.floorY + Math.random() * 0.6, Math.sin(ang) * r);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.setScalar(0.8 + Math.random() * 1.4);
    m.receiveShadow = false;
    group.add(m);
  }
  return group;
}
