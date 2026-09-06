// Everything in this top section (language toggle, scroll reveal) is plain
// DOM code with zero external dependencies, so it runs and works even if the
// Three.js import below fails, is blocked, or is slow. The 3D hero object is
// an enhancement, never a requirement for the page to be usable — see the
// try/catch around the dynamic import further down.

// Language toggle — UI-only for now, no localized copy wired up yet.
// Two of these now exist (#lang-toggle in the desktop capsule,
// #lang-toggle-mobile in the mobile dropdown menu — see index.html's nav
// comment for why they're separate elements, not one moved by CSS) — kept
// in sync here so either one reflects the other's state, in case a resize
// (e.g. rotating a tablet) reveals the one that wasn't just clicked.
const langToggles = [...document.querySelectorAll('.nav__lang')];
function setLangToggles(next) {
  langToggles.forEach((toggle) => {
    toggle.dataset.lang = next;
    toggle.querySelectorAll('.nav__lang-option').forEach((el) => {
      el.classList.toggle('nav__lang-option--active', el.dataset.value === next);
    });
  });
}
langToggles.forEach((toggle) => {
  toggle.addEventListener('click', () => {
    setLangToggles(toggle.dataset.lang === 'en' ? 'zh' : 'en');
  });
});

// Capsule header — expands from a floating pill to a full-width bar once
// the second section (Numbers Tell the Story v2) reaches the header, not on
// a flat scroll-distance threshold. rAF-throttled so it doesn't run on every
// event. The logo (two stacked <img>s, see .nav__logo-img--white/--color in
// styles.css) crossfades via CSS opacity off .nav--on-light below — the
// same up-to-date light/dark check the nav text color already uses —
// instead of a separate one-shot swap tied to this capsule expansion, which
// used to leave the colored mark showing even back over a later dark
// section like #wwd2.
const navEl = document.querySelector('.nav');
const navTriggerSection = document.getElementById('numbers-alt');
// The shared topography canvas (see initNumbersStage()) flips #numbers-alt's
// background from light to dark on its own scroll-driven schedule, stashing
// live 0..1 progress on this container's _topoSeamT — read directly below
// instead of just checking whether #numbers-alt's (still-pinned, by-then
// invisible) box overlaps the header, which used to stay "light" for the
// whole rest of numbers-pin's scroll range even after the canvas underneath
// had already gone dark.
const topoContainer = document.querySelector('[data-topography]');
// The light bands need dark nav text — toggled by whether the header
// currently overlaps any of them. Two separate ranges rather than one long
// one: #connect and #wwd2 sit between numbers-alt and expertise-alt and are
// dark (dark topography canvases of their own by this point), so that whole
// stretch must be excluded or the nav text would go dark-on-dark there.
const navLightZones = [
  [document.getElementById('numbers-alt'), document.getElementById('numbers-alt')],
  [document.getElementById('expertise-alt'), document.getElementById('client2')],
];
if (navEl && navTriggerSection) {
  let navTicking = false;
  window.addEventListener('scroll', () => {
    if (navTicking) return;
    navTicking = true;
    requestAnimationFrame(() => {
      const navHeight = navEl.getBoundingClientRect().height;
      const reachedSecondSection = navTriggerSection.getBoundingClientRect().top <= navHeight;
      navEl.classList.toggle('is-scrolled', reachedSecondSection);
      const overLight = navLightZones.some(([startEl, endEl], zoneIndex) => {
        if (!startEl || !endEl) return false;
        const top = startEl.getBoundingClientRect().top;
        const bottom = endEl.getBoundingClientRect().bottom;
        if (!(top <= navHeight && bottom >= 0)) return false;
        // First zone (#numbers-alt) shares its background with the canvas
        // that also covers WWD below it — defer to the canvas's own live
        // flip progress instead of treating the whole pinned-box overlap
        // as "light".
        if (zoneIndex === 0) return !topoContainer || (topoContainer._topoSeamT || 0) < 0.5;
        return true;
      });
      navEl.classList.toggle('nav--on-light', overLight);
      navTicking = false;
    });
  });
}

// Mobile nav menu — burger toggles #nav-mobile-menu open/closed (see the
// CSS comment on .nav__mobile-menu for why it's a sibling of .nav__capsule,
// not nested inside it). Only ever matters below 720px; resizing past that
// while open force-closes it so a tablet rotation etc. can't leave the
// dropdown state stuck showing (display:none) behind the now-restored
// desktop capsule row.
const navBurger = document.getElementById('nav-burger');
const navMobileMenu = document.getElementById('nav-mobile-menu');
if (navEl && navBurger && navMobileMenu) {
  const mobileMq = window.matchMedia('(max-width: 720px)');
  function closeMobileMenu() {
    navEl.classList.remove('is-menu-open');
    navBurger.classList.remove('is-open');
    navBurger.setAttribute('aria-expanded', 'false');
  }
  navBurger.addEventListener('click', () => {
    const open = navEl.classList.toggle('is-menu-open');
    navBurger.classList.toggle('is-open', open);
    navBurger.setAttribute('aria-expanded', String(open));
  });
  // Tapping any link/button inside the menu should close it too — without
  // this, an in-page anchor (Get in Touch → #contact) leaves the dropdown
  // sitting open over whatever it just scrolled to.
  navMobileMenu.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) closeMobileMenu();
  });
  document.addEventListener('click', (e) => {
    if (!navEl.classList.contains('is-menu-open')) return;
    if (navEl.contains(e.target)) return;
    closeMobileMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileMenu();
  });
  mobileMq.addEventListener('change', (e) => {
    if (!e.matches) closeMobileMenu();
  });
}

const heroWrap = document.getElementById('hero-headline-wrap');
const heroCanvas = document.getElementById('hero-glass-canvas');
const heroHeadingVisual = document.querySelector('.hero__headline-visual');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Hero glass token ──────────────────────────────────────────────────────
// The four-line headline is baked onto a canvas texture — each line
// auto-scaled to fill the wrap's width, then the whole block scaled down
// together if that would overflow the box height, same approach as the
// GlassHero prototype's drawText() — and the same glass torus knot sits in
// front of it in the same WebGL scene, so the glass visibly bends the words
// behind it. The real, accessible <h1 class="sr-only"> always exists in the
// DOM; `.hero__baked` is its aria-hidden duplicate and stays fully visible
// until this succeeds — loaded via dynamic import and wrapped in try/catch
// so a blocked/slow/broken CDN never costs the page its headline.
async function initHeroGlass() {
  if (!heroWrap || !heroCanvas || !heroHeadingVisual) return;

  let THREE;
  try {
    THREE = await import('./vendor/three.module.js');
  } catch (err) {
    console.warn('CXC hero: Three.js failed to load, skipping glass token.', err);
    return;
  }

  try {
    const LINES = [...heroHeadingVisual.querySelectorAll('.hero__headline-line')].map((el) =>
      el.textContent.trim().toUpperCase()
    );
    const BG = '#05070c';
    const INK = '#f4f6fa';
    const CAMERA_Z = 6;
    const GROUP_Z = 2.4; // pulled toward the camera, same relative depth as the GlassHero reference

    // ── Glass token tuning ──────────────────────────────────────────────
    // Adjust these four numbers to move/resize the glass; nothing else in
    // this function needs to change.
    const TOKEN_SIZE = 0.3; // width as a fraction of the headline block's width — bigger = bigger glass
    const TOKEN_OFFSET_X = 0; // -0.5 (block's left edge) to 0.5 (right edge), 0 = centered. Negative = left, positive = right.
    const TOKEN_OFFSET_Y = 0; // -0.5 (block's bottom edge) to 0.5 (top edge), 0 = centered. Negative = down, positive = up.

    const renderer = new THREE.WebGLRenderer({ canvas: heroCanvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.z = CAMERA_Z;

    // Small brand-toned "room" so the glass has reflections to catch,
    // without pulling in an extra CDN module just for an HDRI environment.
    const envScene = new THREE.Scene();
    function envPanel(color, x, y, z, rx, ry) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color }));
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, 0);
      envScene.add(mesh);
    }
    envPanel('#5fcbe8', -4, 0, 0, 0, Math.PI / 2);
    envPanel('#3f58a7', 4, 0, 0, 0, -Math.PI / 2);
    envPanel('#4083c4', 0, 4, 0, Math.PI / 2, 0);
    envPanel('#0c1119', 0, -4, 0, -Math.PI / 2, 0);
    envPanel('#141d33', 0, 0, -4, 0, 0);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;

    // Text plane, redrawn on every resize so it always matches the wrap's
    // current box exactly — the glass sits in front of it.
    const textCanvas = document.createElement('canvas');
    const textCtx = textCanvas.getContext('2d');
    let textTexture = null;
    const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }));
    scene.add(textPlane);

    function drawText(width, height) {
      const dpr = Math.min(window.devicePixelRatio, 2);
      textCanvas.width = Math.round(width * dpr);
      textCanvas.height = Math.round(height * dpr);
      textCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      textCtx.fillStyle = BG;
      textCtx.fillRect(0, 0, width, height);
      textCtx.fillStyle = INK;
      textCtx.textAlign = 'left';
      textCtx.textBaseline = 'middle';

      const cs = getComputedStyle(heroHeadingVisual.querySelector('.hero__headline-line'));
      const weight = cs.fontWeight || '800';
      const family = cs.fontFamily || "'Mona Sans Variable', sans-serif";

      const maxWidth = width; // no inset — glyphs start flush at x=0, same as .hero__sub's text-align: left
      const maxHeight = height * 0.9;
      const baseSize = 100;
      const lineGap = 0.98;
      // Flush-left — every line ends up the same rendered width (see
      // below), so this also gives them a shared left edge, which is what
      // lets the plain HTML paragraph underneath line up exactly with the
      // canvas-drawn headline above it.
      const x = 0;

      textCtx.font = `${weight} ${baseSize}px ${family}`;
      // Each line is first sized so that IT ALONE would span maxWidth, then
      // every line is scaled down by the same `fit` factor if the combined
      // height would overflow — so all lines end up the same final width
      // (maxWidth * fit), just at different font sizes.
      const sizes = LINES.map((line) => baseSize * (maxWidth / textCtx.measureText(line).width));
      const totalHeight = sizes.reduce((sum, size) => sum + size * lineGap, 0);
      const fit = Math.min(1, maxHeight / totalHeight);

      let y = height / 2 - (totalHeight * fit) / 2;
      LINES.forEach((line, i) => {
        const size = sizes[i] * fit;
        textCtx.font = `${weight} ${size}px ${family}`;
        y += (size * lineGap) / 2;
        textCtx.fillText(line, x, y);
        y += (size * lineGap) / 2;
      });

      if (textTexture) textTexture.dispose();
      textTexture = new THREE.CanvasTexture(textCanvas);
      textTexture.colorSpace = THREE.SRGBColorSpace;
      textTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      textPlane.material.map = textTexture;
      textPlane.material.needsUpdate = true;
    }

    // Smooth glass torus knot — same geometry and material approach as the
    // GlassHero reference, so it visibly refracts the headline behind it.
    const group = new THREE.Group();
    group.position.z = GROUP_Z;
    scene.add(group);

    const knotGeo = new THREE.TorusKnotGeometry(1, 0.3, 300, 48, 2, 3);
    knotGeo.computeBoundingSphere();
    const KNOT_RADIUS = knotGeo.boundingSphere.radius;
    const knotMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0,
      transmission: 1,
      thickness: 0.7,
      ior: 1.45,
      envMapIntensity: 1,
      toneMapped: false,
    });
    group.add(new THREE.Mesh(knotGeo, knotMaterial));

    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(4, 5, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#5fcbe8', 1.4);
    rim.position.set(-5, -2, -3);
    scene.add(rim);
    scene.add(new THREE.AmbientLight('#7fa8ff', 0.4));

    // The canvas fills the wrap exactly (`.hero__glass-canvas` is inset:0
    // in CSS) — the wrap's own box is sized by its `aspect-ratio` in CSS,
    // so there's no per-frame box math needed here beyond reading it back.
    function resize() {
      const width = heroCanvas.clientWidth;
      const height = heroCanvas.clientHeight;
      if (width === 0 || height === 0) return;

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      const visibleHeight = 2 * CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const visibleWidth = visibleHeight * camera.aspect;
      textPlane.scale.set(visibleWidth, visibleHeight, 1);

      // Size and position are both fractions of the heading block, projected
      // out to the group's actual depth so they read correctly despite the
      // glass sitting closer to the camera than the text.
      const depthRatio = (CAMERA_Z - GROUP_Z) / CAMERA_Z;
      const widthAtGroup = visibleWidth * depthRatio;
      const heightAtGroup = visibleHeight * depthRatio;
      const tokenDiameter = widthAtGroup * TOKEN_SIZE;
      group.scale.setScalar(tokenDiameter / (2 * KNOT_RADIUS));
      group.position.x = TOKEN_OFFSET_X * widthAtGroup;
      group.position.y = TOKEN_OFFSET_Y * heightAtGroup;

      drawText(width, height);
    }

    const pointer = new THREE.Vector2();
    window.addEventListener('pointermove', (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    const clock = new THREE.Clock();
    function render() {
      const t = clock.getElapsedTime();
      if (!reduceMotion) {
        group.rotation.x = t * 0.3 + pointer.y * 0.12;
        group.rotation.y = t * 0.45 + pointer.x * 0.18;
      } else {
        group.rotation.set(0.5, 0.4, 0);
      }
      renderer.render(scene, camera);
    }

    function debounce(fn, delay) {
      let id;
      return () => {
        clearTimeout(id);
        id = setTimeout(fn, delay);
      };
    }
    const debouncedResize = debounce(resize, 150);
    new ResizeObserver(debouncedResize).observe(heroWrap);

    await document.fonts.ready;
    resize();
    heroWrap.classList.add('is-ready');
    if (reduceMotion) {
      render();
    } else {
      renderer.setAnimationLoop(render);
    }
  } catch (err) {
    console.warn('CXC hero: glass token failed to initialize.', err);
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initHeroGlass();
} else {
  window.addEventListener('DOMContentLoaded', initHeroGlass);
}

// ── Credibility numbers: count up from 0 once the section scrolls into
// view. Eased fast-to-slow (cubic ease-out), fires once via
// IntersectionObserver so re-scrolling past it doesn't replay it.
function initCredibilityCountUp(section, values) {
  if (!values.length || !section) return;

  const reduceMotionCount = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotionCount) return;

  // Original text is read once, up front, into a data attribute — animateValue
  // and resetValue both read from there so replays always count up to the
  // real target, never to whatever the last animation frame happened to
  // leave behind in textContent.
  values.forEach((el) => {
    el.dataset.target = el.textContent.trim();
  });

  function parseTarget(el) {
    const match = el.dataset.target.match(/^([\d.]+)(.*)$/);
    if (!match) return null;
    return {
      target: parseFloat(match[1]),
      suffix: match[2],
      decimals: (match[1].split('.')[1] || '').length,
    };
  }

  // A fast scroll can pass an element through "intersecting" and back out
  // again before a running rAF loop finishes, which would otherwise leave
  // a stale loop overwriting textContent for another 1400ms regardless of
  // what runs after it. Each element gets a run token — animateValue and
  // resetValue both bump it and capture their own copy, so a stale frame()
  // checking a token that's since moved on just quietly stops.
  const runToken = new WeakMap();

  function animateValue(el) {
    const parsed = parseTarget(el);
    if (!parsed) return;
    const { target, suffix, decimals } = parsed;

    const myToken = (runToken.get(el) || 0) + 1;
    runToken.set(el, myToken);

    const duration = 1400;
    const start = performance.now();

    function frame(now) {
      if (runToken.get(el) !== myToken) return;
      const elapsed = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (elapsed < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function resetValue(el) {
    const parsed = parseTarget(el);
    if (!parsed) return;
    runToken.set(el, (runToken.get(el) || 0) + 1);
    el.textContent = (0).toFixed(parsed.decimals) + parsed.suffix;
  }

  // Driven off the scroll event (rAF-throttled, same pattern as the nav
  // capsule above) rather than IntersectionObserver — measured on the live
  // deployed site, IntersectionObserver's own callback scheduling was too
  // unreliable/delayed for a check this position-sensitive (a scroll back
  // up to the hero didn't reset in time). A direct getBoundingClientRect()
  // read on every scroll tick has no such lag.
  let hasCounted = false;
  let countTicking = false;
  let lastScrollY = window.scrollY;

  function checkCountState() {
    const currentScrollY = window.scrollY;
    const scrollingUp = currentScrollY < lastScrollY;
    lastScrollY = currentScrollY;

    const rect = section.getBoundingClientRect();
    const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    const visibleRatio = rect.height > 0 ? Math.max(0, visibleHeight) / rect.height : 0;

    if (!hasCounted && visibleRatio >= 0.4) {
      values.forEach(animateValue);
      hasCounted = true;
    } else if (hasCounted && scrollingUp && rect.top > 0) {
      // `rect.top > 0` alone is ambiguous — it's also true while the section
      // is still entering from below on the way down (on a viewport shorter
      // than ~2.5x the section's height, it can cross the 40%-visible
      // trigger while still short of the top edge), which reset the count
      // right after it had just started. Requiring scrollingUp too makes
      // this only fire on the way back up, once the section has fully
      // retreated below the viewport.
      values.forEach(resetValue);
      hasCounted = false;
    }
  }

  window.addEventListener('scroll', () => {
    if (countTicking) return;
    countTicking = true;
    requestAnimationFrame(() => {
      checkCountState();
      countTicking = false;
    });
  }, { passive: true });

  checkCountState();
}

// Numbers Tell the Story v2's count-up.
function bootCredibilityCountUp() {
  initCredibilityCountUp(document.getElementById('numbers-alt'), document.querySelectorAll('#numbers-alt .numtell__value'));
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  bootCredibilityCountUp();
} else {
  window.addEventListener('DOMContentLoaded', bootCredibilityCountUp);
}

// ── Numbers Tell the Story v2: "Numbers" handwriting draw-on, once ───────
// Same safe-by-default pattern as the testimonial laurels: the SVG's own
// CSS already renders it fully drawn (static) by default, so `.is-armed`
// (which hides it, ready to animate) only ever gets added here, right
// before observing — if IntersectionObserver is unsupported or motion is
// reduced, it simply stays fully drawn instead of never appearing.
function initNumbersHandwriting() {
  const svg = document.getElementById('numtell-number-anim');
  if (!svg) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof IntersectionObserver === 'undefined') return;

  svg.classList.add('is-armed');

  // Small delay before actually starting the draw-on: firing the instant
  // it crosses 40% visible had it finishing (1s draw) well before the
  // section settles into view, reading as already-done rather than drawn.
  // The delay is intentionally shorter than the count-up's own 1400ms
  // (see initCredibilityCountUp) so both finish at roughly the same time
  // instead of the handwriting looking rushed relative to the numbers.
  const START_DELAY = 400;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      window.setTimeout(() => svg.classList.add('is-playing'), START_DELAY);
    });
  }, { threshold: 0.4 });

  observer.observe(svg);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initNumbersHandwriting();
} else {
  window.addEventListener('DOMContentLoaded', initNumbersHandwriting);
}

