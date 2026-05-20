import * as THREE from 'three';
import { buildScene } from '../scene.js';
import { initControls } from '../controls.js';
import { createObservationUI } from '../interaction/observationUI.js';
import { initAudio } from '../audio.js';
import { Creature } from '../creatures/Creature.js';

class Futabasaurus extends Creature {
  constructor() {
    const mesh = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4f7f94, roughness: 0.58, metalness: 0.02 });
    const paleMat = new THREE.MeshStandardMaterial({ color: 0xb5d5df, roughness: 0.62, metalness: 0.0 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.8, 8.4, 12, 24), bodyMat);
    body.rotation.z = Math.PI / 2;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 5.2, 14), bodyMat);
    neck.position.set(5.2, 1.0, 0); neck.rotation.z = -Math.PI / 4.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 12), paleMat);
    head.position.set(7.4, 2.8, 0);
    const finGeo = new THREE.ConeGeometry(0.88, 2.2, 3);
    const fins = [[-0.8, -0.8, 1.6], [-0.8, -0.8, -1.6], [1.3, -1.0, 1.4], [1.3, -1.0, -1.4]];
    fins.forEach(([x,y,z]) => { const f = new THREE.Mesh(finGeo, paleMat); f.position.set(x,y,z); f.rotation.z = Math.PI/2; mesh.add(f); });
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.8, 12), bodyMat);
    tail.position.set(-6.2, 0.15, 0); tail.rotation.z = -Math.PI / 2;
    mesh.add(body, neck, head, tail);
    super({ species: 'futabasaurus', mesh, position: new THREE.Vector3(-24, 2, -8), cfg: { speed: 1.0, maxAccel: 0.9, turnRate: 0.9, depthMin: -7.5, depthMax: 7.5, wallMargin: 8 } });
  }
}

class Opabinia extends Creature {
  constructor() {
    const mesh = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x6f9fbb, roughness: 0.42, metalness: 0.1 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 3.8, 10, 20), mat); body.rotation.z = Math.PI/2;
    mesh.add(body);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x12263d, emissive: 0x0d2a4a, emissiveIntensity: 0.55 });
    for (let i=0;i<5;i++){ const e = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), eyeMat); e.position.set(-0.5 + i*0.38, 0.9, 0.55); mesh.add(e); }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.2,2.9,10), mat); trunk.position.set(2.6,0.25,0); trunk.rotation.z = -Math.PI/2.8; mesh.add(trunk);
    const claw = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), eyeMat); claw.position.set(3.5,-0.65,0); mesh.add(claw);
    super({ species: 'opabinia', mesh, position: new THREE.Vector3(10, 0.8, -12), cfg: { speed: 1.35, maxAccel: 1.3, turnRate: 1.8, depthMin: -5.5, depthMax: 8.2, wallMargin: 7 } });
  }
}

class Anomalocaris extends Creature {
  constructor() {
    const mesh = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f5f88, roughness: 0.5, metalness: 0.08 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 7.2, 12, 22), bodyMat); body.rotation.z = Math.PI/2; mesh.add(body);
    const finMat = new THREE.MeshStandardMaterial({ color: 0x3f89ba, roughness: 0.45, metalness: 0.06, transparent:true, opacity:0.92 });
    for (let i=0;i<7;i++){ const fin = new THREE.Mesh(new THREE.ConeGeometry(0.44,1.35,3), finMat); fin.position.set(-2.8 + i*1.05, 0.1, 1.42); fin.rotation.set(0,0,Math.PI/2); mesh.add(fin); const fin2=fin.clone(); fin2.position.z=-1.42; mesh.add(fin2);}    
    const armGeo = new THREE.TorusGeometry(0.95,0.14,8,18,Math.PI*1.1);
    const armL = new THREE.Mesh(armGeo, bodyMat); armL.position.set(3.3,-0.5,1.0); armL.rotation.set(0.2,0.2,-0.45);
    const armR = armL.clone(); armR.position.z = -1.0; armR.rotation.y *= -1;
    mesh.add(armL, armR);
    super({ species: 'anomalocaris', mesh, position: new THREE.Vector3(18, -2, 10), cfg: { speed: 1.45, maxAccel: 1.4, turnRate: 1.7, depthMin: -8.2, depthMax: 5.8, wallMargin: 8 } });
  }
}

