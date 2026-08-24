// Everything in this top section (language toggle, scroll reveal) is plain
// DOM code with zero external dependencies, so it runs and works even if the
// Three.js import below fails, is blocked, or is slow. The 3D hero object is
// an enhancement, never a requirement for the page to be usable — see the
// try/catch around the dynamic import further down.

// ── Expertise videos: force autoplay, no play-button flash ──────────────
// The `autoplay muted playsinline` attributes are usually enough, but some
// mobile browsers (notably Android Chrome under data-saver, or when the
// `muted` attribute alone isn't trusted) still pause and show a play
// button until a script explicitly sets `.muted = true` and calls
// `.play()`. Retried once the video actually scrolls into view, since
// some browsers defer/cancel autoplay for off-screen media.
(function forceExpertiseVideoAutoplay() {
  const videos = [...document.querySelectorAll('.expertise__video')];
  if (!videos.length) return;

  function attemptPlay(video) {
    video.muted = true;
    video.playsInline = true;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  videos.forEach(attemptPlay);

  if (typeof IntersectionObserver === 'undefined') return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.target.paused) attemptPlay(entry.target);
    });
  }, { threshold: 0.1 });
  videos.forEach((video) => observer.observe(video));
})();

// Language toggle — UI-only for now, no localized copy wired up yet.
const langToggle = document.getElementById('lang-toggle');
if (langToggle) {
  langToggle.addEventListener('click', () => {
    const next = langToggle.dataset.lang === 'en' ? 'zh' : 'en';
    langToggle.dataset.lang = next;
    langToggle.querySelectorAll('.nav__lang-option').forEach((el) => {
      el.classList.toggle('nav__lang-option--active', el.dataset.value === next);
    });
  });
}