// ── Numbers Tell the Story v2: topography WebGL background ──────────────
// Ported from 素材/React拓樸變形蟲背景 (React Bits "Topography", OGL) — same
// shader and CONFIG values, verbatim. Loaded via dynamic import wrapped in
// try/catch, same defensive pattern as the hero glass token: if the OGL
// CDN is blocked/slow/broken, `.topo-bg`'s plain CSS background (already
// the section's own flat color) is all that's lost, never the section
// itself. Boots every `[data-topography]` element found, not just this
// one, so it stays reusable if another section adopts it later.
async function initTopographyBackgrounds() {
  const containers = [...document.querySelectorAll('[data-topography]')];
  if (!containers.length) return;

  let OGL;
  try {
    OGL = await import('https://cdn.jsdelivr.net/npm/ogl@1.0.11/+esm');
  } catch (err) {
    console.warn('Numbers Tell the Story v2: OGL failed to load, keeping the flat background color.', err);
    return;
  }

  const { Renderer, Program, Mesh, Triangle } = OGL;

  const CONFIG = {
    ground: '#F1F1F1',
    // Numbers Tell the Story's own ground and line color stay these light
    // values for its whole (now full-viewport) height. The dark tones below
    // are only for reference here — the actual light↔dark swap is a
    // scroll-driven, whole-screen color flip owned by initSeamColorFade()
    // further down (not a spatial gradient tied to this CONFIG object),
    // which drives both the container's flat CSS background and, every
    // frame, uSeamT below for the contour line color.
    groundDark: '#1C1D1E',
    lineColor: '#E3E3E3',
    lineColorDark: '#3A3C3E',
    speed: 0.86,
    morphAmount: 0.54,
    morphSpeed: 0.08,
    bands: 4.0,
    thickness: 0.002,
    glow: 0.13,
    contrast: 2.7,
    dprCap: 2,
  };

  const hexToRgb = (hex) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!r) return [1, 1, 1];
    return [parseInt(r[1], 16) / 255, parseInt(r[2], 16) / 255, parseInt(r[3], 16) / 255];
  };

  const vertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

  // Fragment shader — verbatim from React Bits "Topography" (ogl).
  const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uMorphAmount;
uniform float uBands;
uniform float uThickness;
uniform float uScale;
uniform float uPixelSize;
uniform float uGlow;
uniform float uColorMode;
uniform float uContrast;
uniform float uBrightness;
uniform float uFillBands;
uniform float uOpacity;
uniform float uLightMode;
uniform vec3 uLow;
uniform vec3 uMid;
uniform vec3 uHigh;
uniform vec3 uLineBottom;
uniform float uSeamT;
uniform vec2 uMouse;
uniform float uMouseEnabled;
uniform float uMouseRadius;
uniform float uMouseStrength;
uniform float uMouseActive;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec4 uCtrlA;
uniform vec4 uCtrlB;
uniform vec4 uCtrlC;
uniform vec4 uCtrlD;
out vec4 fragColor;

float bez(float t, vec4 c) {
  float w = 6.2831853 * t;
  return 0.5 * (c.x * sin(w) + c.y * cos(w) + c.z * sin(2.0 * w) + c.w * cos(2.0 * w));
}

float field(vec2 uv) {
  vec2 a = vec2(bez(uv.x, uCtrlA), bez(uv.x, uCtrlB));
  vec2 b = vec2(bez(uv.y, uCtrlC), bez(uv.y, uCtrlD));
  return distance(a, b);
}

vec3 elevationColor(float e) {
  vec3 c = mix(uLow, uMid, smoothstep(0.0, 0.5, e));
  c = mix(c, uHigh, smoothstep(0.5, 1.0, e));
  return c;
}

