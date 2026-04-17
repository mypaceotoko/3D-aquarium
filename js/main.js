import * as THREE from 'three';
import { buildScene, TANK } from './scene.js';
import { Jellyfish }    from './creatures/Jellyfish.js';
import { Coelacanth }   from './creatures/Coelacanth.js';
import { Gar }          from './creatures/Gar.js';
import { Pirarucu }     from './creatures/Pirarucu.js';
import { Trilobite }    from './creatures/Trilobite.js';
import { GiantIsopod }  from './creatures/GiantIsopod.js';
import { initControls } from './controls.js';
import { initAudio }    from './audio.js';

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------

const canvas   = document.getElementById('stage');
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
              || window.matchMedia?.('(max-width: 780px)').matches;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isMobile,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
if (!isMobile) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 140);
camera.position.set(0, 3.5, 32);

// ---------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------

const state = {
  ambient: true,
  soundOn: false,
  food: {
    active: false,
    position: new THREE.Vector3(),
  },
};

// Scene environment -------------------------------------------------
const sceneApi = buildScene(scene, { isMobile });

// ---------------------------------------------------------------------
// Spawn creatures
// ---------------------------------------------------------------------

const creatures = [];
const counts = isMobile
  ? { jellyfish: 3, coelacanth: 1, gar: 1, pirarucu: 1, trilobite: 3, isopod: 2 }
  : { jellyfish: 5, coelacanth: 2, gar: 2, pirarucu: 1, trilobite: 4, isopod: 3 };

for (let i = 0; i < counts.jellyfish; i++)  creatures.push(addToScene(new Jellyfish()));
for (let i = 0; i < counts.coelacanth; i++) creatures.push(addToScene(new Coelacanth({ castShadow: !isMobile })));
for (let i = 0; i < counts.gar; i++)        creatures.push(addToScene(new Gar({ castShadow: !isMobile })));
for (let i = 0; i < counts.pirarucu; i++)   creatures.push(addToScene(new Pirarucu({ castShadow: !isMobile })));
for (let i = 0; i < counts.trilobite; i++)  creatures.push(addToScene(new Trilobite({ castShadow: !isMobile })));
for (let i = 0; i < counts.isopod; i++)     creatures.push(addToScene(new GiantIsopod({ castShadow: !isMobile })));

function addToScene(c) { scene.add(c.mesh); return c; }

const getCreatures = () => creatures;

// ---------------------------------------------------------------------
// Food manager
// ---------------------------------------------------------------------

const foodList = [];
const FOOD_GRAVITY = 0.45;   // slower than real gravity — underwater settling
const FOOD_DRAG    = 0.55;   // velocity retention per second
const FOOD_EAT_R   = 1.1;    // reactive-fish consume radius

