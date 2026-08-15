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
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildRequestRuleExpr,
  combineBillingExpr,
  parseTiersFromExpr,
  splitBillingExprAndRequestRules,
  tryParseRequestRuleExpr,
} from '../billing-expr'

// ---------------------------------------------------------------------------
// A. ParsedTier precise sourceOffset
// ---------------------------------------------------------------------------

describe('ParsedTier sourceOffset', () => {
  // Two identical-content tiers at different positions (no condition prefix)
  const expr = 'tier("base", p * 3 + c * 15) + tier("base", p * 3 + c * 15)'

  it('assigns precise sourceOffset matching indexOf for duplicate tiers', () => {
    const tiers = parseTiersFromExpr(expr)
    assert.equal(tiers.length, 2)

    // Both sourceOffsets are finite non-negative integers
    assert.equal(Number.isFinite(tiers[0].sourceOffset), true)
    assert.ok(tiers[0].sourceOffset >= 0)
    assert.equal(Number.isFinite(tiers[1].sourceOffset), true)
    assert.ok(tiers[1].sourceOffset >= 0)

    // Compute expected offsets from the test string itself
    const firstOffset = expr.indexOf('tier(')
    const secondOffset = expr.indexOf('tier(', firstOffset + 1)
    assert.ok(firstOffset >= 0)
    assert.ok(secondOffset >= 0)

    // Precise offset contract
    assert.deepEqual(
      tiers.map((tier) => tier.sourceOffset),
      [firstOffset, secondOffset]
    )

    // Labels preserved
    assert.equal(tiers[0].label, 'base')
    assert.equal(tiers[1].label, 'base')
    assert.deepEqual(tiers[0].conditions, [])
    assert.deepEqual(tiers[1].conditions, [])
  })

  it('produces identical sourceOffset on reparse (stability)', () => {
    const tiers1 = parseTiersFromExpr(expr)
    const tiers2 = parseTiersFromExpr(expr)
    assert.equal(tiers1.length, tiers2.length)
    for (let i = 0; i < tiers1.length; i++) {
      assert.equal(tiers1[i].sourceOffset, tiers2[i].sourceOffset)
      assert.equal(tiers1[i].label, tiers2[i].label)
    }
  })
})

// ---------------------------------------------------------------------------
// B. vN: body-relative sourceOffset definition
// ---------------------------------------------------------------------------

describe('sourceOffset is body-relative after stripExprVersion', () => {
  const body = 'tier("std", p * 2 + c * 10) + tier("std", p * 2 + c * 10)'
  const versioned = `v2:${body}`

  it('produces identical sourceOffset arrays with or without vN: prefix', () => {
    const tiersWithout = parseTiersFromExpr(body)
    const tiersWith = parseTiersFromExpr(versioned)

    assert.equal(tiersWithout.length, 2)
    assert.equal(tiersWith.length, 2)

    // sourceOffset must be relative to the body after stripping the prefix
    assert.deepEqual(
      tiersWithout.map((t) => t.sourceOffset),
      tiersWith.map((t) => t.sourceOffset)
    )
  })

  it('first tier offset is not shifted by v2: prefix length', () => {
    const tiersWithout = parseTiersFromExpr(body)
    const tiersWith = parseTiersFromExpr(versioned)

    // "v2:" is 3 characters; if offset were absolute, tiersWith[0].sourceOffset
    // would be tiersWithout[0].sourceOffset + 3. It must NOT be.
    assert.equal(tiersWith[0].sourceOffset, tiersWithout[0].sourceOffset)
    assert.notEqual(tiersWith[0].sourceOffset, tiersWithout[0].sourceOffset + 3)
  })
})

// ---------------------------------------------------------------------------
// C. Request-rule duplicate factor precise sourceOffset
// ---------------------------------------------------------------------------