void main() {
  vec2 res = iResolution.xy;
  vec2 uv = gl_FragCoord.xy / res;

  vec2 suv = (uv - 0.5) / max(uScale, 0.001) + 0.5;

  vec2 sampleUv = suv;
  if (uPixelSize > 1.0) {
    vec2 px = res / uPixelSize;
    sampleUv = (floor(suv * px) + 0.5) / px;
  }

  float fv = field(sampleUv);

  if (uMouseEnabled > 0.5) {
    vec2 d = uv - uMouse;
    d.x *= res.x / max(res.y, 1.0);
    float r = max(uMouseRadius, 0.001);
    float bump = exp(-dot(d, d) / (r * r)) * uMouseStrength * uMouseActive;
    fv += bump;
  }

  float f = fv * uBands;
  float frac = fract(f);
  float lineDist = min(frac, 1.0 - frac);

  float aa = fwidth(f) + 0.0001;
  float mask = 1.0 - smoothstep(uThickness - aa, uThickness + aa, lineDist);

  float glowR = uThickness + uGlow * 0.5 + aa;
  float glow = (1.0 - smoothstep(uThickness, glowR, lineDist)) * step(0.0001, uGlow);

  float elev = clamp(fv / (uMorphAmount * 2.5 + 0.001), 0.0, 1.0);

  // Numbers Tell the Story → Connect: this canvas spans both sections, but
  // the light/dark swap is NOT a spatial gradient across it — the whole
  // visible screen flips together, driven by how far you've scrolled past
  // the boundary (see the JS-side scroll listener that sets uSeamT every
  // frame). uSeamT defaults to 0 wherever there's no boundary, so this is a
  // no-op (always the flat light line) elsewhere.
  vec3 lineCol;
  if (uColorMode < 0.5) {
    lineCol = mix(elevationColor(elev), uLineBottom, uSeamT);
  } else if (uColorMode < 1.5) {
    lineCol = uMid;
  } else {
    float parity = mod(floor(f), 2.0);
    lineCol = mix(uMid, uHigh, parity);
  }

  float coverage = clamp(mask + glow * 0.55, 0.0, 1.0);
  coverage = pow(coverage, max(uContrast, 0.001));

  vec3 outColor = lineCol;
  float outAlpha = coverage;

  if (uFillBands > 0.5) {
    vec3 fillCol = elevationColor(elev);
    float fillA = 0.1 * elev;
    outColor = mix(fillCol, lineCol, coverage);
    outAlpha = clamp(coverage + fillA, 0.0, 1.0);
  }

  if (uGrain > 0.5) {
    float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + iTime) * 43758.5453);
    outAlpha += (g - 0.5) * uGrainIntensity;
  }

  outColor *= uBrightness;
  outColor = clamp(outColor, 0.0, 1.0);

  float a = clamp(outAlpha, 0.0, 1.0) * uOpacity;
  if (uLightMode > 0.5) {
    float peak = max(outColor.r, max(outColor.g, outColor.b));
    vec3 chroma = pow(clamp(outColor / max(peak, 0.0001), 0.0, 1.0), vec3(1.18));
    fragColor = vec4(mix(vec3(1.0), chroma, a * 0.94), 1.0);
  } else {
    fragColor = vec4(outColor * a, a);
  }
}
`;

  const CTRL_INDICES = [
    [1, -2, 3, -4],
    [9, -8, 7, -6],
    [5, 2, 5, -5],
    [-1, -3, 8, 9],
  ];

  // There's a single [data-topography] canvas on the page — shared by
  // Numbers Tell the Story through the feature cards, position:sticky (see
  // .topo-bg in styles.css) so it's physically the same never-scrolling
  // canvas the whole way, never a seam between separately-scrolling
  // instances. The light→dark flip is NOT a spatial gradient painted across
  // it — the whole visible screen flips together, driven by scroll
  // position. initNumbersStage() (below, outside the WebGL-dependent code
  // so it also runs if OGL fails) owns that scroll listener: it sets the
  // container's flat CSS background directly every tick and stashes the
  // live 0..1 progress on container._topoSeamT, which the render loop below
  // just reads each frame to drive uSeamT — no coordination needed beyond
  // that one shared property.
  function initTopography(container) {
    const line = new Float32Array(hexToRgb(CONFIG.lineColor));

    const renderer = new Renderer({
      webgl: 2,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      dpr: Math.min(window.devicePixelRatio || 1, CONFIG.dprCap),
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uSpeed: { value: CONFIG.speed },
        uMorphAmount: { value: CONFIG.morphAmount },
        uMorphSpeed: { value: CONFIG.morphSpeed },
        uBands: { value: CONFIG.bands },
        uThickness: { value: CONFIG.thickness },
        uScale: { value: 1.0 },
        uPixelSize: { value: 1.0 },
        uGlow: { value: CONFIG.glow },
        uColorMode: { value: 0.0 },
        uContrast: { value: CONFIG.contrast },
        uBrightness: { value: 1.0 },
        uFillBands: { value: 0.0 },
        uOpacity: { value: 1.0 },
        uLightMode: { value: 0.0 },
        uGrain: { value: 0.0 },
        uGrainIntensity: { value: 0.0 },
        uLow: { value: new Float32Array(line) },
        uMid: { value: new Float32Array(line) },
        uHigh: { value: new Float32Array(line) },
        uLineBottom: { value: new Float32Array(hexToRgb(CONFIG.lineColorDark)) },
        uSeamT: { value: 0.0 },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uMouseEnabled: { value: 0.0 },
        uMouseRadius: { value: 0.3 },
        uMouseStrength: { value: 0.4 },
        uMouseActive: { value: 0.0 },
        uCtrlA: { value: new Float32Array([0, 0, 0, 0]) },
        uCtrlB: { value: new Float32Array([0, 0, 0, 0]) },
        uCtrlC: { value: new Float32Array([0, 0, 0, 0]) },
        uCtrlD: { value: new Float32Array([0, 0, 0, 0]) },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    const u = program.uniforms;
    const ctrlArrays = [u.uCtrlA.value, u.uCtrlB.value, u.uCtrlC.value, u.uCtrlD.value];

    const setSize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
      u.iResolution.value[0] = gl.drawingBufferWidth;
      u.iResolution.value[1] = gl.drawingBufferHeight;
      renderer.render({ scene: mesh });
    };
    const ro = new ResizeObserver(setSize);
    ro.observe(container);
    setSize();

    const updateCtrls = (time) => {
      const ma = u.uMorphAmount.value;
      const sp = u.uSpeed.value;
      const msp = u.uMorphSpeed.value;
      for (let g = 0; g < 4; g++) {
        const arr = ctrlArrays[g];
        const idx = CTRL_INDICES[g];
        for (let j = 0; j < 4; j++) {
          const i = idx[j];
          arr[j] = ma * Math.sin(time * sp * Math.sin(i * msp) + i);
        }
      }
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let isVisible = true;
    let isPageVisible = !document.hidden;
    const t0 = performance.now();

    const loop = (t) => {
      const time = (t - t0) * 0.001;
      u.iTime.value = time;
      u.uSeamT.value = container._topoSeamT || 0;
      updateCtrls(time);
      renderer.render({ scene: mesh });
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!reduce && isVisible && isPageVisible && raf === 0) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        isVisible ? start() : stop();
      },
      { threshold: 0 }
    );
    io.observe(container);

    const onVisibility = () => {
      isPageVisible = !document.hidden;
      isPageVisible ? start() : stop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    if (reduce) {
      u.iTime.value = 6.0;
      updateCtrls(6.0);
      renderer.render({ scene: mesh });
    } else {
      start();
    }

    container._topographyDestroy = () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      try {
        container.removeChild(canvas);
      } catch (e) {}
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      delete container._topographyDestroy;
    };
  }

  try {
    containers.forEach((el) => {
      if (!el._topographyDestroy) initTopography(el);
    });
  } catch (err) {
    console.warn('Numbers Tell the Story v2: topography background failed to initialize.', err);
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initTopographyBackgrounds();
} else {
  window.addEventListener('DOMContentLoaded', initTopographyBackgrounds);
}

// ── Numbers Tell the Story v2: label reveal (reuses Expertise's kinetic
// sweep — .kl / .kl__text / .kl__block, same blue #2479cb block, same
// left-to-right sweep keyframes). Each label gets its own .kl unit;
// `.is-revealing` goes on the section (not each .kl), matching how the
// original CSS selectors are written (`.is-revealing .kl__block`, a
// descendant combinator) — all three labels sweep together, lightly
// staggered, once the section scrolls into view.
function initNumtellLabelReveal() {
  const section = document.getElementById('numbers-alt');
  const labels = section ? [...section.querySelectorAll('.numtell__label')] : [];
  if (!labels.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof IntersectionObserver === 'undefined') return;

  const DURATION = 0.5;
  const STAGGER = 0.18;

  labels.forEach((label, i) => {
    const text = label.textContent;
    label.textContent = '';
    label.setAttribute('aria-label', text);
    const outer = document.createElement('span');
    outer.className = 'kl';
    outer.setAttribute('aria-hidden', 'true');
    outer.style.setProperty('--kd', `${i * STAGGER}s`);
    outer.style.setProperty('--kdur', `${DURATION}s`);
    const inner = document.createElement('span');
    inner.className = 'kl__text';
    inner.textContent = text;
    const block = document.createElement('span');
    block.className = 'kl__block';
    outer.append(inner, block);
    label.appendChild(outer);
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      section.classList.add('is-revealing');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.4 });
  observer.observe(section);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initNumtellLabelReveal();
} else {
  window.addEventListener('DOMContentLoaded', initNumtellLabelReveal);
}

// ── Numbers Tell the Story: scroll-jacked hold → exit → background flip ──
// #numbers-pin is a tall wrapper; .numbers-sticky (its pinned child) holds
// Numbers Tell the Story's content in place for HOLD_SCROLL px, then floats
// it up + fades it over EXIT_SCROLL px, and only once that's fully done
// does the shared background flip from light to dark over FLIP_SCROLL px —
// sequential, not simultaneous, and deliberately short so the flip itself
// reads as fast. Sets the shared .topo-bg container's flat CSS background
// directly every tick (works even if the WebGL layer never loads) and
// stashes the live 0..1 progress on container._topoSeamT, which
// initTopography's own render loop (above) reads each frame to blend the
// contour line color the same way. Independent of the WebGL init — runs
// whether or not OGL ever loads — and calls onSeamComplete() once, the
// moment the flip finishes, so What We Do's own reveal (initWwdSequence,
// below) can key off exactly that instead of guessing.
function initNumbersStage(onSeamComplete) {
  const pin = document.getElementById('numbers-pin');
  const content = document.getElementById('numbers-alt');
  const container = document.querySelector('[data-topography]');
  const storyWrap = document.getElementById('story');
  if (!pin || !content || !container) return;

  // Always runs, even under prefers-reduced-motion — this owns the only
  // thing standing between the shared canvas and its CSS gradient fallback
  // (see the container.style.background line below), so skipping it
  // entirely would bring back exactly the two-tone seam this whole
  // rewrite exists to remove. Reduced motion instead shrinks the hold/exit/
  // flip distances to near-zero (1px, not 0 — avoids a divide-by-zero) so
  // the same formulas produce an imperceptibly fast snap instead of a
  // smooth animation, rather than branching into separate logic.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HOLD_SCROLL = reduce ? 0 : 420; // Numbers Tell the Story just sits there — long enough that even a hard/fast scroll finishes the handwriting draw-on + count-up (~1.4s of real animation) before the exit fade can start
  const EXIT_SCROLL = reduce ? 1 : 350; // then floats up + fades
  const FLIP_SCROLL = reduce ? 1 : 200; // then, and only then, the background flips — kept short on purpose
  const RISE_DISTANCE = reduce ? 0 : 60;
  const GROUND_LIGHT = [241, 241, 241]; // #F1F1F1
  const GROUND_DARK = [28, 29, 30]; // #1C1D1E

  function mixRgb(a, b, t) {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const b2 = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r}, ${g}, ${b2})`;
  }

  function measure() {
    pin.style.height = `${window.innerHeight + HOLD_SCROLL + EXIT_SCROLL + FLIP_SCROLL}px`;
  }

  let fired = false;
  let ticking = false;

  function update() {
    const p = Math.max(0, -pin.getBoundingClientRect().top);

    const exitP = Math.max(0, p - HOLD_SCROLL);
    const exitT = Math.min(1, exitP / EXIT_SCROLL);
    content.style.opacity = String(1 - exitT);
    content.style.transform = `translateY(${-exitT * RISE_DISTANCE}px)`;

    const flipP = Math.max(0, p - HOLD_SCROLL - EXIT_SCROLL);
    const flipT = Math.min(1, flipP / FLIP_SCROLL);
    container.style.background = mixRgb(GROUND_LIGHT, GROUND_DARK, flipT);
    container._topoSeamT = flipT;

    if (flipT >= 1 && !fired) {
      fired = true;
      if (onSeamComplete) onSeamComplete();
    }

    // .topo-bg (position:sticky + margin-bottom:-100vh) keeps rendering
    // roughly 100vh past .story-wrap's real bottom edge in this Chrome
    // build — a sticky-positioning quirk with the negative-margin trick —
    // which would otherwise paint over whatever section follows (Expertise)
    // and hide its dark-on-light heading text under the canvas's dark
    // background. Explicitly hiding it here, the moment .story-wrap's own
    // box has scrolled past the viewport, sidesteps the quirk directly
    // instead of via an overflow:hidden ancestor (which stops the overrun
    // but also strips .topo-bg of its stickiness entirely — see the comment
    // on .topo-bg in styles.css for why that was worse).
    // A plain hard visibility flip right at the boundary pixel showed up as
    // a one-frame flash of the Expertise section underneath (worse on
    // mobile, where the heading and first video sit in the same initial
    // viewport) — the sticky quirk this exists to route around means the
    // browser's own paint isn't perfectly in sync with what getBoundingClientRect
    // reports on the same frame, so a hard cutoff has no cushion for that
    // mismatch. Fading opacity out over a small zone before the boundary,
    // and only applying `visibility: hidden` once that fade has already
    // reached 0, means any one-frame lag lands on an already-invisible
    // element instead of a fully-opaque one.
    if (storyWrap) {
      const FADE_ZONE = 60;
      const bottom = storyWrap.getBoundingClientRect().bottom;
      const fadeT = Math.max(0, Math.min(1, bottom / FADE_ZONE));
      container.style.opacity = String(fadeT);
      container.style.visibility = bottom <= 0 ? 'hidden' : 'visible';
    }

    ticking = false;
  }

  measure();
  update();

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );

  window.addEventListener('resize', () => {
    measure();
    update();
  });
}

// Mobile's version of the same "What We Do" heading→line→tag entrance
// desktop plays as part of the scroll-jack sequence below (masked heading
// reveal, line grow, then the tag's characters rising in — see the
// .wwd2-pin.is-armed(.is-revealing) rules in styles.css). Those rules are
// plain class-triggered CSS `animation`s, not scroll-scrubbed, so the same
// choreography works fine fired once from an IntersectionObserver instead
// of from a local scroll fraction — mobile has no scroll-jack pin to read
// one from. Kept as its own small, self-contained function (rather than
// reusing initWwdSequence()'s internals) so it doesn't depend on any of
// that function's later const declarations, which mobile's early return
// below never reaches.
function initWwdMobileEntrance(pin, titleGroup, tag, tagWrap, onHeadingDone) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (onHeadingDone) onHeadingDone(); // reduced motion never plays this entrance at all — cards (initWwdMobileCards) still need the go-ahead, immediately
    return;
  }
  if (!pin || !titleGroup || !tag) {
    if (onHeadingDone) onHeadingDone(); // same — don't leave cards waiting forever on an entrance that's never going to run
    return;
  }

  const TAG_TEXT = 'to Connect.';
  const CHAR_STAGGER = 0.03;

  function renderChars(text, animate) {
    tag.textContent = '';
    tag.setAttribute('aria-label', text);
    [...text].forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'connect__char';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = ch === ' ' ? ' ' : ch;
      if (animate) {
        span.style.setProperty('--char-delay', `${i * CHAR_STAGGER}s`);
        span.classList.add('is-in');
      }
      tag.appendChild(span);
    });
  }

  // Static safe default: real text present immediately, no animation yet —
  // same as desktop's own pre-arm render.
  renderChars(TAG_TEXT, false);
  pin.classList.add('is-armed');

  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    pin.classList.add('is-revealing');
    // 650ms — faster than desktop's own 1100ms, timed to land right after
    // the mobile-only heading (0.35s) + line (0.35s delay, 0.3s) durations
    // in styles.css's @media (max-width:720px) block, not desktop's 0.6s/
    // 0.6s/0.5s. Mobile has no scroll-jack holding the page still while
    // this plays, and cards are deliberately held back until it's done
    // (onHeadingDone — initWwdMobileCards' own flush, wired up at the call
    // site below) — so however long this takes is real dead time a user
    // who's already scrolling can run straight into, unlike desktop where
    // the scroll-jack itself provides the wait.
    setTimeout(() => {
      tag.style.opacity = '1';
      renderChars(TAG_TEXT, true);
      if (onHeadingDone) onHeadingDone();
    }, 650);
  }

  if ('IntersectionObserver' in window) {
    // titleGroup is short (just the heading + line, ~40-50px tall) —
    // threshold:0.3 alone means "30% of its own tiny height," which is
    // satisfied the instant it clips the very bottom edge of the
    // viewport, while it's still sitting far below where anyone's
    // actually looking. By the time it scrolls up into a comfortable
    // reading position, the reveal (and its own ~1.1s of real-time
    // animation) has already long finished — reads as "it was just
    // already there," not as an entrance. The -35% bottom rootMargin
    // shrinks the effective observed viewport, so intersection only
    // fires once titleGroup has actually scrolled up into (roughly) the
    // top 65% of the screen — much closer to where it's actually seen.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          reveal();
          io.disconnect();
        }
      });
    }, { threshold: 0.3, rootMargin: '0px 0px -35% 0px' });
    io.observe(titleGroup);
  } else {
    reveal();
  }
}

