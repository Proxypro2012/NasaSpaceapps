import * as THREE from 'three';
import type { Ephemeris } from '../engine/ephemeris';
import { bodyDirections } from '../engine/sky';
import type { Site, Vec3, Verdict } from '../engine/types';
import {
  SKY_COLORS,
  earthFragment,
  earthVertex,
  moonFragment,
  moonVertex,
  skyFragment,
  skyVertex,
} from './shaders';

const FOV_DEG = 30;
const MIN_DISTANCE = 1.22;
const MAX_DISTANCE = 9;
/** Earth is drawn close and large so it fits on screen; only its direction is real. */
const EARTH_DISTANCE = 1.42;
const EARTH_RADIUS = 0.105;

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  eph: Ephemeris;
  sites: Site[];
  poleHalfExtentM: number;
  reducedMotion: boolean;
  onSelectSite(id: string): void;
  onOpenSite(id: string): void;
  /** Called when the camera leaves, or returns to, the opening view. */
  onViewChange?(moved: boolean): void;
}

interface Pin {
  site: Site;
  dir: THREE.Vector3;
  root: HTMLButtonElement;
  leader: HTMLDivElement;
  label: HTMLDivElement;
  verdict: Verdict | null;
}

/** Builds a sphere whose vertices are Moon-fixed directions and whose UVs match an equirectangular map centred on 0 longitude. */
function moonGeometry(rows = 96, cols = 192): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const lat = Math.PI / 2 - (Math.PI * i) / rows;
    for (let j = 0; j <= cols; j++) {
      const lon = -Math.PI + (2 * Math.PI * j) / cols;
      pos.push(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
      uv.push(j / cols, 1 - i / rows);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class MoonScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.05, 50);
  private sky: THREE.ShaderMaterial;
  private moon: THREE.ShaderMaterial;
  private earthMat: THREE.ShaderMaterial;
  private earth: THREE.Mesh;
  private pins: Pin[] = [];
  private sunLabel: HTMLDivElement;
  private earthLabel: HTMLDivElement;

  private orientation = new THREE.Quaternion();
  private distance = 6.3;
  private fly: { fromQ: THREE.Quaternion; toQ: THREE.Quaternion; fromD: number; toD: number; t0: number; ms: number } | null =
    null;
  private centre = { x: 0, y: 0 };
  private size = { w: 1, h: 1 };
  private displayMs = 0;
  private raf = 0;
  private startedAt = performance.now();
  private disposers: (() => void)[] = [];
  private sunDir: Vec3 = [1, 0, 0];
  private earthDir: Vec3 = [1, 0, 0];

  constructor(private opts: SceneOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // shaders write display values themselves

    this.sky = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uSize: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uTop: { value: 0.02 },
        uBottom: { value: 0.5 },
        uStars: { value: 1 },
        uSun: { value: new THREE.Vector2(0, 0) },
        uSunPower: { value: 1 },
        uC: { value: SKY_COLORS.map((c) => new THREE.Vector3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255)) },
      },
    });
    const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.sky);
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -1;
    this.scene.add(skyMesh);

    const loader = new THREE.TextureLoader();
    let pending = 3;
    const texture = (file: string) => {
      const t = loader.load(`${import.meta.env.BASE_URL}textures/${file}`, () => {
        pending -= 1;
        if (pending === 0) this.moon.uniforms.uReady.value = 1;
      });
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = 8;
      t.wrapS = THREE.RepeatWrapping;
      return t;
    };
    this.moon = new THREE.ShaderMaterial({
      vertexShader: moonVertex,
      fragmentShader: moonFragment,
      uniforms: {
        uColor: { value: texture('moon_color.jpg') },
        uNormal: { value: texture('moon_normal.jpg') },
        uPoleNormal: { value: texture('pole_normal.jpg') },
        uSunDir: { value: new THREE.Vector3(1, 0, 0) },
        uEarthDir: { value: new THREE.Vector3(1, 0, 0) },
        uPoleHalf: { value: opts.poleHalfExtentM },
        uReady: { value: 0 },
      },
    });
    this.scene.add(new THREE.Mesh(moonGeometry(), this.moon));

    this.earthMat = new THREE.ShaderMaterial({
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
      uniforms: { uSunDir: { value: new THREE.Vector3(1, 0, 0) } },
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 48, 32), this.earthMat);
    this.scene.add(this.earth);

    this.camera.position.set(0.42, 0, -0.91).normalize().multiplyScalar(this.distance);
    this.camera.up.set(1, 0, 0);
    this.camera.lookAt(0, 0, 0);
    this.orientation.copy(this.camera.quaternion);

    this.sunLabel = this.bodyLabel('Sun');
    this.earthLabel = this.bodyLabel('Earth');
    for (const site of opts.sites) this.pins.push(this.makePin(site));

    this.bindPointer();
    this.resize();
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this.disposers.push(() => window.removeEventListener('resize', onResize));
    this.raf = requestAnimationFrame(this.frame);
  }

  /** The date to draw. Called every frame while the date glides. */
  setTime(ms: number): void {
    this.displayMs = ms;
  }

  /** Where on the canvas the Moon's centre should sit, and how big it should be. */
  setFrame(centreX: number, centreY: number, radiusPx: number): void {
    this.centre = { x: centreX, y: centreY };
    const tanHalf = Math.tan((FOV_DEG * Math.PI) / 360);
    const s = Math.min(0.75, (radiusPx / (this.size.h / 2)) * tanHalf);
    this.homeDistance = 1 / Math.sin(Math.atan(s));
    if (!this.userMoved) this.distance = this.homeDistance;
  }
  private homeDistance = 6.3;
  /** Space kept free at the bottom of the scene for controls. */
  labelBottomInset = 12;
  private moved = false;
  private get userMoved(): boolean {
    return this.moved;
  }
  private set userMoved(v: boolean) {
    if (v === this.moved) return;
    this.moved = v;
    this.opts.onViewChange?.(v);
  }

  setVerdicts(verdicts: Record<string, Verdict>, pulse: boolean): void {
    for (const pin of this.pins) {
      const v = verdicts[pin.site.id];
      if (!v) continue;
      const changed = pin.verdict !== null && pin.verdict !== v;
      pin.verdict = v;
      pin.root.dataset.verdict = v;
      pin.root.setAttribute('aria-label', `${pin.site.name}: ${v}. Press Enter to open the site view.`);
      if (changed && pulse && !this.opts.reducedMotion) {
        pin.root.classList.remove('pulse');
        void pin.root.offsetWidth;
        pin.root.classList.add('pulse');
      }
    }
  }

  setSelected(id: string): void {
    for (const pin of this.pins) pin.root.setAttribute('aria-pressed', String(pin.site.id === id));
  }

  /**
   * Glide the camera down over the pole so the sites pull apart, or back to the opening view.
   * The sites sit within a few degrees of each other, so the camera frames all of them rather
   * than the chosen one alone; looking straight down on one would push the others off screen.
   */
  focusSite(id: string | null): void {
    const target = new THREE.PerspectiveCamera();
    let toD = this.homeDistance;
    if (id) {
      if (!this.pins.some((p) => p.site.id === id)) return;
      const middle = new THREE.Vector3();
      for (const p of this.pins) middle.add(p.dir);
      middle.normalize();
      const spread = Math.max(...this.pins.map((p) => p.dir.angleTo(middle)));
      target.position.copy(middle).multiplyScalar(2);
      toD = this.distanceToFit(spread);
      this.userMoved = true;
    } else {
      target.position.set(0.42, 0, -0.91).normalize();
      this.userMoved = false;
    }
    target.up.set(1, 0, 0);
    target.lookAt(0, 0, 0);
    if (this.opts.reducedMotion) {
      this.orientation.copy(target.quaternion);
      this.distance = toD;
      return;
    }
    this.fly = {
      fromQ: this.orientation.clone(),
      toQ: target.quaternion.clone(),
      fromD: this.distance,
      toD,
      t0: performance.now(),
      ms: 1500,
    };
  }

  /**
   * Camera distance at which a point `angle` radians from the view centre lands well inside
   * the free area around the frame centre, leaving room for the top bar and a pin label.
   */
  private distanceToFit(angle: number): number {
    const { w, h } = this.size;
    const { x: cx, y: cy } = this.centre;
    const room = Math.min(cy - 84, h - this.labelBottomInset - cy, cx, w - cx);
    const px = Math.max(40, room * 0.55);
    const tanHalf = Math.tan((FOV_DEG * Math.PI) / 360);
    const d = Math.cos(angle) + (Math.sin(angle) * (h / 2)) / (tanHalf * px);
    return Math.min(this.homeDistance, Math.max(MIN_DISTANCE, d));
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const d of this.disposers) d();
    for (const pin of this.pins) pin.root.remove();
    this.sunLabel.remove();
    this.earthLabel.remove();
    this.renderer.dispose();
  }

  private bodyLabel(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'body-label';
    el.textContent = text;
    this.opts.overlay.appendChild(el);
    return el;
  }

  private makePin(site: Site): Pin {
    const root = document.createElement('button');
    root.type = 'button';
    root.className = 'pin';
    const dot = document.createElement('span');
    dot.className = 'pin-dot';
    const leader = document.createElement('div');
    leader.className = 'pin-leader';
    const label = document.createElement('div');
    label.className = 'pin-label';
    const name = document.createElement('span');
    name.className = 'pin-name';
    name.textContent = site.name;
    // The verdict word lives on the card; here the dot's colour carries it.
    label.append(name);
    root.append(leader, dot, label);
    root.addEventListener('click', () => this.opts.onSelectSite(site.id));
    root.addEventListener('dblclick', () => this.opts.onOpenSite(site.id));
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.opts.onSelectSite(site.id);
        this.opts.onOpenSite(site.id);
      }
    });
    this.opts.overlay.appendChild(root);
    return { site, dir: new THREE.Vector3(...site.up), root, leader, label, verdict: null };
  }

  private bindPointer(): void {
    const el = this.opts.canvas;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const yaw = new THREE.Quaternion();
    const pitch = new THREE.Quaternion();
    const X = new THREE.Vector3(1, 0, 0);
    const Y = new THREE.Vector3(0, 1, 0);
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
      this.fly = null;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      // Slower when close, so the surface roughly follows the pointer.
      const k = 0.006 * Math.min(1, (this.distance - 1) / 5 + 0.03);
      yaw.setFromAxisAngle(Y, -(e.clientX - lastX) * k);
      pitch.setFromAxisAngle(X, -(e.clientY - lastY) * k);
      this.orientation.multiply(yaw).multiply(pitch).normalize();
      lastX = e.clientX;
      lastY = e.clientY;
      this.userMoved = true;
    };
    const up = () => {
      dragging = false;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.fly = null;
      const altitude = (this.distance - 1) * Math.exp(e.deltaY * 0.0016);
      this.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, 1 + altitude));
      this.userMoved = true;
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
    const el = this.opts.canvas;
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.sky.uniforms.uSize.value.set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
  }

  private tmp = new THREE.Vector3();
  private inv = new THREE.Quaternion();

  private project(v: THREE.Vector3): { x: number; y: number } {
    this.tmp.copy(v).project(this.camera);
    return { x: (this.tmp.x * 0.5 + 0.5) * this.size.w, y: (-this.tmp.y * 0.5 + 0.5) * this.size.h };
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) return;
    const { w, h } = this.size;

    if (this.fly) {
      const p = Math.min(1, (now - this.fly.t0) / this.fly.ms);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      this.orientation.slerpQuaternions(this.fly.fromQ, this.fly.toQ, e);
      this.distance = this.fly.fromD + (this.fly.toD - this.fly.fromD) * e;
      if (p >= 1) this.fly = null;
    }

    this.camera.quaternion.copy(this.orientation);
    this.camera.position.set(0, 0, this.distance).applyQuaternion(this.orientation);
    // Shift the picture so the Moon's centre lands where the layout wants it.
    const zoomedIn = Math.min(1, Math.max(0, (this.homeDistance - this.distance) / (this.homeDistance - 1.6)));
    const cx = this.centre.x + (w / 2 - this.centre.x) * zoomedIn * 0.5;
    const cy = this.centre.y + (h / 2 - this.centre.y) * zoomedIn;
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    // Everything below comes from the engine for the displayed date.
    bodyDirections(this.opts.eph, this.displayMs, this.sunDir, this.earthDir);
    this.moon.uniforms.uSunDir.value.set(...this.sunDir);
    this.moon.uniforms.uEarthDir.value.set(...this.earthDir);
    this.earthMat.uniforms.uSunDir.value.set(...this.sunDir);
    this.earth.position.set(...this.earthDir).multiplyScalar(EARTH_DISTANCE);

    // The Sun is far off screen in reality. Its glow is placed along the true
    // on-screen direction from the Moon, inside the frame.
    this.inv.copy(this.orientation).invert();
    this.tmp.set(...this.sunDir).applyQuaternion(this.inv);
    const len = Math.hypot(this.tmp.x, this.tmp.y);
    const sx = len > 1e-4 ? this.tmp.x / len : 0;
    const sy = len > 1e-4 ? -this.tmp.y / len : -1;
    const moonPx = (h / 2) * (Math.tan(Math.asin(1 / this.distance)) / Math.tan((FOV_DEG * Math.PI) / 360));
    const inset = 46;
    let reach = moonPx * 1.55 + 60;
    if (sx > 0) reach = Math.min(reach, (w - inset - cx) / sx);
    if (sx < 0) reach = Math.min(reach, (inset - cx) / sx);
    if (sy > 0) reach = Math.min(reach, (h - inset - cy) / sy);
    if (sy < 0) reach = Math.min(reach, (inset - cy) / sy);
    reach = Math.max(reach, 0);
    const sunX = cx + sx * reach;
    const sunY = cy + sy * reach;
    const dpr = this.renderer.getPixelRatio();
    this.sky.uniforms.uSun.value.set(sunX * dpr, sunY * dpr);
    // Behind the Moon as seen from here, the glow dims rather than vanishing.
    const facing = this.tmp.z / Math.max(1e-6, this.tmp.length());
    this.sky.uniforms.uSunPower.value = Math.min(1, len * 3) * (facing < -0.9 ? 0.5 : 1);
    this.sky.uniforms.uTime.value = this.opts.reducedMotion ? 0 : (now - this.startedAt) / 1000;
    this.place(this.sunLabel, sunX, sunY + 34, len > 0.2);

    const ep = this.project(this.earth.position);
    this.place(this.earthLabel, ep.x, ep.y + moonPx * EARTH_RADIUS + 16, true);

    this.layoutPins(cx, cy);
    this.renderer.render(this.scene, this.camera);
  };

  private place(el: HTMLElement, x: number, y: number, show: boolean): void {
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    el.style.opacity = show ? '1' : '0';
  }

  private layoutPins(cx: number, cy: number): void {
    const camDir = this.tmp.copy(this.camera.position).normalize().clone();
    const pts = this.pins.map((pin) => ({ pin, ...this.project(pin.dir), front: pin.dir.dot(camDir) > 0.08 }));
    const shown = pts.filter((p) => p.front);
    // Labels fan outward from the middle of the visible pins so they never stack.
    let mx = cx;
    let my = cy;
    if (shown.length > 1) {
      mx = shown.reduce((s, p) => s + p.x, 0) / shown.length;
      my = shown.reduce((s, p) => s + p.y, 0) / shown.length;
    }
    const fallback = [-2.4, -0.6, 0.9];
    const { w, h } = this.size;
    const reach = 54;
    const boxes: { pin: Pin; px: number; py: number; x: number; y: number; bw: number; bh: number; shown: boolean }[] = [];
    pts.forEach((p, i) => {
      const { pin } = p;
      pin.root.style.display = p.front ? '' : 'none';
      if (!p.front) return;
      let dx = p.x - mx;
      let dy = p.y - my;
      const d = Math.hypot(dx, dy);
      if (d < 4) {
        dx = Math.cos(fallback[i % 3]);
        dy = Math.sin(fallback[i % 3]);
      } else {
        dx /= d;
        dy /= d;
      }
      const bw = pin.label.offsetWidth || 130;
      const bh = pin.label.offsetHeight || 44;
      // The label's box, placed outward from the pin and anchored on its near side.
      const ax = p.x + dx * reach;
      const ay = p.y + dy * reach;
      boxes.push({
        pin,
        px: p.x,
        py: p.y,
        x: ax - (dx > 0.35 ? 0 : dx < -0.35 ? bw : bw / 2),
        y: ay - (dy > 0.5 ? 0 : dy < -0.5 ? bh : bh / 2),
        bw,
        bh,
        // Only the selected pin, or one under the pointer, shows its label.
        shown: pin.label.offsetWidth > 0,
      });
    });
    const clamp = (b: (typeof boxes)[number]) => {
      b.x = Math.min(w - b.bw - 8, Math.max(8, b.x));
      b.y = Math.min(h - b.bh - this.labelBottomInset, Math.max(84, b.y));
    };
    boxes.forEach(clamp);
    for (let pass = 0; pass < 4; pass++) {
      for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
          const A = boxes[a];
          const B = boxes[b];
          if (!A.shown || !B.shown) continue;
          const overlapX = Math.min(A.x + A.bw, B.x + B.bw) - Math.max(A.x, B.x);
          const overlapY = Math.min(A.y + A.bh, B.y + B.bh) - Math.max(A.y, B.y);
          if (overlapX <= -6 || overlapY <= -6) continue;
          const push = (overlapY + 6) / 2;
          const upper = A.y + A.bh / 2 <= B.y + B.bh / 2 ? A : B;
          const lower = upper === A ? B : A;
          upper.y -= push;
          lower.y += push;
          clamp(upper);
          clamp(lower);
        }
      }
    }
    for (const b of boxes) {
      // The leader runs from the pin to the nearest point of its label.
      const tx = Math.min(b.x + b.bw, Math.max(b.x, b.px));
      const ty = Math.min(b.y + b.bh, Math.max(b.y, b.py));
      b.pin.root.style.transform = `translate(${b.px.toFixed(1)}px, ${b.py.toFixed(1)}px)`;
      b.pin.leader.style.width = `${Math.hypot(tx - b.px, ty - b.py).toFixed(1)}px`;
      b.pin.leader.style.transform = `rotate(${Math.atan2(ty - b.py, tx - b.px)}rad)`;
      b.pin.label.style.transform = `translate(${(b.x - b.px).toFixed(1)}px, ${(b.y - b.py).toFixed(1)}px)`;
    }
  }
}
