import * as THREE from 'three';
import { createObservationUI } from './observationUI.js';

// ─── Per-species hit radii (world units) ─────────────────────────────────────
const HIT_R = {
  // deep-sea
  leviathan: 7.0, pirarucu: 3.0, coelacanth: 2.6, gar: 2.2,
  jellyfish:  1.6, trilobite: 1.2, isopod: 1.4,
  // tropical
  clownfish: 1.5, 'neon-tetra': 1.0, 'sea-turtle': 2.5,
  guppy: 1.0, shrimp: 0.9, seahorse: 1.2, 'garden-eel': 0.9,
  // ocean (large creatures need generous radii)
  dolphin: 3.5, orca: 9.0, whale: 24.0, shark: 6.5, megalodon: 18.0,
  squid: 28.0,
  // sweets
  taiyaki: 1.8, 'coelacanth-monaka': 2.6, 'crab-pan': 1.6,
  'goldfish-jelly': 1.5, 'tako-sen': 1.6, 'ebi-sen': 0.9,
};

// ─── Per-species follow distance ─────────────────────────────────────────────
const FOLLOW_D = {
  leviathan: 14, pirarucu: 6,  coelacanth: 5,  gar: 5,
  jellyfish:  3,  trilobite: 2,  isopod: 2,
  clownfish: 2.5, 'neon-tetra': 2, 'sea-turtle': 5,
  guppy: 2, shrimp: 1.8, seahorse: 2.5, 'garden-eel': 2.2,
  dolphin: 9, orca: 22, whale: 55, shark: 14, megalodon: 42,
  squid: 58,
  taiyaki: 4, 'coelacanth-monaka': 5, 'crab-pan': 3.5,
  'goldfish-jelly': 3.5, 'tako-sen': 4, 'ebi-sen': 2.5,
};

// ─── Main entry point ────────────────────────────────────────────────────────
/**
 * Attaches tap-to-observe to any aquarium.
 *
 * Usage:
 *   const obs = initObservation({ camera, orbit, canvas, getCreatures });
 *   // In render loop:
 *   obs.update(dt);
 *   if (!obs.isObserving) orbit.update(); // pause orbit while following
 *
 * @param {Object} opts
 * @param {THREE.PerspectiveCamera} opts.camera
 * @param {import('three/addons/controls/OrbitControls').OrbitControls} opts.orbit
 * @param {HTMLCanvasElement} opts.canvas
 * @param {() => Creature[]} opts.getCreatures
 */
export function initObservation({ camera, orbit, canvas, getCreatures }) {
  const ui  = createObservationUI();
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const tmp = new THREE.Vector3();

  let target = null;   // creature currently observed
  let blend  = 0;      // 0→1 ease-in blend for camera approach

  // ── Tap discrimination (ignore drags) ────────────────────────────────────
  let downX = 0, downY = 0, downT = 0;
  canvas.addEventListener('pointerdown', e => {
    downX = e.clientX; downY = e.clientY; downT = e.timeStamp;
  });
  canvas.addEventListener('pointerup', e => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 12) return;
    if (e.timeStamp - downT > 420) return;
    _handleTap(e);
  });

  function _handleTap(e) {
    const rect = canvas.getBoundingClientRect();
    ptr.x =  (e.clientX - rect.left) / rect.width  * 2 - 1;
    ptr.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);

    const list = getCreatures?.() ?? [];
    let best = null, bestD = Infinity;
    const cp = new THREE.Vector3();

    for (const c of list) {
      const center = c.getCenter(tmp);
      const r = HIT_R[c.species] ?? 2.5;
      ray.ray.closestPointToPoint(center, cp);
      if (cp.distanceTo(center) > r) continue;
      const d = ray.ray.origin.distanceTo(cp);
      if (d < bestD) { bestD = d; best = c; }
    }

    if (best) _startObserving(best);
  }

  function _startObserving(c) {
    target = c;
    blend  = 0;
    ui.show(c.species);
  }

  function _stopObserving() {
    target = null;
    if (orbit) {
      orbit.enabled = true;
      orbit.update(); // sync internal state to avoid camera snap on resume
    }
    ui.hide();
  }

  ui.onClose(_stopObserving);

  // ── Public API ───────────────────────────────────────────────────────────
  return {
    get isObserving() { return !!target; },

    stopObserving: _stopObserving,

    selectSpecies(speciesId) {
      const list = (getCreatures?.() ?? []).filter(c => c.species === speciesId);
      if (!list.length) return;
      _startObserving(list[Math.floor(Math.random() * list.length)]);
    },

    update(dt) {
      if (!target) return;

      // Disable orbit so we can drive the camera freely
      if (orbit) orbit.enabled = false;

      blend = Math.min(1, blend + dt * 0.7);
      const k = _ease(blend);

      const center = target.getCenter(tmp).clone();
      const dist   = FOLLOW_D[target.species] ?? 6;

      // Trail slightly behind + above the creature
      const behind = target.heading
        ? target.heading.clone().multiplyScalar(-dist)
        : new THREE.Vector3(0, 0, -dist);
      behind.y += dist * 0.22;

      const camGoal = center.clone().add(behind);
      camera.position.lerp(camGoal,    Math.min(1, dt * 1.6 * (0.25 + 0.75 * k)));
      if (orbit) {
        orbit.target.lerp(center, Math.min(1, dt * 2.2));
        // Explicitly orient the camera — orbit.update() is skipped while
        // observing, so without this the camera slides without rotating.
        camera.lookAt(orbit.target);
      } else {
        camera.lookAt(center);
      }
    },
  };
}

function _ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
