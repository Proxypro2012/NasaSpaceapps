import * as THREE from 'three';
import type { TerrainTile } from '../engine/load';

/** Vertical stretch of the terrain model, for readability. Stated on screen. */
export const TERRAIN_STRETCH = 1.5;

const vertex = /* glsl */ `
uniform sampler2D uHeight;
uniform float uStretch;
uniform float uSpan;
varying vec2 vUv;
varying float vH;
void main() {
  vUv = uv;
  float h = texture2D(uHeight, uv).r;
  vH = h;
  vec3 p = vec3((uv.x - 0.5) * uSpan, h * uStretch, (0.5 - uv.y) * uSpan);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

/**
 * Terrain shaded by the real Sun direction. Shadows are cast by marching each
 * point toward the Sun across the height map: the 80 m tile first, then a
 * wider, coarser tile out to about 160 km, with the Moon's curvature included.
 */
const fragment = /* glsl */ `
precision highp float;
uniform sampler2D uHeight;
uniform sampler2D uFar;
uniform float uFarSpan;   // metres across the wide tile
uniform float uSpan;      // metres across the tile
uniform float uCell;      // metres per height sample
uniform vec2 uSunMap;     // unit direction toward the Sun on the map (x east-ish, y up the image)
uniform float uSunTan;    // tangent of the Sun's elevation
uniform float uSunRadius; // angular radius of the Sun, as a tangent
uniform float uEclipseLight;
uniform vec2 uSite;
varying vec2 vUv;
varying float vH;

float heightAt(vec2 uv) { return texture2D(uHeight, uv).r; }