// Mobile's version of the cards' own entrance (desktop's horizontal
// carousel slide-in has no equivalent here — see initWwdSequence()'s
// mobile early return): each card fades in from the left with an eased
// fast-to-slow curve as it scrolls into view, and a small fixed per-index
// delay on top of that gives consecutive cards a slight ripple on top of
// whatever natural gap scrolling itself already puts between them (most
// noticeable if several become visible in the same scroll step). One
// IntersectionObserver watches all six; the "safe by default" pattern
// applies here too — .wwd2-card--pending (added below, right before
// observing) is what actually hides a card, so a JS failure before this
// point just leaves every card in its plain, fully-visible default state
// rather than stuck invisible.
// Returns a flush function — call it once the heading+line entrance
// (initWwdMobileEntrance's own onHeadingDone, wired up at the call site
// below) has actually finished. Each card still gets observed and
// individually tracked here as soon as it scrolls into view, same as
// before — what's gated is only the visible reveal (.is-in) itself, which
// a card can't receive until BOTH it has scrolled into view AND the
// heading's animation is done, whichever happens later. In the ordinary
// case (heading is above the cards, so its animation finishes first) this
// is a no-op; it only matters for a fast scroll or a tall/short viewport
// where a card could otherwise have scrolled into view first.
function initWwdMobileCards(cards) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  if (!cards || !cards.length) return () => {};

  const STAGGER_MS = 80; // small, fixed gap per card index — see comment above

  cards.forEach((card, i) => {
    card.style.transitionDelay = `${i * STAGGER_MS}ms`;
    card.classList.add('wwd2-card--pending');
  });

  let headingDone = false;
  const waitingForHeading = [];

  function revealCard(card) {
    if (headingDone) {
      card.classList.add('is-in');
    } else {
      waitingForHeading.push(card);
    }
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          revealCard(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
    cards.forEach((card) => io.observe(card));
  } else {
    cards.forEach((card) => revealCard(card));
  }

  return function flush() {
    headingDone = true;
    waitingForHeading.forEach((card) => card.classList.add('is-in'));
    waitingForHeading.length = 0;
  };
}

// ── What We Do: one continuous experience under a single heading ────────
// The title card (heading + line + rotating blue tag, Figma node 273:1080)
// and the six feature cards (Figma node 273:1136) are ONE experience, not
// two separate sections. #wwd2 is a tall wrapper; .wwd2-sticky (its one
// pinned child, plain CSS position:sticky, spans this whole height) is what
// makes everything inside feel "stuck" while these phases play out, each
// consuming its own slice of scroll:
//   ENTRANCE_HOLD_SCROLL — heading, then line, then tag fade in in order
//     (CSS, see styles.css), held in place the whole time by a translateY
//     on .wwd2-title-group so the group reads as vertically centered.
//   TAG_EXIT_SCROLL — the tag fades + lifts a little (a small local move,
//     not a real scroll-away) — comfortably done before it would ever
//     reach the heading, since the group hasn't started moving yet.
//   REPOSITION_SCROLL — .wwd2-title-group's translateY eases back to 0,
//     physically carrying the (now tag-less) heading up to this flex
//     column's own resting spot (top:120px, via padding-top) — this is
//     what makes it feel like it "sticks" once the cards take over.
//   CARD_ENTRANCE (per card, staggered, only starts once REPOSITION_SCROLL
//     is fully done — waiting until the heading has actually settled at the
//     top avoids the cards sliding in underneath/over it while it's still
//     moving) — each card first eases quickly to a "parked" spot partway
//     in (CARD_PARK_SCROLL of scroll, fast-to-slow), then needs further,
//     roughly 1:1 scrolling (CARD_SETTLE_SCROLL) to glide the rest of the
//     way into place — scroll-driven throughout, not a timed animation, so
//     it never runs ahead of how much the user has actually scrolled.
//   then the remaining scroll room slides .wwd2-track left until the sixth
//     card clears the right padding.
function initWwdSequence() {
  const pin = document.getElementById('wwd2');
  const sticky = pin && pin.querySelector('.wwd2-sticky');
  const titleGroup = pin && pin.querySelector('.wwd2-title-group');
  const tag = pin && pin.querySelector('.connect__tag');
  const tagWrap = pin && pin.querySelector('.wwd2-tag-wrap');
  const viewport = pin && pin.querySelector('.wwd2-cards-viewport');
  const track = document.getElementById('wwd2-track');
  const cards = track ? [...track.children] : [];
  if (!pin || !sticky || !titleGroup || !tag || !viewport || !track || !cards.length) return;
  // Mobile gets a plain, normal-flow stacked layout instead (see the
  // .wwd2-* rules inside @media (max-width:720px) in styles.css) — no
  // horizontal scroll-jack, no pinning, no card slide-in. Returning here
  // before .is-armed (or anything else) ever gets added means every
  // element (other than the heading/line/tag, handed off below) just
  // renders at its own safe-default CSS state: cards plain and fully
  // visible, .wwd2-pin left at height:auto.
  //
  // initNumbersStage() still has to run on this early-return path too — it
  // owns the shared topo canvas's per-frame background flip (see its own
  // comment above, and the one further down by its real call: skipping this
  // call entirely is a known failure mode that already happened once).
  // Without it the canvas never gets a flat color painted onto it at all and
  // falls back to .topo-bg's own static CSS gradient — a visible gradient
  // showing through wherever the canvas is behind content next, including
  // right behind these WWD cards on mobile.
  if (window.matchMedia('(max-width: 720px)').matches) {
    initNumbersStage();
    // The heading/line/tag entrance and the cards' own fade-in are the two
    // pieces of this sequence mobile keeps — see initWwdMobileEntrance()/
    // initWwdMobileCards() above for why they're separate,
    // IntersectionObserver-driven functions instead of reusing the
    // scroll-jack code below. Cards aren't allowed to actually appear
    // until the heading+line animation is done (initWwdMobileCards'
    // returned flush function, handed to initWwdMobileEntrance as
    // onHeadingDone) — see both functions' own comments for why.
    const flushWwdMobileCards = initWwdMobileCards(cards);
    initWwdMobileEntrance(pin, titleGroup, tag, tagWrap, flushWwdMobileCards);
    return;
  }

  const TAG_TEXT = 'to Connect.';
  const CHAR_STAGGER = 0.03;

  const ENTRANCE_HOLD_SCROLL = 420; // heading → line → tag fade in, all centered, THEN a bit of dwell before tag exit is allowed to start (was 300 — too easy to blow straight past "to Connect." on a fast scroll before it even registered)
  const REVEAL_START_SCROLL = 30; // wwd2-pin's own scroll must have started (i.e. .wwd2-sticky is actually caught/pinned, titleGroup already at its centered offset) before the heading is allowed to start revealing — see the seamComplete/entranceTriggered gating in update() below
  const TAG_EXIT_SCROLL = 360; // tag fades + lifts slightly, well before it nears the heading (was 180 — too easy to blow straight through the whole fade on a fast scroll, barely giving "to Connect." time to register before it was gone)
  const TAG_DWELL_MS = 1200; // real-time floor on top of TAG_EXIT_SCROLL — see tagRevealedAt below for why scroll distance alone still isn't enough on a fast scroll
  const REPOSITION_SCROLL = 280; // the (now tag-less) title group eases from centered up to top:120
  const CARD_STAGGER_SCROLL = 45; // each card's own *fade-in* starts this much later than the previous — position is never staggered, see below
  const CARD_PARK_SCROLL = 80; // quick eased (fast-to-slow) slide from cardStartX (off the right edge, see measure()) to CARD_PARK_X — small budget, feels fast
  const CARD_PARK_X = 600; // px right of its resting spot where the eased curve stops — "600px from the heading's left edge"
  const CARD_SETTLE_SCROLL = CARD_PARK_X; // CARD_PARK_X → 0, 1:1 with scroll (see the linear settle formula below) — set equal to the distance itself so 1px scrolled moves the row exactly 1px
  const CARD_OPACITY_SCROLL = 160; // how much (per-card, staggered) scroll it takes to fully fade in — was tied to CARD_PARK_SCROLL*0.7 (56px), which finished within the fast "park" leg alone and read as an abrupt pop-in rather than a fade
  // Total scroll room needed for the row to finish sliding AND for the last
  // card's (staggered) fade-in to finish, whichever needs more.
  const CARD_ENTRANCE_TOTAL = Math.max(
    CARD_PARK_SCROLL + CARD_SETTLE_SCROLL,
    (cards.length - 1) * CARD_STAGGER_SCROLL + CARD_OPACITY_SCROLL
  );
  const RIGHT_PADDING = 64; // gap kept after the last card once fully revealed
  const TAG_LIFT = 40; // px the tag rises while fading — small and local, not a real scroll-away

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // Wraps an element's text in the shared .kl/.kl__text/.kl__block kinetic
  // block-sweep structure (see styles.css) — same reveal Numbers Tell the
  // Story's stat labels use. Skipped entirely under reduced motion so the
  // element's own plain text stays put, un-wrapped.
  function wrapKineticText(el) {
    const text = el.textContent;
    el.textContent = '';
    el.setAttribute('aria-label', text);
    const outer = document.createElement('span');
    outer.className = 'kl';
    outer.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span');
    inner.className = 'kl__text';
    inner.textContent = text;
    const block = document.createElement('span');
    block.className = 'kl__block';
    outer.append(inner, block);
    el.appendChild(outer);
    return outer;
  }

  // Each card's title sweeps in, then its description a beat later — same
  // per-unit stagger Numbers Tell the Story uses. Triggered once per card
  // (cardTextRevealed below) shortly after that card's own entrance
  // begins, via .is-text-revealing (not the shared .is-revealing — #wwd2
  // also carries that for its own heading/tag entrance, and a bare
  // `.is-revealing .kl__block` selector used to catch the cards' .kl units
  // too since they're nested inside #wwd2 — see the #numbers-alt.is-armed
  // scoping fix on that rule in styles.css). REVEAL_DELAY (below, in
  // update()) adds a small real-time pause after the trigger condition is
  // met, so the sweep doesn't start at the very first, barely-visible
  // instant of the card's fade-in.
  const KL_STAGGER = 0.15;
  const REVEAL_DELAY = 180; // ms — small real-time pause after the trigger condition below, so the sweep doesn't fire the instant the card is barely visible
  const cardTextRevealed = cards.map(() => false);
  const cardTextRevealPending = cards.map(() => false);
  if (!reduce) {
    cards.forEach((card) => {
      const title = card.querySelector('.wwd2-card__title');
      const desc = card.querySelector('.wwd2-card__desc');
      if (title) wrapKineticText(title).style.setProperty('--kd', '0s');
      if (desc) wrapKineticText(desc).style.setProperty('--kd', `${KL_STAGGER}s`);
    });
  }

  function renderChars(text, animate) {
    tag.textContent = '';
    tag.setAttribute('aria-label', text);
    [...text].forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'connect__char';
      span.setAttribute('aria-hidden', 'true');
      // A lone space text node inside a `display: inline-block` span gets
      // whitespace-collapsed away (renders 0-width) — use a non-breaking
      // space so "to Connect." etc. keep a visible gap between words.
      span.textContent = ch === ' ' ? ' ' : ch;
      if (animate) {
        span.style.setProperty('--char-delay', `${i * CHAR_STAGGER}s`);
        span.classList.add('is-in');
      }
      tag.appendChild(span);
    });
  }

  // Locks the tag's box width once real fonts are loaded (measuring
  // against a fallback font would under-size it).
  function lockTagWidth() {
    const originalText = tag.textContent;
    tag.style.width = 'auto';
    tag.textContent = TAG_TEXT;
    const width = tag.getBoundingClientRect().width;
    tag.textContent = originalText;
    tag.style.width = `${Math.ceil(width)}px`;
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(lockTagWidth);
  } else {
    lockTagWidth();
  }
  window.addEventListener('resize', lockTagWidth);

  // Static safe default: real text present immediately, no animation yet.
  renderChars(TAG_TEXT, false);

  let maxTranslate = 0;
  let centerOffset = 0;
  // Where the row starts, in px right of its resting spot — tied to the
  // viewport's own width (remeasured on resize) rather than a fixed guess,
  // so it always starts fully off the right edge of the screen regardless
  // of how wide the viewport is, instead of just "pretty far right".
  let cardStartX = 0;
  function measure() {
    maxTranslate = Math.max(0, track.scrollWidth - viewport.clientWidth + RIGHT_PADDING);
    cardStartX = reduce ? 0 : window.innerWidth;
    // How far down .wwd2-title-group needs to start so it *reads* as
    // vertically centered, given its own (unaffected by any transform
    // already on it — transforms don't change offsetHeight) rendered
    // height and .wwd2-sticky's padding-top:120px resting spot.
    const groupHeight = titleGroup.offsetHeight;
    centerOffset = reduce ? 0 : Math.max(0, (window.innerHeight - groupHeight) / 2 - 120);
    // Fully sequential: hold → tag exit → reposition → card entrance. Cards
    // only start once the heading has actually finished moving to top, so
    // they never slide in underneath/over heading text that's still mid-move.
    const budgets = reduce ? 0 : ENTRANCE_HOLD_SCROLL + TAG_EXIT_SCROLL + REPOSITION_SCROLL + CARD_ENTRANCE_TOTAL;
    pin.style.height = `${window.innerHeight + budgets + maxTranslate}px`;
  }

  let entranceTriggered = reduce;
  // Separate from entranceTriggered on purpose: entranceTriggered flips
  // true the instant the scroll condition is met, but the tag itself
  // doesn't actually become visible until triggerReveal()'s own 1100ms
  // real-time delay elapses (timed to land exactly when the heading/line
  // CSS animations finish — see triggerReveal() below). A fast scroll can
  // easily carry p past ENTRANCE_HOLD_SCROLL (and so make tagExitP > 0)
  // well within that 1100ms window; the tag-exit block further down used
  // to be gated on entranceTriggered alone, so it would start writing
  // opacity/transform onto a tag that hadn't been revealed yet — flashing
  // it partially visible (and already fading) before the line had even
  // finished growing, then to fully transparent moments later. Gating that
  // block on tagRevealed instead means it can't touch the tag at all until
  // the real reveal has actually happened.
  let tagRevealed = reduce;
  // Timestamp (performance.now(), real time) of the moment tagRevealed
  // flipped true — see TAG_DWELL_MS above and its use in update() below.
  // On a fast scroll, tagExitP can already be well past TAG_EXIT_SCROLL
  // (or the whole entrance even locked) by the instant the tag is first
  // revealed, since that reveal is on its own 1100ms real-time clock,
  // independent of scroll speed. Without a real-time floor, the very next
  // frame's exit math would immediately overwrite the opacity:1 this just
  // set — visually, "to Connect." never appears at all, just a flash of
  // nothing. Gating the exit block on elapsed real time since reveal (not
  // just tagRevealed's boolean) guarantees it stays fully visible for at
  // least TAG_DWELL_MS no matter how fast scrolling continues underneath.
  let tagRevealedAt = 0;
  // Numbers Tell the Story's dark-flip completes (see onSeamComplete below)
  // well before the user has actually scrolled wwd2-pin into its own sticky
  // hold — it's driven by #numbers-pin's own, earlier scroll range, not
  // wwd2-pin's. Revealing the heading straight from that callback (the
  // previous approach) meant its 0.6s fade-in played out entirely while
  // wwd2 was still off-screen or mid-scroll-entry: by the time the user
  // actually saw it, opacity was already locked at 1 (the `forwards` fill),
  // so all they saw was the already-fully-visible heading physically
  // riding up from the bottom of the viewport as .wwd2-sticky scrolled
  // into its catch point — reading as "it rises up from the bottom" no
  // matter what the CSS animation itself did. seamComplete here only
  // records that the background is safely dark already (so white text
  // never reveals against light); the actual reveal is gated in update()
  // below on wwd2-pin's OWN local scroll (p > REVEAL_START_SCROLL) too, so
  // it can only ever start once .wwd2-sticky is already caught/pinned and
  // titleGroup is already sitting at its centered offset.
  let seamComplete = reduce;
  let tagExitDone = reduce;
  // The scroll position (p) at the exact instant the tag actually finished
  // exiting — null until then. Reposition/cards (below) are driven off
  // "distance scrolled since this", not off a fixed ENTRANCE_HOLD_SCROLL +
  // TAG_EXIT_SCROLL offset from p directly, specifically because the tag's
  // own finish time isn't purely distance-based any more (see TAG_DWELL_MS
  // — it also has to have been visible for a minimum real time). A fast
  // scroll can carry p past that fixed distance well before the dwell
  // timer allows the tag to actually start fading, and reposition/cards
  // reading raw p directly would start sliding in while the (still fully
  // visible, dwell-held) tag box is still sitting there — the "時機重疊"
  // overlap this fixes. Tying them to tagExitFinishedAtP instead means
  // they literally cannot begin until the tag has, for real, finished.
  let tagExitFinishedAtP = reduce ? 0 : null;
  // Once the cards have fully entered at least once, the whole entrance
  // (tag exit, heading reposition, card group entrance) locks in place —
  // scrolling back up from the card carousel only scrubs the carousel back
  // to card 1, it never re-shows the tag or the centered-heading-alone
  // state. Without this, scrolling up past the cards replayed the entrance
  // in reverse, which read as an unnecessary/jarring "the cards vanished
  // and the heading is alone again" moment for something the user had
  // already seen.
  let entranceLocked = reduce;
  let ticking = false;

  // initNumbersStage owns the light→dark screen flip driven by #numbers-pin's
  // own scroll position (see its own comment above), and runs regardless of
  // reduce — losing this call (as happened once already, see git history)
  // doesn't just skip the entrance below: #numbers-alt's shared canvas stops
  // getting its per-frame flat background/uSeamT updates entirely, so it
  // silently falls back to .topo-bg's own CSS gradient — a visible two-tone
  // gradient/seam instead of the intended whole-screen flip.
  if (reduce) {
    // No phased choreography: the tag is simply hidden (it's decorative —
    // the cards are the content that actually needs to stay reachable) and
    // cards are simply shown, both immediately, already at the heading's
    // final top-anchored spot (centerOffset is 0 under reduce). Only the
    // horizontal slide (how cards 2-6 become reachable at all) stays fully
    // active.
    tag.style.display = 'none';
    if (tagWrap) tagWrap.classList.add('is-collapsed');
    initNumbersStage();
  } else {
    pin.classList.add('is-armed');
    initNumbersStage(() => {
      seamComplete = true;
    });
  }

  function triggerReveal() {
    entranceTriggered = true;
    pin.classList.add('is-revealing');
    // Timed to land right after the heading (0.6s) + line (0.6s delay,
    // 0.5s) finish — see styles.css. The tag box has no animation of its
    // own (see .wwd2-pin.is-armed .connect__tag there): it just switches
    // to visible here, in the same tick as the character stagger below,
    // so the only motion the user sees is the letters rising into place —
    // not the box fading in first and the letters again a beat later.
    setTimeout(() => {
      tag.style.opacity = '1';
      renderChars(TAG_TEXT, true);
      tagRevealed = true;
      tagRevealedAt = performance.now();
      // update() is safe to call immediately here even if the user kept
      // scrolling during this delay and tagExitP is already well past 0:
      // the exit block below is gated on TAG_DWELL_MS having elapsed since
      // tagRevealedAt, which is 0ms ago right now, so it can't touch
      // opacity yet — this call is a no-op for the tag specifically (it
      // still needs to run for everything else update() drives, like
      // repoT/card positions, in case scroll has already moved past those
      // too). The real resync for the tag itself happens in the second
      // setTimeout below, once the dwell floor has actually passed.
      update();
      setTimeout(update, TAG_DWELL_MS);
    }, 1100);
  }

  function update() {
    const p = Math.max(0, -pin.getBoundingClientRect().top);

    if (!reduce && !entranceTriggered && seamComplete && p > REVEAL_START_SCROLL) {
      triggerReveal();
    }

    if (!reduce) {
      const tagExitP = Math.max(0, p - ENTRANCE_HOLD_SCROLL);
      let tagExitT = Math.min(1, tagExitP / TAG_EXIT_SCROLL);
      const tagDwellDone = tagRevealed && performance.now() - tagRevealedAt >= TAG_DWELL_MS;

      if (entranceLocked) {
        // Pin the whole entrance at its finished state regardless of the
        // current (possibly-decreasing, if scrolling back up) p — only the
        // horizontal card carousel below stays live in both directions.
        tagExitT = 1;
      } else if (tagDwellDone && tagExitP > 0) {
        // The tag's own entrance (.is-revealing .connect__tag, in
        // styles.css) is a `forwards`-filled CSS animation on these same
        // two properties — once played, its filled end state keeps
        // outranking plain inline styles on opacity/transform in the
        // cascade. Clearing it here (harmless — the entrance has long
        // finished by the time this ever moves off 1) lets the inline
        // values actually take effect.
        tag.style.animation = 'none';
        tag.style.opacity = String(1 - tagExitT);
        tag.style.transform = `translateY(${-tagExitT * TAG_LIFT}px)`;
        if (tagExitT >= 1 && !tagExitDone) {
          tagExitDone = true;
          tagExitFinishedAtP = p;
          // The tag is fully invisible by now (opacity 0) — collapse its
          // wrapper's box too so it stops holding open a gap between the
          // heading and the cards below (see .wwd2-tag-wrap.is-collapsed).
          if (tagWrap) tagWrap.classList.add('is-collapsed');
        }
      }

      // Distance scrolled since the tag actually finished (see
      // tagExitFinishedAtP's own comment above) — 0 (nothing yet) until
      // that's set. Cards only start once the heading has also fully
      // finished repositioning to top (repoT reaching 1) — starting any
      // earlier had them sliding in underneath/over heading text that
      // hadn't settled yet.
      const repoP = tagExitFinishedAtP === null ? 0 : Math.max(0, p - tagExitFinishedAtP);
      let repoT = Math.min(1, repoP / REPOSITION_SCROLL);
      const cardBaseP = Math.max(0, repoP - REPOSITION_SCROLL);

      if (!entranceLocked && cardBaseP >= CARD_ENTRANCE_TOTAL) entranceLocked = true;
      if (entranceLocked) repoT = 1;

      titleGroup.style.transform = `translateY(${centerOffset * (1 - repoT)}px)`;

      // All six cards share this same x — moving as one rigid row keeps
      // their 32px CSS gap constant throughout the entrance instead of it
      // stretching while a later card is still catching up to an earlier
      // one that's already arrived.
      const parkT = entranceLocked ? 1 : Math.min(1, cardBaseP / CARD_PARK_SCROLL);
      const settleP = Math.max(0, cardBaseP - CARD_PARK_SCROLL);
      // Two distinct legs: the park leg is an eased (fast-to-slow) curve
      // from cardStartX (off the right edge) down to CARD_PARK_X; the
      // settle leg is a straight 1:1 scroll mapping from there to 0 (no
      // easing) — CARD_SETTLE_SCROLL is set equal to CARD_PARK_X, so every
      // extra px scrolled moves the row exactly 1px further left.
      const groupX = parkT < 1
        ? cardStartX + (CARD_PARK_X - cardStartX) * easeOutCubic(parkT)
        : Math.max(0, CARD_PARK_X - settleP);
      cards.forEach((card, i) => {
        // Only the fade-in is staggered per card — purely cosmetic, no
        // positional difference between cards.
        const localP = Math.max(0, cardBaseP - i * CARD_STAGGER_SCROLL);
        const opacityT = entranceLocked ? 1 : Math.min(1, localP / CARD_OPACITY_SCROLL);
        card.style.opacity = String(easeOutCubic(opacityT));
        card.style.transform = `translateX(${groupX}px)`;
        // Triggers on the first sign of this card's own entrance (localP,
        // staggered per-card same as opacity), same as originally — a
        // "wait until the row is fully home" version was tried instead but
        // wasn't wanted: revert to this, just with a small REVEAL_DELAY
        // pause (real time, not scroll distance) so the sweep doesn't start
        // at the very first, barely-visible instant. Guarding with a
        // pending-timeout flag (not just cardTextRevealed) avoids stacking
        // multiple timeouts if update() runs again before this one fires.
        if (!cardTextRevealed[i] && !cardTextRevealPending[i] && (localP > 0 || entranceLocked)) {
          cardTextRevealPending[i] = true;
          window.setTimeout(() => {
            cardTextRevealed[i] = true;
            card.classList.add('is-text-revealing');
          }, REVEAL_DELAY);
        }
      });
    }

    const slideBase = reduce ? 0 : ENTRANCE_HOLD_SCROLL + TAG_EXIT_SCROLL + REPOSITION_SCROLL + CARD_ENTRANCE_TOTAL;
    const horizontalScrolled = Math.max(0, p - slideBase);
    const x = Math.min(maxTranslate, horizontalScrolled);
    track.style.transform = `translateX(-${x}px)`;

    ticking = false;
  }

  measure();
  update();

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );

  window.addEventListener('resize', () => {
    measure();
    update();
  });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initWwdSequence();
} else {
  window.addEventListener('DOMContentLoaded', initWwdSequence);
}

