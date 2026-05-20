import * as THREE from 'three';
import { buildScene } from '../scene.js';
import { initControls } from '../controls.js';
import { createObservationUI } from '../interaction/observationUI.js';
import { initAudio } from '../audio.js';
import { Coelacanth } from '../creatures/Coelacanth.js';
import { Trilobite } from '../creatures/Trilobite.js';
import { GiantIsopod } from '../creatures/GiantIsopod.js';
import { Leviathan } from '../creatures/Leviathan.js';

export function launch() {
  document.getElementById('ui').style.display = '';
  const canvas = document.getElementById('stage');
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || window.matchMedia?.('(max-width: 780px)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  if (!isMobile) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 220);
  camera.position.set(0, 7, 48);

  const state = { ambient: true, soundOn: false, food: { active: false, position: new THREE.Vector3() }, creatures: null };
  const sceneApi = buildScene(scene, { isMobile });

  const creatures = [];
  const addToScene = (c, s, p) => {
    c.mesh.scale.multiplyScalar(s);
    c.mesh.position.copy(p);
    c.pos.copy(p);
    scene.add(c.mesh);
    creatures.push(c);
  };

  addToScene(new Leviathan({ castShadow: !isMobile }), 1.85, new THREE.Vector3(0, -1.5, 0));
  addToScene(new Coelacanth({ castShadow: !isMobile }), 5.8, new THREE.Vector3(-10, 0.5, -6));
  addToScene(new GiantIsopod({ castShadow: !isMobile }), 8.5, new THREE.Vector3(9, -5.6, 8));
  addToScene(new Trilobite({ castShadow: !isMobile }), 8.0, new THREE.Vector3(12, -6.2, -7));

  state.creatures = creatures;
  const getCreatures = () => creatures;

  const obsUI = createObservationUI();
  const controls = initControls({
    camera, renderer, state, getCreatures,
    onFeed: (point) => sceneApi.bubbles.spawnAt(point.x, point.y, point.z, 8),
    onObserve: (c) => obsUI.show(c.species),
    onRelease: () => obsUI.hide(),
  });
  obsUI.onClose(() => controls.release());
  const audio = initAudio({ state, getCreatures });

  const speciesPool = ['leviathan', 'coelacanth', 'isopod', 'trilobite'];
  const pickAmbient = () => controls.selectSpecies(speciesPool[Math.floor(Math.random() * speciesPool.length)]);
  let ambientTimer = setInterval(pickAmbient, 15000);
  pickAmbient();

  const btnAmbient = document.getElementById('btn-ambient');
  const btnSound = document.getElementById('btn-sound');
  const btnFeed = document.getElementById('btn-feed');
  const btnBright = document.getElementById('btn-bright');
  const btnUiToggle = document.getElementById('btn-ui-toggle');
  const ui = document.getElementById('ui');

  btnAmbient.onclick = () => {
    state.ambient = !state.ambient;
    btnAmbient.classList.toggle('on', state.ambient);
    if (state.ambient) { pickAmbient(); ambientTimer = setInterval(pickAmbient, 15000); }
    else clearInterval(ambientTimer);
  };
  btnSound.onclick = () => {
    state.soundOn = !state.soundOn;
    btnSound.classList.toggle('on', state.soundOn);
    if (state.soundOn) audio.resume();
  };
  btnFeed.onclick = () => sceneApi.bubbles.spawnAt(0, 2, 0, 10);

  const levels = [0.72, 1.2, 1.5];
  let levelIdx = 1;
  const applyExposure = () => {
    renderer.toneMappingExposure = levels[levelIdx];
    btnBright.textContent = `明 ${['暗め', '標準', '明るめ'][levelIdx]}`;
  };
  applyExposure();
  btnBright.onclick = () => { levelIdx = (levelIdx + 1) % levels.length; applyExposure(); };

  btnUiToggle.onclick = () => {
    const collapsed = ui.classList.toggle('collapsed');
    btnUiToggle.textContent = collapsed ? '▴' : '▾';
  };

  const clock = new THREE.Clock();
  let paused = false;
  document.addEventListener('visibilitychange', () => { paused = document.hidden; });
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  function animate() {
    requestAnimationFrame(animate);
    if (paused) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    scene.fog = new THREE.FogExp2(0x031728, 0.03);
    for (const c of creatures) c.update(dt, t, state);
    controls.update(dt);
    audio.update(dt, t);
    renderer.render(scene, camera);
  }
  animate();
}
