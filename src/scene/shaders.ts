/**
 * The night sky is a WebGL port of Voca's dawn_sky.frag: one continuous strip
 * of colour (deep night at 0, morning cream at 1) windowed by uTop and uBottom,
 * with painterly haze, stars, a faint milky band and a vignette. Here the
 * window stays on the night end of the strip, navy falling to mauve, and the
 * Sun is a glow placed in the direction the engine reports.
 */

/** Voca SkyPalette.colors and SkyPalette.stops. */
export const SKY_COLORS = [
  0x070f20, 0x0f1d38, 0x232848, 0x3e2e48, 0x6e4558, 0xb06a5e, 0xdb8e6d, 0xefb189, 0xf8d2ae, 0xfff0dd,
];

export const skyVertex = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

export const skyFragment = /* glsl */ `
precision highp float;

uniform vec2 uSize;
uniform float uTime;
uniform float uTop;
uniform float uBottom;
uniform float uStars;
uniform vec2 uSun;        // Sun position in pixels from the top-left
uniform float uSunPower;  // 0 when the Sun's screen direction is undefined
uniform vec3 uC[10];

vec3 strip(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = uC[0];
  c = mix(c, uC[1], clamp(t / 0.16, 0.0, 1.0));
  c = mix(c, uC[2], clamp((t - 0.16) / 0.16, 0.0, 1.0));
  c = mix(c, uC[3], clamp((t - 0.32) / 0.12, 0.0, 1.0));
  c = mix(c, uC[4], clamp((t - 0.44) / 0.10, 0.0, 1.0));
  c = mix(c, uC[5], clamp((t - 0.54) / 0.09, 0.0, 1.0));
  c = mix(c, uC[6], clamp((t - 0.63) / 0.08, 0.0, 1.0));
  c = mix(c, uC[7], clamp((t - 0.71) / 0.08, 0.0, 1.0));
  c = mix(c, uC[8], clamp((t - 0.79) / 0.09, 0.0, 1.0));
  c = mix(c, uC[9], clamp((t - 0.88) / 0.12, 0.0, 1.0));
  return c;
}

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 3; octave++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

float starLayer(vec2 p, float density, float threshold, float time) {
  vec2 grid = p * density;
  vec2 id = floor(grid);
  vec2 local = fract(grid) - 0.5;
  float seed = hash(id);
  if (seed < threshold) return 0.0;
  vec2 offset = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
  float d = length(local - offset * 0.7);
  float size = mix(0.035, 0.1, hash(id + 1.9));
  float core = smoothstep(size, 0.0, d);
  float twinkle = 0.62 + 0.38 * sin(time * (0.9 + seed * 2.2) + seed * 40.0);
  return core * twinkle * (0.55 + 0.45 * hash(id + 5.3));
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 uv = frag / uSize;
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  float haze = fbm(vec2(uv.x * 1.4 + uTime * 0.010, uv.y * 2.6 - uTime * 0.004));
  float t = mix(uTop, uBottom, uv.y) + (haze - 0.5) * 0.034;
  vec3 color = strip(t);

  // The Sun: a soft disc with a wide warm falloff and feathered rays.
  vec2 sun = vec2(uSun.x / uSize.y, uSun.y / uSize.y);
  float sunDistance = length(p - sun);
  vec3 sunLight = vec3(1.0, 0.91, 0.76);
  color += sunLight * exp(-sunDistance * 4.6) * 0.26 * uSunPower;
  color += sunLight * exp(-sunDistance * 15.0) * 0.36 * uSunPower;
  color = mix(color, vec3(1.0, 0.97, 0.9), smoothstep(0.034, 0.028, sunDistance) * uSunPower * 0.92);
  float angle = atan(p.y - sun.y, p.x - sun.x);
  float bands = sin(angle * 7.0 + sin(angle * 3.0 + uTime * 0.035) * 1.3);
  float rays = smoothstep(0.15, 1.0, bands) * exp(-sunDistance * 2.1);
  color += sunLight * rays * 0.06 * uSunPower;

  float starMask = uStars * smoothstep(0.92, 0.10, uv.y) * (1.0 - 0.8 * exp(-sunDistance * 3.0) * uSunPower);
  if (starMask > 0.001) {
    float stars = starLayer(p, 46.0, 0.86, uTime) + 0.55 * starLayer(p + 11.0, 92.0, 0.9, uTime * 1.3);
    float band = exp(-pow((uv.y - (0.36 - uv.x * 0.28)) * 5.0, 2.0));
    float dust = fbm(p * 7.0 + 4.0) * band;
    color += vec3(0.93, 0.95, 1.0) * (stars + dust * 0.09) * starMask;
  }

  float vignette = pow(length((uv - 0.5) * vec2(1.1, 0.9)), 2.2);
  color *= 1.0 - vignette * 0.34;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const moonVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vDir;
void main() {
  vUv = uv;
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The Moon is drawn in its own body-fixed frame, so the light is simply the
 * Sun direction the engine reports for the displayed date. Relief comes from
 * surface normals stored in that same frame; inside the south polar cap they
 * come from the LOLA 80 m map.
 */
export const moonFragment = /* glsl */ `
precision highp float;

