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
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import {
  KIMI_K3_API_COMPATIBILITY,
  KIMI_K3_CANONICAL,
  KIMI_K3_CODE_EXAMPLES,
  KIMI_K3_EVIDENCE_STARTER_REPO,
  KIMI_K3_EVIDENCE_STATUS,
  KIMI_K3_EVIDENCE_URL,
  KIMI_K3_MEASURED_USAGE,
  KIMI_K3_OPENCODE_CONFIG,
  KIMI_K3_OPENCODE_VERIFICATION,
  KIMI_K3_VERIFICATION_SCOPE,
  copyTextToClipboard,
  getKimiK3CtaDestination,
  getKimiK3Metadata,
} from './landing.js';

const require = createRequire(import.meta.url);

// Build a synthetic `t` for the `kimi` namespace from the locale JSON so the
// metadata helper can be exercised under Node without the i18n singleton.
// `getKimiK3Metadata` now takes a `t` function (decoupled from i18n.js).
// Credit / measured-usage / verification-scope copy lives in the kimi
// locale (moved out of landing.js constants during the i18n migration).
const kimiBundle = (lang) => require(`../../i18n/locales/kimi/${lang}.json`);
const kimiT = (lang) => {
  const bundle = kimiBundle(lang);
  return (key /* , opts */) =>
    key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), bundle);
};

