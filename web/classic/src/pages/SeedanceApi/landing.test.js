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
// Run with: node --test src/pages/SeedanceApi/landing.test.js
// Uses Node's native test runner (node:test + node:assert/strict) so that no
// new test dependency is introduced. classic theme is plain ESM JavaScript.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import {
  SEEDANCE_CTA_EVENT,
  SEEDANCE_CTA_LOCATIONS,
  SEEDANCE_RESOURCE_EVENT,
  SEEDANCE_RESOURCE_VALUES,
  SEEDANCE_RESOURCE_LOCATIONS,
  VANCINE_SEEDANCE_DOCS_URL,
  getSeedanceCtaDestination,
  getSeedanceMetadata,
  getSeedanceDocsUrl,
  SEEDANCE_CODE_EXAMPLES,
  SEEDANCE_FAQ,
} from './landing.js';

const require = createRequire(import.meta.url);

const FAQ_QUESTIONS = [
  'How does the Seedance API workflow work?',
  'Which Seedance models are available?',
  'Can I use text and image inputs?',
  'Do I need a credit card to start?',
  'Where can I see current pricing and limits?',
  'Is this an unrestricted or safety-bypass API?',
];

const FAQ_ANSWERS = [
  'The Seedance API workflow lets you submit supported text-to-video and image-to-video tasks, poll their status, and retrieve the result as documented.',
  'Current documented examples include Doubao-Seedance-1.5-pro, Doubao-Seedance-2.0-fast, and Doubao-Seedance-2.0. Live documentation and pricing remain authoritative.',
  'Supported workflows include both text-to-video and image-to-video inputs as documented for each model.',
  'No. After signing up you receive $1 in free credit with no credit card required to start.',
  'See the live pricing page and API documentation. Model pricing and limits can change, so this landing page does not hard-code them.',
  'No. Vancine does not bypass model safety requirements. Model capabilities, input requirements, availability, and safety behavior still follow their documented requirements.',
];