uniform sampler2D uColor;
uniform sampler2D uNormal;
uniform sampler2D uPoleNormal;
uniform vec3 uSunDir;
uniform vec3 uEarthDir;
uniform vec3 uSunKm;
uniform vec3 uEarthKm;
uniform float uPoleHalf;   // half-width of the polar map, metres
uniform float uReady;

varying vec2 vUv;
varying vec3 vDir;

const float MOON_RADIUS_M = 1737400.0;

// Direct solar disc remaining at this surface point. The small-angle disc
// overlap is for rendering only; window numbers come from the terrain engine.
float eclipseLight(vec3 surface) {
  vec3 s = uSunKm - surface;
  vec3 e = uEarthKm - surface;
  float r = asin(695700.0 / length(s));
  float R = asin(6378.137 / length(e));
  float d = acos(clamp(dot(normalize(s), normalize(e)), -1.0, 1.0));
  if (d >= r + R) return 1.0;
  if (d + r <= R) return 0.0;
  if (d + R <= r) return 1.0 - R * R / (r * r);
  float a = acos(clamp((d*d + r*r - R*R) / (2.0*d*r), -1.0, 1.0));
  float b = acos(clamp((d*d + R*R - r*r) / (2.0*d*R), -1.0, 1.0));
  float q = max(0.0, (-d+r+R)*(d+r-R)*(d-r+R)*(d+r+R));
  float covered = (r*r*a + R*R*b - 0.5*sqrt(q)) / (3.14159265*r*r);
  return clamp(1.0 - covered, 0.0, 1.0);
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 n = normalize(texture2D(uNormal, vUv).xyz * 2.0 - 1.0);

  // South polar stereographic map coordinates of this point.
  if (dir.z < -0.9) {
    float k = 2.0 * MOON_RADIUS_M / (1.0 - dir.z);
    vec2 xy = vec2(dir.y, dir.x) * k;
    vec2 puv = xy / (2.0 * uPoleHalf) + 0.5;
    float edge = max(abs(xy.x), abs(xy.y)) / uPoleHalf;
    float w = 1.0 - smoothstep(0.82, 0.97, edge);
    if (w > 0.0) {
      vec3 pn = normalize(texture2D(uPoleNormal, puv).xyz * 2.0 - 1.0);
      n = normalize(mix(n, pn, w));
    }
  }
  n = mix(dir, n, uReady);

  vec3 albedo = pow(texture2D(uColor, vUv).rgb, vec3(2.2));
  albedo = mix(vec3(0.16), albedo, uReady) * vec3(1.06, 1.0, 0.9);

  float geo = dot(dir, uSunDir);
  float lit = pow(max(dot(n, uSunDir), 0.0), 0.82);
  float day = smoothstep(-0.07, 0.05, geo);
  float earthshine = 0.03 * max(dot(dir, uEarthDir), 0.0);
  vec3 color = albedo * (lit * day * eclipseLight(dir * 1737.4) * 2.5 + 0.012) + albedo * earthshine * vec3(0.75, 0.9, 1.25);

  gl_FragColor = vec4(pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

export const earthVertex = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** A small painted Earth, lit from the same Sun direction. It is a marker, not a map. */
export const earthFragment = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
varying vec3 vNormalW;
varying vec3 vLocal;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 q = normalize(vLocal) * 2.6;
  float land = smoothstep(0.52, 0.6, noise3(q) * 0.6 + noise3(q * 2.3) * 0.4);
  float cloud = smoothstep(0.55, 0.75, noise3(q * 1.7 + 9.0) * 0.55 + noise3(q * 4.1 + 3.0) * 0.45);
  vec3 ocean = vec3(0.07, 0.30, 0.42);
  vec3 ground = vec3(0.30, 0.42, 0.30);
  vec3 base = mix(mix(ocean, ground, land), vec3(0.95, 0.95, 0.92), cloud * 0.85);
  float d = dot(n, uSunDir);
  float day = smoothstep(-0.12, 0.22, d);
  vec3 color = base * (0.05 + 1.15 * day * (0.55 + 0.45 * max(d, 0.0)));
  gl_FragColor = vec4(pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;
