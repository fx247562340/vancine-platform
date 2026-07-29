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
// Run with: node --test src/components/home/word-reveal.test.js
//
// RED → GREEN regression for Hero WordReveal language-switch lag.
// Locks the real bug: when text gains more whitespace-split segments after
// mount (zh→en/fr/vi), newly mounted spans must NOT inherit entrance
// opacity:0 + stagger delay.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WORD_STAGGER,
  splitHeadlineWords,
  buildWordRevealMotion,
  resolveWordRevealMode,
  deriveWordRevealMode,
  shouldStickWordRevealInstant,
  describeWordSegment,
} from './word-reveal.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Representative headline strings (same keys as HeroSection i18n). */
const HEADLINES = {
  zh: '无限创意',
  en: 'Infinite Creativity',
  fr: 'Créativité Infinie',
  // Vietnamese tends to expand into many short tokens
  vi: 'Sáng tạo vô hạn',
  ja: '無限の創造性',
  ru: 'Бесконечное творчество',
};

function isImmediatelyVisible(motion) {
  // framer-motion: initial=false skips enter animation (starts at animate).
  if (motion.initial === false) return true;
  if (
    motion.initial &&
    motion.initial.opacity === 1 &&
    motion.initial.y === 0
  ) {
    return true;
  }
  return false;
}

function hasEntranceHiddenInitial(motion) {
  return (
    motion.initial &&
    motion.initial.opacity === 0 &&
    typeof motion.initial.y === 'number' &&
    motion.initial.y > 0
  );
}

describe('splitHeadlineWords — language token shapes that trigger the bug', () => {
  test('zh is a single non-space segment (no stagger surface)', () => {
    const segs = splitHeadlineWords(HEADLINES.zh);
    const nonSpace = segs.filter((s) => s.trim().length > 0);
    assert.equal(nonSpace.length, 1);
  });

  test('en/fr expand to multiple non-space segments', () => {
    for (const lang of ['en', 'fr']) {
      const nonSpace = splitHeadlineWords(HEADLINES[lang]).filter(
        (s) => s.trim().length > 0,
      );
      assert.ok(
        nonSpace.length >= 2,
        `${lang} must split into ≥2 words (got ${nonSpace.length})`,
      );
    }
  });

  test('vi expands further than en (more new spans on zh→vi)', () => {
    const enCount = splitHeadlineWords(HEADLINES.en).length;
    const viCount = splitHeadlineWords(HEADLINES.vi).length;
    assert.ok(
      viCount > enCount,
      `vi segment count (${viCount}) should exceed en (${enCount})`,
    );
  });

  test('preserves whitespace tokens so layout matches source text', () => {
    const segs = splitHeadlineWords('Infinite Creativity');
    assert.deepEqual(segs, ['Infinite', ' ', 'Creativity']);
  });

  test('handles empty / null-ish input without throwing', () => {
    assert.deepEqual(splitHeadlineWords(''), ['']);
    assert.deepEqual(splitHeadlineWords(null), ['']);
    assert.deepEqual(splitHeadlineWords(undefined), ['']);
  });
});

describe('describeWordSegment — visible, wrappable inter-word spacing', () => {
  /**
   * The regression: a lone regular space inside a `display: inline-block`
   * span collapses to zero width, fusing words ("China’sfrontierAImodels.").
   * A whitespace segment must render with a collapse-resistant style while
   * still allowing the headline to wrap on narrow viewports.
   */
  function preservesVisibleSpace(d) {
    return (
      (d.style &&
        typeof d.style.whiteSpace === 'string' &&
        /pre/.test(d.style.whiteSpace)) ||
      (typeof d.text === 'string' && d.text.includes(' '))
    );
  }

  test('whitespace segment preserves a visible space (pre-wrap or NBSP)', () => {
    const d = describeWordSegment(' ');
    assert.equal(d.isWhitespace, true);
    assert.ok(
      preservesVisibleSpace(d),
      `whitespace must not collapse to zero width; got ${JSON.stringify(d)}`,
    );
  });

  test('whitespace segment stays wrappable (not a lone inline-block)', () => {
    const d = describeWordSegment(' ');
    // A lone inline-block span with only an NBSP would forbid line breaks and
    // overflow narrow screens; whitespace must remain a break opportunity.
    assert.equal(
      d.style.display,
      undefined,
      'whitespace span must not be forced to inline-block',
    );
  });

  test('word segments stay inline-block (transform animation applies)', () => {
    for (const w of ['China’s', 'frontier', 'models.']) {
      const d = describeWordSegment(w);
      assert.equal(d.isWhitespace, false);
      assert.equal(d.style.display, 'inline-block');
    }
  });

  test('reconstructing the H1 from segments keeps spaces between words', () => {
    const line = 'China’s frontier AI models.';
    const joined = splitHeadlineWords(line)
      .map((s) => describeWordSegment(s).text)
      .join('');
    assert.equal(joined, line);
  });
});

