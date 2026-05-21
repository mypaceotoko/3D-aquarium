import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TANK } from './scene.js';

/**
 * Camera + input controller.
 *
 * Responsibilities:
 *   - OrbitControls: drag = rotate, wheel/pinch = zoom (no pan)
 *   - Click discrimination: short taps hit-test creatures → follow them with a
 *     smooth, continuous camera lerp. Short taps on empty water drop food at
 *     the 3D-intersected point via onFeed(point). Drags are absorbed by orbit.
 *   - Ambient mode: when no recent user interaction + no follow target, camera
 *     slowly cycles between scripted cinematic waypoints with soft drift.
 *   - Species selection (from UI buttons) picks a random creature of that
 *     species and follows it.
 */
export function initControls({
  camera,
  renderer,
  state,
  getCreatures,
  onFeed,
  onObserve,
  onRelease,
  tank,                 // optional bounds override for the food-drop plane
  orbitDistance,        // optional { min, max } for OrbitControls zoom range
  cinematicWaypoints,   // optional array overriding ambient camera waypoints
}) {
  const canvas = renderer.domElement;
  const TANK_BOUNDS = tank ?? TANK;

  // --- OrbitControls --------------------------------------------------
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = orbitDistance?.min ?? 6;
  controls.maxDistance = orbitDistance?.max ?? 55;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed  = 0.75;

  // --- State ---------------------------------------------------------
  const ray     = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tmpV    = new THREE.Vector3();

  let tween = null;                // one-shot tween to a fixed target (e.g. waypoint)
  let follow = null;               // { creature, offset, targetLook: Vector3 } — continuous
  let followExpiry = Infinity;     // Infinity = user-initiated; finite = ambient auto-follow
  let userUntil = 0;               // performance.now()/1000 baseline — ambient paused until then
  let lastUserInteraction = 0;

  // Click/drag discrimination -----------------------------------------
  let downX = 0, downY = 0, downT = 0;
  const CLICK_MOVE_PX = 10;
  const CLICK_MAX_MS  = 400;

  canvas.addEventListener('pointerdown', (e) => {
    downX = e.clientX; downY = e.clientY; downT = e.timeStamp;
    markUserInteraction();
  });
  canvas.addEventListener('pointerup', (e) => {
    const dt = e.timeStamp - downT;
    const mv = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (mv <= CLICK_MOVE_PX && dt <= CLICK_MAX_MS) onClick(e);
  });
  canvas.addEventListener('wheel', markUserInteraction, { passive: true });
  canvas.addEventListener('touchstart', markUserInteraction, { passive: true });

  function markUserInteraction() {
    const now = performance.now() / 1000;
    lastUserInteraction = now;
    userUntil = now + 10; // ambient pauses for 10s after any interaction
    // Exit follow mode if the user takes over orbit — do it on drag only
    // (not tap), so detect on actual movement below in update()
  }

  // --- Click handler -------------------------------------------------
  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    pointer.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    ray.setFromCamera(pointer, camera);

    // 1) Try to hit a creature via ray-vs-bounding-sphere (generous radius)
    const creatures = getCreatures?.() ?? [];
    let best = null, bestDistAlong = Infinity;
    const closestPt = new THREE.Vector3();

    for (const c of creatures) {
      const center = c.getCenter(tmpV);
      const radius = creatureHitRadius(c);
      ray.ray.closestPointToPoint(center, closestPt);
      const missDist = closestPt.distanceTo(center);
      if (missDist > radius) continue;
      const along = ray.ray.origin.distanceTo(closestPt);
      if (along < bestDistAlong) {
        bestDistAlong = along;
        best = c;
      }
    }

    if (best) {
      follow = makeFollow(best);
      followExpiry = Infinity;
      onObserve?.(best);
      return;
    }

    // 2) Empty water tap → drop food at ray intersection with a horizontal
    //    plane around the upper third of the tank.
    const dropPlaneY = TANK_BOUNDS.maxY - 2;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -dropPlaneY);
    const point = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, point)) {
      // Clamp to tank bounds (slightly inset)
      point.x = THREE.MathUtils.clamp(point.x, TANK_BOUNDS.minX + 3, TANK_BOUNDS.maxX - 3);
      point.z = THREE.MathUtils.clamp(point.z, TANK_BOUNDS.minZ + 3, TANK_BOUNDS.maxZ - 3);
      onFeed?.(point);
    }
  }

  function creatureHitRadius(c) {
    switch (c.species) {
      case 'leviathan':    return 7.0;
      case 'pirarucu':     return 3.0;
      case 'coelacanth':   return 2.6;
      case 'gar':          return 2.2;
      case 'jellyfish':    return 1.6;
      case 'trilobite':    return 1.2;
      case 'isopod':       return 1.4;
      case 'futabasaurus': return 26.0;
      case 'opabinia':     return  9.0;
      case 'anomalocaris': return 14.0;
      case 'cameroceras':  return 16.0;
      case 'bluewhale':    return 36.0;
      case 'frilledshark': return 14.0;
      case 'ammonite':     return 13.0;
      default:             return 1.8;
    }
  }

  function followDistance(c) {
    switch (c.species) {
      case 'leviathan':    return 14;
      case 'futabasaurus': return 80;
      case 'cameroceras':  return 60;
      case 'anomalocaris': return 50;
      case 'opabinia':     return 30;
      case 'bluewhale':    return 95;
      case 'frilledshark': return 42;
      case 'ammonite':     return 40;
      default:             return 5.5;
    }
  }

  function makeFollow(c) {
    const dist = followDistance(c);
    const offset = new THREE.Vector3(-dist, dist * 0.35, dist);
    return {
      creature: c,
      offset,
      blend: 0,
    };
  }

  // --- Waypoints for ambient cinematic cam ---------------------------
  const waypoints = cinematicWaypoints ?? [
    { pos: new THREE.Vector3(  0, 3.5, 36), look: new THREE.Vector3( 0, 0,  0) },
    { pos: new THREE.Vector3(-26, 4.0, 18), look: new THREE.Vector3( 2, 1, -2) },
    { pos: new THREE.Vector3( 22, 6.0,-18), look: new THREE.Vector3(-3, 2,  2) },
    { pos: new THREE.Vector3( 18,-2.0, 22), look: new THREE.Vector3( 0,-4, -2) },
    { pos: new THREE.Vector3(-18, 8.5,-10), look: new THREE.Vector3( 0, 1,  4) },
    // Leviathan showcase: wide angle from below, looking up at the open water
    { pos: new THREE.Vector3(  8,-5.0, 30), look: new THREE.Vector3( 0, 1,  0) },
  ];
  let wpIdx = 0;
  let wpT = 0;
  const WP_DUR = 25;

  // --- Public ---------------------------------------------------------
  const api = {
    controls,

    /** Pick a random creature of the species and follow it. */
    selectSpecies(speciesId) {
      const list = (getCreatures?.() ?? []).filter(c => c.species === speciesId);
      if (!list.length) return;
      const c = list[Math.floor(Math.random() * list.length)];
      follow = makeFollow(c);
      followExpiry = Infinity;
      onObserve?.(c);
      // Force a short ambient pause so the user sees the zoom land
      userUntil = performance.now() / 1000 + 8;
    },

    /** Cancel follow / tween — back to free orbit. */
    release() { follow = null; tween = null; followExpiry = Infinity; onRelease?.(); },

    update(dt) {
      const now = performance.now() / 1000;

      // Detect sustained drag → cancel follow mode so the user can re-orbit
      if (follow && now - lastUserInteraction < 0.05) {
        // If the orbit controls are actively rotating (pointer held + moving),
        // we back out of follow. Simple heuristic: an orbit drag updates the
        // spherical coords, which we approximate by checking if user is
        // currently interacting (pointerdown).
        // Easier: drop follow after any pointerdown event that dragged more
        // than CLICK_MOVE_PX — but we don't see that here. Use a sentinel:
        if (orbitActive) { follow = null; onRelease?.(); }
      }

      // --- Follow mode -------------------------------------------------
      if (follow) {
        // Ambient auto-follow expires after its allotted duration → resume waypoint cycle
        if (followExpiry < Infinity && now > followExpiry) {
          follow = null;
          followExpiry = Infinity;
          onRelease?.();
          wpIdx = (wpIdx + 1) % waypoints.length;
          wpT = 0;
          controls.update();
          return;
        }
        const c = follow.creature;
        const center = c.getCenter(tmpV).clone();
        // Anchor behind the creature along its heading so we "trail" it.
        // Trail distance scales with the follow distance so giant creatures
        // aren't viewed from inside their own body.
        const fd = followDistance(c);
        const trail  = -Math.max(4.5, fd * 0.55);
        const sideK  =  Math.max(3.0, fd * 0.30);
        const liftY  =  Math.max(2.0, fd * 0.18);
        const behind = c.heading ? c.heading.clone().multiplyScalar(trail) : new THREE.Vector3(0, 0, trail);
        behind.y += liftY;
        behind.x += -sideK * (c.heading?.z ?? 0);
        behind.z +=  sideK * (c.heading?.x ?? 0);
        const camTarget = center.clone().add(behind);

        follow.blend = Math.min(1, follow.blend + dt * 0.8);
        const k = easeInOutCubic(follow.blend);
        camera.position.lerp(camTarget, Math.min(1, dt * 1.6 * (0.4 + 0.8 * k)));
        controls.target.lerp(center, Math.min(1, dt * 2.2));

        controls.update();
        return;
      }

      // --- One-shot tween (used by ambient waypoint switches) ---------
      if (tween) {
        tween.t += dt / tween.duration;
        const k = easeInOutCubic(Math.min(tween.t, 1));
        camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
        controls.target.lerpVectors(tween.fromLook, tween.toLook, k);
        if (tween.t >= 1) tween = null;
      }

      // --- Ambient mode ------------------------------------------------
      if (state.ambient && now > userUntil && !tween) {
        wpT += dt;
        if (wpT > WP_DUR) {
          wpIdx = (wpIdx + 1) % waypoints.length;
          wpT = 0;
          const wp = waypoints[wpIdx];
          // Waypoint 5: auto-follow the Leviathan for one cycle instead of a fixed tween
          if (wpIdx === 5) {
            const lev = (getCreatures?.() ?? []).find(c => c.species === 'leviathan');
            if (lev) {
              follow = makeFollow(lev);
              followExpiry = now + WP_DUR;
            } else {
              tween = {
                fromPos: camera.position.clone(), fromLook: controls.target.clone(),
                toPos: wp.pos.clone(), toLook: wp.look.clone(), t: 0, duration: 7.5,
              };
            }
          } else {
            // Smooth waypoint transition over ~7s
            tween = {
              fromPos: camera.position.clone(),
              fromLook: controls.target.clone(),
              toPos: wp.pos.clone(),
              toLook: wp.look.clone(),
              t: 0,
              duration: 7.5,
            };
          }
        } else if (!tween) {
          // Slow orbital drift around the current look target, easing the
          // camera toward the waypoint position while rotating a bit.
          const wp = waypoints[wpIdx];
          const rel = camera.position.clone().sub(wp.look);
          const radius = Math.max(6, rel.length());
          const ang = Math.atan2(rel.z, rel.x) + dt * 0.03;
          const drift = new THREE.Vector3(
            wp.look.x + Math.cos(ang) * radius,
            wp.pos.y + Math.sin(now * 0.12) * 0.5,
            wp.look.z + Math.sin(ang) * radius,
          );
          camera.position.lerp(drift, Math.min(1, dt * 0.18));
          controls.target.lerp(wp.look, Math.min(1, dt * 0.4));
        }
      }

      controls.update();
    },
  };

  // Track whether a rotate-drag is in progress so follow can be cancelled
  let orbitActive = false;
  controls.addEventListener('start', () => { orbitActive = true; });
  controls.addEventListener('end',   () => { orbitActive = false; });

  return api;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
