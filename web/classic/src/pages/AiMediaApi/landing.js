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
/**
 * Pure, dependency-free landing-page contract for the Classic theme.
 *
 * Mirrors the Default theme's landing.ts semantics so both themes share one
 * acquisition contract. Kept free of React/DOM so the Node native test
 * runner can verify behavior without a browser.
 */

/** Primary CTA event name shared with the analytics layer. */
export const AI_MEDIA_CTA_EVENT = 'get_started_clicked';

/**
 * Ordered, immutable list of the only analytics location values this page
 * may send. Every primary CTA must use one of these.
 */
export const AI_MEDIA_CTA_LOCATIONS = Object.freeze([
  'ai_media_hero',
  'ai_media_pricing',
  'ai_media_final',
]);

/** Classic-theme CTA destinations, keyed by authentication state. */
const CLASSIC_CTA_DESTINATION = {
  guest: '/register?source=ai-media-api',
  authenticated: '/console/playground',
};

/**
 * Returns the primary CTA destination for the Classic theme.
 *
 * @param {boolean} isAuthenticated whether a user session is active
 * @returns {string} the destination path
 */
export function getAiMediaCtaDestination(isAuthenticated) {
  return isAuthenticated
    ? CLASSIC_CTA_DESTINATION.authenticated
    : CLASSIC_CTA_DESTINATION.guest;
}

/** Canonical landing URL, identical across languages in version one. */
const AI_MEDIA_CANONICAL = 'https://vancine.com/ai-media-api';

/**
 * Vancine's own documentation base URL. All user-facing docs entry points
 * on this page resolve here.
 */
export const VANCINE_DOCS_URL = 'https://vancine.com/docs';

const AI_MEDIA_DOCS_SECTION = {
  image: '#image',
  video: '#video',
  speech: '#audio',
};

/**
 * Returns a Vancine docs URL for the given media section.
 *
 * @param {('image'|'video'|'speech')} [section] section id, or omit for docs home
 * @returns {string} a vancine.com/docs[...] URL
 */
export function getAiMediaDocsUrl(section) {
  const anchor = section ? AI_MEDIA_DOCS_SECTION[section] || '' : '';
  return `${VANCINE_DOCS_URL}${anchor}`;
}

// Returns the route-specific SEO/social metadata from the `aimedia`
// namespace at runtime. The caller passes its own `t` function (the page
// supplies `i18n.t` from useTranslation; tests supply a synthetic
// translator built from the resource-loader) so this module no longer
// imports the i18n singleton and loads under Node's test runner. Invoke
// inside an effect (i18n has been initialized by then) and refresh on
// language change.
export function getAiMediaMetadata(t) {
  const tt = (key) => t(key, { ns: 'aimedia' });
  return {
    title: tt('meta.title'),
    description: tt('meta.description'),
    ogTitle: tt('meta.ogTitle'),
    ogDescription: tt('meta.ogDescription'),
    canonical: AI_MEDIA_CANONICAL,
  };
}

/**
 * Static, dependency-free API code examples. These mirror the existing
 * English documentation and use documented endpoints only.
 *
 * @type {{id: string, labelKey: string, code: string}[]}
 */
export const AI_MEDIA_CODE_EXAMPLES = Object.freeze([
  {
    id: 'image',
    labelKey: 'Image',
    code: `curl https://vancine.com/v1/images/generations \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "doubao-seedream",
    "prompt": "A friendly robot watering plants in a sunlit greenhouse",
    "response_format": "url"
  }'`,
  },
  {
    id: 'video',
    labelKey: 'Video',
    code: `# 1. Create a video generation task
curl https://vancine.com/v1/video/generations \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "doubao-seedance",
    "prompt": "A timelapse of a flower blooming at sunrise"
  }'

# 2. Poll the task status and fetch the result
curl https://vancine.com/v1/video/generations/{task_id} \\
  -H "Authorization: Bearer $VANCINE_API_KEY"`,
  },
  {
    id: 'speech',
    labelKey: 'Text to Speech',
    code: `curl https://vancine.com/v1/audio/speech \\
  -H "Authorization: Bearer $VANCINE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "doubao-tts",
    "input": "Hello from Vancine. One API for video, image, speech, and text.",
    "voice": "zh_female_cancan_mars",
    "response_format": "mp3"
  }' \\
  --out speech.mp3`,
  },
]);
