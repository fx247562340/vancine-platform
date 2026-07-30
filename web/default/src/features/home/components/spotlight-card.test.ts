/*
Copyright (C) 2023-2026 QuantumNous

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
// Run with: node --test src/features/home/components/spotlight-card.test.ts
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, 'spotlight-card.tsx'), 'utf8')
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('Default SpotlightCard — chrome contract', () => {
  test('wrapper carries Tailwind group class so group-hover overlay works', () => {
    assert.match(
      src,
      /wrapperClass\s*=\s*\[\s*'group\s/,
      "wrapperClass array's first element must start with 'group'",
    )
  })

  test('wrapper has real border + border-border/40 + bg-muted/10', () => {
    assert.match(src, /'border\s+border-border\/40\s+bg-muted\/10'/)
  })

  test('wrapper keeps the top inner highlight shadow', () => {
    assert.match(src, /shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.06\)\]/)
  })
})

describe('Default SpotlightCard — combined pointer-fine + no-preference gate', () => {
  test('JS listener is gated on (pointer: fine) AND (prefers-reduced-motion: no-preference)', () => {
    assert.match(
      src,
      /matchMedia\(\s*['"]\(pointer: fine\) and \(prefers-reduced-motion: no-preference\)['"]\s*\)/,
    )
  })

  test('no bare pointer-fine matchMedia remains', () => {
    assert.equal(
      /matchMedia\(\s*['"]\(pointer: fine\)['"]\s*\)/.test(code),
      false,
      'matchMedia must use the combined media query, not bare pointer:fine',
    )
  })

  test('hover translate uses combined media variant', () => {
    assert.match(
      src,
      /\[@media\(pointer:fine\)_and_\(prefers-reduced-motion:no-preference\)\]:hover:-translate-y-1/,
    )
  })

  test('hover border uses combined media variant', () => {
    assert.match(
      src,
      /\[@media\(pointer:fine\)_and_\(prefers-reduced-motion:no-preference\)\]:hover:border-border/,
    )
  })

  test('group-hover overlay opacity uses combined media variant', () => {
    assert.match(
      src,
      /\[@media\(pointer:fine\)_and_\(prefers-reduced-motion:no-preference\)\]:group-hover:opacity-100/,
    )
  })

  test('no bare pointer-fine hover transform / border / group-hover classes remain', () => {
    assert.equal(
      /\[@media\(pointer:fine\)\]:hover:-translate-y-1/.test(code),
      false,
      'hover translate must use the combined media variant, not bare pointer:fine',
    )
    assert.equal(
      /\[@media\(pointer:fine\)\]:hover:border/.test(code),
      false,
      'hover border must use the combined media variant, not bare pointer:fine',
    )
    assert.equal(
      /\[@media\(pointer:fine\)\]:group-hover:opacity-100/.test(code),
      false,
      'group-hover overlay opacity must use the combined media variant, not bare pointer:fine',
    )
  })
})

describe('Default SpotlightCard — fine-pointer spotlight JS', () => {
  test('pointermove handler writes CSS custom properties (--spot-x, --spot-y)', () => {
    assert.match(src, /--spot-x/)
    assert.match(src, /--spot-y/)
    assert.match(src, /style\.setProperty\(['"]--spot-x/)
    assert.match(src, /style\.setProperty\(['"]--spot-y/)
  })

  test('pointermove handler does NOT call setState / useState / setXxx', () => {
    assert.equal(/setState\(/.test(src), false)
    assert.equal(/setProperty\(['"]--/.test(src), true) // sanity: CSS-var write is expected
    assert.equal(/useState\b/.test(src), false)
    assert.equal(/set[A-Z]\w+\s*\([^)]*,\s*[^)]*['"]\w+['"]/.test(src), false)
  })

  test('requestAnimationFrame is used and canceled on cleanup', () => {
    assert.match(src, /requestAnimationFrame/)
    assert.match(src, /cancelAnimationFrame/)
    assert.match(src, /return\s*\(\)\s*=>\s*\{[\s\S]*cancelAnimationFrame/)
  })

  test('pointermove listener attached to the card element only and removed on cleanup', () => {
    assert.match(src, /addEventListener\(['"]pointermove/)
    assert.match(src, /removeEventListener\(['"]pointermove/)
  })

  test('hover translate is capped at 4px (translate-y-1), no scale/rotate', () => {
    assert.match(src, /hover:-translate-y-1/)
    assert.equal(/hover:scale-/.test(src), false)
    assert.equal(/hover:rotate-/.test(src), false)
  })
})

describe('Default SpotlightCard — base transitions + reduced-motion', () => {
  test('wrapper carries base transition-transform + duration-200', () => {
    assert.match(src, /transition-transform/)
    assert.match(src, /duration-200/)
  })

  test('transition-transform + duration-200 are NOT inside the fine-pointer media', () => {
    assert.equal(
      /\[@media\(pointer:fine\)_and_\(prefers-reduced-motion:no-preference\)\]:transition-transform/.test(
        code,
      ),
      false,
      'transition-transform must not be inside any pointer media',
    )
    assert.equal(
      /\[@media\(pointer:fine\)_and_\(prefers-reduced-motion:no-preference\)\]:duration-200/.test(
        code,
      ),
      false,
      'duration-200 must not be inside any pointer media',
    )
  })

  test('overlay carries base transition-opacity + duration-200', () => {
    const overlay = code.match(
      /<span\s+aria-hidden[\s\S]*?<\/span>/,
    )
    assert.ok(overlay, 'overlay span must exist')
    assert.match(overlay[0], /transition-opacity/)
    assert.match(overlay[0], /duration-200/)
  })
})

describe('Default SpotlightCard — overlay group-hover contract', () => {
  test('overlay span uses group-hover (requires wrapper `group`)', () => {
    const overlay = code.match(
      /<span\s+aria-hidden[\s\S]*?<\/span>/,
    )
    assert.ok(overlay, 'overlay span must exist')
    assert.match(overlay[0], /group-hover/)
  })
})

describe('Default SpotlightCard — reduced-motion completeness', () => {
  test('wrapper base transition disabled under reduced motion', () => {
    assert.match(src, /motion-reduce:transition-none/)
  })

  test('wrapper hover translate disabled under reduced motion', () => {
    assert.match(src, /motion-reduce:hover:translate-y-0/)
  })

  test('overlay itself disables opacity + transition under reduced motion', () => {
    const overlay = code.match(
      /<span\s+aria-hidden[\s\S]*?<\/span>/,
    )
    assert.ok(overlay, 'overlay span must exist')
    assert.match(overlay[0], /motion-reduce:opacity-0/)
    assert.match(overlay[0], /motion-reduce:transition-none/)
  })
})

describe('Default SpotlightCard — primitive does not add a focusable role or link wrapper', () => {
  test('no tabIndex / role=link / <a / href', () => {
    assert.equal(/tabIndex\s*=/.test(src), false)
    assert.equal(/role\s*=\s*['"]link['"]/.test(src), false)
    assert.equal(/<a\b/.test(src), false)
    assert.equal(/href\s*=/.test(src), false)
  })
})

describe('Default SpotlightCard — no new motion deps', () => {
  test('no gsap / framer-motion / motion / react-bits IMPORTS', () => {
    for (const dep of ['gsap', 'framer-motion', 'react-bits', '@reactbits']) {
      assert.equal(
        new RegExp(`\\b(from|require\\()\\s*['"]${dep}`).test(code),
        false,
        `must not import ${dep}`,
      )
    }
  })
})