// ── What We Do: custom cursor ────────────────────────────────────────────
// Replaces the system pointer with a small blue dot (see .wwd2-cursor,
// hidden by default) while the mouse is over the dark panel — mouse-only
// (matching .wwd2-sticky's own `cursor: none` under the same media guard),
// so touch devices are untouched. Lives at the body level rather than
// inside .wwd2-sticky so its position:fixed rendering is never at risk of
// being clipped by that panel's own overflow:hidden.
function initWwdCursor() {
  const sticky = document.querySelector('.wwd2-sticky');
  if (!sticky) return;
  if (!window.matchMedia('(hover: hover)').matches) return;

  const cursor = document.createElement('div');
  cursor.className = 'wwd2-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cursor);

  sticky.addEventListener('mouseenter', () => cursor.classList.add('is-visible'));
  sticky.addEventListener('mouseleave', () => cursor.classList.remove('is-visible'));
  sticky.addEventListener('mousemove', (e) => {
    cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
  });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initWwdCursor();
} else {
  window.addEventListener('DOMContentLoaded', initWwdCursor);
}

// ── What We Do: card hover (JS-driven, not plain :hover) ─────────────────
// The hovered card's text block scales/lifts/tilts well past its own real
// (untransformed) column width — see .wwd2-card.is-active-hover in
// styles.css — deliberately overlapping the next card over. Plain CSS
// `:hover` tracks each card's real column, not its escaped visual shape,
// so right at that boundary the mouse is genuinely inside the NEXT card's
// real column even though it still looks like it's over the lifted card;
// `:hover` would flip to that next card and (being later in DOM order)
// paint over the one the user meant to point at. Debouncing the switch —
// only committing to a new active card once the mouse has stayed there a
// beat, not on every mouseenter — absorbs that boundary flicker without
// needing to shrink the escape enough to avoid it entirely.
function initWwdCardHover() {
  const track = document.getElementById('wwd2-track');
  const cards = track ? [...track.querySelectorAll('.wwd2-card')] : [];
  if (!track || !cards.length) return;
  if (!window.matchMedia('(hover: hover)').matches) return;

  const SWITCH_DELAY = 100;
  let active = null;
  let switchTimer = 0;

  function setActive(card) {
    if (card === active) return;
    if (active) active.classList.remove('is-active-hover');
    active = card;
    if (active) active.classList.add('is-active-hover');
  }

  // Listens on .wwd2-card__text specifically, not the whole .wwd2-card —
  // hovering the dummy image below shouldn't lift the text card above it.
  // Both enter AND leave reset the same debounce timer, whichever fires
  // last within the window wins — so a quick graze across the boundary
  // into a neighbor's real hitbox (see the .is-active-hover comment in
  // styles.css for why that can happen) settles back on the card the user
  // actually left second, instead of either getting stuck active with
  // nothing currently hovered, or requiring a full re-hover to drop.
  cards.forEach((card) => {
    const text = card.querySelector('.wwd2-card__text');
    if (!text) return;
    text.addEventListener('mouseenter', () => {
      clearTimeout(switchTimer);
      switchTimer = setTimeout(() => setActive(card), SWITCH_DELAY);
    });
    text.addEventListener('mouseleave', () => {
      clearTimeout(switchTimer);
      switchTimer = setTimeout(() => setActive(null), SWITCH_DELAY);
    });
  });

  // Leaving the whole row clears the active card immediately — no reason
  // to debounce a clean exit.
  track.addEventListener('mouseleave', () => {
    clearTimeout(switchTimer);
    setActive(null);
  });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initWwdCardHover();
} else {
  window.addEventListener('DOMContentLoaded', initWwdCardHover);
}

