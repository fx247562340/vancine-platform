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
// Run with: node --test src/pages/AiMediaApi/landing.test.js
// Uses Node's native test runner (node:test + node:assert/strict) so that no
// new test dependency is introduced. classic theme is plain ESM JavaScript.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import {
  AI_MEDIA_CTA_LOCATIONS,
  VANCINE_DOCS_URL,
  getAiMediaCtaDestination,
  getAiMediaDocsUrl,
  getAiMediaMetadata,
} from './landing.js';

const require = createRequire(import.meta.url);

const FAQ_QUESTIONS = [
  'Is Vancine OpenAI compatible?',
  'Which models can I access?',
  'How does video generation work?',
  'Do I need a credit card to start?',
  'Where can I see pricing?',
  'Can I test models before integrating?',
];

const FAQ_ANSWERS = [
  'For supported text and speech workflows, Vancine offers OpenAI-compatible request shapes. For video, image, and 3D capabilities, use the documented media endpoints.',
  'You can use the video, image, speech, text, and 3D models currently supported by the platform. See the live pricing page and API documentation for current availability.',
  'Video generation uses an async task workflow: submit a generation request, receive a task ID, then poll the task status and retrieve the result.',
  'No. After signing up you receive $1 in free credits with no credit card required to begin testing.',
  'See the live pricing page. Model pricing can change, so this landing page does not hard-code specific prices.',
  'Yes. After signing you can test supported models in the Playground before writing any integration code.',
];

describe('classic ai-media-api landing contract', () => {
  test('logged-out CTA points to /register?source=ai-media-api', () => {
    assert.equal(
      getAiMediaCtaDestination(false),
      '/register?source=ai-media-api',
    );
  });

  test('logged-in CTA points to /console/playground', () => {
    assert.equal(getAiMediaCtaDestination(true), '/console/playground');
  });

  test('exactly the three allowed analytics locations, in order', () => {
    assert.deepEqual(AI_MEDIA_CTA_LOCATIONS, [
      'ai_media_hero',
      'ai_media_pricing',
      'ai_media_final',
    ]);
  });

  test('English metadata title', () => {
    assert.equal(
      getAiMediaMetadata('en').title,
      'Chinese AI Media APIs for Developers | Vancine',
    );
  });

  test('Chinese metadata title selected for zh-CN', () => {
    assert.equal(
      getAiMediaMetadata('zh-CN').title,
      '面向开发者的中国 AI 多媒体 API | Vancine',
    );
  });

  test('French falls back to English metadata', () => {
    assert.equal(
      getAiMediaMetadata('fr').title,
      'Chinese AI Media APIs for Developers | Vancine',
    );
  });

  test('canonical URL is stable across languages', () => {
    assert.equal(
      getAiMediaMetadata('zh-TW').canonical,
      'https://vancine.com/ai-media-api',
    );
    assert.equal(
      getAiMediaMetadata('en').canonical,
      'https://vancine.com/ai-media-api',
    );
  });

  test('Chinese metadata is selected for zh-TW', () => {
    assert.equal(
      getAiMediaMetadata('zh-TW').title,
      '面向开发者的中国 AI 多媒体 API | Vancine',
    );
  });

  test('docs URL contract points at vancine.com/docs', () => {
    assert.equal(VANCINE_DOCS_URL, 'https://vancine.com/docs');
    assert.equal(getAiMediaDocsUrl(), 'https://vancine.com/docs');
    assert.equal(getAiMediaDocsUrl('image'), 'https://vancine.com/docs#image');
    assert.equal(getAiMediaDocsUrl('video'), 'https://vancine.com/docs#video');
    assert.equal(getAiMediaDocsUrl('speech'), 'https://vancine.com/docs#audio');
  });

  test('docs URLs never point at the upstream docs domain or /docs/api', () => {
    for (const section of [undefined, 'image', 'video', 'speech']) {
      const url = getAiMediaDocsUrl(section);
      assert.ok(
        !url.includes('docs.newapi.pro'),
        `docs URL must not include docs.newapi.pro: ${url}`,
      );
      assert.ok(
        !url.includes('/docs/api'),
        `docs URL must not include /docs/api: ${url}`,
      );
    }
  });

  test('English FAQ question keys equal the question text', () => {
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

describe('classic ai-media-api locale parity (all locales carry FAQ keys)', () => {
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
