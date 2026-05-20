/* =====================================================
   ORBIT Ω — app.js
   Bootloader, cursor, scroll reveals, live counter,
   HUD, ambient audio synth, form, nav scroll.
   ===================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const prefersReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------- Bootloader ----------------
function runBoot() {
  const pct = $(".boot__pct");
  const start = performance.now();
  const dur = prefersReduce ? 400 : 1600;
  function step() {
    const t = Math.min(1, (performance.now() - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    if (pct) pct.textContent = String(Math.floor(eased * 100)).padStart(2, "0");
    if (t < 1) requestAnimationFrame(step);
    else {
      // Wait for galaxy to be ready, then reveal
      const reveal = () => document.body.classList.remove("loading");
      if (window.__orbit && window.__orbit.galaxy) reveal();
      else document.addEventListener("orbit:ready", reveal, { once: true });
      // Failsafe in case galaxy never inits (e.g., no WebGL)
      setTimeout(reveal, 1800);
    }
  }
  requestAnimationFrame(step);
}

// ---------------- Custom cursor ----------------
function initCursor() {
  if (window.matchMedia("(pointer: coarse)").matches) return;
  const cursor = $(".cursor");
  if (!cursor) return;
  const dot = $(".cursor__dot", cursor);
  const ring = $(".cursor__ring", cursor);
  const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const cur = { x: target.x, y: target.y };
  const lag = { x: target.x, y: target.y };

  window.addEventListener("pointermove", (e) => {
    target.x = e.clientX; target.y = e.clientY;
  }, { passive: true });

  // Hover detection — anything clickable / focusable
  const hoverSel = "a, button, [role='button'], input, textarea, select, label, [data-cursor]";
  document.addEventListener("pointerover", (e) => {
    if (e.target.closest(hoverSel)) cursor.classList.add("is-hover");
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest && e.target.closest(hoverSel)) cursor.classList.remove("is-hover");
  });
  document.addEventListener("pointerdown", () => cursor.classList.add("is-press"));
  document.addEventListener("pointerup", () => cursor.classList.remove("is-press"));

  function frame() {
    cur.x += (target.x - cur.x) * 0.42;
    cur.y += (target.y - cur.y) * 0.42;
    lag.x += (target.x - lag.x) * 0.16;
    lag.y += (target.y - lag.y) * 0.16;
    if (dot) dot.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0) translate(-50%, -50%)`;
    if (ring) ring.style.transform = `translate3d(${lag.x}px, ${lag.y}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(frame);
  }
  frame();
}

// ---------------- Scroll reveals ----------------
function initReveals() {
  const els = $$(".reveal");
  if (!("IntersectionObserver" in window) || prefersReduce) {
    els.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, idx) => {
      if (e.isIntersecting) {
        const el = e.target;
        // Stagger by index within parent
        const siblings = el.parentElement ? Array.from(el.parentElement.querySelectorAll(".reveal")) : [el];
        const i = siblings.indexOf(el);
        el.style.transitionDelay = `${Math.max(0, i) * 100}ms`;
        el.classList.add("is-in");
        io.unobserve(el);
      }
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
  els.forEach((el) => io.observe(el));
}

// ---------------- Nav scroll state ----------------
function initNav() {
  const nav = $(".nav");
  if (!nav) return;
  let last = -1;
  function check() {
    const s = window.scrollY > 8;
    if (s !== last) { nav.classList.toggle("is-scrolled", s); last = s; }
  }
  window.addEventListener("scroll", check, { passive: true });
  check();
}

// ---------------- HUD lat/lon ----------------
function initHud() {
  const lat = $('[data-hud="lat"]');
  const lon = $('[data-hud="lon"]');
  if (!lat || !lon) return;
  function tick() {
    const la = (Math.random() * 90).toFixed(0);
    const laM = (Math.random() * 60).toFixed(0);
    const lo = (Math.random() * 180).toFixed(0);
    const loM = (Math.random() * 60).toFixed(0);
    const ns = Math.random() > 0.5 ? "+" : "−";
    const ew = Math.random() > 0.5 ? "+" : "−";
    lat.textContent = `${ns}${String(la).padStart(2, "0")}°${String(laM).padStart(2, "0")}′`;
    lon.textContent = `${ew}${String(lo).padStart(3, "0")}°${String(loM).padStart(2, "0")}′`;
  }
  tick();
  setInterval(tick, 2400);
}

// ---------------- Hero countdown clock ----------------
function initEyebrowClock() {
  const el = $("[data-eyebrow-clock]");
  if (!el) return;
  // Fictional event: starts now-ish, lasts 30 days
  const startedAt = Date.now() - 1000 * 60 * 60 * 18; // 18h in
  const endsAt = startedAt + 1000 * 60 * 60 * 24 * 30;
  function fmt() {
    const left = Math.max(0, endsAt - Date.now());
    const d = Math.floor(left / 86400000);
    const h = Math.floor((left % 86400000) / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    const s = Math.floor((left % 60000) / 1000);
    el.textContent = `T−${String(d).padStart(2, "0")}D ${String(h).padStart(2, "0")}H ${String(m).padStart(2, "0")}M ${String(s).padStart(2, "0")}S`;
  }
  fmt();
  setInterval(fmt, 1000);
}

// ---------------- Live token counter ----------------
function initCounter() {
  const wrap = $("[data-counter]");
  const fill = $("[data-counter-bar]");
  const claimed = $("[data-claimed-count]");
  const rate = $("[data-rate]");
  if (!wrap) return;

  const TOTAL = 100_000_000_000_000;       // 100T
  const startTokens = 87_412_905_873_122;   // visually mid-event
  let tokens = startTokens;
  let rateValue = 38_400_000;               // tokens / sec
  let claimedCount = 14_287;

  // Build digits with proper grouping (commas)
  function render() {
    const str = Math.floor(tokens).toLocaleString("en-US");
    // Re-render only if content length matches; otherwise rebuild
    if (wrap.dataset.len !== String(str.length)) {
      wrap.innerHTML = "";
      for (const ch of str) {
        if (ch === ",") {
          const c = document.createElement("i");
          c.textContent = ",";
          c.style.cssText = "font-style:normal;color:rgba(255,255,255,0.25);padding:0 .12em;";
          wrap.appendChild(c);
        } else {
          const s = document.createElement("span");
          s.textContent = ch;
          wrap.appendChild(s);
        }
      }
      wrap.dataset.len = str.length;
    } else {
      // Update each character in place
      let i = 0;
      for (const node of wrap.children) {
        const ch = str[i++];
        if (node.tagName === "SPAN" && node.textContent !== ch) {
          node.textContent = ch;
          node.animate(
            [{ opacity: 0.2, transform: "translateY(-4px)" }, { opacity: 1, transform: "translateY(0)" }],
            { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" }
          );
        }
      }
    }
    if (fill) fill.style.width = `${((TOTAL - tokens) / TOTAL * 100).toFixed(2)}%`;
    if (claimed) claimed.textContent = claimedCount.toLocaleString("en-US");
    if (rate) rate.textContent = Math.floor(rateValue).toLocaleString("en-US");
  }

  render();

  // Use requestAnimationFrame for smooth accumulation
  let last = performance.now();
  function tick(now) {
    const dt = (now - last) / 1000;
    last = now;
    // Slight rate fluctuation for organic feel
    rateValue += (Math.random() - 0.5) * 200_000;
    rateValue = Math.max(28_000_000, Math.min(48_000_000, rateValue));
    tokens = Math.max(0, tokens - rateValue * dt);
    if (Math.random() < 0.04) claimedCount += 1;
    render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------------- Form ----------------
function initForm() {
  const form = $("#applyForm");
  if (!form) return;
  const status = $("#applyStatus");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name || !data.email || !data.role || !data.tier || !data.project) {
      status.style.color = "var(--acc-fire)";
      status.textContent = "// fill the required fields, please.";
      return;
    }
    status.style.color = "var(--acc-cyan)";
    status.textContent = "// transmitting…";
    if (window.__orbit && window.__orbit.galaxy) window.__orbit.galaxy.pulse();

    setTimeout(() => {
      status.style.color = "var(--acc-violet)";
      status.textContent = `// signal received. expect a reply at ${data.email} within 72h.`;
      form.reset();
    }, 1100);
  });
}

// ---------------- Pulse galaxy on important interactions ----------------
function initPulses() {
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".btn--primary, .nav__cta, .tier--featured");
    if (t && window.__orbit && window.__orbit.galaxy) {
      window.__orbit.galaxy.pulse();
    }
  });
}

// ---------------- Year ----------------
function initYear() {
  const y = $("[data-year]");
  if (y) y.textContent = String(new Date().getFullYear());
}

// ---------------- Ambient audio (WebAudio synth pad) ----------------
function initAudio() {
  const btn = $("#audioToggle");
  if (!btn) return;
  let ctx, master, nodes = [];
  let on = false;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Soft low-pass filter
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.Q.value = 0.6;
    lp.connect(master);

    // Stereo delay for spaciousness
    const delayL = ctx.createDelay(1.5);
    const delayR = ctx.createDelay(1.5);
    delayL.delayTime.value = 0.32;
    delayR.delayTime.value = 0.41;
    const fbL = ctx.createGain(); fbL.gain.value = 0.32;
    const fbR = ctx.createGain(); fbR.gain.value = 0.32;
    const merger = ctx.createChannelMerger(2);
    delayL.connect(fbL).connect(delayL);
    delayR.connect(fbR).connect(delayR);
    delayL.connect(merger, 0, 0);
    delayR.connect(merger, 0, 1);
    merger.connect(lp);

    // Pad chord — root, fifth, ninth, third (Cmaj9-ish but lower)
    const freqs = [110, 165, 247, 330]; // A2, E3, B3, E4
    freqs.forEach((f, i) => {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = "sine"; o2.type = "triangle";
      o1.frequency.value = f;
      o2.frequency.value = f * 1.005; // slight detune
      const g = ctx.createGain(); g.gain.value = 0.15 / freqs.length;
      o1.connect(g); o2.connect(g);

      // LFO to modulate gain for breathing pad
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.07 + i * 0.02;
      lfoGain.gain.value = 0.06;
      lfo.connect(lfoGain).connect(g.gain);
      lfo.start();

      g.connect(delayL);
      g.connect(delayR);
      o1.start(); o2.start();
      nodes.push(o1, o2, lfo);
    });

    // Tiny shimmer — high sine pulsing
    const shim = ctx.createOscillator();
    const shimGain = ctx.createGain();
    shim.type = "sine";
    shim.frequency.value = 1320;
    shimGain.gain.value = 0;
    const shLfo = ctx.createOscillator();
    const shLfoGain = ctx.createGain();
    shLfo.frequency.value = 0.18;
    shLfoGain.gain.value = 0.014;
    shLfo.connect(shLfoGain).connect(shimGain.gain);
    shim.connect(shimGain).connect(delayL);
    shim.start(); shLfo.start();
    nodes.push(shim, shLfo);
  }

  function fade(target, time = 1.2) {
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(target, now + time);
  }

  btn.addEventListener("click", async () => {
    if (!ctx) build();
    if (ctx.state === "suspended") await ctx.resume();
    on = !on;
    btn.setAttribute("aria-pressed", String(on));
    fade(on ? 0.18 : 0, 1.2);
  });
}

// ---------------- Boot ----------------
document.addEventListener("DOMContentLoaded", () => {
  runBoot();
  initCursor();
  initReveals();
  initNav();
  initHud();
  initEyebrowClock();
  initCounter();
  initForm();
  initPulses();
  initYear();
  initAudio();
});
