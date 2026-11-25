/**
 * The feel of the house.
 *
 * Every number that shapes how it *feels* to move through the page lives here,
 * so the whole motion language can be re-tuned from one file.
 *
 * The target is a heavy, oiled glide: the page keeps travelling after the wheel
 * stops, then settles without ever bouncing back. Nothing below is a physical
 * spring — a spring overshoots, and overshoot reads as "toy". A long exponential
 * decay reads as expensive, because it is how heavy things actually come to rest.
 *
 * NOTE: `ReactLenis` serialises its options with `JSON.stringify` to decide when
 * to rebuild the instance. Everything here must therefore be a stable, plain
 * value, and the module must never export a freshly-built object per call.
 */

/**
 * Exponential ease-out — quick pickup, very long tail, never overshoots.
 * @param {number} t normalised time, 0 → 1
 * @returns {number} normalised progress, 0 → 1
 */
export const glideEasing = (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))

/** The default curve is exponential-out; this matches it in CSS form. */
export const GLIDE_CURVE = 'cubic-bezier(0.16, 1, 0.3, 1)'

/**
 * Lenis options. `autoRaf` lets Lenis own the frame loop, which is what keeps
 * the smoothing locked to the display refresh rate rather than to scroll events.
 */
export const LENIS_OPTIONS = {
  /** Seconds for a full settle after the input stops. Long = the "rubber" tail. */
  duration: 1.45,
  easing: glideEasing,
  smoothWheel: true,
  /** Below 1 makes each wheel notch advance less, so the glide carries further. */
  wheelMultiplier: 0.9,
  /** Touch is left native-feeling but slightly amplified on release. */
  touchMultiplier: 1.5,
  /** Native momentum on touch devices beats anything we synthesise. */
  syncTouch: false,
  /** Lenis drives its own requestAnimationFrame loop. */
  autoRaf: true,
}

/** Reveal-on-enter timing, shared by CSS and the <Reveal> component. */
export const REVEAL = {
  /** Travel distance in px. Shallower than it sounds — weight comes from duration. */
  distance: 28,
  /** Milliseconds. Deliberately slow; this is the single biggest "expensive" cue. */
  duration: 1100,
  /** Extra delay per index when revealing a group. */
  stagger: 90,
  /**
   * The viewport is shrunk by 10% at the bottom, so an element reveals once its
   * top edge has crossed into the lower tenth rather than the instant it appears.
   *
   * This is expressed as a rootMargin rather than a `threshold` on purpose: a
   * percentage threshold is measured against the *element's* height, so a section
   * taller than the viewport could never satisfy it and would stay invisible
   * forever. A margin against the viewport works at any element height.
   */
  rootMargin: '0px 0px -10% 0px',
}

/** How far a parallax layer drifts relative to the page. 0 = pinned, 1 = page speed. */
export const PARALLAX = {
  /** The hero flacon plate. */
  hero: 0.14,
  /** Decorative background washes. */
  ambient: 0.22,
}
