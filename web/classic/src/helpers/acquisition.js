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
 * First-party acquisition attribution helper (classic theme).
 * Parity with web/default/src/lib/acquisition.ts
 *
 * reportSignupStarted always waits for any in-flight landing_view first.
 */

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
];

const inFlight = new Map();

/** Shared landing_view promise for the current page (if any). */
let landingViewPromise = null;

/**
 * Extract allowlisted UTM keys from a query string.
 * @param {string} search
 * @returns {Record<string, string>}
 */
export function extractUtm(search) {
  const out = {};
  if (!search) return out;
  try {
    const q = search.startsWith('?') ? search.slice(1) : search;
    const params = new URLSearchParams(q);
    for (const key of UTM_KEYS) {
      const raw = params.get(key);
      if (raw != null && raw !== '') {
        out[key] = raw;
      }
    }
  } catch (_err) {
    // ignore
  }
  return out;
}

/**
 * @param {string} [pathname]
 * @returns {string}
 */
export function extractLandingPath(pathname) {
  try {
    const path =
      pathname ??
      (typeof window !== 'undefined' && window.location
        ? window.location.pathname
        : '') ??
      '';
    if (!path || !path.startsWith('/')) return '';
    if (path.startsWith('//')) return '';
    return path.split(/[?#]/)[0] || '';
  } catch (_err) {
    return '';
  }
}

/**
 * @param {'landing_view'|'signup_started'} event
 * @param {Record<string, string>} [fields]
 * @param {{ keepalive?: boolean }} [opts]
 * @returns {Promise<void>}
 */
export async function reportAcquisitionEvent(event, fields, opts) {
  try {
    const body = { event };
    if (event === 'landing_view') {
      const src = fields || {};
      for (const key of UTM_KEYS) {
        if (typeof src[key] === 'string' && src[key] !== '') {
          body[key] = src[key];
        }
      }
      if (src.landing_path) body.landing_path = src.landing_path;
    }
    await fetch('/api/acquisition/touch', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: Boolean(opts && opts.keepalive),
    });
  } catch (_err) {
    // Intentionally swallowed
  }
}

/**
 * Global first-touch capture for the current page load.
 * @returns {Promise<void>}
 */
export function captureAndReportFirstTouch() {
  if (landingViewPromise) return landingViewPromise;

  const key = 'landing_view';
  const existing = inFlight.get(key);
  if (existing) {
    landingViewPromise = existing;
    return existing;
  }

  const p = (async () => {
    try {
      const search =
        typeof window !== 'undefined' && window.location
          ? window.location.search || ''
          : '';
      const pathname =
        typeof window !== 'undefined' && window.location
          ? window.location.pathname || ''
          : '';
      const utm = extractUtm(search);
      const landing_path = extractLandingPath(pathname);
      await reportAcquisitionEvent('landing_view', { ...utm, landing_path });
    } catch (_err) {
      // never throw
    }
  })();

  inFlight.set(key, p);
  landingViewPromise = p;
  return p;
}

/**
 * Fire signup_started against an existing touch only (server no-create).
 * Waits for any in-flight/page landing_view capture to settle first.
 * @param {{ keepalive?: boolean }} [opts]
 * @returns {Promise<void>}
 */
export async function reportSignupStarted(opts) {
  try {
    await captureAndReportFirstTouch();
  } catch (_err) {
    // soft-fail
  }

  const key = 'signup_started';
  const existing = inFlight.get(key);
  if (existing) {
    try {
      await existing;
    } catch (_err) {
      /* empty */
    }
    return;
  }

  const p = reportAcquisitionEvent('signup_started', undefined, {
    keepalive: Boolean(opts && opts.keepalive),
  });
  inFlight.set(key, p);
  try {
    await p;
  } catch (_err) {
    /* empty */
  }
}

/** Test-only */
export function __resetAcquisitionLocksForTests() {
  inFlight.clear();
  landingViewPromise = null;
}
