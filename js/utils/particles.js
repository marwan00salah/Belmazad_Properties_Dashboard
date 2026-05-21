// Shared particles.js config for the homepage-style background (used by
// the admin landing AND the AI Agents area, AGENT-07). Lifecycle is now
// driven from main.js's render() loop — the particles canvas lives at the
// body level so it persists across full route-view re-renders (which used
// to destroy + re-init it on every setState, causing visible thrash and
// the "background goes crazy" effect during chat sends).
//
// particles.js itself is loaded via a <script> tag in index.html; this
// module just provides the config + a destroy helper that walks the
// global pJSDom registry. main.js owns mounting/unmounting.

export const PARTICLES_CONFIG = {
  particles: {
    number: { value: 200, density: { enable: true, value_area: 962 } },
    color: { value: "#4f46e5" },
    shape: { type: "circle", stroke: { width: 0, color: "#000000" }, polygon: { nb_sides: 8 }, image: { src: "img/github.svg", width: 100, height: 100 } },
    opacity: { value: 0.5, random: true, anim: { enable: false, speed: 1, opacity_min: 0.1, sync: false } },
    size: { value: 1, random: true, anim: { enable: false, speed: 9.744926547616142, size_min: 0.1, sync: false } },
    line_linked: { enable: true, distance: 150, color: "#a5b4fc", opacity: 0.4, width: 1 },
    move: { enable: true, speed: 6, direction: "none", random: false, straight: false, out_mode: "out", bounce: false, attract: { enable: false, rotateX: 600, rotateY: 1200 } },
  },
  interactivity: {
    detect_on: "window",
    events: { onhover: { enable: true, mode: "repulse" }, onclick: { enable: true, mode: "bubble" }, resize: true },
    modes: {
      grab: { distance: 633.4202255950493, line_linked: { opacity: 1 } },
      bubble: { distance: 400, size: 5, duration: 0.2, opacity: 0.14385614385614387, speed: 3 },
      repulse: { distance: 160, duration: 0.4 },
      push: { particles_nb: 4 },
      remove: { particles_nb: 2 },
    },
  },
  retina_detect: true,
};

export function destroyParticles() {
  if (!window.pJSDom || !window.pJSDom.length) return;
  try {
    window.pJSDom.forEach((dom) => {
      if (dom && dom.pJS && dom.pJS.fn && dom.pJS.fn.vendors &&
          typeof dom.pJS.fn.vendors.destroypJS === "function") {
        dom.pJS.fn.vendors.destroypJS();
      }
    });
  } catch (_) { /* best-effort */ }
  window.pJSDom = [];
}