describe('resolveWordRevealMode', () => {
  test('first mount → entrance; after entrance completes → instant', () => {
    assert.equal(resolveWordRevealMode(false), 'entrance');
    assert.equal(resolveWordRevealMode(true), 'instant');
  });
});

describe('deriveWordRevealMode — pure render-time derivation (no ref writes)', () => {
  test('first mount (hasMounted=false) stays entrance even if text equals previous', () => {
    assert.equal(
      deriveWordRevealMode({
        hasMounted: false,
        previousText: HEADLINES.zh,
        text: HEADLINES.zh,
        hasCompletedEntrance: false,
      }),
      'entrance',
    );
  });

  test('current text-change render is instant BEFORE sticky state flips', () => {
    // Simulates the SAME commit where text just changed: refs still hold the
    // last committed snapshot, sticky state is still false. Mode must already
    // be instant so newly mounted spans never inherit entrance opacity:0.
    assert.equal(
      deriveWordRevealMode({
        hasMounted: true,
        previousText: HEADLINES.zh,
        text: HEADLINES.en,
        hasCompletedEntrance: false,
      }),
      'instant',
    );
  });

  test('switch-back to initial language stays instant once sticky is true', () => {
    assert.equal(
      deriveWordRevealMode({
        hasMounted: true,
        previousText: HEADLINES.en,
        text: HEADLINES.zh,
        hasCompletedEntrance: true,
      }),
      'instant',
    );
  });

  test('sticky instant wins even when previousText accidentally equals text', () => {
    assert.equal(
      deriveWordRevealMode({
        hasMounted: true,
        previousText: HEADLINES.zh,
        text: HEADLINES.zh,
        hasCompletedEntrance: true,
      }),
      'instant',
    );
  });

  test('post-mount same-text re-render without sticky stays entrance', () => {
    // Parent re-render with identical text must not flip to instant.
    assert.equal(
      deriveWordRevealMode({
        hasMounted: true,
        previousText: HEADLINES.zh,
        text: HEADLINES.zh,
        hasCompletedEntrance: false,
      }),
      'entrance',
    );
  });
});

describe('shouldStickWordRevealInstant — effect gate (no first-mount setState)', () => {
  test('first mount never requests sticky flip', () => {
    assert.equal(
      shouldStickWordRevealInstant({
        hasMounted: false,
        previousText: HEADLINES.zh,
        text: HEADLINES.zh,
        hasCompletedEntrance: false,
      }),
      false,
    );
  });

  test('post-mount text change requests sticky flip once', () => {
    assert.equal(
      shouldStickWordRevealInstant({
        hasMounted: true,
        previousText: HEADLINES.zh,
        text: HEADLINES.en,
        hasCompletedEntrance: false,
      }),
      true,
    );
  });

  test('already sticky never re-requests flip', () => {
    assert.equal(
      shouldStickWordRevealInstant({
        hasMounted: true,
        previousText: HEADLINES.en,
        text: HEADLINES.zh,
        hasCompletedEntrance: true,
      }),
      false,
    );
  });

  test('post-mount same text does not flip', () => {
    assert.equal(
      shouldStickWordRevealInstant({
        hasMounted: true,
        previousText: HEADLINES.zh,
        text: HEADLINES.zh,
        hasCompletedEntrance: false,
      }),
      false,
    );
  });
});

/**
 * Lifecycle simulation locking the full WordReveal contract without JSX:
 * 1. first mount render → entrance, effect → no setState
 * 2. text-change render → instant in SAME commit (before effect)
 * 3. effect after text change → sticky flip
 * 4. switch back to initial text → still instant
 */