function dropFood(point) {
  const geo = new THREE.SphereGeometry(0.13, 10, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd080,
    roughness: 0.5,
    metalness: 0.0,
    emissive: 0xff9040,
    emissiveIntensity: 0.8,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(point);
  scene.add(m);

  const food = {
    mesh: m,
    vel: new THREE.Vector3(
      (Math.random() - 0.5) * 0.18,
      -0.2,
      (Math.random() - 0.5) * 0.18,
    ),
    life: 14,
  };
  foodList.push(food);

  // Ambient bubbles at splash point
  sceneApi.bubbles.spawnAt(point.x, point.y, point.z, 6);
  audio.triggerFeed();

  refreshFoodTarget();
}

function refreshFoodTarget() {
  if (foodList.length === 0) {
    state.food.active = false;
    return;
  }
  // Primary target = oldest food (first to settle / be eaten)
  state.food.active = true;
  state.food.position.copy(foodList[0].mesh.position);
}

function updateFood(dt) {
  for (let i = foodList.length - 1; i >= 0; i--) {
    const f = foodList[i];
    f.life -= dt;
    f.vel.y -= FOOD_GRAVITY * dt;
    f.vel.multiplyScalar(Math.pow(FOOD_DRAG, dt));
    f.mesh.position.addScaledVector(f.vel, dt);

    // Subtle slow rotation
    f.mesh.rotation.y += dt * 1.2;
    f.mesh.rotation.x += dt * 0.9;

    let eaten = false;

    // Check reactive creatures
    for (const c of creatures) {
      if (!c.cfg.reactsToFood) continue;
      if (c.pos.distanceTo(f.mesh.position) < FOOD_EAT_R) {
        audio.triggerChomp();
        sceneApi.bubbles.spawnAt(f.mesh.position.x, f.mesh.position.y, f.mesh.position.z, 4);
        eaten = true;
        break;
      }
    }

    if (!eaten && (f.mesh.position.y < TANK.floorY + 0.25 || f.life <= 0)) {
      eaten = true;
    }

    if (eaten) {
      scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.mesh.material.dispose();
      foodList.splice(i, 1);
    }
  }

  refreshFoodTarget();
}

// ---------------------------------------------------------------------
// Controls + audio
// ---------------------------------------------------------------------

const controls = initControls({
  camera, renderer, state,
  getCreatures,
  onFeed: (point) => dropFood(point),
});

const audio = initAudio({ state, getCreatures });

// ---------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------

const ui        = document.getElementById('ui');
const hint      = document.getElementById('hint');
const btnAmbient = document.getElementById('btn-ambient');
const btnSound   = document.getElementById('btn-sound');
const btnFeed    = document.getElementById('btn-feed');
const btnUiToggle = document.getElementById('btn-ui-toggle');
const speciesBtns = document.querySelectorAll('.species-btn');

// --- Collapsible UI panel ---------------------------------------------
const UI_COLLAPSED_KEY = 'aquarium.uiCollapsed';

function setUiCollapsed(collapsed) {
  ui.classList.toggle('collapsed', collapsed);
  btnUiToggle.setAttribute('aria-expanded', String(!collapsed));
  btnUiToggle.textContent = collapsed ? '▴' : '▾';
  btnUiToggle.title = collapsed ? 'メニューを開く' : 'メニューを閉じる';
  try { localStorage.setItem(UI_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (_) {}
}

btnUiToggle.addEventListener('click', () => {
  setUiCollapsed(!ui.classList.contains('collapsed'));
});

(function initUiCollapsed() {
  let stored = null;
  try { stored = localStorage.getItem(UI_COLLAPSED_KEY); } catch (_) {}
  if (stored === '1' || stored === '0') {
    setUiCollapsed(stored === '1');
    return;
  }
  // First visit: auto-collapse on short viewports (phone landscape)
  const shortLandscape = window.innerHeight < 480 && window.innerWidth > window.innerHeight;
  setUiCollapsed(isMobile && shortLandscape);
})();

btnAmbient.addEventListener('click', () => {
  state.ambient = !state.ambient;
  btnAmbient.setAttribute('aria-pressed', String(state.ambient));
  btnAmbient.textContent = state.ambient ? '鑑賞 ON' : '鑑賞 OFF';
});

btnSound.addEventListener('click', () => {
  if (state.soundOn) {
    audio.disable();
    state.soundOn = false;
    btnSound.setAttribute('aria-pressed', 'false');
    btnSound.textContent = '音 OFF';
  } else {
    const ok = audio.enable();
    if (ok) {
      state.soundOn = true;
      btnSound.setAttribute('aria-pressed', 'true');
      btnSound.textContent = '音 ON';
      hint.classList.remove('show');
    }
  }
});

btnFeed.addEventListener('click', () => {
  // Drop at a random spot around the upper-middle of the tank
  const p = new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(TANK.maxX * 0.7),
    TANK.maxY - 2,
    THREE.MathUtils.randFloatSpread(TANK.maxZ * 0.7),
  );
  dropFood(p);
});

speciesBtns.forEach((b) => {
  b.addEventListener('click', () => {
    const id = b.dataset.species;
    controls.selectSpecies(id);
  });
});

// Show hint on first idle
setTimeout(() => {
  if (!state.soundOn) hint.classList.add('show');
}, 1500);

// Auto-dim UI after inactivity
let lastMove = performance.now();
['pointermove', 'pointerdown', 'keydown'].forEach((evt) => {
  window.addEventListener(evt, () => {
    lastMove = performance.now();
    ui.classList.remove('dim');
  });
});

// ---------------------------------------------------------------------
// Resize + visibility
// ---------------------------------------------------------------------

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

let paused = false;
document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
});

// ---------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------

const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  if (paused) return;

  const rawDt = clock.getDelta();
  const dt    = Math.min(rawDt, 0.05);   // cap to avoid big jumps after hidden
  const time  = clock.elapsedTime;

  sceneApi.update(dt, time);

  for (const c of creatures) c.update(dt, time, state);

  updateFood(dt);
  controls.update(dt);
  audio.update(dt, time);

  // Auto-dim UI after 5s of no mouse movement
  if (performance.now() - lastMove > 5000 && !ui.classList.contains('dim')) {
    ui.classList.add('dim');
  }

  renderer.render(scene, camera);
}

loop();