// ── Testimonial laurels: fade + float up once in view ───────────────────
// `.is-hidden` only ever gets added here, right before observing — never in
// plain CSS — so a laurel is always visible by default; if IntersectionObserver
// is unavailable or motion is reduced, this just no-ops and they stay visible.
function initTestimonialLaurels(laurelSelector, sectionId, scoreSelector) {
  const laurels = [...document.querySelectorAll(laurelSelector)];
  const section = document.getElementById(sectionId);
  if (!laurels.length || !section) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof IntersectionObserver === 'undefined') return;

  // If the section is already in view when this runs (e.g. a reload while
  // scrolled down to it), skip the reveal entirely rather than adding
  // `is-hidden` and immediately removing it — that round trip is fast, but
  // not instant, and reads as the laurel dropping down before floating back
  // up instead of a clean single upward motion.
  const sectionRect = section.getBoundingClientRect();
  if (sectionRect.top < window.innerHeight && sectionRect.bottom > 0) return;

  // Count-up starts from 60% of the target rather than 0 — for a value like
  // "280+" that would otherwise need to climb the same visual distance as
  // "76%" in the same duration, making it look like it's racing to catch up.
  // Starting proportionally closer keeps the motion consistent regardless
  // of how big the number is.
  const COUNT_START_RATIO = 0.6;
  const COUNT_DURATION = 1000;

  function animateScore(el) {
    const raw = el.textContent.trim();
    const match = raw.match(/^([\d.]+)(.*)$/);
    if (!match) return;
    const target = parseFloat(match[1]);
    const suffix = match[2];
    const decimals = (match[1].split('.')[1] || '').length;
    const startValue = target * COUNT_START_RATIO;
    const start = performance.now();

    function frame(now) {
      const elapsed = Math.min((now - start) / COUNT_DURATION, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const value = startValue + (target - startValue) * eased;
      el.textContent = value.toFixed(decimals) + suffix;
      if (elapsed < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  laurels.forEach((el) => el.classList.add('is-hidden'));

  const STAGGER = 180;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      laurels.forEach((el, i) => {
        setTimeout(() => {
          el.classList.remove('is-hidden');
          const score = el.querySelector(scoreSelector);
          if (score) animateScore(score);
        }, i * STAGGER);
      });
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.3 });

  observer.observe(section);
}

// initTestimonialLaurels() stays parameterized (laurelSelector/sectionId/
// scoreSelector) even though only .client2 calls it now — the old #trust
// call that used to sit alongside this one was removed with that section.
function bootTestimonialLaurels() {
  initTestimonialLaurels('.client2__laurel', 'client2', '.client2__laurel-score');
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  bootTestimonialLaurels();
} else {
  window.addEventListener('DOMContentLoaded', bootTestimonialLaurels);
}

// client2's laurel labels ("On-time Delivery Rate" etc.) get the same
// kinetic block-sweep reveal Numbers Tell the Story's stat labels use (see
// initNumtellLabelReveal() above) — .client2__laurel-label .kl__block is
// overridden to this section's own #ffb349 accent instead of the shared
// component's default blue (see styles.css). Triggered independently of
// initTestimonialLaurels() above (own IntersectionObserver on the same
// #client2 section) — same pattern Numbers Tell the Story uses for its own
// two independent reveal systems (count-up + label sweep).
function initClient2LabelReveal() {
  const section = document.getElementById('client2');
  const labels = section ? [...section.querySelectorAll('.client2__laurel-label')] : [];
  if (!labels.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof IntersectionObserver === 'undefined') return;

  const DURATION = 0.5;
  const STAGGER = 0.18;

  labels.forEach((label, i) => {
    const text = label.innerHTML;
    const spokenLabel = text.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
    label.textContent = '';
    label.setAttribute('aria-label', spokenLabel);
    const outer = document.createElement('span');
    outer.className = 'kl';
    outer.setAttribute('aria-hidden', 'true');
    outer.style.setProperty('--kd', `${i * STAGGER}s`);
    outer.style.setProperty('--kdur', `${DURATION}s`);
    const inner = document.createElement('span');
    inner.className = 'kl__text';
    inner.innerHTML = text;
    const block = document.createElement('span');
    block.className = 'kl__block';
    outer.append(inner, block);
    label.appendChild(outer);
  });

  const START_DELAY = 350; // ms — small pause before the sweep starts, same reasoning as initNumbersHandwriting's own delay

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      window.setTimeout(() => section.classList.add('is-label-revealing'), START_DELAY);
    });
  }, { threshold: 0.3 });
  observer.observe(section);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initClient2LabelReveal();
} else {
  window.addEventListener('DOMContentLoaded', initClient2LabelReveal);
}

// ── Services section: spheres converge-then-drift ────────────────────────
// Both decorative spheres start pulled in to a 100px gap. Once the section
// scrolls into view they ease outward to their resting (bled-off-edge)
// position — fast to slow, one-time. Continuing to scroll through the
// section then drifts them up to 20px further outward, tied to scroll
// progress, for a subtle parallax as the section passes.
function initServicesSpheres(section, sphereLeft, sphereRight, onEntranceEase) {
  if (!section || !sphereLeft || !sphereRight) return;

  const reduceMotionSpheres = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PARALLAX_MAX = 60;
  // The extra outward drift stays off until the section has scrolled this
  // far past the viewport top, then ramps linearly the rest of the way
  // until the section has fully scrolled out of view (range recomputed
  // per frame from the section's actual height, not a fixed distance).
  const PARALLAX_START = 200;
  const ENTRANCE_DURATION = 1400;
  const START_GAP = 100;

  let closeAmount = 0;
  let entranceOffset = 0;
  let parallaxOffset = 0;
  let entranceStarted = false;

  function measureCloseAmount() {
    const width = section.getBoundingClientRect().width;
    // The resting position is left:-22% / right:-22% on 46%-wide spheres —
    // derive the gap between their facing edges at that resting position.
    const restingGap = width * 0.52;
    closeAmount = Math.max(0, (restingGap - START_GAP) / 2);
  }

  function render() {
    const left = entranceOffset - parallaxOffset;
    const right = -entranceOffset + parallaxOffset;
    sphereLeft.style.transform = `translateX(${left}px)`;
    sphereRight.style.transform = `translateX(${right}px) scaleY(-1) rotate(180deg)`;
  }

  measureCloseAmount();
  entranceOffset = closeAmount;
  render();

  if (reduceMotionSpheres) {
    entranceOffset = 0;
    render();
    if (onEntranceEase) onEntranceEase(1);
  } else if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entranceStarted) return;
        entranceStarted = true;
        const startOffset = entranceOffset;
        const start = performance.now();
        function frame(now) {
          const elapsed = Math.min((now - start) / ENTRANCE_DURATION, 1);
          const eased = 1 - Math.pow(1 - elapsed, 3);
          entranceOffset = startOffset * (1 - eased);
          render();
          if (onEntranceEase) onEntranceEase(eased);
          if (elapsed < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.2 });
    observer.observe(section);
  } else {
    entranceOffset = 0;
    render();
    if (onEntranceEase) onEntranceEase(1);
  }

  let sphereTicking = false;
  window.addEventListener('scroll', () => {
    if (sphereTicking) return;
    sphereTicking = true;
    requestAnimationFrame(() => {
      const rect = section.getBoundingClientRect();
      const scrolledPast = Math.max(0, -rect.top - PARALLAX_START);
      const parallaxRange = Math.max(1, rect.height - PARALLAX_START);
      const progress = Math.min(scrolledPast / parallaxRange, 1);
      parallaxOffset = reduceMotionSpheres ? 0 : progress * PARALLAX_MAX;
      render();
      sphereTicking = false;
    });
  });

  window.addEventListener('resize', () => {
    measureCloseAmount();
    if (!entranceStarted) entranceOffset = closeAmount;
    render();
  });
}

// Called once per section that has a .services__sphere pair — currently
// "What we do" and the Numbers Tell the Story v2 comparison section, each
// fully independent (own scroll-linked entrance/parallax state).
function bootServicesSpheres() {
  document.querySelectorAll('.services__sphere--wire').forEach((sphereLeft) => {
    const section = sphereLeft.closest('section');
    const sphereRight = section && section.querySelector('.services__sphere--color');
    // Numbers Tell the Story v2's stat gap narrows in lockstep with this
    // section's own sphere entrance — same easing, same frame, driven by
    // the callback below rather than a second independent animation.
    const stats = section && section.id === 'numbers-alt' ? section.querySelector('.numtell__stats') : null;
    let onEntranceEase;
    if (stats) {
      const GAP_START = 160;
      const GAP_END = 60;
      stats.style.gap = `${GAP_START}px`;
      onEntranceEase = (eased) => {
        stats.style.gap = `${GAP_START - (GAP_START - GAP_END) * eased}px`;
      };
    }
    initServicesSpheres(section, sphereLeft, sphereRight, onEntranceEase);
  });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  bootServicesSpheres();
} else {
  window.addEventListener('DOMContentLoaded', bootServicesSpheres);
}