describe('WordReveal lifecycle simulation — mount / text-change / switch-back', () => {
  function simulateLifecycle(sequence) {
    let hasMounted = false;
    let previousText = sequence[0];
    let hasCompletedEntrance = false;
    const modes = [];
    const stickyFlips = [];

    for (let i = 0; i < sequence.length; i++) {
      const text = sequence[i];
      // RENDER (read-only)
      const mode = deriveWordRevealMode({
        hasMounted,
        previousText,
        text,
        hasCompletedEntrance,
      });
      modes.push(mode);

      // EFFECT (writes refs + maybe sticky)
      const shouldStick = shouldStickWordRevealInstant({
        hasMounted,
        previousText,
        text,
        hasCompletedEntrance,
      });
      hasMounted = true;
      previousText = text;
      if (shouldStick) {
        hasCompletedEntrance = true;
        stickyFlips.push(i);
        // Sticky re-render after setState — same text, mode stays instant.
        modes.push(
          deriveWordRevealMode({
            hasMounted,
            previousText,
            text,
            hasCompletedEntrance,
          }),
        );
      }
    }

    return { modes, stickyFlips, hasCompletedEntrance };
  }

  test('first mount has no sticky flip and uses entrance', () => {
    const { modes, stickyFlips } = simulateLifecycle([HEADLINES.zh]);
    assert.deepEqual(stickyFlips, []);
    assert.equal(modes[0], 'entrance');
  });

  test('zh→en text-change render is instant; sticky flips once after commit', () => {
    const { modes, stickyFlips, hasCompletedEntrance } = simulateLifecycle([
      HEADLINES.zh,
      HEADLINES.en,
    ]);
    // modes[0] first mount entrance; modes[1] text-change instant; modes[2] sticky re-render
    assert.equal(modes[0], 'entrance');
    assert.equal(modes[1], 'instant');
    assert.equal(modes[2], 'instant');
    assert.deepEqual(stickyFlips, [1]);
    assert.equal(hasCompletedEntrance, true);
  });

  test('switch back to initial language stays instant (no entrance revival)', () => {
    const { modes, stickyFlips } = simulateLifecycle([
      HEADLINES.zh,
      HEADLINES.en,
      HEADLINES.zh,
    ]);
    // Index 0: mount entrance
    // Index 1: zh→en instant (+ sticky re-render)
    // Final step: en→zh still instant, no extra sticky flip
    assert.equal(modes[0], 'entrance');
    assert.ok(modes.slice(1).every((m) => m === 'instant'));
    assert.deepEqual(stickyFlips, [1]);
  });

  test('round-trip zh→en→fr→zh all post-mount commits are instant', () => {
    const { modes, stickyFlips } = simulateLifecycle([
      HEADLINES.zh,
      HEADLINES.en,
      HEADLINES.fr,
      HEADLINES.zh,
    ]);
    assert.equal(modes[0], 'entrance');
    assert.ok(
      modes.slice(1).every((m) => m === 'instant'),
      `expected all post-mount modes instant, got ${JSON.stringify(modes)}`,
    );
    assert.deepEqual(stickyFlips, [1]);
  });
});

describe('buildWordRevealMotion — first-mount entrance (must keep stagger)', () => {
  test('segment 0 starts hidden with baseDelay only', () => {
    const m = buildWordRevealMotion({
      index: 0,
      baseDelay: 0.8,
      duration: 0.45,
      mode: 'entrance',
    });
    assert.ok(hasEntranceHiddenInitial(m), 'entrance must start opacity:0');
    assert.deepEqual(m.animate, { opacity: 1, y: 0 });
    assert.equal(m.transition.delay, 0.8);
    assert.equal(m.transition.duration, 0.45);
  });

  test('later segments stagger by WORD_STAGGER', () => {
    const baseDelay = 0.8;
    for (const i of [1, 2, 6]) {
      const m = buildWordRevealMotion({
        index: i,
        baseDelay,
        duration: 0.45,
        mode: 'entrance',
      });
      assert.ok(hasEntranceHiddenInitial(m));
      assert.equal(m.transition.delay, baseDelay + i * WORD_STAGGER);
    }
  });

  test('Hero Infinite Creativity line: en index 2 delay is 0.8 + 2*0.06', () => {
    // Mirrors HeroSection: delay={0.8} duration={0.45} on second WordReveal
    const segs = splitHeadlineWords(HEADLINES.en);
    assert.ok(segs.length >= 3, 'en must produce index 2');
    const m = buildWordRevealMotion({
      index: 2,
      baseDelay: 0.8,
      duration: 0.45,
      mode: 'entrance',
    });
    assert.equal(m.transition.delay, 0.92);
    assert.ok(hasEntranceHiddenInitial(m));
  });
});

