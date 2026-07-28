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

// Run with: node --test src/helpers/acquisition.test.js
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import {
  __resetAcquisitionLocksForTests,
  captureAndReportFirstTouch,
  extractLandingPath,
  extractUtm,
  reportAcquisitionEvent,
  reportSignupStarted,
} from './acquisition.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  __resetAcquisitionLocksForTests();
  try {
    delete globalThis.window;
  } catch (_err) {
    /* empty */
  }
});

describe('extractUtm (classic)', () => {
  test('allowlists only utm_* keys', () => {
    const utm = extractUtm(
      '?utm_source=reddit&utm_campaign=kimi_k3_launch&utm_medium=post&foo=1&fbclid=x',
    );
    assert.equal(utm.utm_source, 'reddit');
    assert.equal(utm.utm_campaign, 'kimi_k3_launch');
    assert.equal(utm.utm_medium, 'post');
    assert.equal(utm.foo, undefined);
    assert.equal(utm.fbclid, undefined);
  });

  test('empty search yields empty object', () => {
    assert.deepEqual(extractUtm(''), {});
  });
});

describe('extractLandingPath (classic)', () => {
  test('returns pathname only', () => {
    assert.equal(extractLandingPath('/register'), '/register');
    assert.equal(extractLandingPath('//evil'), '');
    assert.equal(extractLandingPath('relative'), '');
  });
});

describe('reportAcquisitionEvent (classic)', () => {
  test('landing_view payload includes utm and path; never throws', async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };
    await reportAcquisitionEvent('landing_view', {
      utm_source: 'reddit',
      landing_path: '/kimi-k3-api',
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/acquisition/touch');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.credentials, 'same-origin');
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.event, 'landing_view');
    assert.equal(body.utm_source, 'reddit');
    assert.equal(body.landing_path, '/kimi-k3-api');
  });

  test('signup_started payload is event-only', async () => {
    const calls = [];
    globalThis.fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init.body)));
      return new Response('{}', { status: 200 });
    };
    await reportAcquisitionEvent('signup_started', {
      utm_source: 'should-not-send',
      landing_path: '/nope',
    });
    assert.deepEqual(calls[0], { event: 'signup_started' });
  });

  test('network errors are swallowed', async () => {
    globalThis.fetch = async () => {
      throw new Error('network down');
    };
    await assert.doesNotReject(() =>
      reportAcquisitionEvent('landing_view', { landing_path: '/' }),
    );
  });
});

describe('captureAndReportFirstTouch (classic)', () => {
  test('reads window location and posts landing_view once under dedupe', async () => {
    const calls = [];
    globalThis.fetch = async (_u, init) => {
      calls.push(JSON.parse(String(init.body)));
      return new Response('{}', { status: 200 });
    };
    globalThis.window = {
      location: {
        search: '?utm_source=x&utm_campaign=y',
        pathname: '/register',
      },
    };
    await Promise.all([
      captureAndReportFirstTouch(),
      captureAndReportFirstTouch(),
    ]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].event, 'landing_view');
    assert.equal(calls[0].utm_source, 'x');
    assert.equal(calls[0].landing_path, '/register');
  });
});

describe('reportSignupStarted (classic)', () => {
  test('posts signup_started after ensuring landing_view', async () => {
    const calls = [];
    globalThis.fetch = async (_u, init) => {
      calls.push(JSON.parse(String(init.body)));
      return new Response('{}', { status: 200 });
    };
    globalThis.window = {
      location: { search: '', pathname: '/register' },
    };
    await reportSignupStarted();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].event, 'landing_view');
    assert.equal(calls[1].event, 'signup_started');
  });

  test('waits for in-flight landing_view before signup_started', async () => {
    const order = [];
    let resolveLanding;
    const landingGate = new Promise((r) => {
      resolveLanding = r;
    });

    globalThis.fetch = async (_u, init) => {
      const body = JSON.parse(String(init.body));
      if (body.event === 'landing_view') {
        order.push('landing_fetch_start');
        await landingGate;
        order.push('landing_fetch_end');
      } else {
        order.push('signup_fetch');
      }
      return new Response('{}', { status: 200 });
    };
    globalThis.window = {
      location: { search: '?utm_source=race', pathname: '/' },
    };

    const landingP = captureAndReportFirstTouch();
    await new Promise((r) => setTimeout(r, 5));
    const signupP = reportSignupStarted();
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(!order.includes('signup_fetch'));

    resolveLanding();
    await Promise.all([landingP, signupP]);
    assert.deepEqual(order, [
      'landing_fetch_start',
      'landing_fetch_end',
      'signup_fetch',
    ]);
  });

  test('OAuth-style await with keepalive settles before redirect', async () => {
    const order = [];
    let resolveLanding;
    const landingGate = new Promise((r) => {
      resolveLanding = r;
    });

    globalThis.fetch = async (_u, init) => {
      const body = JSON.parse(String(init.body));
      if (body.event === 'landing_view') {
        await landingGate;
      } else {
        order.push(`signup keepalive=${Boolean(init.keepalive)}`);
      }
      return new Response('{}', { status: 200 });
    };
    globalThis.window = {
      location: { search: '', pathname: '/register' },
    };

    void captureAndReportFirstTouch();
    let redirected = false;
    const oauthClick = (async () => {
      await reportSignupStarted({ keepalive: true });
      redirected = true;
      order.push('redirect');
    })();

    await new Promise((r) => setTimeout(r, 10));
    assert.equal(redirected, false);
    resolveLanding();
    await oauthClick;
    assert.equal(redirected, true);
    assert.deepEqual(order, ['signup keepalive=true', 'redirect']);
  });
});

