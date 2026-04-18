// Tropical aquarium — placeholder for Step 2.
// Full implementation added in Step 3.
import * as THREE from 'three';

export function launch() {
  const canvas   = document.getElementById('stage');
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
                || window.matchMedia?.('(max-width: 780px)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0078a8);
  scene.fog = new THREE.FogExp2(0x0098c0, 0.016);

  const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 160);
  camera.position.set(0, 2, 22);

  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const sun = new THREE.DirectionalLight(0xfff5cc, 2.2);
  sun.position.set(8, 24, 10);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40),
    new THREE.MeshStandardMaterial({ color: 0xf0d880, roughness: 0.88 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -8;
  scene.add(floor);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    renderer.render(scene, camera);
  })();
}