describe('buildWordRevealMotion — language switch (the regression)', () => {
  /**
   * Simulate the exact bug pattern:
   * 1. Component mounted with zh (1 segment) under entrance mode.
   * 2. Language flips to en/fr/vi → more segments mount.
   * 3. Mode must be instant for EVERY segment, including newly added ones.
   */
  function assertLanguageSwitchInstant(fromLang, toLang, baseDelay = 0.8) {
    assert.equal(resolveWordRevealMode(true), 'instant');

    const toSegs = splitHeadlineWords(HEADLINES[toLang]);
    const fromSegs = splitHeadlineWords(HEADLINES[fromLang]);
    assert.ok(
      toSegs.length !== fromSegs.length || toLang !== fromLang,
      'fixture must change text shape or language',
    );

    const motions = toSegs.map((_, index) =>
      buildWordRevealMotion({
        index,
        baseDelay,
        duration: 0.45,
        mode: resolveWordRevealMode(true), // post-mount
      }),
    );

    for (let i = 0; i < motions.length; i++) {
      const m = motions[i];
      assert.ok(
        isImmediatelyVisible(m),
        `${fromLang}→${toLang} segment[${i}] must be immediately visible (initial false or opacity:1), got ${JSON.stringify(m.initial)}`,
      );
      assert.equal(
        m.transition.delay,
        0,
        `${fromLang}→${toLang} segment[${i}] must have delay 0, got ${m.transition.delay}`,
      );
      // Must NOT look like the entrance hidden state
      assert.equal(
        hasEntranceHiddenInitial(m),
        false,
        `${fromLang}→${toLang} segment[${i}] must not start from opacity:0`,
      );
    }

    // Extra lock: newly added tail segments (the ones that used to lag)
    if (toSegs.length > fromSegs.length) {
      for (let i = fromSegs.length; i < toSegs.length; i++) {
        const m = motions[i];
        assert.ok(
          isImmediatelyVisible(m),
          `NEW segment[${i}] on ${fromLang}→${toLang} must not re-animate`,
        );
        assert.equal(m.transition.delay, 0);
      }
    }
  }

  test('zh → en: all en segments instant (no stagger lag on "Creativity")', () => {
    assertLanguageSwitchInstant('zh', 'en');
  });

  test('zh → fr: all fr segments instant', () => {
    assertLanguageSwitchInstant('zh', 'fr');
  });

  test('zh → vi: all vi segments instant (max new spans)', () => {
    assertLanguageSwitchInstant('zh', 'vi');
  });

  test('en → vi and vi → en round-trip stay instant', () => {
    assertLanguageSwitchInstant('en', 'vi');
    assertLanguageSwitchInstant('vi', 'en');
  });

  test('en → zh and ja/ru switches stay instant', () => {
    assertLanguageSwitchInstant('en', 'zh');
    assertLanguageSwitchInstant('en', 'ja');
    assertLanguageSwitchInstant('zh', 'ru');
  });

  test('instant mode ignores baseDelay entirely (even large delays)', () => {
    const m = buildWordRevealMotion({
      index: 6,
      baseDelay: 10,
      duration: 0.45,
      mode: 'instant',
    });
    assert.ok(isImmediatelyVisible(m));
    assert.equal(m.transition.delay, 0);
    assert.equal(m.transition.duration, 0);
  });

  test('reducedMotion forces instant even when mode is entrance', () => {
    const m = buildWordRevealMotion({
      index: 3,
      baseDelay: 0.8,
      duration: 0.45,
      mode: 'entrance',
      reducedMotion: true,
    });
    assert.ok(isImmediatelyVisible(m));
    assert.equal(m.transition.delay, 0);
  });
});