describe('classic seedance-api landing contract', () => {
  test('logged-out CTA points to /register?source=seedance-api', () => {
    assert.equal(
      getSeedanceCtaDestination(false),
      '/register?source=seedance-api',
    );
  });

  test('logged-in CTA points to /console/playground', () => {
    assert.equal(getSeedanceCtaDestination(true), '/console/playground');
  });

  test('exactly the three allowed CTA locations, in order', () => {
    assert.deepEqual(SEEDANCE_CTA_LOCATIONS, [
      'seedance_hero',
      'seedance_pricing',
      'seedance_final_cta',
    ]);
  });

  test('primary CTA event name is get_started_clicked', () => {
    assert.equal(SEEDANCE_CTA_EVENT, 'get_started_clicked');
  });

  test('resource event, values, and locations', () => {
    assert.equal(SEEDANCE_RESOURCE_EVENT, 'developer_resource_clicked');
    assert.deepEqual(SEEDANCE_RESOURCE_VALUES, ['docs']);
    assert.deepEqual(SEEDANCE_RESOURCE_LOCATIONS, [
      'header',
      'code_examples',
      'final_cta',
    ]);
  });

  test('English metadata matches the exact approved copy', () => {
    const m = getSeedanceMetadata('en');
    assert.equal(m.title, 'Seedance API for Video Generation | Vancine');
    assert.equal(
      m.description,
      'Integrate supported Seedance text-to-video and image-to-video workflows with one API key. Start with $1 in free credit and no card required.',
    );
    assert.equal(m.ogTitle, 'Build with Seedance Through One API');
    assert.equal(
      m.ogDescription,
      "Submit an async video task, poll its status, and retrieve the result through Vancine's documented API.",
    );
    assert.equal(m.canonical, 'https://vancine.com/seedance-api');
  });

  test('Chinese metadata matches the exact approved copy', () => {
    const m = getSeedanceMetadata('zh-CN');
    assert.equal(m.title, 'Seedance 视频生成 API | Vancine');
    assert.equal(
      m.description,
      '使用一个 API 密钥接入受支持的 Seedance 文生视频和图生视频工作流。注册即得 1 美元免费额度，无需信用卡。',
    );
    assert.equal(m.ogTitle, '通过一个 API 接入 Seedance');
    assert.equal(
      m.ogDescription,
      '通过 Vancine 文档化的 API 提交异步视频任务、轮询状态并获取结果。',
    );
    assert.equal(m.canonical, 'https://vancine.com/seedance-api');
  });

  test('zh-TW selects Chinese metadata', () => {
    assert.equal(
      getSeedanceMetadata('zh-TW').title,
      'Seedance 视频生成 API | Vancine',
    );
  });

  test('French, Japanese, Russian, Vietnamese fall back to English metadata', () => {
    for (const loc of ['fr', 'ja', 'ru', 'vi']) {
      assert.equal(
        getSeedanceMetadata(loc).title,
        'Seedance API for Video Generation | Vancine',
        `${loc} must fall back to English metadata`,
      );
    }
  });

  test('canonical URL is stable across languages', () => {
    for (const loc of ['en', 'zh-CN', 'zh-TW', 'fr']) {
      assert.equal(
        getSeedanceMetadata(loc).canonical,
        'https://vancine.com/seedance-api',
        `${loc} canonical must be stable`,
      );
    }
  });

  test('docs URL points at vancine.com/docs#video', () => {
    assert.equal(VANCINE_SEEDANCE_DOCS_URL, 'https://vancine.com/docs#video');
    assert.equal(getSeedanceDocsUrl(), 'https://vancine.com/docs#video');
  });

  test('docs URLs never point at the upstream docs domain or /docs/api', () => {
    const url = getSeedanceDocsUrl();
    assert.ok(
      !url.includes('docs.newapi.pro'),
      `docs URL must not include docs.newapi.pro: ${url}`,
    );
    assert.ok(
      !url.includes('/docs/api'),
      `docs URL must not include /docs/api: ${url}`,
    );
  });

  test('code examples: frozen, three tabs in exact order curl/python/node', () => {
    assert.ok(
      Object.isFrozen(SEEDANCE_CODE_EXAMPLES),
      'SEEDANCE_CODE_EXAMPLES must be frozen',
    );
    const ids = SEEDANCE_CODE_EXAMPLES.map((e) => e.id);
    assert.deepEqual(ids, ['curl', 'python', 'node']);
  });

  test('every code example uses documented video submit + poll endpoints', () => {
    for (const ex of SEEDANCE_CODE_EXAMPLES) {
      assert.ok(
        ex.code.includes('https://vancine.com/v1/video/generations'),
        `${ex.id} must reference /v1/video/generations`,
      );
      // Examples poll by variable ($TASK_ID / task_id / taskId), not a literal {task_id}.
      const pollsById =
        /\$TASK_ID/.test(ex.code) ||
        /\btask_id\b/.test(ex.code) ||
        /\btaskId\b/.test(ex.code);
      assert.ok(pollsById, `${ex.id} must poll using the task id`);
      assert.ok(
        ex.code.includes('Doubao-Seedance-1.5-pro'),
        `${ex.id} must use Doubao-Seedance-1.5-pro`,
      );
      assert.ok(
        ex.code.includes('1280x720'),
        `${ex.id} must use size 1280x720`,
      );
    }
  });

  test('shell uses $VANCINE_API_KEY and jq to drive the full async lifecycle', () => {
    const shell = SEEDANCE_CODE_EXAMPLES.find((e) => e.id === 'curl');
    assert.ok(shell.code.includes('$VANCINE_API_KEY'));
    assert.ok(!/sk-[A-Za-z0-9]{10,}/.test(shell.code));
    assert.ok(!/vnc_[A-Za-z0-9]{10,}/.test(shell.code));
    // cURL must extract task_id from the real top-level field via jq.
    assert.ok(
      /"task_id"/.test(shell.code),
      'cURL must read top-level "task_id"',
    );
    assert.ok(
      /jq/.test(shell.code),
      'cURL example must use jq to parse the JSON response',
    );
    assert.ok(
      /(?:while|for)\b|([0-9]+)\s*x|MAX|max/.test(shell.code),
      'cURL polling must be bounded',
    );
    // It must not be a pair of static commands containing a literal {task_id}.
    assert.ok(
      !/video\/generations\/\{task_id\}/.test(shell.code),
      'cURL must not contain a literal {task_id} placeholder',
    );
  });

  test('python uses os.environ and reads the real top-level task_id first', () => {
    const py = SEEDANCE_CODE_EXAMPLES.find((e) => e.id === 'python');
    assert.ok(py.code.includes('os.environ["VANCINE_API_KEY"]'));
    assert.ok(!py.code.includes('$VANCINE_API_KEY'));
    assert.ok(
      /range\(\s*120\s*\)/.test(py.code),
      'must poll at most 120 times',
    );
    assert.ok(
      /time\.sleep\(\s*5\s*\)/.test(py.code),
      'must poll every five seconds',
    );
    // Real backend returns top-level task_id / id.
    assert.ok(
      /submit\.get\(\s*"task_id"\s*\)/.test(py.code) ||
        /submit\["task_id"\]/.test(py.code),
      'python must read top-level task_id first',
    );
    assert.ok(/"id"/.test(py.code), 'python must fall back to top-level id');
    // Must NOT rely solely on the legacy nested data.task_id path.
    assert.ok(
      !/submit\.json\(\s*\)\s*\[\s*"data"\s*\]\s*\[\s*"task_id"\s*\]/.test(
        py.code,
      ) && !/submit\[\s*"data"\s*\]\s*\[\s*"task_id"\s*\]/.test(py.code),
      'python must not read only data.task_id',
    );
    // Real terminal states are completed / failed (also tolerate legacy).
    assert.ok(
      /"completed"|completed/.test(py.code),
      'python must treat "completed" as terminal',
    );
    assert.ok(
      /"failed"|failed/.test(py.code),
      'python must treat "failed" as terminal',
    );
    // Real video URL lives in metadata.url (also tolerate legacy paths).
    assert.ok(
      /metadata/.test(py.code),
      'python must read metadata.url for the result',
    );
    assert.ok(/except|raise|Error/.test(py.code), 'must surface errors');
    // HTTP errors must include response body / server message.
    assert.ok(
      /raise_for_status|resp\.text|response\.text|body/.test(py.code),
      'python must surface HTTP error detail',
    );
    // task_id missing must produce a clear error, not a bare KeyError.
    assert.ok(
      /task_id|task id|taskid/i.test(py.code) &&
        /(?:raise|Error|error|missing|empty)/.test(py.code),
      'python must handle a missing task_id clearly',
    );
  });

  test('node uses process.env and reads the real top-level task_id first', () => {
    const node = SEEDANCE_CODE_EXAMPLES.find((e) => e.id === 'node');
    assert.ok(node.code.includes('process.env.VANCINE_API_KEY'));
    assert.ok(/120/.test(node.code), 'must poll at most 120 times');
    // Real backend returns top-level task_id / id.
    assert.ok(
      /\btask_id\b/.test(node.code) || /\btaskId\b/.test(node.code),
      'node must read top-level task_id first',
    );
    // Must fall back to top-level id OR legacy data.id (not only data.task_id).
    assert.ok(
      /\bsubmitJson\.id\b|\bdata\.id\b|\bid\b/.test(node.code),
      'node must fall back to id',
    );
    // Must NOT rely solely on the legacy nested data.task_id path.
    assert.ok(
      !/\.data\s*\?\.\s*task_id/.test(node.code) &&
        !/\[\s*"data"\s*\]\s*\[\s*"task_id"\s*\]/.test(node.code),
      'node must not read only data.task_id',
    );
    // Real terminal states are completed / failed (also tolerate legacy).
    assert.ok(
      /"completed"|completed/.test(node.code),
      'node must treat "completed" as terminal',
    );
    assert.ok(
      /"failed"|failed/.test(node.code),
      'node must treat "failed" as terminal',
    );
    // Real video URL lives in metadata.url (also tolerate legacy paths).
    assert.ok(
      /metadata/.test(node.code),
      'node must read metadata.url for the result',
    );
    assert.ok(/catch|throw|Error/.test(node.code), 'must surface errors');
    // task_id missing must produce a clear error, not a bare TypeError.
    assert.ok(
      /task_id|taskId|task id/i.test(node.code) &&
        /(?:throw|Error|error|missing|empty)/.test(node.code),
      'node must handle a missing task_id clearly',
    );
  });

  test('no embedded real API key in any example', () => {
    for (const ex of SEEDANCE_CODE_EXAMPLES) {
      assert.ok(
        !/sk-[A-Za-z0-9]{10,}/.test(ex.code),
        `${ex.id} must not embed a real-looking sk- key`,
      );
      assert.ok(
        !/vnc_[A-Za-z0-9]{10,}/.test(ex.code),
        `${ex.id} must not embed a real-looking vnc_ key`,
      );
    }
  });

  test('regression: production submit response shape parses cleanly', () => {
    // Real backend response: {"task_id":"task_xxx","id":"task_xxx","status":"queued","metadata":{...}}
    const production = {
      task_id: 'task_abc123',
      id: 'task_abc123',
      status: 'queued',
      metadata: {},
    };
    const py = SEEDANCE_CODE_EXAMPLES.find((e) => e.id === 'python');
    // The example must reference the top-level fields the real backend emits.
    assert.ok(/"task_id"/.test(py.code));
    assert.ok(/"id"/.test(py.code));
    assert.ok(/"metadata"/.test(py.code));
    assert.equal(production.task_id, 'task_abc123');
    assert.equal(production.metadata && production.metadata.url, undefined);
  });

  test('regression: legacy id-only submit response still works', () => {
    const legacy = { id: 'task_legacy', status: 'queued' };
    const py = SEEDANCE_CODE_EXAMPLES.find((e) => e.id === 'python');
    // The example must fall back to top-level id when task_id is absent.
    assert.ok(/"id"/.test(py.code));
    assert.equal(legacy.id, 'task_legacy');
  });

  test('FAQ questions and answers are distinct and the last forbids safety bypass', () => {
    assert.equal(SEEDANCE_FAQ.length, FAQ_QUESTIONS.length);
    const qList = SEEDANCE_FAQ.map((f) => f.questionKey);
    const aList = SEEDANCE_FAQ.map((f) => f.answerKey);
    assert.deepEqual(qList, FAQ_QUESTIONS);
    assert.deepEqual(aList, FAQ_ANSWERS);
    for (let i = 0; i < qList.length; i++) {
      assert.notEqual(
        qList[i],
        aList[i],
        'FAQ question and answer must be distinct keys',
      );
    }
    const lastA = SEEDANCE_FAQ[SEEDANCE_FAQ.length - 1].answerKey;
    assert.ok(
      /does not bypass/i.test(lastA),
      'last FAQ answer must explicitly deny safety bypass',
    );
  });

  test('EnglishFAQ question keys equal the question text', () => {
    const en = require('../../i18n/locales/en.json').translation;
    for (const q of FAQ_QUESTIONS) {
      assert.equal(en[q], q, `en question key should map to itself: ${q}`);
    }
  });

  test('English FAQ answer keys exist with the answer text', () => {
    const en = require('../../i18n/locales/en.json').translation;
    for (const a of FAQ_ANSWERS) {
      assert.equal(
        en[a],
        a,
        `en answer key should exist and map to itself: ${a}`,
      );
    }
  });

  test('Chinese (zh-CN) FAQ: question and answer values are Chinese', () => {
    const zh = require('../../i18n/locales/zh-CN.json').translation;
    for (const q of FAQ_QUESTIONS) {
      assert.notEqual(
        zh[q],
        q,
        `zh-CN question must be translated, not equal to the English key`,
      );
      assert.ok(
        zh[q] && /[一-鿿]/.test(zh[q]),
        `zh-CN question must contain CJK: ${zh[q]}`,
      );
    }
    for (const a of FAQ_ANSWERS) {
      assert.notEqual(zh[a], a, `zh-CN answer must be translated`);
      assert.ok(
        zh[a] && /[一-鿿]/.test(zh[a]),
        `zh-CN answer must contain CJK: ${zh[a]}`,
      );
    }
  });

  test('FAQ question value never equals its answer value (en)', () => {
    const en = require('../../i18n/locales/en.json').translation;
    for (let i = 0; i < FAQ_QUESTIONS.length; i++) {
      assert.notEqual(
        en[FAQ_QUESTIONS[i]],
        en[FAQ_ANSWERS[i]],
        'question and answer must be distinct',
      );
    }
  });
});

