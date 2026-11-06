// shaders.js - GLSL for the galaxy (three.js ShaderMaterial adds the headers).
// Careful: avoid GLSL ES 3.00 reserved words as variable names (flat, input, output, filter, sample, smooth).
// Scale idea: sector stars are big and shine, resource planets are small. uFh = pixels per world unit at distance 1,
// so a planet never drops below about one pixel and a star never below a visible disc, however far the camera is.

// ---------- resource planets (one instanced mesh; shape morphs by aShape = (p-norm k, y-stretch)) ----------
// aSun = position of the planet's own star: that is where its light comes from.
export const NODE_VERT = `
attribute vec3 aPos; attribute float aScale; attribute vec3 aColor; attribute vec2 aShape; attribute vec4 aState; attribute vec4 aMisc; attribute vec3 aSun;
uniform float uTime; uniform float uFh;
varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vColor; varying vec4 vState; varying vec4 vMisc; varying float vDepth; varying float vTiny;
void main(){
  vec3 d = normalize(position);
  float k = aShape.x;
  float nk = pow(pow(abs(d.x), k) + pow(abs(d.y), k) + pow(abs(d.z), k), 1.0 / k);
  vec3 p = d / nk; p.y *= aShape.y;
  vec3 a = abs(d);
  vec3 face = (k < 1.5) ? sign(d) : sign(d) * step(a.yzx, a) * step(a.zxy, a);
  float flatness = clamp(abs(k - 2.0) * 0.45, 0.0, 0.85);
  vec3 n = normalize(mix(d, normalize(face), flatness));
  float seed = aMisc.z;
  float ang = uTime * (0.18 + 0.22 * seed) + seed * 6.2831;
  float c = cos(ang); float s = sin(ang);
  p.xz = vec2(c * p.x + s * p.z, -s * p.x + c * p.z);
  n.xz = vec2(c * n.x + s * n.z, -s * n.x + c * n.z);
  float sp = clamp((uTime - aMisc.y) / 1.1, 0.0, 1.0);
  float grow = 1.0 - pow(1.0 - sp, 3.0);
  float over = 1.0 + 0.28 * sin(sp * 3.14159) * (1.0 - sp);
  float sc = aScale * grow * over * (1.0 + 0.30 * aState.z + 0.22 * aMisc.w);
  sc *= 1.0 + aState.y * 0.07 * sin(uTime * 3.0 + seed * 20.0);
  vec4 c0 = viewMatrix * vec4(aPos, 1.0);
  float dep = max(-c0.z, 1.0);
  float minW = mix(1.1, 3.2, clamp(aState.z, 0.0, 1.0)) * dep / uFh;     // radius never below ~1 px (3 px when it is a search hit)
  vTiny = clamp((minW * grow) / max(sc, 0.0001) - 0.6, 0.0, 1.0);
  sc = max(sc, minW * grow);
  vec4 mv = viewMatrix * vec4(aPos + p * sc, 1.0);
  vN = normalize((viewMatrix * vec4(n, 0.0)).xyz);
  vV = normalize(-mv.xyz);
  vec4 sv = viewMatrix * vec4(aSun, 1.0);
  vL = normalize(sv.xyz - c0.xyz);
  vColor = aColor; vState = aState; vMisc = aMisc; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const NODE_FRAG = `