// Capsule header — expands from a floating pill to a full-width bar once
// the second section (credibility stats) reaches the header, not on a flat
// scroll-distance threshold. rAF-throttled so it doesn't run on every event.
// The logo swaps to the color mark in the same step, same size, no fade.
const navEl = document.querySelector('.nav');
const navTriggerSection = document.getElementById('credibility');
const navLogoImg = document.getElementById('nav-logo-img');
const NAV_LOGO_DEFAULT = 'img/logo_print_horizon-white.png';
const NAV_LOGO_SCROLLED = 'img/logo_print_horizon.png';
// The light band (credibility + services + capabilities + trust, which is
// also a white section) needs dark nav text — toggled by whether that
// combined range currently overlaps the header, so it reverts once the page
// scrolls past trust into the dark contact section below.
const navLightZoneStart = document.getElementById('credibility');
const navLightZoneEnd = document.getElementById('trust');
if (navEl && navTriggerSection) {
  let navTicking = false;
  window.addEventListener('scroll', () => {
    if (navTicking) return;
    navTicking = true;
    requestAnimationFrame(() => {
      const navHeight = navEl.getBoundingClientRect().height;
      const reachedSecondSection = navTriggerSection.getBoundingClientRect().top <= navHeight;
      navEl.classList.toggle('is-scrolled', reachedSecondSection);
      if (navLogoImg) {
        const nextSrc = reachedSecondSection ? NAV_LOGO_SCROLLED : NAV_LOGO_DEFAULT;
        if (!navLogoImg.src.endsWith(nextSrc)) navLogoImg.src = nextSrc;
      }
      if (navLightZoneStart && navLightZoneEnd) {
        const lightTop = navLightZoneStart.getBoundingClientRect().top;
        const lightBottom = navLightZoneEnd.getBoundingClientRect().bottom;
        const overLight = lightTop <= navHeight && lightBottom >= 0;
        navEl.classList.toggle('nav--on-light', overLight);
      }
      navTicking = false;
    });
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

// ── Credibility section: interactive dot-map background ─────────────────
// Same hover-glow concept as the worldmap_test.html reference: a grid of
// dots brightens toward --teal as the pointer nears. Adapted to cover-fit
// the section's real box instead of a fixed test canvas, and redrawn only
// on mousemove/resize (not a perpetual rAF loop) since nothing here is
// time-based — the color is a pure function of pointer distance.
function initCredibilityMap() {
  const canvas = document.getElementById('credibility-map');
  const section = canvas && canvas.closest('.credibility');
  if (!canvas || !section) return;
  const ctx = canvas.getContext('2d');

  const DOTS = [[379.95,173.28],[409.66,182.69],[379.95,182.69],[399.76,163.86],[399.76,116.77],[399.76,145.02],[399.76,154.44],[379.95,107.36],[379.95,126.19],[379.95,116.77],[379.95,163.86],[399.76,107.36],[379.95,145.02],[379.95,154.44],[399.76,173.28],[370.05,116.77],[370.05,145.02],[370.05,126.19],[370.05,154.44],[399.76,97.94],[370.05,173.28],[370.05,163.86],[399.76,69.69],[399.76,79.11],[429.47,192.11],[399.76,88.52],[399.76,32.02],[399.76,41.44],[419.56,41.44],[389.86,154.44],[389.86,145.02],[389.86,126.19],[389.86,182.69],[389.86,116.77],[389.86,163.86],[389.86,192.11],[389.86,173.28],[419.56,182.69],[419.56,13.19],[419.56,173.28],[399.76,192.11],[389.86,88.52],[389.86,97.94],[389.86,107.36],[419.56,97.94],[419.56,69.69],[419.56,88.52],[419.56,79.11],[419.56,22.6],[370.05,182.69],[419.56,154.44],[419.56,135.61],[419.56,145.02],[419.56,163.86],[419.56,107.36],[419.56,116.77],[419.56,126.19],[419.56,192.11],[340.34,182.69],[340.34,192.11],[439.37,126.19],[439.37,135.61],[439.37,97.94],[439.37,116.77],[439.37,107.36],[340.34,145.02],[340.34,173.28],[439.37,145.02],[439.37,163.86],[439.37,154.44],[439.37,88.52],[340.34,154.44],[300.73,97.94],[310.63,97.94],[310.63,107.36],[409.66,173.28],[290.82,107.36],[439.37,173.28],[409.66,163.86],[300.73,107.36],[409.66,145.02],[409.66,88.52],[330.44,182.69],[409.66,97.94],[439.37,79.11],[409.66,135.61],[409.66,154.44],[350.24,135.61],[360.14,182.69],[429.47,88.52],[399.76,22.6],[360.14,173.28],[429.47,79.11],[429.47,69.69],[360.14,163.86],[409.66,79.11],[429.47,145.02],[429.47,135.61],[429.47,97.94],[429.47,116.77],[429.47,107.36],[429.47,126.19],[409.66,32.02],[350.24,145.02],[350.24,154.44],[350.24,182.69],[409.66,69.69],[409.66,41.44],[350.24,173.28],[409.66,13.19],[429.47,163.86],[409.66,22.6],[429.47,154.44],[350.24,126.19],[419.56,314.53],[419.56,305.12],[419.56,295.7],[419.56,286.28],[419.56,342.78],[419.56,352.2],[419.56,333.37],[419.56,323.95],[429.47,323.95],[439.37,276.86],[439.37,267.45],[439.37,248.61],[439.37,286.28],[439.37,258.03],[439.37,295.7],[439.37,314.53],[439.37,305.12],[449.27,333.37],[459.18,333.37],[459.18,314.53],[439.37,239.19],[459.18,267.45],[459.18,323.95],[429.47,220.36],[449.27,267.45],[449.27,276.86],[429.47,248.61],[419.56,220.36],[429.47,314.53],[429.47,333.37],[419.56,239.19],[419.56,229.78],[419.56,248.61],[419.56,267.45],[419.56,258.03],[429.47,229.78],[419.56,276.86],[429.47,258.03],[429.47,239.19],[429.47,267.45],[429.47,295.7],[429.47,305.12],[429.47,286.28],[429.47,276.86],[360.14,258.03],[370.05,248.61],[370.05,239.19],[370.05,258.03],[370.05,267.45],[370.05,220.36],[370.05,229.78],[360.14,201.53],[360.14,229.78],[360.14,239.19],[360.14,210.94],[360.14,248.61],[360.14,220.36],[370.05,210.94],[379.95,276.86],[379.95,258.03],[379.95,267.45],[379.95,239.19],[370.05,201.53],[379.95,248.61],[379.95,314.53],[379.95,323.95],[379.95,286.28],[379.95,305.12],[379.95,295.7],[330.44,248.61],[340.34,239.19],[330.44,229.78],[360.14,267.45],[340.34,258.03],[340.34,248.61],[340.34,267.45],[320.53,248.61],[330.44,239.19],[320.53,239.19],[379.95,229.78],[330.44,258.03],[330.44,220.36],[350.24,220.36],[350.24,229.78],[350.24,239.19],[350.24,201.53],[350.24,210.94],[340.34,229.78],[350.24,248.61],[340.34,220.36],[340.34,210.94],[409.66,220.36],[350.24,258.03],[350.24,267.45],[409.66,361.62],[399.76,220.36],[409.66,333.37],[409.66,352.2],[399.76,239.19],[409.66,342.78],[399.76,229.78],[399.76,276.86],[399.76,248.61],[399.76,286.28],[399.76,267.45],[399.76,258.03],[409.66,229.78],[409.66,258.03],[409.66,248.61],[399.76,295.7],[409.66,267.45],[409.66,323.95],[409.66,239.19],[409.66,314.53],[409.66,305.12],[409.66,286.28],[409.66,276.86],[409.66,295.7],[399.76,361.62],[389.86,276.86],[389.86,286.28],[389.86,267.45],[389.86,258.03],[389.86,295.7],[389.86,305.12],[379.95,210.94],[389.86,342.78],[389.86,314.53],[389.86,248.61],[389.86,323.95],[389.86,333.37],[399.76,342.78],[399.76,323.95],[399.76,333.37],[399.76,305.12],[399.76,314.53],[389.86,220.36],[399.76,352.2],[389.86,239.19],[389.86,229.78],[379.95,220.36],[389.86,210.94],[578.02,295.7],[578.02,286.28],[568.11,267.45],[578.02,276.86],[587.92,305.12],[568.11,276.86],[568.11,286.28],[647.34,361.62],[657.24,314.53],[657.24,286.28],[657.24,267.45],[657.24,295.7],[667.14,389.87],[667.14,371.03],[667.14,342.78],[667.14,352.2],[667.14,361.62],[657.24,352.2],[657.24,371.03],[647.34,295.7],[736.47,323.95],[647.34,333.37],[647.34,286.28],[657.24,342.78],[647.34,342.78],[657.24,333.37],[667.14,333.37],[657.24,361.62],[706.76,323.95],[706.76,380.45],[706.76,305.12],[706.76,389.87],[706.76,399.29],[716.66,323.95],[716.66,389.87],[706.76,258.03],[667.14,323.95],[716.66,399.29],[677.05,352.2],[667.14,295.7],[677.05,361.62],[667.14,305.12],[677.05,305.12],[677.05,342.78],[677.05,295.7],[706.76,408.7],[657.24,323.95],[617.63,323.95],[617.63,361.62],[617.63,333.37],[617.63,352.2],[617.63,342.78],[617.63,305.12],[597.82,286.28],[597.82,276.86],[617.63,295.7],[607.73,258.03],[607.73,286.28],[607.73,267.45],[647.34,352.2],[597.82,305.12],[607.73,361.62],[607.73,371.03],[607.73,352.2],[607.73,342.78],[607.73,333.37],[607.73,276.86],[637.43,352.2],[597.82,342.78],[637.43,342.78],[637.43,361.62],[637.43,333.37],[637.43,267.45],[637.43,286.28],[637.43,314.53],[637.43,323.95],[627.53,305.12],[627.53,323.95],[617.63,248.61],[627.53,361.62],[597.82,361.62],[617.63,258.03],[627.53,352.2],[627.53,333.37],[627.53,342.78],[597.82,352.2],[211.6,295.7],[152.18,220.36],[191.79,276.86],[211.6,286.28],[191.79,267.45],[191.79,305.12],[191.79,295.7],[191.79,286.28],[211.6,314.53],[211.6,352.2],[211.6,361.62],[211.6,342.78],[211.6,323.95],[211.6,333.37],[181.89,258.03],[211.6,305.12],[221.5,361.62],[211.6,276.86],[112.56,220.36],[211.6,258.03],[221.5,389.87],[221.5,446.37],[211.6,371.03],[221.5,371.03],[181.89,267.45],[221.5,380.45],[181.89,295.7],[132.37,239.19],[181.89,286.28],[171.98,239.19],[132.37,229.78],[171.98,248.61],[132.37,220.36],[201.69,361.62],[201.69,342.78],[201.69,323.95],[201.69,333.37],[201.69,305.12],[201.69,314.53],[201.69,418.12],[201.69,295.7],[221.5,333.37],[221.5,352.2],[201.69,371.03],[211.6,380.45],[201.69,352.2],[201.69,408.7],[201.69,399.29],[201.69,380.45],[201.69,389.87],[201.69,286.28],[191.79,239.19],[122.47,229.78],[122.47,220.36],[201.69,436.95],[211.6,389.87],[211.6,408.7],[201.69,427.54],[211.6,399.29],[201.69,239.19],[201.69,276.86],[201.69,258.03],[201.69,267.45],[211.6,427.54],[211.6,436.95],[211.6,267.45],[241.31,295.7],[241.31,305.12],[241.31,286.28],[251.21,352.2],[241.31,276.86],[241.31,361.62],[251.21,342.78],[241.31,342.78],[241.31,352.2],[241.31,333.37],[241.31,323.95],[241.31,314.53],[251.21,276.86],[251.21,286.28],[261.11,342.78],[261.11,333.37],[261.11,323.95],[261.11,314.53],[251.21,323.95],[251.21,314.53],[251.21,305.12],[251.21,295.7],[251.21,333.37],[231.4,361.62],[221.5,267.45],[221.5,286.28],[241.31,371.03],[231.4,371.03],[221.5,276.86],[221.5,295.7],[221.5,314.53],[221.5,323.95],[221.5,305.12],[231.4,380.45],[231.4,352.2],[231.4,286.28],[231.4,276.86],[231.4,305.12],[231.4,267.45],[231.4,295.7],[231.4,333.37],[231.4,314.53],[231.4,342.78],[231.4,323.95],[280.92,295.7],[271.02,314.53],[271.02,323.95],[261.11,286.28],[271.02,333.37],[142.27,248.61],[271.02,295.7],[142.27,239.19],[152.18,229.78],[280.92,314.53],[152.18,239.19],[280.92,305.12],[152.18,248.61],[271.02,305.12],[261.11,305.12],[142.27,220.36],[261.11,295.7],[171.98,258.03],[142.27,229.78],[162.08,248.61],[221.5,342.78],[627.53,145.02],[627.53,154.44],[627.53,69.69],[627.53,79.11],[627.53,88.52],[627.53,97.94],[627.53,107.36],[627.53,126.19],[627.53,135.61],[627.53,116.77],[607.73,163.86],[607.73,173.28],[617.63,163.86],[637.43,173.28],[607.73,210.94],[607.73,182.69],[637.43,210.94],[627.53,50.85],[607.73,126.19],[607.73,116.77],[607.73,107.36],[607.73,145.02],[607.73,154.44],[607.73,135.61],[607.73,201.53],[617.63,88.52],[617.63,97.94],[617.63,107.36],[617.63,50.85],[637.43,163.86],[617.63,60.27],[617.63,69.69],[617.63,79.11],[617.63,192.11],[617.63,182.69],[617.63,173.28],[617.63,126.19],[617.63,145.02],[617.63,135.61],[617.63,116.77],[607.73,60.27],[627.53,173.28],[627.53,163.86],[607.73,69.69],[607.73,79.11],[607.73,97.94],[607.73,88.52],[607.73,50.85],[587.92,182.69],[607.73,192.11],[607.73,220.36],[627.53,201.53],[627.53,182.69],[627.53,192.11],[627.53,60.27],[686.95,97.94],[696.86,135.61],[686.95,69.69],[686.95,79.11],[686.95,88.52],[696.86,145.02],[696.86,88.52],[696.86,97.94],[696.86,107.36],[696.86,116.77],[696.86,126.19],[686.95,135.61],[677.05,88.52],[677.05,69.69],[677.05,79.11],[686.95,107.36],[677.05,107.36],[677.05,97.94],[696.86,79.11],[686.95,116.77],[686.95,154.44],[677.05,60.27],[686.95,145.02],[696.86,69.69],[736.47,107.36],[726.57,88.52],[726.57,79.11],[726.57,107.36],[726.57,97.94],[716.66,79.11],[637.43,154.44],[746.37,97.94],[736.47,79.11],[736.47,97.94],[736.47,88.52],[706.76,97.94],[677.05,116.77],[706.76,107.36],[706.76,116.77],[706.76,126.19],[706.76,88.52],[716.66,88.52],[716.66,97.94],[706.76,79.11],[716.66,107.36],[716.66,116.77],[746.37,88.52],[647.34,135.61],[647.34,145.02],[647.34,154.44],[647.34,163.86],[647.34,126.19],[647.34,107.36],[647.34,69.69],[647.34,79.11],[647.34,97.94],[647.34,116.77],[647.34,192.11],[647.34,88.52],[637.43,126.19],[637.43,116.77],[647.34,201.53],[637.43,107.36],[637.43,145.02],[637.43,135.61],[637.43,97.94],[637.43,79.11],[637.43,69.69],[637.43,88.52],[667.14,60.27],[667.14,116.77],[667.14,126.19],[667.14,154.44],[667.14,163.86],[667.14,173.28],[667.14,107.36],[667.14,69.69],[677.05,126.19],[667.14,97.94],[667.14,88.52],[667.14,79.11],[657.24,182.69],[657.24,126.19],[657.24,116.77],[657.24,60.27],[657.24,192.11],[657.24,173.28],[657.24,107.36],[657.24,69.69],[657.24,97.94],[657.24,79.11],[657.24,88.52],[617.63,154.44],[538.4,79.11],[538.4,69.69],[538.4,60.27],[558.21,229.78],[538.4,88.52],[538.4,97.94],[548.31,220.36],[538.4,50.85],[548.31,210.94],[548.31,229.78],[538.4,210.94],[538.4,182.69],[538.4,173.28],[538.4,116.77],[538.4,163.86],[548.31,201.53],[538.4,192.11],[538.4,126.19],[538.4,135.61],[538.4,145.02],[538.4,154.44],[538.4,201.53],[548.31,69.69],[548.31,60.27],[548.31,50.85],[548.31,97.94],[548.31,88.52],[548.31,79.11],[558.21,248.61],[548.31,192.11],[548.31,32.02],[548.31,41.44],[558.21,239.19],[548.31,163.86],[548.31,173.28],[548.31,154.44],[548.31,182.69],[548.31,107.36],[548.31,126.19],[548.31,116.77],[548.31,135.61],[548.31,145.02],[538.4,107.36],[518.6,69.69],[518.6,88.52],[518.6,79.11],[518.6,116.77],[518.6,97.94],[518.6,107.36],[538.4,220.36],[518.6,60.27],[528.5,239.19],[518.6,50.85],[518.6,163.86],[518.6,192.11],[518.6,182.69],[518.6,173.28],[518.6,201.53],[518.6,210.94],[518.6,145.02],[518.6,126.19],[518.6,135.61],[528.5,229.78],[518.6,154.44],[528.5,248.61],[528.5,88.52],[528.5,97.94],[528.5,220.36],[528.5,107.36],[528.5,79.11],[528.5,69.69],[538.4,229.78],[528.5,126.19],[538.4,239.19],[528.5,60.27],[528.5,116.77],[528.5,201.53],[528.5,192.11],[528.5,210.94],[528.5,135.61],[528.5,182.69],[528.5,173.28],[528.5,154.44],[528.5,145.02],[528.5,163.86],[558.21,135.61],[578.02,201.53],[578.02,192.11],[578.02,210.94],[578.02,182.69],[578.02,135.61],[578.02,163.86],[578.02,145.02],[578.02,154.44],[578.02,173.28],[578.02,229.78],[578.02,220.36],[568.11,32.02],[568.11,41.44],[568.11,50.85],[587.92,145.02],[568.11,60.27],[587.92,154.44],[578.02,239.19],[568.11,69.69],[578.02,248.61],[587.92,163.86],[578.02,258.03],[587.92,173.28],[587.92,248.61],[578.02,13.19],[578.02,32.02],[578.02,126.19],[587.92,229.78],[587.92,201.53],[587.92,192.11],[587.92,220.36],[587.92,210.94],[578.02,22.6],[578.02,88.52],[578.02,97.94],[578.02,107.36],[578.02,116.77],[578.02,69.69],[578.02,60.27],[578.02,50.85],[578.02,41.44],[578.02,79.11],[568.11,116.77],[558.21,69.69],[587.92,116.77],[558.21,88.52],[558.21,97.94],[558.21,107.36],[558.21,116.77],[558.21,32.02],[558.21,60.27],[558.21,41.44],[558.21,50.85],[558.21,79.11],[558.21,182.69],[558.21,192.11],[558.21,173.28],[558.21,201.53],[558.21,210.94],[558.21,126.19],[558.21,145.02],[518.6,220.36],[558.21,163.86],[558.21,154.44],[587.92,135.61],[568.11,173.28],[568.11,145.02],[568.11,163.86],[568.11,126.19],[568.11,154.44],[568.11,135.61],[568.11,88.52],[568.11,97.94],[568.11,107.36],[558.21,220.36],[568.11,182.69],[568.11,248.61],[568.11,229.78],[568.11,239.19],[568.11,79.11],[568.11,192.11],[568.11,220.36],[587.92,126.19],[568.11,201.53],[568.11,210.94],[518.6,258.03],[469.08,22.6],[488.89,182.69],[469.08,88.52],[469.08,97.94],[469.08,107.36],[597.82,201.53],[597.82,192.11],[478.98,220.36],[478.98,210.94],[478.98,201.53],[469.08,116.77],[478.98,239.19],[469.08,13.19],[469.08,229.78],[469.08,210.94],[469.08,126.19],[597.82,210.94],[469.08,239.19],[469.08,201.53],[469.08,192.11],[469.08,145.02],[469.08,135.61],[469.08,154.44],[469.08,163.86],[478.98,116.77],[478.98,97.94],[478.98,88.52],[597.82,145.02],[478.98,107.36],[439.37,220.36],[478.98,22.6],[478.98,79.11],[488.89,192.11],[488.89,201.53],[488.89,220.36],[488.89,210.94],[478.98,13.19],[597.82,182.69],[478.98,163.86],[478.98,145.02],[478.98,154.44],[478.98,173.28],[478.98,182.69],[597.82,154.44],[597.82,163.86],[597.82,173.28],[478.98,135.61],[478.98,192.11],[478.98,126.19],[518.6,229.78],[449.27,229.78],[587.92,69.69],[449.27,220.36],[587.92,60.27],[449.27,88.52],[439.37,210.94],[587.92,50.85],[587.92,22.6],[597.82,229.78],[587.92,32.02],[587.92,41.44],[449.27,97.94],[449.27,201.53],[449.27,182.69],[449.27,173.28],[449.27,192.11],[587.92,88.52],[449.27,163.86],[449.27,145.02],[449.27,116.77],[449.27,126.19],[449.27,154.44],[449.27,107.36],[449.27,135.61],[587.92,79.11],[459.18,107.36],[459.18,135.61],[459.18,88.52],[459.18,97.94],[459.18,126.19],[459.18,116.77],[459.18,79.11],[459.18,22.6],[439.37,192.11],[439.37,201.53],[597.82,220.36],[459.18,13.19],[459.18,220.36],[587.92,97.94],[459.18,239.19],[459.18,145.02],[587.92,107.36],[459.18,248.61],[459.18,229.78],[459.18,154.44],[459.18,163.86],[459.18,201.53],[459.18,173.28],[459.18,210.94],[488.89,50.85],[498.79,107.36],[498.79,135.61],[488.89,13.19],[498.79,126.19],[498.79,154.44],[498.79,145.02],[508.69,248.61],[498.79,97.94],[498.79,41.44],[498.79,3.77],[498.79,79.11],[498.79,88.52],[498.79,116.77],[498.79,210.94],[488.89,173.28],[498.79,229.78],[498.79,220.36],[597.82,69.69],[498.79,182.69],[597.82,60.27],[498.79,192.11],[597.82,50.85],[498.79,163.86],[498.79,173.28],[597.82,22.6],[508.69,69.69],[508.69,97.94],[508.69,239.19],[508.69,88.52],[508.69,116.77],[508.69,126.19],[508.69,107.36],[518.6,248.61],[508.69,60.27],[518.6,239.19],[508.69,50.85],[607.73,229.78],[508.69,79.11],[508.69,192.11],[508.69,210.94],[508.69,201.53],[508.69,229.78],[508.69,220.36],[508.69,182.69],[508.69,154.44],[508.69,135.61],[508.69,145.02],[508.69,163.86],[508.69,173.28],[498.79,201.53],[597.82,79.11],[597.82,97.94],[597.82,116.77],[597.82,88.52],[597.82,126.19],[488.89,107.36],[597.82,135.61],[488.89,116.77],[488.89,60.27],[488.89,79.11],[488.89,88.52],[488.89,22.6],[597.82,107.36],[488.89,41.44],[449.27,210.94],[488.89,154.44],[488.89,97.94],[488.89,126.19],[488.89,145.02],[488.89,163.86],[488.89,135.61],[132.37,60.27],[132.37,182.69],[132.37,50.85],[132.37,192.11],[132.37,69.69],[132.37,154.44],[132.37,173.28],[132.37,145.02],[132.37,126.19],[132.37,135.61],[132.37,163.86],[132.37,79.11],[122.47,182.69],[112.56,50.85],[112.56,22.6],[122.47,88.52],[132.37,116.77],[122.47,13.19],[132.37,107.36],[132.37,210.94],[132.37,97.94],[122.47,192.11],[132.37,88.52],[122.47,201.53],[122.47,210.94],[132.37,201.53],[142.27,173.28],[122.47,41.44],[122.47,50.85],[142.27,163.86],[142.27,145.02],[142.27,154.44],[132.37,13.19],[122.47,60.27],[122.47,69.69],[142.27,192.11],[122.47,107.36],[142.27,201.53],[122.47,97.94],[142.27,182.69],[122.47,79.11],[142.27,210.94],[142.27,126.19],[142.27,135.61],[122.47,116.77],[142.27,22.6],[122.47,173.28],[142.27,88.52],[142.27,3.77],[132.37,3.77],[122.47,163.86],[142.27,13.19],[142.27,69.69],[142.27,107.36],[142.27,97.94],[122.47,22.6],[142.27,116.77],[122.47,135.61],[122.47,145.02],[122.47,126.19],[122.47,154.44],[102.66,201.53],[53.15,107.36],[53.15,97.94],[63.05,116.77],[63.05,126.19],[53.15,79.11],[53.15,88.52],[53.15,116.77],[43.24,97.94],[43.24,107.36],[43.24,88.52],[43.24,116.77],[43.24,79.11],[72.95,88.52],[72.95,97.94],[72.95,107.36],[72.95,79.11],[82.86,145.02],[72.95,116.77],[63.05,88.52],[63.05,107.36],[63.05,97.94],[72.95,126.19],[63.05,79.11],[23.44,135.61],[13.53,69.69],[13.53,79.11],[23.44,126.19],[13.53,88.52],[82.86,135.61],[23.44,116.77],[13.53,126.19],[3.63,97.94],[13.53,107.36],[13.53,116.77],[13.53,97.94],[33.34,107.36],[33.34,97.94],[33.34,69.69],[33.34,79.11],[33.34,116.77],[33.34,88.52],[23.44,79.11],[23.44,88.52],[23.44,97.94],[33.34,126.19],[23.44,107.36],[23.44,69.69],[112.56,201.53],[102.66,126.19],[102.66,41.44],[112.56,60.27],[112.56,192.11],[102.66,50.85],[102.66,88.52],[102.66,107.36],[102.66,116.77],[102.66,79.11],[112.56,182.69],[102.66,97.94],[112.56,210.94],[112.56,97.94],[112.56,173.28],[112.56,88.52],[112.56,116.77],[112.56,79.11],[112.56,107.36],[112.56,163.86],[112.56,154.44],[112.56,135.61],[112.56,126.19],[112.56,145.02],[92.76,154.44],[92.76,135.61],[92.76,145.02],[92.76,126.19],[82.86,126.19],[92.76,116.77],[82.86,79.11],[82.86,107.36],[92.76,107.36],[82.86,116.77],[82.86,88.52],[82.86,97.94],[102.66,182.69],[102.66,173.28],[102.66,163.86],[102.66,135.61],[92.76,97.94],[102.66,154.44],[102.66,145.02],[102.66,192.11],[92.76,79.11],[92.76,88.52],[92.76,69.69],[191.79,3.77],[221.5,3.77],[221.5,13.19],[231.4,154.44],[221.5,50.85],[152.18,210.94],[231.4,135.61],[221.5,60.27],[221.5,97.94],[221.5,88.52],[221.5,79.11],[231.4,145.02],[241.31,79.11],[241.31,88.52],[241.31,69.69],[241.31,50.85],[241.31,60.27],[231.4,32.02],[231.4,41.44],[241.31,97.94],[231.4,50.85],[231.4,60.27],[211.6,88.52],[241.31,41.44],[211.6,145.02],[211.6,135.61],[211.6,126.19],[211.6,97.94],[211.6,154.44],[201.69,3.77],[211.6,163.86],[221.5,135.61],[211.6,173.28],[201.69,13.19],[221.5,173.28],[211.6,3.77],[221.5,154.44],[221.5,145.02],[211.6,13.19],[211.6,32.02],[211.6,79.11],[211.6,69.69],[211.6,22.6],[221.5,126.19],[271.02,41.44],[271.02,13.19],[241.31,32.02],[271.02,22.6],[271.02,32.02],[271.02,60.27],[271.02,88.52],[271.02,69.69],[261.11,13.19],[271.02,79.11],[280.92,41.44],[261.11,22.6],[280.92,32.02],[280.92,22.6],[290.82,22.6],[290.82,32.02],[280.92,60.27],[280.92,69.69],[280.92,79.11],[280.92,50.85],[280.92,88.52],[271.02,50.85],[251.21,88.52],[251.21,79.11],[251.21,69.69],[251.21,60.27],[251.21,50.85],[251.21,97.94],[241.31,22.6],[251.21,116.77],[251.21,41.44],[261.11,32.02],[251.21,107.36],[261.11,50.85],[261.11,60.27],[251.21,32.02],[261.11,69.69],[261.11,97.94],[251.21,22.6],[261.11,88.52],[261.11,79.11],[201.69,22.6],[162.08,97.94],[162.08,135.61],[162.08,107.36],[162.08,79.11],[162.08,182.69],[162.08,145.02],[162.08,173.28],[162.08,163.86],[162.08,69.69],[162.08,154.44],[162.08,88.52],[171.98,163.86],[171.98,192.11],[171.98,154.44],[171.98,107.36],[201.69,32.02],[162.08,32.02],[162.08,3.77],[162.08,50.85],[171.98,201.53],[171.98,210.94],[152.18,154.44],[152.18,145.02],[171.98,97.94],[152.18,135.61],[152.18,163.86],[152.18,126.19],[152.18,192.11],[152.18,201.53],[152.18,116.77],[152.18,182.69],[152.18,173.28],[152.18,79.11],[152.18,3.77],[152.18,32.02],[162.08,210.94],[162.08,201.53],[152.18,50.85],[152.18,88.52],[152.18,97.94],[152.18,107.36],[162.08,192.11],[171.98,145.02],[191.79,163.86],[191.79,60.27],[191.79,13.19],[191.79,22.6],[191.79,116.77],[191.79,126.19],[171.98,88.52],[201.69,182.69],[191.79,154.44],[191.79,135.61],[191.79,69.69],[201.69,116.77],[201.69,79.11],[201.69,69.69],[201.69,41.44],[201.69,126.19],[201.69,145.02],[201.69,163.86],[201.69,154.44],[201.69,173.28],[201.69,135.61],[191.79,145.02],[171.98,13.19],[171.98,3.77],[191.79,173.28],[181.89,210.94],[181.89,201.53],[181.89,220.36],[171.98,79.11],[171.98,32.02],[171.98,50.85],[171.98,41.44],[181.89,192.11],[191.79,192.11],[191.79,201.53],[181.89,41.44],[181.89,163.86],[191.79,182.69],[181.89,79.11],[181.89,145.02],[181.89,154.44],[181.89,88.52]];

  const MAP_W = 750;
  const MAP_H = 450;
  const SQUARE_SIZE = 12;
  const CORNER_RADIUS = 4;
  const TUNED_SCALE = 1.6;
  const HOVER_RADIUS_BASE = 80;
  const FADE_RINGS = 3;
  const RING_WIDTH_BASE = ((9.9 + 9.42) / 2) * TUNED_SCALE;

  const BASE_COLOR = [222, 222, 222];
  const HOVER_COLOR = [95, 203, 232];

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let mouseX = -9999;
  let mouseY = -9999;

  function lerpColor(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function resize() {
    const rect = section.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    scale = Math.max(rect.width / MAP_W, rect.height / MAP_H);
    offsetX = (rect.width - MAP_W * scale) / 2;
    offsetY = (rect.height - MAP_H * scale) / 2;
    draw();
  }

  function draw() {
    const rect = section.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    const rel = scale / TUNED_SCALE;
    const hoverRadius = HOVER_RADIUS_BASE * rel;
    const fadeWidth = RING_WIDTH_BASE * FADE_RINGS * rel;
    const squareSize = SQUARE_SIZE * rel;
    const cornerRadius = CORNER_RADIUS * rel;

    for (let i = 0; i < DOTS.length; i++) {
      const dx = DOTS[i][0] * scale + offsetX;
      const dy = DOTS[i][1] * scale + offsetY;

      const distX = dx - mouseX;
      const distY = dy - mouseY;
      const dist = Math.sqrt(distX * distX + distY * distY);

      let color = BASE_COLOR;
      if (dist <= hoverRadius) {
        const edgeDist = hoverRadius - dist;
        const t = edgeDist >= fadeWidth ? 1 : edgeDist / fadeWidth;
        color = lerpColor(BASE_COLOR, HOVER_COLOR, t);
      }

      ctx.beginPath();
      ctx.roundRect(dx - squareSize / 2, dy - squareSize / 2, squareSize, squareSize, cornerRadius);
      ctx.fillStyle = `rgb(${color[0] | 0}, ${color[1] | 0}, ${color[2] | 0})`;
      ctx.fill();
    }
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    draw();
  });

  canvas.addEventListener('mouseleave', () => {
    mouseX = -9999;
    mouseY = -9999;
    draw();
  });

  resize();

  let mapResizeTicking = false;
  window.addEventListener('resize', () => {
    if (mapResizeTicking) return;
    mapResizeTicking = true;
    requestAnimationFrame(() => {
      resize();
      mapResizeTicking = false;
    });
  });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initCredibilityMap();
} else {
  window.addEventListener('DOMContentLoaded', initCredibilityMap);
}

// ── Credibility numbers: count up from 0 once the section scrolls into
// view. Eased fast-to-slow (cubic ease-out), fires once via
// IntersectionObserver so re-scrolling past it doesn't replay it.
function initCredibilityCountUp() {
  const values = document.querySelectorAll('.numbers-card__value');
  const section = document.getElementById('credibility');
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

  function checkCountState() {
    const rect = section.getBoundingClientRect();
    const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    const visibleRatio = rect.height > 0 ? Math.max(0, visibleHeight) / rect.height : 0;

    if (!hasCounted && visibleRatio >= 0.4) {
      values.forEach(animateValue);
      hasCounted = true;
    } else if (hasCounted && rect.top > 0) {
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

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initCredibilityCountUp();
} else {
  window.addEventListener('DOMContentLoaded', initCredibilityCountUp);
}

// ── Testimonial laurels: fade + float up once in view ───────────────────
// `.is-hidden` only ever gets added here, right before observing — never in
// plain CSS — so a laurel is always visible by default; if IntersectionObserver
// is unavailable or motion is reduced, this just no-ops and they stay visible.
function initTestimonialLaurels() {
  const laurels = [...document.querySelectorAll('.testimonials__laurel')];
  const section = document.getElementById('trust');
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
          const score = el.querySelector('.testimonials__laurel-score');
          if (score) animateScore(score);
        }, i * STAGGER);
      });
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.3 });

  observer.observe(section);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initTestimonialLaurels();
} else {
  window.addEventListener('DOMContentLoaded', initTestimonialLaurels);
}