describe('HeroSection wiring — component must call the pure helpers', () => {
  const heroSrc = readFileSync(join(__dirname, 'HeroSection.jsx'), 'utf8');

  /** Extract the WordReveal function body for structural locks. */
  function extractWordRevealBody(src) {
    const start = src.indexOf('const WordReveal');
    assert.ok(start >= 0, 'WordReveal component must exist');
    // Body ends at the next top-level const after WordReveal closes.
    const after = src.slice(start);
    const endMatch = after.match(/\nconst CountUp\b|\nconst HeroSection\b/);
    assert.ok(endMatch, 'must find end of WordReveal');
    return after.slice(0, endMatch.index);
  }

  /**
   * Split WordReveal source into approximate render-body vs useEffect bodies.
   * Render purity lock: no ref.current = ... outside effect callbacks.
   */
  function splitRenderAndEffects(wordRevealSrc) {
    // Strip useEffect callback bodies so remaining source ≈ render path.
    const effectBodies = [];
    const renderApprox = wordRevealSrc.replace(
      /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\)/g,
      (match) => {
        effectBodies.push(match);
        return '/* __EFFECT_ELIDED__ */';
      },
    );
    return { renderApprox, effectBodies };
  }

  test('imports split/motion helpers from word-reveal.js', () => {
    assert.match(
      heroSrc,
      /from\s+['"]\.\/word-reveal(\.js)?['"]/,
      'HeroSection must import ./word-reveal helpers',
    );
    assert.match(heroSrc, /splitHeadlineWords/);
    assert.match(heroSrc, /buildWordRevealMotion/);
    assert.match(heroSrc, /deriveWordRevealMode/);
    assert.match(heroSrc, /shouldStickWordRevealInstant/);
  });

  test('must not hard-code entrance initial opacity:0 on every render', () => {
    // The old bug: every motion.span always got initial={{ opacity: 0, y: 24 }}
    // After fix, that object should only appear inside the helper (entrance path),
    // not as a literal on the JSX motion.span.
    assert.equal(
      /initial=\{\{\s*opacity:\s*0\s*,\s*y:\s*24\s*\}\}/.test(heroSrc),
      false,
      'HeroSection must not hard-code initial={{ opacity: 0, y: 24 }} on motion.span',
    );
  });

  test('WordReveal tracks sticky post-mount state + pure mode derivation', () => {
    assert.match(
      heroSrc,
      /hasCompletedEntrance/,
      'WordReveal must track whether the entrance animation has already run',
    );
    assert.match(
      heroSrc,
      /deriveWordRevealMode\s*\(/,
      'WordReveal must call deriveWordRevealMode during render',
    );
    assert.match(
      heroSrc,
      /shouldStickWordRevealInstant\s*\(/,
      'WordReveal must gate sticky setState via shouldStickWordRevealInstant',
    );
  });

  test('WordReveal render body must not assign ref.current (render purity)', () => {
    const body = extractWordRevealBody(heroSrc);
    const { renderApprox, effectBodies } = splitRenderAndEffects(body);

    // Render path: reads of .current are fine; assignments are not.
    const renderAssignments = [
      ...renderApprox.matchAll(/(\w+Ref|\w+)\.current\s*=\s*[^=]/g),
    ].map((m) => m[0]);
    assert.deepEqual(
      renderAssignments,
      [],
      `render must not write ref.current; found: ${renderAssignments.join(', ')}`,
    );

    // Effects are allowed (and required) to update the committed snapshots.
    assert.ok(
      effectBodies.length >= 1,
      'WordReveal must update refs inside useEffect',
    );
    const effectSrc = effectBodies.join('\n');
    assert.match(
      effectSrc,
      /hasMountedRef\.current\s*=/,
      'effect must commit hasMountedRef',
    );
    assert.match(
      effectSrc,
      /previousTextRef\.current\s*=/,
      'effect must commit previousTextRef',
    );
  });

  test('first-mount path gates setState (shouldStick before setHasCompletedEntrance)', () => {
    const body = extractWordRevealBody(heroSrc);
    // Must not unconditionally set sticky true on mount.
    assert.equal(
      /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{\s*setHasCompletedEntrance\s*\(\s*true\s*\)/.test(
        body,
      ),
      false,
      'first-mount effect must not unconditionally setHasCompletedEntrance(true)',
    );
    assert.match(
      body,
      /if\s*\(\s*shouldStick\s*\)\s*\{[\s\S]*setHasCompletedEntrance\s*\(\s*true\s*\)/,
      'sticky setState must be gated by shouldStick',
    );
  });

  test('H1 must not collapse inter-word spaces (whitespace regression)', () => {
    // The bug: a lone ' ' rendered inside a display:inline-block motion.span
    // collapses to zero width, fusing words ("China’sfrontierAImodels.").
    assert.equal(
      heroSrc.includes("{word === ' ' ? ' ' : word}"),
      false,
      'must not render bare spaces inside inline-block spans',
    );
    assert.match(
      heroSrc,
      /describeWordSegment/,
      'WordReveal must render segments via describeWordSegment (pre-wrap whitespace)',
    );
  });
});
