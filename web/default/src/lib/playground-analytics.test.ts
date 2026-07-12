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

// Run with: node --test src/lib/playground-analytics.test.ts.
// Real state-machine tests for the default-theme playground funnel tracker
// (no React). Mirrors the classic theme's playback-analytics.test.js cases.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  
  type PlaygroundAnalytics,
  createPlaygroundAnalytics,
} from './playground-analytics.ts';

interface TrackCall {
  name: string
  data?: Record<string, string | number | boolean>
}

function makeCollector() {
  const calls: TrackCall[] = [];
  const trackEvent = (name: string, data?: Record<string, string | number | boolean>) =>
    calls.push({ name, data });
  return { calls, trackEvent };
}

const byName = (calls: TrackCall[], name: string) =>
  calls.filter((c) => c.name === name);

function makeAnalytics() {
  const collector = makeCollector();
  return {
    analytics: createPlaygroundAnalytics(collector.trackEvent) as PlaygroundAnalytics,
    calls: collector.calls,
  };
}

describe('createPlaygroundAnalytics (default)', () => {
  test('started fires once at start; success fires succeeded once', () => {
    const { analytics, calls } = makeAnalytics();
    const h = analytics.start('doubao-pro', 'openai');
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

  test('success is idempotent: double success reports succeeded only once', () => {
    const { analytics, calls } = makeAnalytics();
    const h = analytics.start('doubao-pro', 'openai');
    h.success();
    h.success();
    h.success();
    assert.equal(byName(calls, 'playground_request_succeeded').length, 1);
  });

  test('start -> fail -> success: NO succeeded on terminal fail', () => {
    const analytics = createPlaygroundAnalytics(() => {});
    const h = analytics.start('doubao-pro', 'openai');
    h.fail();
    h.success(); // late success must be ignored
    const collector = makeCollector();
    const api2 = createPlaygroundAnalytics(collector.trackEvent);
    const h2 = api2.start('doubao-pro', 'openai');
    h2.fail();
    h2.success();
    assert.equal(
      byName(collector.calls, 'playground_request_succeeded').length,
      0,
    );
  });

  test('start -> cancel -> success: NO succeeded on terminal cancel', () => {
    const { analytics, calls } = makeAnalytics();
    const h = analytics.start('doubao-pro', 'openai');
    h.cancel();
    h.success(); // late success after cancel must be ignored
    assert.equal(byName(calls, 'playground_request_succeeded').length, 0);
  });

  test('fail/cancel are themselves idempotent', () => {
    const { analytics, calls } = makeAnalytics();
    const h = analytics.start('doubao-pro', 'openai');
    h.fail();
    h.fail();
    h.cancel(); // no-op, already failed
    assert.equal(byName(calls, 'playground_request_succeeded').length, 0);
  });

  test('unknown model (empty string) emits neither started nor succeeded', () => {
    const { analytics, calls } = makeAnalytics();
    const h = analytics.start('', 'openai');
    h.success();
    assert.equal(byName(calls, 'playground_request_started').length, 0);
    assert.equal(byName(calls, 'playground_request_succeeded').length, 0);
  });

  test('unknown model (null) emits neither started nor succeeded', () => {
    const { analytics, calls } = makeAnalytics();
    const h = analytics.start(null, 'openai');
    h.success();
    assert.equal(byName(calls, 'playground_request_started').length, 0);
    assert.equal(byName(calls, 'playground_request_succeeded').length, 0);
  });

  test('custom-request mode: dedicated handle emits started + succeeded', () => {
    // Custom-request mode does not know the endpoint ahead of time; the hook
    // passes the model with endpoint_type defaulting to 'openai'. Model this
    // with the same start/success sequence the hook performs.
    const { analytics, calls } = makeAnalytics();
    const h = analytics.start('gpt-4o', 'openai');
    h.success();
    assert.equal(byName(calls, 'playground_request_started').length, 1);
    assert.equal(byName(calls, 'playground_request_succeeded').length, 1);
    assert.deepEqual(calls[0].data, {
      model: 'gpt-4o',
      endpoint_type: 'openai',
    });
  });

  test('concurrent A/B each report their own model + endpoint (interleaved)', () => {
    const { analytics, calls } = makeAnalytics();
    const a = analytics.start('model-a', 'openai');
    const b = analytics.start('model-b', 'image-generation');
    b.success();
    a.success();
    const succeeded = byName(calls, 'playground_request_succeeded');
    assert.equal(succeeded.length, 2);
    const models = succeeded.map((c) => c.data?.model);
    assert.deepEqual(models, ['model-b', 'model-a']);
    const endpoints = succeeded.map((c) => c.data?.endpoint_type);
    assert.deepEqual(endpoints, ['image-generation', 'openai']);
  });

  test('one request failing does not suppress another succeeding', () => {
    const { analytics, calls } = makeAnalytics();
    const a = analytics.start('model-a', 'openai');
    const b = analytics.start('model-b', '3d-generation');
    a.fail();
    b.success();
    const succeeded = byName(calls, 'playground_request_succeeded');
    assert.equal(succeeded.length, 1);
    assert.deepEqual(succeeded[0].data, {
      model: 'model-b',
      endpoint_type: '3d-generation',
    });
  });

  test('non-chat endpoints surface their endpoint_type', () => {
    const { analytics, calls } = makeAnalytics();
    analytics.start('seedance-1-5p', 'openai-video').success();
    analytics.start('hitem', '3d-generation').success();
    analytics.start('seedream-4-0', 'image-generation').success();
    const succeeded = byName(calls, 'playground_request_succeeded');
    const ep = succeeded.map((c) => c.data?.endpoint_type);
    assert.deepEqual(ep, ['openai-video', '3d-generation', 'image-generation']);
  });

  test('stop (cancel) followed by a successful response reports no succeeded', () => {
    // Models onStopGenerator calling cancel() on the latest handle; a racing
    // SSE [DONE] that arrives afterwards must not flip to succeeded.
    const { analytics, calls } = makeAnalytics();
    const h = analytics.start('doubao-pro', 'openai');
    h.cancel(); // user pressed stop
    h.success(); // late [DONE] callback
    assert.equal(byName(calls, 'playground_request_succeeded').length, 0);
    assert.equal(byName(calls, 'playground_request_started').length, 1);
  });
});
