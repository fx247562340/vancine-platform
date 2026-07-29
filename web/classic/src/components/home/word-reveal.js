/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/**
 * Pure helpers for HeroSection WordReveal.
 *
 * Kept as plain JS so Node's test runner can lock the language-switch
 * regression without importing JSX / framer-motion.
 */

/** Per-word stagger step used on first-mount entrance only. */
export const WORD_STAGGER = 0.06;

/**
 * Describe how one headline segment should be rendered so spacing survives.
 *
 * - Word segments → `display: inline-block` (so transforms apply).
 * - Whitespace segments → `white-space: pre-wrap` on an inline span: the space
 *   keeps its width (not collapsed) AND remains a legal line-break point, so
 *   long headlines still wrap on narrow viewports (unlike a bare NBSP).
 *
 * @param {string} word
 * @returns {{
 *   text: string,
 *   isWhitespace: boolean,
 *   style: Record<string, string>,
 *   animateWhitespace: boolean,
 * }}
 */
export function describeWordSegment(word) {
  const text = typeof word === 'string' ? word : '';
  const isWhitespace = text.length > 0 && text.trim() === '';
  if (isWhitespace) {
    return {
      text,
      isWhitespace: true,
      style: { whiteSpace: 'pre-wrap' },
      // Whitespace is an inline span (no transform animation needed).
      animateWhitespace: false,
    };
  }
  return {
    text,
    isWhitespace: false,
    style: { display: 'inline-block' },
    animateWhitespace: false,
  };
}

/**
 * Split headline text into word/space segments for staggered reveal.
 * Preserves whitespace tokens so layout matches the original string.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitHeadlineWords(text) {
  return String(text ?? '').split(/(\s+)/);
}

/**
 * Build framer-motion props for one headline segment.
 *
 * @param {object} opts
 * @param {number} opts.index - segment index (drives stagger on entrance)
 * @param {number} [opts.baseDelay=0] - base delay before first word
 * @param {number} [opts.duration=0.4] - entrance duration
 * @param {'entrance'|'instant'} opts.mode
 *   - `entrance`: first mount only — opacity/y reveal with stagger
 *   - `instant`: language switch / post-mount text change — fully visible,
 *     no delay, no opacity:0 initial (new segments must not re-animate)
 * @param {boolean} [opts.reducedMotion=false] - force instant when true
 * @returns {{
 *   initial: false | { opacity: number, y: number },
 *   animate: { opacity: number, y: number },
 *   transition: { duration: number, delay: number, ease?: number[] },
 * }}
 */
export function buildWordRevealMotion({
  index,
  baseDelay = 0,
  duration = 0.4,
  mode,
  reducedMotion = false,
}) {
  const animate = { opacity: 1, y: 0 };

  // Post-mount language switches (and reduced-motion) must never re-run the
  // staggered entrance — newly mounted segments would otherwise appear late.
  if (mode === 'instant' || reducedMotion) {
    return {
      initial: false,
      animate,
      transition: { duration: 0, delay: 0 },
    };
  }

  return {
    initial: { opacity: 0, y: 24 },
    animate,
    transition: {
      duration,
      delay: baseDelay + index * WORD_STAGGER,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  };
}

/**
 * Resolve motion mode for a WordReveal instance.
 *
 * @param {boolean} hasCompletedEntrance - true after entrance is done / sticky instant
 * @returns {'entrance'|'instant'}
 */
export function resolveWordRevealMode(hasCompletedEntrance) {
  return hasCompletedEntrance ? 'instant' : 'entrance';
}

/**
 * Derive motion mode during render from committed refs + sticky state.
 *
 * READ-ONLY inputs only — callers must not write refs while calling this.
 * On a post-mount text change, returns `instant` in the SAME commit (before
 * any effect runs), so language switches never flash entrance stagger.
 *
 * @param {object} opts
 * @param {boolean} opts.hasMounted - hasMountedRef.current (last committed)
 * @param {string} opts.previousText - previousTextRef.current (last committed)
 * @param {string} opts.text - current text prop
 * @param {boolean} opts.hasCompletedEntrance - sticky state after real text change
 * @returns {'entrance'|'instant'}
 */
export function deriveWordRevealMode({
  hasMounted,
  previousText,
  text,
  hasCompletedEntrance,
}) {
  const isPostMountTextChange = hasMounted && previousText !== text;
  return resolveWordRevealMode(hasCompletedEntrance || isPostMountTextChange);
}

/**
 * Whether the post-commit effect should flip sticky instant state.
 *
 * First mount must return false (no setState — would cut entrance short).
 * Only a real post-mount text change requests the sticky update.
 *
 * @param {object} opts
 * @param {boolean} opts.hasMounted - value BEFORE this effect updates the ref
 * @param {string} opts.previousText - value BEFORE this effect updates the ref
 * @param {string} opts.text - current text prop
 * @param {boolean} opts.hasCompletedEntrance - current sticky state
 * @returns {boolean}
 */
export function shouldStickWordRevealInstant({
  hasMounted,
  previousText,
  text,
  hasCompletedEntrance,
}) {
  if (hasCompletedEntrance) return false;
  return hasMounted && previousText !== text;
}
