import * as THREE from 'three';

/**
 * Shared vertex-shader injection that gives all finfish a unified body-bend:
 *
 *   lateralZ = sin( time*freq + x/len * k ) * amp * tailWeight(x)  +  turn * tailWeight * curlK
 *   pitchY   = uPitch * tailWeight(x)        // heading pitched up/down, tail follows
 *
 * Vertices are offset in local Z (lateral) and Y (vertical). `x` is the local
 * fish axis: head at +X, tail at -X. `length` is the full nose-to-tail length
 * in local units.
 *
 * All meshes that belong to the same fish should share the same `uniforms`
 * object so body + fins + tail bend in lock-step.
 *
 * Returns the uniforms object (create it once per fish, pass it to each mesh's
 * material via this helper).
 */
export function makeFishBendUniforms({
  length,
  amp = 0.22,
  freq = 1.4,
  tailWeight = 1.4,
  curl = 0.8,
} = {}) {
  return {
    uTime:   { value: 0 },
    uTurn:   { value: 0 },
    uPitch:  { value: 0 },
    uAmp:    { value: amp },
    uFreq:   { value: freq },
    uLen:    { value: length },
    uTailW:  { value: tailWeight },
    uCurl:   { value: curl },
  };
}

export function injectFishBend(material, uniforms) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);

    shader.uniforms.uTime  = uniforms.uTime;
    shader.uniforms.uTurn  = uniforms.uTurn;
    shader.uniforms.uPitch = uniforms.uPitch;
    shader.uniforms.uAmp   = uniforms.uAmp;
    shader.uniforms.uFreq  = uniforms.uFreq;
    shader.uniforms.uLen   = uniforms.uLen;
    shader.uniforms.uTailW = uniforms.uTailW;
    shader.uniforms.uCurl  = uniforms.uCurl;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uTurn;
        uniform float uPitch;
        uniform float uAmp;
        uniform float uFreq;
        uniform float uLen;
        uniform float uTailW;
        uniform float uCurl;
      `)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3( position );
        // body axis normalized: +1 at head (+X), -1 at tail (-X)
        float bodyS = clamp(transformed.x / (uLen * 0.5), -1.0, 1.0);
        // tailWeight: 0 near head, 1 near tail
        float tw = pow(clamp(-bodyS, 0.0, 1.0), uTailW);
        // travelling wave along body (anti-head, positive phase going tailward)
        float wave = sin(uTime * uFreq * 6.2831853 - bodyS * 3.2) * uAmp * tw;
        // steering curl: tail trails outside the turn
        wave += uTurn * uCurl * tw;
        transformed.z += wave;
        // pitch: head up/down tilts tail the opposite way
        transformed.y += -uPitch * tw * 0.45;
      `);
  };
  // Flag so the material gets recompiled when onBeforeCompile is replaced
  material.customProgramCacheKey = () => 'fishBend_v1';
  return material;
}