void main() {
  float texel = uCell / uSpan;
  float hx = heightAt(vUv + vec2(texel, 0.0)) - heightAt(vUv - vec2(texel, 0.0));
  float hy = heightAt(vUv + vec2(0.0, texel)) - heightAt(vUv - vec2(0.0, texel));
  vec3 n = normalize(vec3(-hx, 2.0 * uCell, -hy));
  float cosEl = 1.0 / sqrt(1.0 + uSunTan * uSunTan);
  vec3 sun = vec3(uSunMap.x * cosEl, uSunTan * cosEl, uSunMap.y * cosEl);
  float facing = max(dot(n, sun), 0.0);

  // March toward the Sun; the clearance of the ray over the terrain sets how much of the disc is seen.
  float clear = 1.0;
  float dist = uCell * 1.5;
  vec2 fromSite = (vUv - uSite) * uSpan;          // metres from the site, map axes
  for (int i = 0; i < 280; i++) {
    vec2 p = vUv + uSunMap * (dist / uSpan);
    float h;
    if (p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0) {
      h = heightAt(p);
    } else {
      vec2 q = vec2(0.5) + (fromSite + uSunMap * dist) / uFarSpan;
      if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) break;
      h = texture2D(uFar, q).r;
    }
    // Distant ground drops away below the local level plane as the Moon curves.
    float drop = dist * dist / (2.0 * 1737400.0);
    float ray = vH + 2.0 + dist * uSunTan;
    float over = (ray - (h - drop)) / dist;       // tangent of the clearance angle
    clear = min(clear, smoothstep(-uSunRadius, uSunRadius, over));
    if (clear <= 0.0) break;
    dist += max(uCell, dist * 0.03);
  }

  // Grazing light makes lit slopes read almost flat-bright, which is what the pole looks like.
  // Grazing light: level ground is dim and Sun-facing slopes are bright, as at the pole.
  float lit = clear * uEclipseLight * (1.0 - exp(-facing * 9.0));
  vec3 ground = vec3(0.90, 0.84, 0.73);
  // A faint, fixed fill light keeps the shape of shadowed ground readable. It is not sunlight.
  float fill = 0.5 + 0.5 * dot(n, normalize(vec3(-0.35, 0.85, 0.4)));
  vec3 shade = vec3(0.05, 0.068, 0.12) * (0.45 + 1.1 * fill);
  vec3 color = mix(shade, ground * (0.55 + 0.45 * fill), clamp(lit, 0.0, 1.0));

  float ring = abs(length((vUv - uSite) * uSpan) - 620.0);
  color = mix(color, vec3(0.486, 0.784, 0.722), 1.0 - smoothstep(55.0, 110.0, ring));
  gl_FragColor = vec4(color, 1.0);
}
`;

export class TerrainView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 100, 400_000);
  private material: THREE.ShaderMaterial;
  private azimuth = 0.6;
  private polar = 0.82;
  private radius: number;
  private raf = 0;
  private dirty = true;
  private disposers: (() => void)[] = [];
  private target = new THREE.Vector3();

  constructor(
    private canvas: HTMLCanvasElement,
    tile: TerrainTile,
    heights: Int16Array,
    farHeights: Int16Array,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    const n = tile.size;
    // Float textures can only be smoothed where the browser supports it.
    const smooth = this.renderer.extensions.has('OES_texture_float_linear');
    const heightTexture = (src: Int16Array) => {
      const data = new Float32Array(n * n);
      // Image rows run top to bottom; texture rows run bottom to top.
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data[(n - 1 - r) * n + c] = src[r * n + c];
      const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.FloatType);
      t.minFilter = t.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
      t.needsUpdate = true;
      return t;
    };
    const tex = heightTexture(heights);

    const span = n * tile.cell_m;
    const siteH = heights[tile.site_row * n + tile.site_col];
    this.radius = span * 1.45;
    this.target.set(0, siteH * TERRAIN_STRETCH * 0.3 - span * 0.02, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uHeight: { value: tex },
        uFar: { value: heightTexture(farHeights) },
        uFarSpan: { value: n * tile.far_cell_m },
        uStretch: { value: TERRAIN_STRETCH },
        uSpan: { value: span },
        uCell: { value: tile.cell_m },
        uSunMap: { value: new THREE.Vector2(1, 0) },
        uSunTan: { value: 0.02 },
        uSunRadius: { value: 0.0046 },
        uEclipseLight: { value: 1 },
        uSite: { value: new THREE.Vector2((tile.site_col + 0.5) / n, 1 - (tile.site_row + 0.5) / n) },
      },
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 340, 340), this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    this.bind();
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this.disposers.push(() => window.removeEventListener('resize', onResize));
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  /**
   * Sun direction on the map (toward the Sun) and its elevation, both from the engine.
   * mapX points along +x of the polar map, mapY along +y.
   */
  setSun(mapX: number, mapY: number, elevationDeg: number, radiusDeg: number, eclipseLight = 1): void {
    this.material.uniforms.uSunMap.value.set(mapX, mapY);
    this.material.uniforms.uSunTan.value = Math.tan((elevationDeg * Math.PI) / 180);
    this.material.uniforms.uSunRadius.value = Math.tan((radiusDeg * Math.PI) / 180);
    this.material.uniforms.uEclipseLight.value = eclipseLight;
    this.dirty = true;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const d of this.disposers) d();
    this.renderer.dispose();
  }

  private bind(): void {
    const el = this.canvas;
    let drag = false;
    let x = 0;
    let y = 0;
    const down = (e: PointerEvent) => {
      drag = true;
      x = e.clientX;
      y = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      this.azimuth -= (e.clientX - x) * 0.006;
      this.polar = Math.min(1.45, Math.max(0.25, this.polar - (e.clientY - y) * 0.005));
      x = e.clientX;
      y = e.clientY;
      this.dirty = true;
    };
    const up = () => (drag = false);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.radius = Math.min(90_000, Math.max(6_000, this.radius * Math.exp(e.deltaY * 0.0014)));
      this.dirty = true;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    });
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (!this.dirty) return;
    this.dirty = false;
    const s = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.radius * s * Math.sin(this.azimuth),
      this.target.y + this.radius * Math.cos(this.polar),
      this.target.z + this.radius * s * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  };
}
