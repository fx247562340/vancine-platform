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
// Run with: node --test src/constants/breakpoints.test.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const require = createRequire(import.meta.url);
const { MOBILE_MAX, DESKTOP_NAV_MIN } = require('./breakpoints');

describe('responsive breakpoints', () => {
  test('MOBILE_MAX is 767 (below: hide Login, collapse nav)', () => {
    assert.equal(MOBILE_MAX, 767);
  });

  test('DESKTOP_NAV_MIN is 1024 (at/above: show full nav)', () => {
    assert.equal(DESKTOP_NAV_MIN, 1024);
  });

  test('mobile breakpoint sits below desktop-nav breakpoint', () => {
    assert.ok(MOBILE_MAX < DESKTOP_NAV_MIN);
  });
});