class Cameroceras extends Creature {
  constructor() {
    const mesh = new THREE.Group();
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xc9d4dc, roughness: 0.46, metalness: 0.04 });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.9, 12.5, 18, 1, false), shellMat); shell.rotation.z = Math.PI/2; mesh.add(shell);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x98aab8, roughness: 0.58, metalness: 0.0 });
    for (let i=0;i<8;i++){ const r = new THREE.Mesh(new THREE.TorusGeometry(0.95 + i*0.05, 0.06, 8, 18), ringMat); r.rotation.y = Math.PI/2; r.position.x = -3.8 + i*1.25; mesh.add(r); }
    const tentacleMat = new THREE.MeshStandardMaterial({ color: 0x7aa7bf, roughness:0.5, metalness:0.04 });
    for (let i=0;i<8;i++){ const t = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.17,4.5,8), tentacleMat); const a=(Math.PI*2*i)/8; t.position.set(5.8, Math.cos(a)*1.1, Math.sin(a)*1.1); t.rotation.z = Math.PI/2 + (Math.random()-0.5)*0.2; mesh.add(t); }
    super({ species: 'cameroceras', mesh, position: new THREE.Vector3(-8, -1, 16), cfg: { speed: 0.9, maxAccel: 0.75, turnRate: 0.8, depthMin: -9.5, depthMax: 4.5, wallMargin: 10 } });
  }
}

export function launch() {
  document.getElementById('ui').style.display = '';
  const canvas = document.getElementById('stage');
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia?.('(max-width: 780px)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5)); renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.24;
  if (!isMobile) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 260); camera.position.set(0, 8, 56);
  const state = { ambient: true, soundOn: false, food: { active: false, position: new THREE.Vector3() }, creatures: null };
  const sceneApi = buildScene(scene, { isMobile });
  scene.fog = new THREE.FogExp2(0x031728, 0.024);

  const creatures = [];
  const add = (c, s) => { c.mesh.scale.multiplyScalar(s); scene.add(c.mesh); creatures.push(c); };
  add(new Futabasaurus(), 2.6); add(new Opabinia(), 4.2); add(new Anomalocaris(), 3.1); add(new Cameroceras(), 3.6);

  state.creatures = creatures;
  const getCreatures = () => creatures;
  configureSpeciesButtons();

  const obsUI = createObservationUI();
  const controls = initControls({ camera, renderer, state, getCreatures, onFeed: (p) => sceneApi.bubbles.spawnAt(p.x,p.y,p.z,12), onObserve: (c) => obsUI.show(c.species), onRelease: () => obsUI.hide() });
  obsUI.onClose(() => controls.release());
  const audio = initAudio({ state, getCreatures });

  const speciesPool = ['futabasaurus', 'opabinia', 'anomalocaris', 'cameroceras'];
  const pickAmbient = () => controls.selectSpecies(speciesPool[Math.floor(Math.random() * speciesPool.length)]);
  let ambientTimer = setInterval(pickAmbient, 14000); pickAmbient();

  const btnAmbient = document.getElementById('btn-ambient'); const btnSound = document.getElementById('btn-sound'); const btnFeed = document.getElementById('btn-feed');
  btnAmbient.onclick = () => { state.ambient = !state.ambient; btnAmbient.classList.toggle('on', state.ambient); if (state.ambient) { pickAmbient(); ambientTimer = setInterval(pickAmbient, 14000); } else clearInterval(ambientTimer); };
  btnSound.onclick = () => { state.soundOn = !state.soundOn; btnSound.classList.toggle('on', state.soundOn); if (state.soundOn) audio.resume(); };
  btnFeed.onclick = () => sceneApi.bubbles.spawnAt(0, 2, 0, 12);

  const clock = new THREE.Clock(); let paused = false;
  document.addEventListener('visibilitychange', () => { paused = document.hidden; });
  window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

  function animate() { requestAnimationFrame(animate); if (paused) return; const dt = Math.min(clock.getDelta(), 0.05); const t = clock.elapsedTime; for (const c of creatures) c.update(dt,t,state); controls.update(dt); audio.update(dt,t); renderer.render(scene, camera); }
  animate();
}

function configureSpeciesButtons() {
  const map = {
    futabasaurus: 'フタバスズキリュウ', opabinia: 'オパビニア', anomalocaris: 'アノマロカリス', cameroceras: 'カメロケラス',
  };
  const buttons = [...document.querySelectorAll('.species-btn')];
  buttons.forEach((b, i) => {
    const id = Object.keys(map)[i];
    if (!id) { b.style.display = 'none'; return; }
    b.style.display = '';
    b.dataset.species = id;
    b.textContent = map[id];
    b.title = map[id];
  });
}