describe('classic kimi-k3-api landing contract', () => {
  test('guest CTA retains only UTM attribution', () => {
    assert.equal(
      getKimiK3CtaDestination(
        false,
        '?utm_source=x&utm_campaign=k3&token=never-copy-this',
      ),
      '/register?source=kimi-k3-api&utm_source=x&utm_campaign=k3',
    );
  });

  test('authenticated CTA uses the classic playground route', () => {
    assert.equal(
      getKimiK3CtaDestination(true, '?utm_medium=social'),
      '/console/playground?utm_medium=social',
    );
  });

  test('metadata is localized and canonical is stable', () => {
    assert.equal(getKimiK3Metadata(kimiT('en')).canonical, KIMI_K3_CANONICAL);
    assert.equal(
      getKimiK3Metadata(kimiT('zh-CN')).canonical,
      KIMI_K3_CANONICAL,
    );
    assert.match(getKimiK3Metadata(kimiT('en')).title, /Coding Agents/);
    assert.match(getKimiK3Metadata(kimiT('zh-CN')).title, /编程智能体/);
  });

  test('examples use the exact public endpoint and model id', () => {
    for (const example of KIMI_K3_CODE_EXAMPLES) {
      assert.match(
        example.code,
        /https:\/\/vancine\.com\/v1\/chat\/completions/,
      );
      assert.match(example.code, /kimi-k3/);
      assert.doesNotMatch(example.code, /sk-[A-Za-z0-9]/);
    }
    assert.match(KIMI_K3_OPENCODE_CONFIG, /https:\/\/vancine\.com\/v1/);
    assert.match(KIMI_K3_OPENCODE_CONFIG, /\{env:VANCINE_API_KEY\}/);
  });

  test('credit copy includes the usage disclaimer', () => {
    // Credit disclaimer moved into the kimi locale during the i18n
    // namespace migration; assert against the live English copy.
    assert.equal(
      kimiBundle('en').hero.creditDisclaimer,
      '$1 free credit. No credit card required. Usage varies by model and request.',
    );
  });

  test('clipboard failures are converted to a visible state', async () => {
    assert.equal(await copyTextToClipboard('x'), 'error');
    assert.equal(
      await copyTextToClipboard('x', {
        writeText: async () => {
          throw new Error('blocked');
        },
      }),
      'error',
    );
    assert.equal(
      await copyTextToClipboard('x', { writeText: async () => {} }),
      'copied',
    );
  });

  test('evidence status is verified and the Evidence links are the public starter repo and evidence file', () => {
    assert.equal(KIMI_K3_EVIDENCE_STATUS, 'verified');
    assert.equal(
      KIMI_K3_EVIDENCE_STARTER_REPO,
      'https://github.com/VancineAI/kimi-k3-api-starter',
    );
    assert.equal(
      KIMI_K3_EVIDENCE_URL,
      'https://github.com/VancineAI/kimi-k3-api-starter/blob/main/results/opencode-agent.verified.json?utm_source=vancine&utm_medium=developer_resource&utm_campaign=kimi_k3_launch&utm_content=opencode_verified_evidence',
    );
    for (const url of [KIMI_K3_EVIDENCE_STARTER_REPO, KIMI_K3_EVIDENCE_URL]) {
      // The internal kit and the wrong owner must never be linked from the page.
      assert.doesNotMatch(url, /fx247562340/);
      assert.doesNotMatch(url, /ops\/kimi-k3-evidence/);
    }
  });

  test('API compatibility evidence is verified with the exact live probe values', () => {
    assert.equal(KIMI_K3_API_COMPATIBILITY.status, 'verified');
    assert.equal(KIMI_K3_API_COMPATIBILITY.temperature, 0);
    assert.equal(KIMI_K3_API_COMPATIBILITY.httpStatus, 200);
    assert.equal(KIMI_K3_API_COMPATIBILITY.requestedModel, 'kimi-k3');
    assert.equal(KIMI_K3_API_COMPATIBILITY.responseModel, 'kimi-k3');
    assert.equal(KIMI_K3_API_COMPATIBILITY.maxTokens, 16);
    assert.equal(KIMI_K3_API_COMPATIBILITY.finishReason, 'length');
    assert.deepEqual(KIMI_K3_API_COMPATIBILITY.usage, {
      prompt: 92,
      completion: 16,
      total: 108,
      reasoning: 13,
    });
    // The reasoning-heavy 16-token probe is inconclusive, never a failure.
    assert.equal(KIMI_K3_API_COMPATIBILITY.visibleContent, 'inconclusive');
  });

  test('OpenCode agent evidence records a completed live v1.18.3 run', () => {
    const run = KIMI_K3_OPENCODE_VERIFICATION;
    assert.equal(run.status, 'verified');
    assert.equal(run.client, 'OpenCode');
    assert.equal(run.clientVersion, '1.18.3');
    assert.equal(run.model, 'kimi-k3');
    assert.equal(run.runStatus, 'completed');
    assert.equal(run.modelSteps, 6);
    assert.equal(run.rounds, 1);
    assert.equal(run.durationMs, 84345);
    assert.deepEqual(run.toolCalls.read, { completed: 5, failed: 0 });
    assert.deepEqual(run.toolCalls.edit, { completed: 1, failed: 0 });
    assert.deepEqual(run.toolCalls.bash, { completed: 1, failed: 0 });
    assert.equal(run.testsPassed, true);
    assert.equal(run.sourceModified, 'src/leap-year.js');
    assert.equal(run.testFileModified, false);
    assert.equal(run.unexpectedFiles, 0);
    assert.equal(run.exitStatus, 0);
    assert.equal(run.runId, 'e52f78b7-0bfa-430f-b8b0-1ad813ea0695');
  });

  test('measured usage is $0.19 USD for one controlled run, with pricing qualifications', () => {
    assert.equal(KIMI_K3_MEASURED_USAGE.agentTelemetryTokens, 28707);
    assert.equal(KIMI_K3_MEASURED_USAGE.amount, 0.19);
    assert.equal(KIMI_K3_MEASURED_USAGE.currency, 'USD');

    // Disclaimer copy lives in the kimi locale (en + zh-CN).
    const en = kimiBundle('en').evidence.measuredUsageDisclaimer;
    const zh = kimiBundle('zh-CN').evidence.measuredUsageDisclaimer;
    assert.match(en, /\$0\.19 in measured Vancine usage/);
    assert.match(en, /Pricing and token usage vary by task/);
    assert.match(
      en,
      /does not guarantee that \$1 credit will complete another coding-agent run/,
    );
    assert.match(zh, /0\.19 美元/);
    assert.match(zh, /价格和 Token 消耗会随任务变化/);
    assert.match(zh, /不保证 1 美元额度能够完成另一次编程 Agent 任务/);
  });

  test('verification scope is limited to OpenCode and discloses the third-party platform', () => {
    assert.deepEqual(KIMI_K3_VERIFICATION_SCOPE.liveVerifiedAgents, [
      'OpenCode',
    ]);
    assert.deepEqual(KIMI_K3_VERIFICATION_SCOPE.configOnlyAgents, [
      'Cline',
      'Roo Code',
    ]);
    // Scope prose lives in the kimi locale.
    const en = kimiBundle('en').evidence.verificationScope;
    const zh = kimiBundle('zh-CN').evidence.verificationScope;
    assert.match(
      en,
      /Only OpenCode v1\.18\.3 has a live coding-agent verification/,
    );
    assert.match(en, /have not been independently live verified/);
    assert.match(en, /third-party API aggregation platform/);
    assert.match(zh, /仅 OpenCode v1\.18\.3 完成了实测编程 Agent 验证/);
    assert.match(zh, /尚未经过独立实测验证/);
    assert.match(zh, /第三方 API 聚合平台/);
  });

  test('no zero-cost or upstream-cost claims anywhere in the evidence data', () => {
    const serialized = JSON.stringify([
      KIMI_K3_EVIDENCE_STATUS,
      KIMI_K3_EVIDENCE_STARTER_REPO,
      KIMI_K3_EVIDENCE_URL,
      KIMI_K3_API_COMPATIBILITY,
      KIMI_K3_OPENCODE_VERIFICATION,
      KIMI_K3_MEASURED_USAGE,
      kimiBundle('en').evidence.measuredUsageDisclaimer,
      kimiBundle('zh-CN').evidence.measuredUsageDisclaimer,
      KIMI_K3_VERIFICATION_SCOPE,
      kimiBundle('en').evidence.verificationScope,
      kimiBundle('zh-CN').evidence.verificationScope,
    ]);
    for (const forbidden of [
      /cost=0/i,
      /free agent run/i,
      /1\.34621/,
      /CNY/,
      /pending/i,
    ]) {
      assert.doesNotMatch(serialized, forbidden);
    }
  });
});