describe('parity with default theme event names', () => {
  test('event names and payload keys match design', async () => {
    const calls = [];
    globalThis.fetch = async (_u, init) => {
      calls.push(JSON.parse(String(init.body)));
      return new Response('{}', { status: 200 });
    };
    await reportAcquisitionEvent('landing_view', {
      utm_source: 'a',
      utm_medium: 'b',
      utm_campaign: 'c',
      utm_content: 'd',
      utm_term: 'e',
      landing_path: '/p',
    });
    assert.deepEqual(Object.keys(calls[0]).sort(), [
      'event',
      'landing_path',
      'utm_campaign',
      'utm_content',
      'utm_medium',
      'utm_source',
      'utm_term',
    ]);
  });
});

describe('login page isolation (classic source contract)', () => {
  test('LoginForm does not import or call reportSignupStarted', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const loginSrc = fs.readFileSync(
      path.join(dir, '../components/auth/LoginForm.jsx'),
      'utf8',
    );
    assert.equal(loginSrc.includes('reportSignupStarted'), false);
    assert.equal(loginSrc.includes('acquisition'), false);

    const registerSrc = fs.readFileSync(
      path.join(dir, '../components/auth/RegisterForm.jsx'),
      'utf8',
    );
    assert.equal(registerSrc.includes('reportSignupStarted'), true);
    // OAuth handlers must await before redirect helpers.
    assert.match(
      registerSrc,
      /await reportSignupStarted\(\{\s*keepalive:\s*true\s*\}\)/,
    );
  });

  test('password handleSubmit awaits reportSignupStarted before register API', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const registerSrc = fs.readFileSync(
      path.join(dir, '../components/auth/RegisterForm.jsx'),
      'utf8',
    );

    // Slice the password submit handler only — not the whole file.
    const submitStart = registerSrc.indexOf('async function handleSubmit(');
    assert.ok(submitStart >= 0, 'handleSubmit must exist');
    const nextFn = registerSrc.indexOf(
      '\n  const sendVerificationCode',
      submitStart,
    );
    assert.ok(nextFn > submitStart, 'must locate end of handleSubmit');
    const handleSubmit = registerSrc.slice(submitStart, nextFn);

    const awaitIdx = handleSubmit.search(/await reportSignupStarted\(\s*\)/);
    assert.ok(
      awaitIdx >= 0,
      'password handleSubmit must await reportSignupStarted()',
    );
    assert.equal(
      handleSubmit.includes('void reportSignupStarted()'),
      false,
      'password handleSubmit must not void reportSignupStarted',
    );

    const registerApiIdx = handleSubmit.search(
      /API\.post\(\s*[`'"]\/api\/user\/register/,
    );
    assert.ok(
      registerApiIdx >= 0,
      'password handleSubmit must POST /api/user/register',
    );
    assert.ok(
      awaitIdx < registerApiIdx,
      'await reportSignupStarted must precede /api/user/register',
    );

    assert.match(handleSubmit, /trackEvent\(\s*['"]signup_started['"]\s*\)/);

    // WeChat path remains fire-and-forget (void), not await.
    const wechatStart = registerSrc.indexOf('const onWeChatLoginClicked');
    const wechatEnd = registerSrc.indexOf(
      'const onSubmitWeChatVerificationCode',
      wechatStart,
    );
    assert.ok(wechatStart >= 0 && wechatEnd > wechatStart);
    const wechatFn = registerSrc.slice(wechatStart, wechatEnd);
    assert.match(
      wechatFn,
      /void reportSignupStarted\(\)/,
      'WeChat path must remain fire-and-forget (void)',
    );
  });
});
