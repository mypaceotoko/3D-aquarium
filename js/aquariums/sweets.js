import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TANK } from '../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// Sweets Aquarium — pastel, dreamy soda-water scene
// Step 2: minimal boot — transitions from selector, renders a background.
// Creatures & full environment are added in later steps.
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
  renderer.toneMappingExposure = 1.25;

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = makeBgTexture();
  scene.fog = new THREE.FogExp2(0xf5d8ea, isMobile ? 0.012 : 0.016);

  const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 140);
  camera.position.set(0, 3.5, 32);

  // ── Lights (soft pastel) ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffe8f4, 0.95));
  const key = new THREE.DirectionalLight(0xfff2dc, 1.6);
  key.position.set(8, 24, 12);
  scene.add(key);
  const rimPink = new THREE.PointLight(0xff9cc8, 0.8, 60, 1.7);
  rimPink.position.set(-16, 4, -8);
  scene.add(rimPink);
  const rimMint = new THREE.PointLight(0x9ce8d8, 0.7, 60, 1.7);
  rimMint.position.set(16, 2, 10);
  scene.add(rimMint);

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
    clock.getDelta();
    orbit.update();
    renderer.render(scene, camera);
  }
  loop();
}

// ─── Background (pastel soda-water gradient) ──────────────────────────────
function makeBgTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#ffe8f4');  // surface: pale pink
  grad.addColorStop(0.35, '#d8ecff');  // mid: soda blue
  grad.addColorStop(0.75, '#a8d4ff');  // deeper blue
  grad.addColorStop(1.00, '#6898c8');  // depth
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