uniform float uTime; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uLight;
varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vColor; varying vec4 vState; varying vec4 vMisc; varying float vDepth; varying float vTiny;
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(vV); vec3 L = normalize(vL);
  float diff = smoothstep(-0.2, 0.9, dot(N, L));                       // day side faces its own star
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
  float archived = step(1.5, vState.x);
  vec3 base = mix(vColor, vec3(lum), vMisc.x * 0.5);
  base = mix(base, vec3(lum), archived * 0.85);
  vec3 col = base * (0.5 + 0.8 * diff);                                // night side stays clearly coloured
  col += base * 0.12;                                                  // faint light of its own
  col += base * rim * (0.35 + 0.5 * diff);                             // thin atmosphere
  col += vec3(1.0) * pow(max(dot(reflect(-L, N), V), 0.0), 42.0) * 0.26 * diff * (1.0 - archived * 0.7);
  col = mix(col, base * 1.3, vTiny * 0.85);                             // far away: a clean coloured point
  col = mix(col, vec3(1.0), vState.z * 0.2);
  col += base * vState.z * 0.35;
  col = mix(col, uFog, archived * 0.35);
  col = mix(col, uFog, vState.w * 0.82);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDepth) * (uLight > 0.5 ? 0.85 : 0.45));
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------- sector stars: glowing plasma ball, white-hot in the middle, coloured at the edge ----------
export const SUN_VERT = `
attribute vec3 aPos; attribute float aScale; attribute vec3 aColor; attribute vec4 aMisc;
uniform float uTime; uniform float uFh;
varying vec3 vN; varying vec3 vV; varying vec3 vObj; varying vec3 vColor;
void main(){
  vec3 d = normalize(position);
  float sp = clamp((uTime - aMisc.y) / 1.4, 0.0, 1.0);
  float grow = 1.0 - pow(1.0 - sp, 3.0);
  float over = 1.0 + 0.12 * sin(sp * 3.14159) * (1.0 - sp);
  float sc = aScale * grow * over * (1.0 + 0.2 * aMisc.w);
  vec4 c0 = viewMatrix * vec4(aPos, 1.0);
  sc = max(sc, 2.6 * max(-c0.z, 1.0) / uFh * grow);                    // a star stays a visible disc from far away
  vec4 mv = viewMatrix * vec4(aPos + d * sc, 1.0);
  float ang = uTime * 0.05 + aMisc.z * 6.2831; float ca = cos(ang), sa = sin(ang);
  vObj = vec3(ca * d.x + sa * d.z, d.y, -sa * d.x + ca * d.z);
  vN = normalize((viewMatrix * vec4(d, 0.0)).xyz); vV = normalize(-mv.xyz);
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`;
export const SUN_FRAG = `
uniform float uTime; uniform float uLight;
varying vec3 vN; varying vec3 vV; varying vec3 vObj; varying vec3 vColor;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(vV);
  float f = clamp(dot(N, V), 0.0, 1.0);
  float limb = 1.0 - f;
  float g = n3(vObj * 5.0 + vec3(0.0, uTime * 0.07, 0.0)) * 0.6 + n3(vObj * 12.0 - vec3(uTime * 0.05, 0.0, 0.0)) * 0.4;   // boiling surface
  vec3 hot = mix(vColor, vec3(1.0), 0.55);
  vec3 col = mix(vColor * 0.9, hot, smoothstep(0.3, 0.8, g));                  // bright granules on a saturated surface
  col = mix(col, vec3(1.0), pow(f, 4.0) * 0.38);                               // white-hot towards the middle
  col = mix(col, vColor * 1.15, smoothstep(0.35, 0.95, limb) * 0.65);          // coloured edge
  col += vColor * pow(limb, 4.0) * 0.8;                                        // bright rim
  if (uLight > 0.5) col = mix(vColor, col, 0.7);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------- billboards (uMode picks the look) ----------
// 0 alert ping + search/selection ring, 1 hub ring, 2 sector haze, 3 select pulse, 4 reticle, 5 route dot, 6 star glow
export const HALO_VERT = `
attribute vec3 aPos; attribute float aScale; attribute vec3 aColor; attribute vec4 aState; attribute vec4 aMisc;
uniform float uTime; uniform float uMode; uniform float uSize; uniform float uFh; uniform float uMinPx;
varying vec2 vUv; varying vec3 vColor; varying vec4 vState; varying vec4 vMisc; varying float vK;
void main(){
  vUv = position.xy * 2.0; vColor = aColor; vState = aState; vMisc = aMisc;
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float dep = max(-mv.z, 1.0);
  vK = (uMode > 5.5) ? mix(0.42, 1.0, smoothstep(2.5, 9.0, dep / max(aScale, 0.001))) : 1.0;   // the glow thins out when you fly right up to a star
  float sp = clamp((uTime - aMisc.y) / 1.1, 0.0, 1.0);
  float grow = 1.0 - pow(1.0 - sp, 3.0);
  float s = aScale * uSize * grow;
  if (uMode < 0.5) {
    float hit = clamp(aState.z, 0.0, 1.0);
    if (aState.y < 0.01) s = aScale * 3.4 * grow;                      // no alert: just the ring around a search hit or selection
    if (aState.y < 0.01 && hit < 0.01) s = 0.0;
    else s = max(s, 24.0 * dep / uFh * grow);
  }
  if (uMode > 2.5 && uMode < 3.5) { float age = clamp((uTime - aMisc.y) / 1.4, 0.0, 1.0); s = max(aScale * (0.5 + 2.6 * age), 26.0 * dep / uFh * (0.35 + age)); }
  if (uMode > 3.5 && uMode < 4.5) { s = max(aScale * uSize * (0.9 + 0.1 * aMisc.w), 24.0 * dep / uFh); }
  if (uMode > 4.5 && uMode < 5.5) { s = max(aScale * uSize * (1.0 + 0.07 * sin(uTime * 4.0)), 10.0 * dep / uFh); }
  if (uMinPx > 0.0) s = max(s, uMinPx * dep / uFh * grow);
  mv.xy += position.xy * s;
  gl_Position = projectionMatrix * mv;
}`;
export const HALO_FRAG = `
uniform float uTime; uniform float uMode; uniform float uLight; uniform float uIntensity;
varying vec2 vUv; varying vec3 vColor; varying vec4 vState; varying vec4 vMisc; varying float vK;
void main(){
  float d = length(vUv);
  if (d > 1.0) discard;
  float a = 0.0; vec3 col = vColor;
  if (uMode < 0.5) {
    float ph = fract(uTime * 0.5 + vMisc.z);
    float ping = smoothstep(0.07, 0.0, abs(d - (0.3 + 0.65 * ph))) * (1.0 - ph) * vState.y * 0.9 * (1.0 - 0.9 * vState.w);
    float hit = clamp(vState.z, 0.0, 1.0);
    float ring = smoothstep(0.09, 0.0, abs(d - (0.78 + 0.03 * sin(uTime * 3.0)))) * hit * 0.95 + (1.0 - smoothstep(0.0, 0.78, d)) * hit * 0.1;
    vec3 hc = mix(vec3(1.0), vColor, 0.35);
    a = max(ping, ring);
    col = (vec3(1.0, 0.27, 0.23) * ping + hc * ring) / max(ping + ring, 0.0001);
  } else if (uMode < 1.5) {
    a = smoothstep(0.022, 0.0, abs(d - 0.9)) * 0.5;
  } else if (uMode < 2.5) {
    // sector haze: a soft cloud of the star's colour that the planets float in
    float ang = atan(vUv.y, vUv.x);
    float sw = 0.72 + 0.28 * sin(ang * 3.0 + d * 7.0 + uTime * 0.05 + vMisc.z * 20.0) * (0.6 + 0.4 * sin(ang * 5.0 - uTime * 0.03 + vMisc.z * 9.0));
    a = exp(-d * d * 4.2) * (1.0 - smoothstep(0.8, 1.0, d)) * (uLight > 0.5 ? 0.07 : 0.11) * sw;
    col = mix(vColor, vec3(1.0), 0.1);
  } else if (uMode < 3.5) {
    float age = clamp((uTime - vMisc.y) / 1.4, 0.0, 1.0);
    a = smoothstep(0.05, 0.0, abs(d - (0.12 + 0.86 * age))) * (1.0 - age) * 0.9;
  } else if (uMode < 4.5) {
    a = smoothstep(0.035, 0.0, abs(d - 0.86)) * vMisc.w;
  } else if (uMode < 5.5) {
    float inner = 1.0 - smoothstep(0.5, 0.55, d);
    float outer = 1.0 - smoothstep(0.76, 0.8, d);
    col = mix(vec3(1.0), vColor, inner); a = outer;
  } else {
    // star glow: white-hot point, tight halo, wide soft bloom and thin diffraction rays
    float seed = vMisc.z;
    float tw = 0.93 + 0.07 * sin(uTime * (0.8 + seed * 1.6) + seed * 40.0);
    float core = exp(-d * d * 220.0);
    float inner = exp(-d * 13.0);
    float halo = exp(-d * 5.2);
    float haze = exp(-d * d * 3.0);
    float cs = cos(seed * 6.2831), sn = sin(seed * 6.2831);
    vec2 q = vec2(cs * vUv.x - sn * vUv.y, sn * vUv.x + cs * vUv.y);
    float r1 = exp(-abs(q.x) * 60.0) * exp(-abs(q.y) * 3.4) + exp(-abs(q.y) * 60.0) * exp(-abs(q.x) * 3.4);
    vec2 q2 = vec2(q.x + q.y, q.x - q.y) * 0.7071;
    float r2 = (exp(-abs(q2.x) * 80.0) * exp(-abs(q2.y) * 6.0) + exp(-abs(q2.y) * 80.0) * exp(-abs(q2.x) * 6.0)) * 0.45;
    float rays = (r1 + r2) * (0.8 + 0.2 * sin(uTime * 0.7 + seed * 12.0));
    float edge = 1.0 - smoothstep(0.78, 1.0, d);
    if (uLight > 0.5) {
      gl_FragColor = vec4(vColor * 0.9, clamp(inner * 0.5 + halo * 0.3, 0.0, 0.7) * edge * uIntensity);
      return;
    }
    vec3 e = vec3(1.0) * (core + inner * 0.5) + vColor * (inner * 0.7 + halo * 0.5 + haze * 0.18) + mix(vec3(1.0), vColor, 0.5) * rays * 0.85;
    gl_FragColor = vec4(e * edge * tw * uIntensity * vK, 1.0);
    return;
  }
  a *= uIntensity;
  gl_FragColor = vec4(col, a);
}`;

// ---------- links ----------
export const EDGE_VERT = `
attribute float aEnd; attribute float aLen; attribute vec3 aColor; attribute float aGlow;
varying float vT; varying float vLen; varying vec3 vC; varying float vGlow; varying float vDepth;
void main(){
  vT = aEnd; vLen = aLen; vC = aColor; vGlow = aGlow;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  vDepth = -mv.z; gl_Position = projectionMatrix * mv;
}`;
export const EDGE_FRAG = `
uniform float uTime; uniform float uLight; uniform float uAlpha;
varying float vT; varying float vLen; varying vec3 vC; varying float vGlow; varying float vDepth;
void main(){
  float phase = fract(vT * vLen / 18.0 - uTime * 0.35);
  float pulse = smoothstep(0.85, 1.0, phase) * vGlow;
  float a = 0.16 + 0.55 * vGlow + 0.3 * pulse;
  a *= (1.0 - smoothstep(320.0, 950.0, vDepth) * 0.75) * uAlpha;
  vec3 col = vC;
  if (uLight > 0.5) { col *= 0.8; a *= 1.25; }
  gl_FragColor = vec4(col, a);
}`;

// ---------- background stars: real colours (blue-white, white, yellow, orange), soft round glow ----------
export const STAR_VERT = `
attribute float aSize; attribute float aPhase; attribute vec3 aTint;
uniform float uTime; uniform float uPx;
varying vec3 vC; varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.7 + 0.3 * sin(uTime * (0.6 + aPhase * 1.5) + aPhase * 50.0);
  gl_PointSize = aSize * uPx * (0.85 + 0.3 * tw);
  vC = aTint; vA = tw;
}`;
export const STAR_FRAG = `
uniform float uLight;
varying vec3 vC; varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = exp(-d * d * 4.5) + 0.35 * exp(-d * 2.0);
  vec3 col = vC; float k = 0.85;
  if (uLight > 0.5) { col = vec3(0.55, 0.57, 0.66); k = 0.3; }
  gl_FragColor = vec4(col, min(a, 1.0) * vA * k);
}`;
