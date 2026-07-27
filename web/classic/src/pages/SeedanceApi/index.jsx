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
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getSeedanceMetadata } from './landing';
import SeedanceHeader from './SeedanceHeader';
import HeroSection from './HeroSection';
import WorkflowSection from './WorkflowSection';
import CodeExamplesSection from './CodeExamplesSection';
import ConversionSections from './ConversionSections';

// Snapshot of a meta/link element's original state before Seedance touches
// it. We track all four distinct cases the cleanup phase must handle:
//   1. element did not exist → Seedance must remove the element it creates
//   2. element existed, had the attribute → restore the original value (''
//      included)
//   3. element existed, lacked the attribute → remove the attribute Seedance
//      added
//   4. element existed, attribute had a normal value → restore that value
//
// After the effect (possibly) creates a new element, it writes that element
// back into `snapshot.el` so cleanup can find and remove it.
function snapshotMeta(selector, attr) {
  const el = document.head.querySelector(selector);
  const attribute = attr ?? 'content';
  return {
    el: el ?? null,
    // The actual element the effect will mutate. It starts as the
    // pre-existing element, or null when Seedance must create one; the
    // effect reassigns this to the freshly created element so cleanup can
    // remove it.
    existed: !!el,
    hadAttribute: el ? el.hasAttribute(attribute) : false,
    value: el?.getAttribute(attribute) ?? '',
  };
}

function restoreOrRemoveMeta(snapshot, attr) {
  const { el, existed, hadAttribute, value } = snapshot;
  if (!el) return;
  const attribute = attr ?? 'content';
  if (!existed) {
    // Seedance created this element from scratch; remove it so it does not
    // leak onto other routes.
    el.remove();
  } else if (hadAttribute) {
    // Original attribute value is restored verbatim — including '' — so the
    // element returns to its exact pre-Seedance state.
    el.setAttribute(attribute, value);
  } else {
    // The element existed but did NOT have this attribute; Seedance added
    // it, so we remove the attribute to restore the original state.
    el.removeAttribute(attribute);
  }
}

// Resolve the element a snapshot should operate on. If the snapshot's
// element already exists, reuse it. Otherwise create the element with its
// identity attribute (name / property / rel), append it, and record the
// created element back onto the snapshot so cleanup can remove it.
function prepareElement(snapshot, tag, identityAttr, identityValue) {
  let el = snapshot.el;
  if (!el) {
    el = document.createElement(tag);
    el.setAttribute(identityAttr, identityValue);
    document.head.appendChild(el);
    snapshot.el = el;
  }
  return el;
}

const SeedanceApi = () => {
  const { t, i18n } = useTranslation('seedance');
  const language = i18n.language;

  useEffect(() => {
    const meta = getSeedanceMetadata();

    // Snapshot BEFORE any mutation so the cleanup phase can distinguish
    // "pre-existing" from "Seedance-created".
    const snapshots = {
      description: snapshotMeta('meta[name="description"]'),
      ogTitle: snapshotMeta('meta[property="og:title"]'),
      ogDescription: snapshotMeta('meta[property="og:description"]'),
      ogUrl: snapshotMeta('meta[property="og:url"]'),
      canonical: snapshotMeta('link[rel="canonical"]', 'href'),
    };
    const prevTitle = document.title;

    document.title = meta.title;

    prepareElement(
      snapshots.description,
      'meta',
      'name',
      'description',
    ).setAttribute('content', meta.description);
    prepareElement(
      snapshots.ogTitle,
      'meta',
      'property',
      'og:title',
    ).setAttribute('content', meta.ogTitle);
    prepareElement(
      snapshots.ogDescription,
      'meta',
      'property',
      'og:description',
    ).setAttribute('content', meta.ogDescription);
    prepareElement(snapshots.ogUrl, 'meta', 'property', 'og:url').setAttribute(
      'content',
      meta.canonical,
    );
    prepareElement(
      snapshots.canonical,
      'link',
      'rel',
      'canonical',
    ).setAttribute('href', meta.canonical);

    return () => {
      document.title = prevTitle;
      restoreOrRemoveMeta(snapshots.description);
      restoreOrRemoveMeta(snapshots.ogTitle);
      restoreOrRemoveMeta(snapshots.ogDescription);
      restoreOrRemoveMeta(snapshots.ogUrl);
      restoreOrRemoveMeta(snapshots.canonical, 'href');
    };
  }, [language]);

  const currentYear = new Date().getFullYear();

  return (
    <div
      className='vancine-public-page vancine-seedance-api-page'
      style={{
        minHeight: '100vh',
        background: 'var(--vc-page-bg)',
        overflowWrap: 'break-word',
      }}
    >
      <SeedanceHeader />
      <main>
        <HeroSection />
        <WorkflowSection />
        <CodeExamplesSection />
        <ConversionSections />
      </main>

      <div
        style={{
          textAlign: 'center',
          padding: '32px 24px 48px',
          borderTop: `1px solid var(--vc-border)`,
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: 'var(--vc-text-subtle)',
            lineHeight: 2,
          }}
        >
          © {currentYear} Vancine ·{' '}
          {t('footer')}
        </p>
      </div>
    </div>
  );
};

export default SeedanceApi;
