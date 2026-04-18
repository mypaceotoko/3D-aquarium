import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─────────────────────────────────────────────────────────────────────────────
// Giant Ocean Aquarium — ジャイアントオーシャン水槽
// Step 2 skeleton: scene boots, camera works, transition confirmed.
// ─────────────────────────────────────────────────────────────────────────────

// Expanded tank bounds (roughly 4× the default tank volume)
const OTANK = {
  minX: -55, maxX: 55,
  minY: -18, maxY: 16,
  minZ: -40, maxZ: 40,
  floorY: -18,
};

export function launch() {
  const canvas   = document.getElementById('stage');
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
                || window.matchMedia?.('(max-width: 780px)').matches;

  // ── Renderer ─────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isMobile,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  if (!isMobile) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x001e3c);
  scene.fog = new THREE.FogExp2(0x002244, isMobile ? 0.008 : 0.011);

  // ── Camera ────────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.2, 300);
  camera.position.set(0, 4, 55);

  // ── Controls ──────────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.08;
  controls.minDistance    = 8;
  controls.maxDistance    = 120;
  controls.maxPolarAngle  = Math.PI * 0.78;
  controls.target.set(0, 0, 0);
  controls.update();

  // ── Placeholder geometry (removed in step 3) ─────────────────────────────
  const tempGeo = new THREE.PlaneGeometry(110, 80);
  const tempMat = new THREE.MeshStandardMaterial({ color: 0x003366, roughness: 0.9 });
  const floor = new THREE.Mesh(tempGeo, tempMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = OTANK.floorY;
  scene.add(floor);

  // Single ambient light so something is visible
  scene.add(new THREE.AmbientLight(0x8ac8ff, 0.6));

  // ── Resize ────────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ── Loop ──────────────────────────────────────────────────────────────────
  let paused = false;
  document.addEventListener('visibilitychange', () => { paused = document.hidden; });

  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    if (paused) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    controls.update(dt);
    renderer.render(scene, camera);
  }
  loop();
}