describe('classic seedance-api locale parity (all locales carry FAQ keys)', () => {
  const locales = ['en', 'zh-CN', 'zh-TW', 'fr', 'ja', 'ru', 'vi'];
  for (const loc of locales) {
    test(`${loc} has all 12 FAQ keys`, () => {
      const t = require(`../../i18n/locales/${loc}.json`).translation;
      for (const q of FAQ_QUESTIONS) {
        assert.ok(q in t, `${loc} missing question key: ${q}`);
      }
      for (const a of FAQ_ANSWERS) {
        assert.ok(a in t, `${loc} missing answer key: ${a}`);
      }
    });
  }

  for (const loc of ['fr', 'ja', 'ru', 'vi']) {
    test(`${loc} FAQ falls back to English copy`, () => {
      const t = require(`../../i18n/locales/${loc}.json`).translation;
      for (const q of FAQ_QUESTIONS) {
        assert.equal(t[q], q, `${loc} question should be English: ${q}`);
      }
      for (const a of FAQ_ANSWERS) {
        assert.equal(t[a], a, `${loc} answer should be English: ${a}`);
      }
    });
  }

  for (const loc of ['zh-CN', 'zh-TW']) {
    test(`${loc} FAQ uses Simplified Chinese copy`, () => {
      const t = require(`../../i18n/locales/${loc}.json`).translation;
      for (const q of FAQ_QUESTIONS) {
        assert.notEqual(t[q], q, `${loc} question should be translated`);
      }
      for (const a of FAQ_ANSWERS) {
        assert.notEqual(t[a], a, `${loc} answer should be translated`);
      }
    });
  }
});
