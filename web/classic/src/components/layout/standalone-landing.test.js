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
// Run with: node --test src/components/layout/standalone-landing.test.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  isStandaloneLandingPage,
  STANDALONE_LANDING_PAGES,
} = require('./standalone-landing');

describe('standalone landing page detection', () => {
  test('includes /seedance-api and /ai-media-api', () => {
    assert.ok(STANDALONE_LANDING_PAGES.includes('/seedance-api'));
    assert.ok(STANDALONE_LANDING_PAGES.includes('/ai-media-api'));
  });

  test('recognizes exact standalone paths', () => {
    assert.equal(isStandaloneLandingPage('/seedance-api'), true);
    assert.equal(isStandaloneLandingPage('/ai-media-api'), true);
  });

  test('does NOT treat other routes as standalone', () => {
    assert.equal(isStandaloneLandingPage('/'), false);
    assert.equal(isStandaloneLandingPage('/login'), false);
    assert.equal(isStandaloneLandingPage('/console/setting'), false);
    assert.equal(isStandaloneLandingPage('/pricing'), false);
    assert.equal(isStandaloneLandingPage('/docs'), false);
  });

  test('does not match path prefixes / substrings', () => {
    assert.equal(isStandaloneLandingPage('/seedance-api/'), false);
    assert.equal(isStandaloneLandingPage('/seedance-api/extra'), false);
    assert.equal(isStandaloneLandingPage('/ai-media-api/extra'), false);
  });
});