describe('ParsedRequestRuleGroup sourceOffset', () => {
  // Two identical top-level rule factors
  const factor = '(param("model") == "gpt-4" ? 1.5 : 1)'
  const reqExpr = `${factor} * ${factor}`

  it('assigns precise sourceOffset matching indexOf for duplicate factors', () => {
    const groups = tryParseRequestRuleExpr(reqExpr)
    if (!groups || groups.length < 2) {
      assert.fail('expected 2+ parsed groups')
      return
    }

    // Both sourceOffsets are finite non-negative integers
    assert.equal(Number.isFinite(groups[0].sourceOffset), true)
    assert.ok(groups[0].sourceOffset >= 0)
    assert.equal(Number.isFinite(groups[1].sourceOffset), true)
    assert.ok(groups[1].sourceOffset >= 0)

    // Compute expected offsets — search cursor advances past first match
    const firstOffset = reqExpr.indexOf(factor)
    const secondOffset = reqExpr.indexOf(factor, firstOffset + factor.length)
    assert.ok(firstOffset >= 0)
    assert.ok(secondOffset >= 0)

    // Precise offset contract — proves cursor doesn't point second at first
    assert.deepEqual(
      groups.map((group) => group.sourceOffset),
      [firstOffset, secondOffset]
    )

    // conditions and multiplier preserved
    assert.equal(groups[0].multiplier, '1.5')
    assert.equal(groups[1].multiplier, '1.5')
    assert.equal(groups[0].conditions.length, 1)
    assert.equal(groups[1].conditions.length, 1)
  })

  it('produces identical sourceOffset on reparse (stability)', () => {
    const g1 = tryParseRequestRuleExpr(reqExpr)
    const g2 = tryParseRequestRuleExpr(reqExpr)
    if (!g1 || !g2 || g1.length < 1 || g2.length < 1) {
      assert.fail('expected non-null parsed groups')
      return
    }
    assert.equal(g1.length, g2.length)
    for (let i = 0; i < g1.length; i++) {
      assert.equal(g1[i].sourceOffset, g2[i].sourceOffset)
    }
  })
})

// ---------------------------------------------------------------------------
// D. Real build/split/combine round-trip
// ---------------------------------------------------------------------------

describe('build/split/combine round-trip', () => {
  const billingExpr = 'tier("standard", p * 3 + c * 15)'
  const requestRuleExpr = '(param("fast") == true ? 1.2 : 1)'

  it('builds request rule expr that round-trips without sourceOffset leakage', () => {
    // 1. Parse the fixed requestRuleExpr
    const parsed = tryParseRequestRuleExpr(requestRuleExpr)
    assert.ok(parsed !== null, 'tryParseRequestRuleExpr must succeed')
    if (parsed === null) return
    assert.equal(parsed.length, 1)
    assert.ok(parsed[0].sourceOffset >= 0)

    // 2. Build from parsed groups (sourceOffset is ignored by buildRequestRuleExpr)
    const rebuiltRequestRuleExpr = buildRequestRuleExpr(parsed)
    assert.ok(rebuiltRequestRuleExpr.length > 0)

    // 3. Rebuilt expr equals the normalized original
    assert.equal(rebuiltRequestRuleExpr, requestRuleExpr)

    // 4. Rebuilt expr does NOT contain sourceOffset or source_offset
    assert.equal(rebuiltRequestRuleExpr.includes('sourceOffset'), false)
    assert.equal(rebuiltRequestRuleExpr.includes('source_offset'), false)
  })

  it('combine → split round-trips billing and request rule expressions', () => {
    // 5. Parse and rebuild request rules
    const parsed = tryParseRequestRuleExpr(requestRuleExpr)
    assert.ok(parsed !== null)
    if (parsed === null) return
    const rebuiltRequestRuleExpr = buildRequestRuleExpr(parsed)
    assert.equal(rebuiltRequestRuleExpr, requestRuleExpr)

    // 6. Combine billing expr with rebuilt request rules
    const combined = combineBillingExpr(billingExpr, rebuiltRequestRuleExpr)
    assert.ok(combined.length > 0)
    assert.ok(combined.includes(billingExpr))

    // 7. Split the combined back
    const split = splitBillingExprAndRequestRules(combined)
    assert.equal(split.billingExpr, billingExpr)
    assert.equal(split.requestRuleExpr, rebuiltRequestRuleExpr)

    // 8. Re-parse the split requestRuleExpr — still succeeds with valid offsets
    const reparsed = tryParseRequestRuleExpr(split.requestRuleExpr)
    assert.ok(reparsed !== null, 're-parsed requestRuleExpr must succeed')
    if (reparsed === null) return
    assert.equal(reparsed.length, 1)
    assert.equal(reparsed[0].sourceOffset, 0)
    assert.ok(reparsed[0].sourceOffset >= 0)
  })

  it('sourceOffset properties do not leak into combined expression', () => {
    const parsed = tryParseRequestRuleExpr(requestRuleExpr)
    assert.ok(parsed !== null)
    if (parsed === null) return
    const rebuiltRequestRuleExpr = buildRequestRuleExpr(parsed)
    const combined = combineBillingExpr(billingExpr, rebuiltRequestRuleExpr)

    assert.equal(combined.includes('sourceOffset'), false)
    assert.equal(combined.includes('source_offset'), false)
  })
})
