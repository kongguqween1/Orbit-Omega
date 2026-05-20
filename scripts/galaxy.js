/* =====================================================
   ORBIT Ω — galaxy.js
   A custom GLSL galaxy of ~80k stars with spiral arms,
   differential rotation, twinkle, parallax + bloom.
   ===================================================== */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// ---------- Shader: spiral galaxy ----------
const galaxyVert = /* glsl */ `
  precision highp float;

  attribute float aRadius;       // radius from core
  attribute float aBranch;       // branch index 0..N
  attribute float aOffsetAngle;  // initial angle offset
  attribute float aRand;         // 0..1
  attribute float aSize;         // base size
  attribute vec3  aColor;        // base color
  attribute float aSpin;         // differential rotation factor

  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec2  uMouse;
  uniform float uScroll;
  uniform float uBoost;

  varying vec3  vColor;
  varying float vTwinkle;
  varying float vRadius;

  // Hash for star twinkle
  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    // Differential rotation — inner orbits faster
    float rotSpeed = aSpin * (1.0 / (aRadius + 0.6));
    float angle = aOffsetAngle + uTime * rotSpeed * 0.18;

    // Spiral arm pull — pinch the angle by branch
    float branchAngle = aBranch * 6.2831853 + aRadius * 0.55;
    float armAngle = mix(angle, angle + branchAngle, 0.6);

    // Base position on a disk
    float r = aRadius;
    vec3 pos;
    pos.x = cos(armAngle) * r;
    pos.z = sin(armAngle) * r;
    // Vertical thickness — thinner near edges, fluffier in core
    float thickness = (1.0 - smoothstep(0.0, 8.0, r)) * 0.8 + 0.06;
    pos.y = (aRand - 0.5) * thickness * (1.0 + 0.3 * sin(uTime * 0.6 + aRand * 6.28));

    // Mouse parallax — nearer particles move more
    float depth = 1.0 - smoothstep(0.0, 9.0, r);
    pos.x += uMouse.x * depth * 0.6;
    pos.y += uMouse.y * depth * 0.4;

    // Boost radial puff (on click)
    float boost = uBoost;
    pos *= 1.0 + boost * 0.08;

    // Subtle warp tied to scroll
    pos.y += sin(r * 0.6 + uScroll * 2.0) * 0.18;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    // Star size attenuated by distance
    float twinkle = 0.5 + 0.5 * sin(uTime * (1.5 + 2.0 * aRand) + aRand * 12.0);
    vTwinkle = twinkle;
    vColor = aColor;
    vRadius = r;

    gl_Position = projectionMatrix * mvPosition;
    float size = aSize * uSize * uPixelRatio;
    size *= (1.0 + 0.6 * twinkle);
    size *= (1.0 + boost * 0.5);
    gl_PointSize = size * (1.0 / -mvPosition.z);
  }
`;

const galaxyFrag = /* glsl */ `
  precision highp float;

  varying vec3  vColor;
  varying float vTwinkle;
  varying float vRadius;

  void main() {
    // Soft circular point with hot core
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float halo = pow(core, 2.4);
    float spike = pow(core, 16.0);

    vec3 col = vColor * (halo * 0.65 + spike * 1.6);
    // boost twinkle on highlights
    col += vColor * (vTwinkle * spike * 0.8);

    float alpha = halo * (0.40 + 0.40 * vTwinkle);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ---------- Shader: distant nebula billboard ----------
const nebulaVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const nebulaFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec2 vUv;

  // Simplex-ish noise (cheap)
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    float r = length(uv);
    if (r > 1.0) { discard; }

    // Slow drifting nebula
    vec2 p = vUv * 3.0 + vec2(uTime * 0.012, uTime * -0.008);
    float n = fbm(p);
    float n2 = fbm(p * 1.7 + 5.2);

    vec3 col1 = vec3(0.18, 0.11, 0.34); // deep violet
    vec3 col2 = vec3(0.09, 0.22, 0.36); // deep blue
    vec3 col3 = vec3(0.32, 0.16, 0.30); // muted magenta

    vec3 col = mix(col1, col2, smoothstep(0.3, 0.7, n));
    col = mix(col, col3, smoothstep(0.4, 0.9, n2));

    // Soft falloff from center
    float falloff = pow(1.0 - r, 2.4);
    col *= falloff * 0.55;

    gl_FragColor = vec4(col, falloff * 0.40);
  }
`;

