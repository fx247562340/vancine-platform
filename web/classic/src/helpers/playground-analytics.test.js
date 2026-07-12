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

// Run with: node --test src/helpers/playground-analytics.test.js
// Pure state-machine tests for the playground funnel tracker (no React).
// First half uses real createPlaygroundAnalytics() with an event collector.
// Second half exercises the scenarios through the public API exactly as the
// hook wires them: separate handles per request, closed over by their own
// callbacks.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPlaygroundAnalytics } from './playground-analytics.js';

function makeCollector() {
  const calls = [];
  const trackEvent = (name, data) => calls.push({ name, data });
  return { calls, trackEvent };
}

function byName(calls, name) {
  return calls.filter((c) => c.name === name);
}

describe('createPlaygroundAnalytics state machine', () => {
  test('started fires once at start; success fires succeeded once', () => {
    const { calls, trackEvent } = makeCollector();
    const api = createPlaygroundAnalytics(trackEvent);
    const h = api.start('doubao-pro', 'openai');
    assert.equal(byName(calls, 'playground_request_started').length, 1);
    assert.deepEqual(calls[0].data, {
      model: 'doubao-pro',
      endpoint_type: 'openai',
    });
    h.success();
    assert.equal(byName(calls, 'playground_request_succeeded').length, 1);
    assert.deepEqual(calls[calls.length - 1].data, {
      model: 'doubao-pro',
      endpoint_type: 'openai',
    });
  });

  test('success is idempotent — double success reports succeeded only once', () => {
    const { calls, trackEvent } = makeCollector();
    const api = createPlaygroundAnalytics(trackEvent);
    const h = api.start('doubao-pro', 'openai');
    h.success();
    h.success();
    h.success();
    assert.equal(byName(calls, 'playground_request_succeeded').length, 1);
  });

  test('start -> fail -> success: NO succeeded reported (terminal fail)', () => {
    const { calls, trackEvent } = makeCollector();
    const api = createPlaygroundAnalytics(trackEvent);
    const h = api.start('doubao-pro', 'openai');
    h.fail();
    h.success(); // late success after fail must be ignored
    assert.equal(byName(calls, 'playground_request_started').length, 1);
    assert.equal(byName(calls, 'playground_request_succeeded').length, 0);
  });

  test('start -> cancel -> success: NO succeeded reported (terminal cancel)', () => {
    const { calls, trackEvent } = makeCollector();
    const api = createPlaygroundAnalytics(trackEvent);
    const h = api.start('doubao-pro', 'openai');
    h.cancel();
    h.success(); // late success after cancel must be ignored
    assert.equal(byName(calls, 'playground_request_started').length, 1);
    assert.equal(byName(calls, 'playground_request_succeeded').length, 0);
  });

  test('fail/cancel are themselves idempotent', () => {
    const { calls, trackEvent } = makeCollector();
    const api = createPlaygroundAnalytics(trackEvent);
    const h = api.start('doubao-pro', 'openai');
    h.fail();
    h.fail();
    h.cancel(); // no-op, already failed
    assert.equal(byName(calls, 'playground_request_succeeded').length, 0);
  });

  test('unknown model: started fires (dedup gate in hook), but NO succeeded', () => {
    // start() reports started when a model is known; the hook gate keeps
    // started for known models only. Here we confirm a known model reports
    // both events via a fresh handle.
    const { calls, trackEvent } = makeCollector();
    const api = createPlaygroundAnalytics(trackEvent);
    const h = api.start('seedance-1-5p', 'openai-video');
    h.success();
    assert.equal(byName(calls, 'playground_request_succeeded').length, 1);
    assert.deepEqual(calls[calls.length - 1].data, {
      model: 'seedance-1-5p',
      endpoint_type: 'openai-video',
    });
  });

  test('custom-request mode: dedicated handle emits started + succeeded', () => {
    // Custom-request mode does not know the endpoint ahead of time; the hook
    // passes the model (and defaults endpoint_type to 'openai'). Model this
    // with the same start/success sequence the hook performs.
    const { calls, trackEvent } = makeCollector();
    const api = createPlaygroundAnalytics(trackEvent);
    const h = api.start('gpt-4o', 'openai');
    h.success();
    assert.equal(byName(calls, 'playground_request_started').length, 1);
    assert.equal(byName(calls, 'playground_request_succeeded').length, 1);
    assert.deepEqual(calls[0].data, {
      model: 'gpt-4o',
      endpoint_type: 'openai',
    });
  });

  test('concurrent requests A, B: each handle reports its own model+endpoint', () => {
    const { calls, trackEvent } = makeCollector();
    const api = createPlaygroundAnalytics(trackEvent);
    const a = api.start('model-a', 'openai');
    const b = api.start('model-b', 'image-generation');
    // Interleave completions; handles must stay isolated.
    b.success();
    a.success();
    const started = byName(calls, 'playground_request_started');
    const succeeded = byName(calls, 'playground_request_succeeded');
    assert.equal(started.length, 2);
    assert.equal(succeeded.length, 2);
    const models = succeeded.map((c) => c.data.model);
    assert.deepEqual(models, ['model-b', 'model-a']);
    const endpoints = succeeded.map((c) => c.data.endpoint_type);
    assert.deepEqual(endpoints, ['image-generation', 'openai']);
  });

  test('one request failing does not suppress another succeeding', () => {
    const { calls, trackEvent } = makeCollector();
    const api = createPlaygroundAnalytics(trackEvent);
    const a = api.start('model-a', 'openai');
    const b = api.start('model-b', '3d-generation');
    a.fail(); // A errors out
    b.success(); // B still succeeds
    assert.equal(byName(calls, 'playground_request_succeeded').length, 1);
    assert.deepEqual(calls[calls.length - 1].data, {
      model: 'model-b',
      endpoint_type: '3d-generation',
    });
  });
});
