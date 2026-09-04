/*!
 * Silk animated background — vanilla JS port of React Bits <Silk />
 * No dependencies. WebGL 1. Drop-in for Webflow / any site.
 *
 * Usage:
 *   <div data-silk
 *        data-silk-color="#6a6e79"
 *        data-silk-speed="0.7"
 *        data-silk-scale="1"
 *        data-silk-noise="1.5"
 *        data-silk-rotation="2.7">
 *     ... your section content ...
 *   </div>
 *   <script src="silk-background.js" defer></script>
 *
 * The script injects a <canvas class="silk-canvas"> as the first child of the
 * host element and keeps it sized to the host. Put your content at z-index >= 1.
 *
 * Runtime API (per element):  el.__silk.set({ color, speed, scale, noise, rotation })
 *                             el.__silk.stop() / el.__silk.start() / el.__silk.destroy()
 * Global:                     Silk.init(root?)  — (re)scan for [data-silk] elements
 */
(function () {
  "use strict";

  var VERT = [
    "attribute vec2 position;",
    "attribute vec2 uv;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = uv;",
    "  gl_Position = vec4(position, 0.0, 1.0);",
    "}"
  ].join("\n");

  // Fragment shader — identical maths to the React Bits component.
  var FRAG = [
    "precision highp float;",
    "varying vec2 vUv;",
    "uniform float uTime;",
    "uniform vec3  uColor;",
    "uniform float uSpeed;",
    "uniform float uScale;",
    "uniform float uRotation;",
    "uniform float uNoiseIntensity;",
    "const float e = 2.71828182845904523536;",
    "float noise(vec2 texCoord) {",
    "  float G = e;",
    "  vec2  r = (G * sin(G * texCoord));",
    "  return fract(r.x * r.y * (1.0 + texCoord.x));",
    "}",
    "vec2 rotateUvs(vec2 uv, float angle) {",
    "  float c = cos(angle);",
    "  float s = sin(angle);",
    "  mat2  rot = mat2(c, -s, s, c);",
    "  return rot * uv;",
    "}",
    "void main() {",
    "  float rnd     = noise(gl_FragCoord.xy);",
    "  vec2  uv      = rotateUvs(vUv * uScale, uRotation);",
    "  vec2  tex     = uv * uScale;",
    "  float tOffset = uSpeed * uTime;",
    "  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);",
    "  float pattern = 0.6 +",
    "      0.4 * sin(5.0 * (tex.x + tex.y +",
    "                       cos(3.0 * tex.x + 5.0 * tex.y) +",
    "                       0.02 * tOffset) +",
    "                sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));",
    "  vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;",
    "  col.a = 1.0;",
    "  gl_FragColor = col;",
    "}"
  ].join("\n");

  var DEFAULT_RGB = [0.482, 0.455, 0.475]; // #7B7481, the component's default

  function hexToRGB(hex) {
    hex = String(hex == null ? "" : hex).replace("#", "").trim();
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) return DEFAULT_RGB.slice();
    var int = parseInt(hex, 16);
    return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
  }

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      if (window.console) console.error("[Silk] shader compile failed:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function initOne(host, overrides) {
    if (!host || host.__silkInit) return;
    host.__silkInit = true;
    overrides = overrides || {};

    function pick(key, name, def) {
      if (overrides[key] != null) return overrides[key];
      if (key === "color") return host.getAttribute(name) || def;
      var v = parseFloat(host.getAttribute(name));
      return isFinite(v) ? v : def;
    }

    var opts = {
      speed: pick("speed", "data-silk-speed", 5),
      scale: pick("scale", "data-silk-scale", 1),
      rotation: pick("rotation", "data-silk-rotation", 0),
      noise: pick("noise", "data-silk-noise", 1.5),
      color: pick("color", "data-silk-color", "#7B7481")
    };

    // Host must be a positioning context so the canvas can fill it.
    if (getComputedStyle(host).position === "static") host.style.position = "relative";

    var canvas = document.createElement("canvas");
    canvas.className = "silk-canvas";
    canvas.setAttribute("aria-hidden", "true");
    var cs = canvas.style;
    cs.position = "absolute";
    cs.top = "0";
    cs.left = "0";
    cs.width = "100%";
    cs.height = "100%";
    cs.display = "block";
    cs.pointerEvents = "none";
    cs.zIndex = "0";
    host.insertBefore(canvas, host.firstChild);

    var gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false }) ||
             canvas.getContext("experimental-webgl");
    if (!gl) {
      host.__silkFailed = true;
      if (window.console) console.warn("[Silk] WebGL unavailable — background disabled.");
      return;
    }

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { host.__silkFailed = true; return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (window.console) console.error("[Silk] program link failed:", gl.getProgramInfoLog(prog));
      host.__silkFailed = true;
      return;
    }
    gl.useProgram(prog);

    // Fullscreen triangle: position (clip space) + uv (0..2), interleaved.
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 0,
       3, -1, 2, 0,
      -1,  3, 0, 2
    ]), gl.STATIC_DRAW);

    var aPos = gl.getAttribLocation(prog, "position");
    var aUv = gl.getAttribLocation(prog, "uv");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

    var uTime = gl.getUniformLocation(prog, "uTime");
    var uColor = gl.getUniformLocation(prog, "uColor");
    var uSpeed = gl.getUniformLocation(prog, "uSpeed");
    var uScale = gl.getUniformLocation(prog, "uScale");
    var uRotation = gl.getUniformLocation(prog, "uRotation");
    var uNoise = gl.getUniformLocation(prog, "uNoiseIntensity");

    (function applyColor(c) { var r = hexToRGB(c); gl.uniform3f(uColor, r[0], r[1], r[2]); })(opts.color);
    gl.uniform1f(uSpeed, opts.speed);
    gl.uniform1f(uScale, opts.scale);
    gl.uniform1f(uRotation, opts.rotation);
    gl.uniform1f(uNoise, opts.noise);
    gl.uniform1f(uTime, 0);

    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      var w = Math.max(1, host.clientWidth);
      var h = Math.max(1, host.clientHeight);
      var pw = Math.round(w * dpr);
      var ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        gl.viewport(0, 0, pw, ph);
      }
    }
    resize();

    var running = false;
    var destroyed = false;
    var rafId = 0;
    var t0 = 0;

    function draw(seconds) {
      gl.uniform1f(uTime, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function loop(now) {
      if (!running) return;
      if (!t0) t0 = now;
      draw((now - t0) * 0.001);
      rafId = requestAnimationFrame(loop);
    }
    function start() {
      if (running || destroyed || host.__silkFailed) return;
      running = true;
      t0 = 0;
      rafId = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }
    function renderStatic() {
      resize();
      draw(2.0);
    }

    var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    var reduceMotion = !!(mq && mq.matches);

    function wake() {
      if (destroyed || host.__silkFailed) return;
      if (reduceMotion) renderStatic();
      else start();
    }

    // Keep sized to the host.
    var ro = null;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(function () {
        resize();
        if (!running) renderStatic();
      });
      ro.observe(host);
    } else {
      window.addEventListener("resize", function () {
        resize();
        if (!running) renderStatic();
      });
    }

    // Only animate while the section is on screen.
    var io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) wake();
          else stop();
        }
      }, { threshold: 0 });
      io.observe(host);
    } else {
      wake();
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else {
        var r = host.getBoundingClientRect();
        var vh = window.innerHeight || document.documentElement.clientHeight;
        if (r.bottom > 0 && r.top < vh) wake();
      }
    });

    if (mq) {
      var onMq = function () {
        reduceMotion = mq.matches;
        if (reduceMotion) { stop(); renderStatic(); }
        else start();
      };
      if (mq.addEventListener) mq.addEventListener("change", onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }

    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      stop();
      if (window.console) console.warn("[Silk] WebGL context lost.");
    }, false);

    host.__silk = {
      start: start,
      stop: stop,
      resize: resize,
      set: function (o) {
        o = o || {};
        if (o.color != null) { var r = hexToRGB(o.color); gl.uniform3f(uColor, r[0], r[1], r[2]); }
        if (o.speed != null) gl.uniform1f(uSpeed, +o.speed);
        if (o.scale != null) gl.uniform1f(uScale, +o.scale);
        if (o.rotation != null) gl.uniform1f(uRotation, +o.rotation);
        if (o.noise != null) gl.uniform1f(uNoise, +o.noise);
        if (!running) renderStatic();
      },
      destroy: function () {
        destroyed = true;
        stop();
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        host.__silkInit = false;
        host.__silk = null;
      }
    };
  }

  function initAll(root) {
    var nodes = (root || document).querySelectorAll("[data-silk]");
    for (var i = 0; i < nodes.length; i++) initOne(nodes[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { initAll(); });
  } else {
    initAll();
  }

  window.Silk = { init: initAll, initOne: initOne };
})();