// ── Testimonials marquee: scroll-coupled direction and speed ─────────────
// Idle, it drifts left-to-right at a fixed pace. Scrolling the page down
// pushes it faster in that same direction; scrolling up reverses it to
// right-to-left, with the reversal's speed matching how fast the page is
// being scrolled. It never stops — the content is duplicated once and the
// offset wraps with modulo math, so the loop is seamless in both
// directions regardless of how it's currently moving.
function initTestimonialsMarquee(trackSelector) {
  const track = document.querySelector(trackSelector);
  if (!track) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const BASE_DURATION = 75; // seconds per loop at rest, matches the original pace
  const SCROLL_BOOST = 2.2; // how strongly scroll velocity influences speed
  const BOOST_CAP_MULTIPLIER = 10; // clamp so a big scroll fling doesn't blow past a sane speed
  const DECAY_TAU = 0.4; // seconds — how fast the scroll-driven boost settles back to idle

  let setWidth = 0;
  let baseSpeed = 0;

  function measure() {
    setWidth = track.scrollWidth / 2;
    baseSpeed = setWidth / BASE_DURATION;
  }
  measure();
  window.addEventListener('resize', measure);

  let offset = -setWidth || 0;
  let velocityBoost = 0;
  let lastScrollY = window.scrollY;
  let lastScrollTime = performance.now();

  window.addEventListener('scroll', () => {
    const now = performance.now();
    const dt = Math.max(now - lastScrollTime, 1);
    const dy = window.scrollY - lastScrollY;
    const scrollSpeed = (dy / dt) * 1000; // px/sec of page scroll
    const cap = baseSpeed * BOOST_CAP_MULTIPLIER;
    velocityBoost = Math.max(-cap, Math.min(cap, scrollSpeed * SCROLL_BOOST));
    lastScrollY = window.scrollY;
    lastScrollTime = now;
  }, { passive: true });

  // Hand-drag (touch or mouse) — pauses the autoplay advance for exactly as
  // long as a finger/pointer is actually down on the track, and hands it
  // straight back afterward at the same slow idle pace, rather than
  // replacing the marquee with a separate scroll mechanism. Pointer Events
  // cover touch and mouse with the same listeners, so this is universal,
  // not mobile-only — a real click-drag on desktop works the same way.
  let dragging = false;
  let dragPointerId = null;
  let dragStartX = 0;
  let dragStartOffset = 0;

  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartOffset = offset;
    velocityBoost = 0; // a drag starting mid-scroll-boost shouldn't keep that boost once released
    track.setPointerCapture(e.pointerId);
  });

  track.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragPointerId) return;
    offset = dragStartOffset + (e.clientX - dragStartX);
  });

  function endDrag(e) {
    if (!dragging || e.pointerId !== dragPointerId) return;
    dragging = false;
    dragPointerId = null;
  }
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  let lastFrameTime = performance.now();
  function frame(now) {
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    if (!dragging) {
      velocityBoost *= Math.exp(-dt / DECAY_TAU);
      const speed = baseSpeed + velocityBoost;
      offset += speed * dt;
    }

    if (setWidth > 0) {
      offset = (((offset % setWidth) + setWidth) % setWidth) - setWidth;
    }

    track.style.transform = `translateX(${offset}px)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// initTestimonialsMarquee() stays parameterized (trackSelector) even though
// only #client2-track calls it now — the old .testimonials__track call that
// used to sit alongside this one was removed with the #trust section.
function bootTestimonialsMarquees() {
  initTestimonialsMarquee('#client2-track');
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  bootTestimonialsMarquees();
} else {
  window.addEventListener('DOMContentLoaded', bootTestimonialsMarquees);
}

// ── CTA 2: cycling icon ───────────────────────────────────────────────────
// Swaps through img/svg icon/Icon-1.svg .. Icon-6.svg above the CTA 2
// heading, 0.5s each, looping. Reduced motion just shows the first icon,
// static, rather than cycling.
function initCta2IconCycle() {
  const icon = document.getElementById('cta2-icon');
  if (!icon) return;

  const ICONS = [1, 2, 3, 4, 5, 6].map((n) => `img/svg icon/Icon-${n}.svg`);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    icon.src = ICONS[0];
    return;
  }

  const INTERVAL = 500;
  let index = 0;
  setInterval(() => {
    index = (index + 1) % ICONS.length;
    icon.src = ICONS[index];
  }, INTERVAL);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initCta2IconCycle();
} else {
  window.addEventListener('DOMContentLoaded', initCta2IconCycle);
}

// ── CTA 2: full-bleed entrance, then shrink to the resting card ─────────
// .cta2-pin is a tall scroll-jack wrapper (height set below); .cta2 (its
// pinned child, plain CSS position:sticky) is what makes .cta2__card and
// .cta2__content feel "stuck" while three phases play out, each consuming
// its own slice of scroll:
//   FADE_SCROLL — .cta2__card fades in (opacity 0->1) already sized
//     full-bleed (position:fixed, covering the viewport). .cta2's own
//     background stays white (matching #client2 above) through this whole
//     phase — it only starts crossfading to blue once SHRINK begins, so
//     scrolling in never shows a flash of blue before the silk appears.
//   HOLD_SCROLL — nothing moves; a deliberate pause once content has
//     finished revealing, so a fast scroll can't blow past the full-bleed
//     moment before it registers (same reasoning as Numbers Tell the
//     Story's own HOLD_SCROLL and WWD's ENTRANCE_HOLD_SCROLL).
//   SHRINK_SCROLL — the card animates from full-bleed down to its real
//     resting rect — measured fresh via measureFinalRect() below, not a
//     hardcoded size, so this adapts to any viewport width/height on its
//     own (mobile included). Driven by CSS transform (scale + translate),
//     not by animating width/height directly: the card's actual DOM size
//     never changes during this phase, only its rendered transform — so
//     silk-background.js's ResizeObserver (which resizes the WebGL canvas,
//     clearing its buffer every time) never fires mid-animation, which is
//     what caused a visible flicker when width/height were animated
//     directly instead.
// Content (icon/heading/lead/button, in .cta2__content — a sibling of
// .cta2__card, not nested inside it) fades up once FADE_SCROLL completes,
// via .is-content-revealing, centered in the viewport (see the CSS rules
// on .cta2-pin.is-armed for the fade itself). Its own top position is
// animated separately from the card — centered while full-bleed, easing
// down to its natural spot (aligned with the card's own top edge, which
// combined with .cta2__content's 88px padding-top recreates the original
// inset) only once SHRINK starts, using the same eased progress as the
// card. Keeping it a sibling (not nested inside .cta2__card) means this
// can be computed directly in real viewport pixels, with no need to
// compensate for .cta2__card's own transform:scale.
function initCta2Transition() {
  const pin = document.getElementById('cta2-pin');
  const section = document.getElementById('cta2');
  const card = section && section.querySelector('.cta2__card');
  const content = section && section.querySelector('.cta2__content');
  const backdrop = section && section.querySelector('.cta2__backdrop');
  const backdropFill = section && section.querySelector('.cta2__backdrop-fill');
  const client2 = document.getElementById('client2');
  const client2Spacer = document.getElementById('client2-spacer');
  const footer = document.querySelector('.footer');
  if (!pin || !section || !card || !content || !backdrop) return;

  // How far past the card's own edges the blue backdrop extends at rest —
  // 80 above, 40 on the other three sides (right/bottom match .cta2's own
  // padding) — so the backdrop's shrunk-down size reads as "a consistent
  // margin around the card" instead of an arbitrary rectangle.
  const BACKDROP_MARGIN = { top: 80, right: 40, bottom: 40, left: 40 };

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return; // .cta2-pin never gets .is-armed — card and content simply render at their normal, final CSS state

  const narrow = window.matchMedia('(max-width: 720px)').matches;
  // Scroll distance for the cover-in, linear (see coverOffset below) — no
  // easeOutCubic front-load, for the same reason .hero-pin/.story-wrap's
  // own cover transition (styles.css) is plain native scroll: a 1:1
  // scroll-to-motion gesture reads as deliberate, where an eased curve
  // crammed into a tight budget reads as a snap. The distance itself
  // (this used to be 160/250, then briefly a full window.innerHeight) was
  // never really the main problem, though — Client2 was also moving in
  // lockstep with the incoming card the whole time (see showClient2Flush's
  // call site below), so there was no stationary reference to actually
  // perceive the cover against, no matter how long the budget was. Now
  // that Client2 holds still throughout, this only has to set the pace.
  const FADE_SCROLL = narrow ? 500 : 650;
  const HOLD_SCROLL = narrow ? 220 : 350;
  const SHRINK_SCROLL = narrow ? 480 : 750; // was 320/500 — felt too fast for how much visual change happens
  // SHRINK_SCROLL is now two back-to-back sub-phases, not one continuous
  // move: SCALE_SCROLL shrinks the box down to its final width/height while
  // it stays centered in the viewport (no position change yet), then
  // SLIDE_SCROLL carries the now-final-size box straight down from that
  // centered spot to its real resting position (bottom-anchored — see
  // .cta2's own align-items:flex-end). Split evenly for now.
  const SCALE_SCROLL = SHRINK_SCROLL / 2;
  const SLIDE_SCROLL = SHRINK_SCROLL / 2;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  let finalRect = { top: 0, left: 0, width: 0, height: 0 };
  let finalContentTop = 0;
  let centeredContentTop = 0;
  // The backdrop's own settled top/height — same value the "shrinking"
  // branch below eases toward and the settled branch relies on directly
  // (backdrop's inline styles are cleared there, so its real on-screen top
  // becomes exactly finalRect.top - BACKDROP_MARGIN.top by construction —
  // see measureFinalRect's comment). Hoisted out of the per-frame branch
  // since it only depends on finalRect, not on scroll position.
  let backdropFinalTop = 0;
  let backdropFinalHeight = 0;
  let client2Height = 0;

  // FLIP-style measurement: .cta2 only actually renders "pinned" (top:0,
  // full viewport) once scrolled into its own sticky range — but the
  // card's rect within that pinned shape is fully determined by CSS
  // (flex layout + viewport size), independent of scroll position. So
  // .cta2 is forced into that exact shape here just long enough to read
  // the card's and content's natural rects, then restored — giving an
  // accurate target even before the user has ever scrolled anywhere near
  // this section.
  function measureFinalRect() {
    card.style.cssText = '';
    content.style.cssText = '';
    const prevSectionStyle = section.style.cssText;
    section.style.position = 'fixed';
    section.style.top = '0';
    section.style.left = '0';
    section.style.width = '100vw';
    section.style.height = '100vh';
    const r = card.getBoundingClientRect();
    const cr = content.getBoundingClientRect();
    finalRect = { top: r.top, left: r.left, width: r.width, height: r.height };
    // .cta2__content's own top aligns with the card's top at rest — its
    // 88px padding-top (see styles.css) is what recreates the original
    // inset from there, so no separate content-vs-card offset is needed.
    finalContentTop = finalRect.top;
    centeredContentTop = (window.innerHeight - cr.height) / 2;
    backdropFinalTop = finalRect.top - BACKDROP_MARGIN.top;
    backdropFinalHeight = finalRect.height + BACKDROP_MARGIN.top + BACKDROP_MARGIN.bottom;
    section.style.cssText = prevSectionStyle;
  }

  // Client2's natural rendered height (its min-height plus whatever extra
  // content/breakpoint reflow adds) — measured with any of our own
  // overrides cleared first so a resize mid-shrink re-reads its true
  // current-width height, not whatever fixed px height we last forced it
  // to. update() re-applies the correct override on the very next call
  // (measure() is always immediately followed by update()), so there's no
  // visible flicker from clearing it here.
  function measureClient2() {
    if (!client2) return;
    const prev = client2.style.cssText;
    client2.style.cssText = '';
    client2Height = client2.getBoundingClientRect().height;
    client2.style.cssText = prev;
  }

  function measure() {
    measureFinalRect();
    measureClient2();
    const total = window.innerHeight + FADE_SCROLL + HOLD_SCROLL + SHRINK_SCROLL;
    // Pulls .cta2-pin up by a full viewport height so its sticky child
    // starts covering while Client2 still has its ENTIRE height left to
    // scroll through — same technique as .hero-pin/.story-wrap (see that
    // comment in styles.css): a negative top margin here, cancelled by
    // adding the same amount back into the pin's own height, leaves
    // whatever comes after this section sitting at the same page position
    // as if neither existed.
    // This has to be a full viewport height, not just FADE_SCROLL: the
    // incoming card starts its cover-in translateY from
    // window.innerHeight too (see coverOffset below), and the handoff from
    // "Client2 in normal flow" to "Client2 pulled into position:fixed,
    // frozen in place" (see update()) has to be seamless at the exact
    // instant p crosses 0 — meaning Client2's natural bottom edge at that
    // instant must already be sitting at exactly window.innerHeight,
    // matching the frozen position it gets held at pixel for pixel.
    // Anything smaller would make it visibly jump the moment it gets
    // pulled into position:fixed.
    const OVERLAP = window.innerHeight;
    pin.style.marginTop = `-${OVERLAP}px`;
    // Deliberately NOT adding OVERLAP back into the pin's own height here
    // (an earlier version did, "cancelling out" the negative margin so
    // .cta2-pin's bottom edge landed at the same page position with or
    // without it — the same idea as .hero-pin/.story-wrap). That canceling
    // is exactly what was making .cta2 stay sticky for a whole extra
    // viewport-height of scroll after settling, with nothing happening —
    // .cta2's own stick budget is (this height) - (.cta2's own height), so
    // padding the height back out by OVERLAP pads the budget by the same
    // amount. Leaving it uncancelled here means .cta2 lets go the moment
    // shrinkT actually reaches 1, and the Footer (and everything after)
    // simply sits OVERLAP px higher up the page than before — which reads
    // as Footer showing up right away instead of a full screen late.
    pin.style.height = `${total}px`;
  }

  // Pulls Client2 into position:fixed with its bottom edge at `topEdge` —
  // used two different ways by its call sites below: held at a constant
  // window.innerHeight through the cover-in/hold (frozen in place while
  // the incoming card/backdrop do the moving), then tracking the
  // backdrop's own current top edge once it starts shrinking back down
  // from full-bleed. Can't be a CSS-only trick either way: by the time the
  // shrink phase runs, Client2 has long since scrolled hundreds of pixels
  // past out of the document's normal flow, so nothing short of
  // re-positioning it can put it back on screen. client2Spacer reserves
  // Client2's normal-flow space while it's pulled out via fixed
  // positioning, so nothing after it on the page jumps.
  function showClient2Flush(topEdge) {
    if (!client2) return;
    if (client2Spacer) {
      client2Spacer.style.display = 'block';
      client2Spacer.style.height = `${client2Height}px`;
    }
    client2.style.position = 'fixed';
    client2.style.top = `${topEdge - client2Height}px`;
    client2.style.left = '0px';
    client2.style.width = `${window.innerWidth}px`;
    client2.style.height = `${client2Height}px`;
    client2.style.margin = '0';
    // Same reasoning as the card/backdrop's own pointer-events:none (see
    // the shrinkT<=0 branch below): position:fixed ignores scroll, so this
    // sits over whatever's at that screen position on every scroll depth
    // while active — nothing should ever need to click through to Client2
    // once it's been pulled out of flow like this.
    client2.style.pointerEvents = 'none';
  }

  function releaseClient2() {
    if (!client2) return;
    client2.style.position = '';
    client2.style.top = '';
    client2.style.left = '';
    client2.style.width = '';
    client2.style.height = '';
    client2.style.margin = '';
    client2.style.pointerEvents = '';
    if (client2Spacer) client2Spacer.style.display = 'none';
  }

  pin.classList.add('is-armed');

  let ticking = false;
  const SETTLE_P = FADE_SCROLL + HOLD_SCROLL + SHRINK_SCROLL;
  // The whole cover→hold→shrink sequence is meant to play once, snap to
  // its finished look, and then hand everything back to plain, static
  // document flow for good — not stay scroll-jacked forever in either
  // direction. teardown() (below) does that one-time handoff the instant
  // real scroll first carries p up to SETTLE_P; once tornDown is true,
  // update() never runs its own logic again (see the guard immediately
  // below), so from then on .cta2/.cta2__card/.cta2__backdrop/Client2 are
  // all just native, scrolling normally with the rest of the page (Footer
  // included) — no more JS-driven sticky/fixed positioning to get out of
  // sync with itself no matter how the user scrolls afterward.
  let tornDown = false;

  function teardown() {
    if (tornDown) return;
    tornDown = true;

    // Snap to the exact same settled visual this always rendered once
    // shrinkT reached 1 — clearing every inline override lets each
    // element's own resting CSS take over, pixel for pixel, one last time.
    card.style.position = '';
    card.style.top = '';
    card.style.left = '';
    card.style.width = '';
    card.style.maxWidth = '';
    card.style.height = '';
    card.style.transform = '';
    card.style.transformOrigin = '';
    card.style.borderRadius = '';
    card.style.pointerEvents = '';

    backdrop.style.position = '';
    backdrop.style.top = '';
    backdrop.style.left = '';
    backdrop.style.width = '';
    backdrop.style.height = '';
    backdrop.style.transform = '';
    backdrop.style.transformOrigin = '';
    backdrop.style.pointerEvents = '';
    if (backdropFill) backdropFill.style.display = 'none';

    // Drops .cta2 out of position:sticky for good (see the CSS rule this
    // class triggers, next to .cta2-pin in styles.css) — from here it just
    // scrolls away in plain normal flow together with Footer below it,
    // instead of staying pinned to the viewport while Footer scrolls in
    // from underneath it. Clearing the scroll-jack margin/height along
    // with it collapses .cta2-pin back down to .cta2's own natural
    // (now auto) height — no more dead scroll-jack space to sit in either.
    pin.classList.add('is-torn-down');
    pin.style.marginTop = '';
    pin.style.height = '';

    // .cta2__content has no `top` of its own in CSS (see its rule) — it's
    // always been JS-driven, in viewport-relative px, on the assumption
    // .cta2 fills the whole viewport while pinned. Once .cta2 is a normal,
    // auto-sized block instead, that assumption no longer holds — read the
    // card's own now-static offset within .cta2 (its containing block,
    // now that .cta2 is position:relative rather than sticky) and use
    // that instead, so content still lines up with the card's top edge
    // exactly like it always has.
    content.style.top = `${card.offsetTop}px`;

    // Client2 is done moving for good — plain normal flow, right where it
    // naturally sits in the document, forever, regardless of any further
    // scrolling in either direction.
    releaseClient2();
  }

  function update() {
    if (tornDown) return;
    const pRaw = -pin.getBoundingClientRect().top;
    const p = Math.max(0, pRaw);
    if (p >= SETTLE_P) {
      teardown();
      return;
    }

    // "Cover" sub-phase (same FADE_SCROLL budget, repurposed): instead of
    // fading in opacity while already full-bleed, the card+backdrop slide
    // straight up from below the viewport to fully covering it — no
    // opacity animation at all now (removed per explicit request — a
    // WebGL canvas mid-opacity-transition was producing a visible
    // flicker). coverOffset is an extra translateY added on top of
    // whatever the shrink phase's own transform is doing (0 for all of
    // cover+hold, so this is the only thing moving the box during cover).
    const coverT = Math.min(1, p / FADE_SCROLL);
    // Linear, not eased — matches .hero-pin/.story-wrap's own plain native
    // scroll (a sticky element's covered-vs-revealed position is
    // inherently 1:1 with scroll; there's no "easing" for JS to apply
    // there, so this mirrors that directly instead of layering an
    // easeOutCubic front-load on top of an already-tight budget, which is
    // what made the cover-in feel like it snapped shut almost immediately
    // no matter how big FADE_SCROLL was made).
    const coverOffset = lerp(window.innerHeight, 0, coverT);
    // toggle, not a one-way add: scrolling back up past the reveal
    // threshold has to hide .cta2__content again too, or it stays visible
    // (position:absolute, centered in the still-sticky .cta2) and
    // visually overflows onto whatever's now showing underneath —
    // Client2, once the card/backdrop themselves have scrolled back out
    // of their own covering position.
    pin.classList.toggle('is-content-revealing', coverT >= 0.8);

    const shrinkP = Math.max(0, p - FADE_SCROLL - HOLD_SCROLL);
    const shrinkT = Math.min(1, shrinkP / SHRINK_SCROLL);

    // Two back-to-back sub-phases within the shrink budget — see
    // SCALE_SCROLL/SLIDE_SCROLL above. scaleT drives size only (position
    // held centered); slideT only starts once scaleT has fully reached 1,
    // and drives the move from centered down to the final resting spot.
    const scaleP = Math.min(shrinkP, SCALE_SCROLL);
    const scaleT = Math.min(1, scaleP / SCALE_SCROLL);
    const scaleEased = easeOutCubic(scaleT);
    const slideP = Math.max(0, shrinkP - SCALE_SCROLL);
    const slideT = Math.min(1, slideP / SLIDE_SCROLL);
    const slideEased = easeOutCubic(slideT);

    // .cta2__backdrop's own CSS background (#2c69ce) is never overridden
    // from here — it's hidden behind the opaque silk card throughout cover
    // and hold anyway, and once the shrink starts exposing it, it should
    // just already be solid blue with no fade-in of its own (removed per
    // explicit request).

    // Content position: centered while full-bleed and through the scale
    // sub-phase, then slides down in sync with the card during the slide
    // sub-phase — never nested inside the card, so this is plain viewport
    // pixels, no scale compensation.
    content.style.top = `${lerp(centeredContentTop, finalContentTop, slideEased)}px`;

    // Only assigned inside the mid-shrink branch below, but read afterward
    // by the Client2/Footer handoff at the bottom of this function — hoisted
    // here so that read isn't a scoping error.
    let bCurY = 0;

    if (shrinkT <= 0) {
      // Covering (or holding, once fully covered) — pinned to the
      // viewport, full-bleed size, no scale yet. The only motion here is
      // coverOffset's translateY (see above) — 0 by the time HOLD begins,
      // so this also correctly renders the static, fully-covering hold
      // state. max-width:1432px from the card's own resting CSS would
      // otherwise clamp the width right back down — needs an explicit
      // override here too. Sized off window.innerWidth/innerHeight in px,
      // not 100vw/100vh — those CSS units include the scrollbar's own
      // width on this (long, scrolling) page, which innerWidth excludes,
      // leaving a gap on the right if the two were mixed.
      // pointer-events:none is essential here, not cosmetic: position:fixed
      // ignores scroll, so this element sits over the ENTIRE viewport at
      // literally every scroll position on the page, including while the
      // user is scrolled all the way up at the hero or WWD — off-screen
      // (below the fold, pre-cover) doesn't stop it from still capturing
      // hover/click, which was silently swallowing WWD's card hover (and
      // anything else's pointer events) everywhere above this section.
      // There's nothing interactive inside .cta2__card itself
      // (content/button live in the sibling .cta2__content instead), so it
      // never needs pointer events during the animated phases at all.
      card.style.position = 'fixed';
      card.style.top = '0px';
      card.style.left = '0px';
      card.style.width = `${window.innerWidth}px`;
      card.style.maxWidth = 'none';
      card.style.height = `${window.innerHeight}px`;
      card.style.transformOrigin = '0 0';
      card.style.transform = `translate(0px, ${coverOffset}px)`;
      card.style.borderRadius = '0px';
      card.style.pointerEvents = 'none';

      // Backdrop's width never changes (see the "else" branch below for
      // why) — always full-bleed, left:0, no horizontal transform at all.
      backdrop.style.position = 'fixed';
      backdrop.style.top = '0px';
      backdrop.style.left = '0px';
      backdrop.style.width = `${window.innerWidth}px`;
      backdrop.style.height = `${window.innerHeight}px`;
      backdrop.style.transformOrigin = '0 0';
      backdrop.style.transform = `translateY(${coverOffset}px)`;
      backdrop.style.pointerEvents = 'none';
      if (backdropFill) backdropFill.style.display = 'none';
    } else {
      // Card's own DOM size stays fixed at the full-bleed 100vw/100vh the
      // whole time — only `transform` changes — so silk-background.js's
      // ResizeObserver never fires mid-shrink (see the function comment).
      // transform-origin:0 0 (set once, at arm time, below) means scaling
      // keeps the top-left corner anchored at (0,0) before translate
      // moves it to the target position.
      //
      // Position math handles both sub-phases with one formula, no explicit
      // branching: curW/curH change only via scaleEased (frozen once the
      // scale sub-phase ends), so "centered for curW/curH" tracks the
      // shrinking box during that sub-phase (keeping its center fixed at
      // the viewport's center — true "shrinks inward evenly", not "shrinks
      // from a fixed corner"), then — because curW/curH stop changing —
      // becomes a constant equal to "centered for the final size" for the
      // rest of the slide sub-phase, which is exactly the position the
      // slide needs to start from. lerp(..., slideEased) then carries it
      // from there down to finalRect's real spot, only once scaleEased has
      // already reached 1 (slideP is 0 until scaleP fills SCALE_SCROLL).
      const curW = lerp(window.innerWidth, finalRect.width, scaleEased);
      const curH = lerp(window.innerHeight, finalRect.height, scaleEased);
      const curSx = curW / window.innerWidth;
      const curSy = curH / window.innerHeight;
      const centeredLeftForCurW = (window.innerWidth - curW) / 2;
      const centeredTopForCurH = (window.innerHeight - curH) / 2;
      const curX = lerp(centeredLeftForCurW, finalRect.left, slideEased);
      const curY = lerp(centeredTopForCurH, finalRect.top, slideEased) + coverOffset; // +coverOffset is a no-op here (already 0 by this scroll depth) — included for correctness, not just belt-and-suspenders
      card.style.position = 'fixed';
      card.style.top = '0px';
      card.style.left = '0px';
      card.style.width = `${window.innerWidth}px`;
      card.style.maxWidth = 'none';
      card.style.height = `${window.innerHeight}px`;
      card.style.transformOrigin = '0 0';
      card.style.transform = `translate(${curX}px, ${curY}px) scale(${curSx}, ${curSy})`;
      // Compensates for the scale above so the CSS radius still reads as a
      // constant ~12px visually instead of shrinking along with the box —
      // tied to scaleEased (radius is a size property, done once scaling
      // is), not the slide that follows it.
      const targetRadius = lerp(0, 12, scaleEased);
      const scaleForRadius = Math.min(curSx, curSy) || 1;
      card.style.borderRadius = `${targetRadius / scaleForRadius}px`;
      card.style.pointerEvents = 'none'; // see the shrinkT<=0 branch above for why this matters everywhere on the page, not just here

      // Backdrop shrinks in exact sync (same scaleEased/slideEased) toward
      // a strip expanded outward from the card's own finalRect by
      // BACKDROP_MARGIN — i.e. the same compact strip its settled CSS
      // (600px tall, bottom-anchored) already represents, arrived at
      // gradually instead of just snapping there. Same centered-then-slide
      // formula as the card, but height/vertical-position only — no
      // horizontal scale or translate at all: the backdrop's width is
      // already exactly window.innerWidth at every step (BACKDROP_MARGIN's
      // left+right exactly cancels out the card's own side insets), so
      // animating it was pure no-op math that risked a mismatched-by-a-
      // few-px snap against the settled CSS (left:0;right:0, always
      // exactly full width) right when the shrink finished.
      const bCurH = lerp(window.innerHeight, backdropFinalHeight, scaleEased);
      const bCurSy = bCurH / window.innerHeight;
      const bCenteredTop = (window.innerHeight - bCurH) / 2;
      bCurY = lerp(bCenteredTop, backdropFinalTop, slideEased) + coverOffset; // +coverOffset a no-op here, same as the card
      backdrop.style.position = 'fixed';
      backdrop.style.top = '0px';
      backdrop.style.left = '0px';
      backdrop.style.width = `${window.innerWidth}px`;
      backdrop.style.height = `${window.innerHeight}px`;
      backdrop.style.transformOrigin = '0 0';
      backdrop.style.transform = `translateY(${bCurY}px) scaleY(${bCurSy})`;
      backdrop.style.pointerEvents = 'none';

      // .cta2__backdrop-fill: the centered-then-slide formula above keeps
      // the backdrop's center fixed while it shrinks — meaning during
      // most of the scale sub-phase (and the start of slide), the
      // backdrop's own bottom edge (bCurY + bCurH) sits well ABOVE the
      // viewport's bottom edge, not just its top edge sitting below 0.
      // Client2 backfills the space above it, but nothing backfills the
      // space below — until now: this fills exactly that gap with the
      // same solid blue, only shown while it's actually needed (it closes
      // to 0 height on its own by the time slideEased reaches 1, matching
      // .cta2__backdrop's own settled CSS bottom:0 exactly).
      if (backdropFill) {
        const bBottomEdge = bCurY + bCurH;
        const gapBelow = window.innerHeight - bBottomEdge;
        if (gapBelow > 0.5) {
          backdropFill.style.display = 'block';
          backdropFill.style.top = `${bBottomEdge}px`;
          backdropFill.style.width = `${window.innerWidth}px`;
          backdropFill.style.height = `${gapBelow}px`;
        } else {
          backdropFill.style.display = 'none';
        }
      }
    }

    // Client2 — this whole function only ever runs before teardown() has
    // fired (see the guard at the top of update()), so this is always the
    // first, forward pass through cover/hold/shrink, never a reverse one:
    //   shrinkT<=0 — cover/hold: Client2 freezes in place (bottom edge held
    //     at a constant window.innerHeight) for as long as the pin is
    //     engaged at all — pulled into position:fixed the instant p crosses
    //     0 (pRaw > 0), seamless with its natural-flow position at that
    //     exact instant since the pin's negative margin above (OVERLAP =
    //     window.innerHeight) makes the two agree pixel for pixel right at
    //     the handoff. Below p=0, it's released back to plain normal-flow
    //     scrolling. Deliberately NOT tracking coverOffset here (an earlier
    //     version did): gluing Client2's edge to the incoming card's own
    //     moving edge made both appear to travel together, which reads as
    //     "the page is just scrolling normally" rather than "a stationary
    //     Client2 is being covered by an incoming layer" — there's no
    //     motion contrast to see. Holding Client2 still while only the
    //     card/backdrop move (via coverOffset) is what actually sells the
    //     cover, the same way .hero stays motionless while .story-wrap
    //     slides up over it.
    //   0 < shrinkT < 1 — mid-shrink: Client2 tracks the backdrop's own
    //     current top edge (bCurY) in real time, glued flush to it the
    //     whole way down, not just at the start/end.
    if (shrinkT <= 0) {
      if (pRaw > 0) {
        showClient2Flush(window.innerHeight);
      } else {
        releaseClient2();
      }
    } else {
      showClient2Flush(bCurY);
    }

    ticking = false;
  }

  measure();
  update();

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );

  window.addEventListener('resize', () => {
    // Once torn down, measure() would re-apply the scroll-jack
    // margin/height this section no longer uses — skip it entirely so a
    // resize (rotating a tablet, etc.) can't accidentally re-pin it.
    if (tornDown) return;
    measure();
    update();
  });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initCta2Transition();
} else {
  window.addEventListener('DOMContentLoaded', initCta2Transition);
}