// ---------- Shader: starfield backdrop (deep stars) ----------
const starsVert = /* glsl */ `
  attribute float aSize;
  attribute float aTwk;
  attribute vec3 aCol;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vCol;
  varying float vT;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float t = 0.5 + 0.5 * sin(uTime * (0.6 + aTwk * 1.4) + aTwk * 12.0);
    gl_PointSize = aSize * uPixelRatio * (1.0 + t * 0.7);
    vCol = aCol; vT = t;
  }
`;
const starsFrag = /* glsl */ `
  precision highp float;
  varying vec3 vCol;
  varying float vT;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float spike = pow(core, 14.0);
    vec3 col = vCol * (core * 0.7 + spike * 1.2);
    gl_FragColor = vec4(col, core * (0.40 + 0.30 * vT));
  }
`;

// ---------- Galaxy class ----------
class Galaxy {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x02030a, 0.030);
    this.clock = new THREE.Clock();

    this.size = { w: window.innerWidth, h: window.innerHeight };
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.mouse = new THREE.Vector2(0, 0);
    this.mouseTarget = new THREE.Vector2(0, 0);
    this.scroll = 0;
    this.scrollTarget = 0;
    this.boost = 0;
    this.boostTarget = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.renderer.setClearColor(0x02030a, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(38, this.size.w / this.size.h, 0.1, 200);
    this.camera.position.set(0, 4.2, 11.5);
    this.camera.lookAt(0, 0, 0);

    // Build scene
    this._buildStarfield();
    this._buildNebula();
    this._buildGalaxy();
    this._buildCore();

    // Post-processing
    this._buildPost();

    this._bind();
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  _buildStarfield() {
    const N = 1800;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const twk = new Float32Array(N);
    const col = new Float32Array(N * 3);
    const palette = [
      new THREE.Color(0xb8b6c8),
      new THREE.Color(0x8a9ac0),
      new THREE.Color(0xb8a48a),
      new THREE.Color(0x7ea0b8),
    ];
    for (let i = 0; i < N; i++) {
      // Spherical shell, far away
      const r = 60 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.6;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      size[i] = 0.6 + Math.random() * 1.6;
      twk[i] = Math.random();
      const c = palette[(Math.random() * palette.length) | 0];
      col[i * 3 + 0] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("aTwk", new THREE.BufferAttribute(twk, 1));
    geo.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: starsVert,
      fragmentShader: starsFrag,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.dpr },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.starsMat = mat;
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  _buildNebula() {
    // Big translucent quad behind the galaxy for color wash
    const geo = new THREE.PlaneGeometry(120, 80, 1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: nebulaVert,
      fragmentShader: nebulaFrag,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.nebulaMat = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, -28);
    mesh.rotation.x = -0.2;
    this.scene.add(mesh);
  }

  _buildGalaxy() {
    const N = 80000;
    const branches = 4;
    const radiusMax = 9.5;
    const positions = new Float32Array(N * 3);
    const aRadius = new Float32Array(N);
    const aBranch = new Float32Array(N);
    const aOffsetAngle = new Float32Array(N);
    const aRand = new Float32Array(N);
    const aSize = new Float32Array(N);
    const aColor = new Float32Array(N * 3);
    const aSpin = new Float32Array(N);

    const inside = new THREE.Color(0xc9a76a);   // muted warm core
    const middle = new THREE.Color(0x7a5fc8);   // muted violet
    const outside = new THREE.Color(0x3c8a9c);  // muted teal rim
    const accent = new THREE.Color(0x9c6ba6);   // muted magenta sprinkle

    for (let i = 0; i < N; i++) {
      // Bias toward inner radii (star density)
      const t = Math.pow(Math.random(), 1.7);
      const r = t * radiusMax + 0.2;
      aRadius[i] = r;
      aBranch[i] = (i % branches) / branches;
      aOffsetAngle[i] = Math.random() * Math.PI * 2;
      aRand[i] = Math.random();
      aSpin[i] = 0.6 + Math.random() * 0.6;

      // Color gradient from core -> rim, with occasional accent
      let c = new THREE.Color();
      const f = THREE.MathUtils.smoothstep(r, 0.0, radiusMax);
      if (f < 0.35) c.copy(inside).lerp(middle, f / 0.35);
      else c.copy(middle).lerp(outside, (f - 0.35) / 0.65);
      if (Math.random() < 0.04) c.copy(accent);
      aColor[i * 3 + 0] = c.r;
      aColor[i * 3 + 1] = c.g;
      aColor[i * 3 + 2] = c.b;

      // Inner stars are brighter & bigger
      const innerness = 1.0 - f;
      aSize[i] = 0.8 + innerness * 2.0 + Math.random() * 0.7;

      // Position is computed in shader; provide a placeholder
      positions[i * 3 + 0] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aRadius", new THREE.BufferAttribute(aRadius, 1));
    geo.setAttribute("aBranch", new THREE.BufferAttribute(aBranch, 1));
    geo.setAttribute("aOffsetAngle", new THREE.BufferAttribute(aOffsetAngle, 1));
    geo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
    geo.setAttribute("aColor", new THREE.BufferAttribute(aColor, 3));
    geo.setAttribute("aSpin", new THREE.BufferAttribute(aSpin, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 12);

    const mat = new THREE.ShaderMaterial({
      vertexShader: galaxyVert,
      fragmentShader: galaxyFrag,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 14.0 },
        uPixelRatio: { value: this.dpr },
        uMouse: { value: new THREE.Vector2() },
        uScroll: { value: 0 },
        uBoost: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.galaxyMat = mat;
    this.galaxy = new THREE.Points(geo, mat);
    this.galaxy.rotation.x = 0.18;
    this.scene.add(this.galaxy);
  }

  _buildCore() {
    // Bloom-friendly core sprite
    const geo = new THREE.SphereGeometry(0.35, 32, 32);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        void main() {
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        varying vec3 vN;
        void main() {
          float fres = pow(1.0 - max(0.0, vN.z), 2.6);
          float pulse = 0.80 + 0.12 * sin(uTime * 1.6);
          vec3 hot = vec3(0.78, 0.66, 0.50);
          vec3 cool = vec3(0.48, 0.38, 0.70);
          vec3 col = mix(hot, cool, fres) * (1.0 + fres * 1.1) * pulse;
          gl_FragColor = vec4(col, fres * 0.78);
        }
      `,
    });
    this.coreMat = mat;
    this.core = new THREE.Mesh(geo, mat);
    this.scene.add(this.core);
  }

  _buildPost() {
    const target = new THREE.WebGLRenderTarget(this.size.w, this.size.h, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(this.size.w, this.size.h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(this.size.w, this.size.h),
      0.50, // strength (dimmer)
      0.75, // radius
      0.10  // threshold — only the brightest bits bloom
    );
    this.composer.addPass(this.bloom);

    // Tiny chromatic aberration / vignette pass for cinematic feel
    const aberrShader = {
      uniforms: {
        tDiffuse: { value: null },
        uAmount: { value: 0.0014 },
        uVignette: { value: 0.72 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform float uAmount;
        uniform float uVignette;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec2 d = vUv - 0.5;
          float r = texture2D(tDiffuse, vUv + d * uAmount).r;
          float g = texture2D(tDiffuse, vUv).g;
          float b = texture2D(tDiffuse, vUv - d * uAmount).b;
          vec3 col = vec3(r, g, b);

          // Subtle scanline + grain
          float grain = fract(sin(dot(vUv * 1024.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
          col += (grain - 0.5) * 0.025;

          // Vignette
          float v = smoothstep(0.95, 0.2, length(d));
          col *= mix(1.0 - uVignette, 1.0, v);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    };
    this.aberrPass = new ShaderPass(aberrShader);
    this.composer.addPass(this.aberrPass);
    this.composer.addPass(new OutputPass());
  }

  _bind() {
    window.addEventListener("resize", this._onResize = () => {
      this.size.w = window.innerWidth;
      this.size.h = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(this.size.w, this.size.h, false);
      this.composer.setPixelRatio(this.dpr);
      this.composer.setSize(this.size.w, this.size.h);
      this.bloom.setSize(this.size.w, this.size.h);
      this.camera.aspect = this.size.w / this.size.h;
      this.camera.updateProjectionMatrix();
      this.galaxyMat.uniforms.uPixelRatio.value = this.dpr;
      this.starsMat.uniforms.uPixelRatio.value = this.dpr;
    });

    window.addEventListener("pointermove", this._onMove = (e) => {
      const x = (e.clientX / this.size.w) * 2 - 1;
      const y = -((e.clientY / this.size.h) * 2 - 1);
      this.mouseTarget.set(x, y);
    }, { passive: true });

    window.addEventListener("scroll", this._onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      this.scrollTarget = window.scrollY / max;
    }, { passive: true });

    window.addEventListener("pointerdown", this._onDown = () => {
      this.boostTarget = 1.0;
    });
    window.addEventListener("pointerup", this._onUp = () => {
      this.boostTarget = 0.0;
    });

    // Pause when tab hidden
    document.addEventListener("visibilitychange", () => {
      this._paused = document.hidden;
      if (!this._paused) this.clock.start();
    });
  }

  _tick() {
    requestAnimationFrame(this._tick);
    if (this._paused) return;

    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;

    // Smooth interpolation
    this.mouse.x += (this.mouseTarget.x - this.mouse.x) * 0.06;
    this.mouse.y += (this.mouseTarget.y - this.mouse.y) * 0.06;
    this.scroll += (this.scrollTarget - this.scroll) * 0.05;
    this.boost += (this.boostTarget - this.boost) * 0.08;

    // Update uniforms
    this.galaxyMat.uniforms.uTime.value = t;
    this.galaxyMat.uniforms.uMouse.value.set(this.mouse.x, this.mouse.y);
    this.galaxyMat.uniforms.uScroll.value = this.scroll;
    this.galaxyMat.uniforms.uBoost.value = this.boost;
    this.starsMat.uniforms.uTime.value = t;
    this.nebulaMat.uniforms.uTime.value = t;
    this.coreMat.uniforms.uTime.value = t;
    if (this.aberrPass) this.aberrPass.uniforms.uTime.value = t;

    // Camera path: gentle orbit + scroll-driven dolly
    const camR = 11.5 + this.scroll * 4.0;
    const camAng = t * 0.04 + this.mouse.x * 0.18;
    this.camera.position.x = Math.sin(camAng) * camR * 0.18;
    this.camera.position.z = Math.cos(camAng) * camR;
    this.camera.position.y = 4.0 - this.scroll * 2.6 + this.mouse.y * 0.3;
    this.camera.lookAt(0, this.scroll * -0.6, 0);

    // Galaxy slowly tilts with scroll
    this.galaxy.rotation.x = 0.18 + this.scroll * 0.5;
    this.galaxy.rotation.y += dt * 0.02;

    // Stars react to scroll: drift slightly
    this.stars.rotation.y += dt * 0.01;

    // Composer render
    this.composer.render();
  }

  // Public API for app.js
  pulse() {
    // Trigger a quick boost ripple
    this.boostTarget = 1.0;
    clearTimeout(this._boostTo);
    this._boostTo = setTimeout(() => (this.boostTarget = 0.0), 280);
  }
}

// ---------- WebGL availability detection ----------
function detectWebGL() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl");
    return !!(window.WebGLRenderingContext && gl);
  } catch (e) {
    return false;
  }
}

function showFallback(reason) {
  const fb = document.getElementById("webglFallback");
  if (fb) fb.hidden = false;
  document.body.classList.remove("loading");
  document.dispatchEvent(new CustomEvent("orbit:ready"));
  if (reason && console && console.warn) console.warn("[orbit] galaxy disabled:", reason);
}

// Initialise after DOM is ready
const canvas = document.getElementById("stage");
if (!canvas) {
  showFallback("canvas missing");
} else if (!detectWebGL()) {
  showFallback("webgl unsupported");
} else {
  // Defer until next tick so layout is resolved
  requestAnimationFrame(() => {
    try {
      const galaxy = new Galaxy(canvas);
      // Expose globally for app.js to call boost on key UX events
      window.__orbit = { galaxy };
      document.dispatchEvent(new CustomEvent("orbit:ready"));
    } catch (err) {
      showFallback(err && err.message ? err.message : "init error");
    }
  });

  // Also catch async WebGL context loss
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    showFallback("context lost");
  });
}
