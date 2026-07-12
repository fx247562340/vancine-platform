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

// Run with: node --test src/helpers/analytics.test.js
// Uses Node's native test runner (node:test + node:assert/strict) so that no
// new test dependency is introduced. classic theme is plain ESM JavaScript.
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { trackEvent } from './analytics.js';

function makeSpy() {
  const calls = [];
  const umami = {
    track: (eventName, eventData) => {
      calls.push({ eventName, eventData });
    },
  };
  return { calls, umami };
}

function makeThrowingUmami() {
  return {
    track: () => {
      throw new Error('ad-blocker or script error');
    },
  };
}

function setWindow(hostname, umami) {
  globalThis.window = { location: { hostname }, ...(umami ? { umami } : {}) };
}

function clearWindow() {
  delete globalThis.window;
}

describe('analytics.trackEvent (classic)', () => {
  afterEach(clearWindow);

  test('reports an event on vancine.com', () => {
    const spy = makeSpy();
    setWindow('vancine.com', spy.umami);

    trackEvent('get_started_clicked', { location: 'hero' });

    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].eventName, 'get_started_clicked');
  });

  test('reports an event on www.vancine.com', () => {
    const spy = makeSpy();
    setWindow('www.vancine.com', spy.umami);

    trackEvent('signup_started');

    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].eventName, 'signup_started');
  });

  test('does not report on localhost', () => {
    const spy = makeSpy();
    setWindow('localhost', spy.umami);

    trackEvent('playground_request_started', {
      model: 'doubao-pro',
      endpoint_type: 'openai',
    });

    assert.equal(spy.calls.length, 0);
  });

  test('does not report on 127.0.0.1', () => {
    const spy = makeSpy();
    setWindow('127.0.0.1', spy.umami);

    trackEvent('checkout_started', { provider: 'stripe', amount: 10 });

    assert.equal(spy.calls.length, 0);
  });

  test('does not report on other hostnames (e.g. staging)', () => {
    const spy = makeSpy();
    setWindow('staging.vancine.com', spy.umami);

    trackEvent('get_started_clicked', { location: 'cta' });

    assert.equal(spy.calls.length, 0);
  });

  test('does not report when window.umami is missing', () => {
    const spy = makeSpy();
    setWindow('vancine.com'); // no umami present on window

    assert.doesNotThrow(() => trackEvent('signup_completed'));
    assert.equal(spy.calls.length, 0);
  });

  test('does not throw when umami.track throws', () => {
    setWindow('vancine.com', makeThrowingUmami());

    assert.doesNotThrow(() => trackEvent('signup_started'));
  });

  test('does not throw or report when window is absent', () => {
    clearWindow();

    assert.doesNotThrow(() => trackEvent('signup_started'));
  });

  test('forwards eventData unchanged and injects no extra fields', () => {
    const spy = makeSpy();
    setWindow('vancine.com', spy.umami);
    const payload = { provider: 'epay', amount: 50 };

    trackEvent('checkout_started', payload);

    assert.equal(spy.calls.length, 1);
    assert.deepEqual(spy.calls[0].eventData, payload);
    assert.deepEqual(Object.keys(spy.calls[0].eventData).sort(), [
      'amount',
      'provider',
    ]);
  });

  test('forwards eventData by reference when provided', () => {
    const spy = makeSpy();
    setWindow('vancine.com', spy.umami);
    const payload = { location: 'hero' };

    trackEvent('get_started_clicked', payload);

    assert.equal(spy.calls[0].eventData, payload);
  });

  test('forwards undefined eventData when omitted', () => {
    const spy = makeSpy();
    setWindow('vancine.com', spy.umami);

    trackEvent('signup_started');

    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].eventData, undefined);
  });
});