// ── Services section: spheres converge-then-drift ────────────────────────
// Both decorative spheres start pulled in to a 100px gap. Once the section
// scrolls into view they ease outward to their resting (bled-off-edge)
// position — fast to slow, one-time. Continuing to scroll through the
// section then drifts them up to 20px further outward, tied to scroll
// progress, for a subtle parallax as the section passes.
function initServicesSpheres() {
  const section = document.getElementById('services');
  const sphereLeft = document.querySelector('.services__sphere--wire');
  const sphereRight = document.querySelector('.services__sphere--color');
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

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initServicesSpheres();
} else {
  window.addEventListener('DOMContentLoaded', initServicesSpheres);
}

// ── Testimonials marquee: scroll-coupled direction and speed ─────────────
// Idle, it drifts left-to-right at a fixed pace. Scrolling the page down
// pushes it faster in that same direction; scrolling up reverses it to
// right-to-left, with the reversal's speed matching how fast the page is
// being scrolled. It never stops — the content is duplicated once and the
// offset wraps with modulo math, so the loop is seamless in both
// directions regardless of how it's currently moving.
function initTestimonialsMarquee() {
  const track = document.querySelector('.testimonials__track');
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

  let lastFrameTime = performance.now();
  function frame(now) {
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    velocityBoost *= Math.exp(-dt / DECAY_TAU);

    const speed = baseSpeed + velocityBoost;
    offset += speed * dt;

    if (setWidth > 0) {
      offset = (((offset % setWidth) + setWidth) % setWidth) - setWidth;
    }

    track.style.transform = `translateX(${offset}px)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initTestimonialsMarquee();
} else {
  window.addEventListener('DOMContentLoaded', initTestimonialsMarquee);
}

// ── Expertise intro: kinetic typography reveal ───────────────────────────
// Splits the existing "Expertise" heading into characters and the lead
// paragraph into words, purely for animation — the text content, layout,
// font, and final appearance are untouched. A small blue block sweeps over
// each unit and it's revealed once fully covered, then the block exits.
// Heading finishes fully before the paragraph starts; within the
// paragraph, each wrapped line finishes before the next line begins.
// Skipped entirely under prefers-reduced-motion, leaving plain static text.
function initExpertiseKinetic() {
  const heading = document.querySelector('.expertise__heading');
  const lead = document.querySelector('.expertise__lead');
  const intro = document.querySelector('.expertise__intro');
  if (!heading || !lead || !intro) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof IntersectionObserver === 'undefined') return;

  // Explicit start times (from the moment the reveal triggers), not a
  // formula — heading starts immediately, the two lines follow at fixed
  // offsets regardless of how long the heading or line 1 take to finish.
  const LINE_DELAYS = [0.06, 0.9];
  const HEADING_DURATION = 0.42;
  const LINE_SWEEP_DURATION = 0.75;

  const headingText = heading.textContent;
  heading.textContent = '';
  heading.setAttribute('aria-label', headingText);
  const headingOuter = document.createElement('span');
  headingOuter.className = 'kl';
  headingOuter.setAttribute('aria-hidden', 'true');
  headingOuter.style.setProperty('--kd', '0s');
  headingOuter.style.setProperty('--kdur', `${HEADING_DURATION}s`);
  const headingInner = document.createElement('span');
  headingInner.className = 'kl__text';
  headingInner.textContent = headingText;
  const headingBlock = document.createElement('span');
  headingBlock.className = 'kl__block';
  headingOuter.append(headingInner, headingBlock);
  heading.appendChild(headingOuter);

  const leadText = lead.textContent;
  lead.setAttribute('aria-label', leadText);
  const words = leadText.split(/\s+/).filter(Boolean);

  // One block per wrapped line, not per word — group words by their
  // rendered line (measured with plain inline-block probe spans), then
  // rebuild the paragraph as one .kl wrapper per line, joined with
  // explicit <br>s so the line breaks stay exactly where they were
  // measured.
  function buildLines() {
    lead.textContent = '';
    const probes = words.map((word, i) => {
      const span = document.createElement('span');
      span.style.display = 'inline-block';
      span.textContent = word;
      lead.appendChild(span);
      if (i < words.length - 1) lead.appendChild(document.createTextNode(' '));
      return span;
    });

    const lineGroups = [];
    let lastTop = null;
    probes.forEach((span, i) => {
      const top = span.offsetTop;
      if (lastTop === null || Math.abs(top - lastTop) > 2) {
        lineGroups.push([]);
        lastTop = top;
      }
      lineGroups[lineGroups.length - 1].push(words[i]);
    });

    lead.textContent = '';
    return lineGroups.map((lineWords, i) => {
      const outer = document.createElement('span');
      outer.className = 'kl';
      outer.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      inner.className = 'kl__text';
      inner.textContent = lineWords.join(' ');
      const block = document.createElement('span');
      block.className = 'kl__block';
      outer.append(inner, block);
      lead.appendChild(outer);
      if (i < lineGroups.length - 1) lead.appendChild(document.createElement('br'));
      return outer;
    });
  }

  let lineEls = buildLines();

  function assignLineDelays() {
    lineEls = buildLines();
    lineEls.forEach((el, i) => {
      const delay = i < LINE_DELAYS.length ? LINE_DELAYS[i] : LINE_DELAYS[LINE_DELAYS.length - 1] + (i - LINE_DELAYS.length + 1) * 0.06;
      el.style.setProperty('--kd', `${delay}s`);
      el.style.setProperty('--kdur', `${LINE_SWEEP_DURATION}s`);
    });
  }
  assignLineDelays();

  // Re-measure once web fonts finish loading — an earlier measurement taken
  // against the fallback font can group words into the wrong line if the
  // real typeface swaps in wider or narrower and reflows the wrap.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (!intro.classList.contains('is-revealing')) assignLineDelays();
    });
  }

  let resizeTicking = false;
  window.addEventListener('resize', () => {
    if (intro.classList.contains('is-revealing') || resizeTicking) return;
    resizeTicking = true;
    requestAnimationFrame(() => {
      assignLineDelays();
      resizeTicking = false;
    });
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      const start = () => intro.classList.add('is-revealing');
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          assignLineDelays();
          start();
        });
      } else {
        start();
      }
    });
  }, { threshold: 0.3 });
  observer.observe(intro);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initExpertiseKinetic();
} else {
  window.addEventListener('DOMContentLoaded', initExpertiseKinetic);
}

