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
import React, { useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../../context/User';
import { getAiMediaMetadata, VANCINE_DOCS_URL } from './landing';
import AiMediaHeader from './AiMediaHeader';
import HeroSection from './HeroSection';
import ApiExamplesSection from './ApiExamplesSection';
import ContentSections from './ContentSections';

const ensureMeta = (selector, attr) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = selector.startsWith('link')
      ? document.createElement('link')
      : document.createElement('meta');
    document.head.appendChild(el);
  }
  return el;
};

const AiMediaApi = () => {
  const { t, i18n } = useTranslation('aimedia');
  const [userState] = useContext(UserContext);
  const language = i18n.language;

  useEffect(() => {
    const meta = getAiMediaMetadata(i18n.t);
    const prev = {
      title: document.title,
      description:
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute('content') || '',
      ogTitle:
        document
          .querySelector('meta[property="og:title"]')
          ?.getAttribute('content') || '',
      ogDescription:
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute('content') || '',
      ogUrl:
        document
          .querySelector('meta[property="og:url"]')
          ?.getAttribute('content') || '',
      canonical:
        document.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
        '',
    };

    document.title = meta.title;

    const desc = ensureMeta('meta[name="description"]');
    desc.setAttribute('name', 'description');
    desc.setAttribute('content', meta.description);

    const ogTitle = ensureMeta('meta[property="og:title"]');
    ogTitle.setAttribute('property', 'og:title');
    ogTitle.setAttribute('content', meta.ogTitle);

    const ogDesc = ensureMeta('meta[property="og:description"]');
    ogDesc.setAttribute('property', 'og:description');
    ogDesc.setAttribute('content', meta.ogDescription);

    const ogUrl = ensureMeta('meta[property="og:url"]');
    ogUrl.setAttribute('property', 'og:url');
    ogUrl.setAttribute('content', meta.canonical);

    const canon = ensureMeta('link[rel="canonical"]', 'href');
    canon.setAttribute('rel', 'canonical');
    canon.setAttribute('href', meta.canonical);

    return () => {
      document.title = prev.title;
      if (prev.description)
        ensureMeta('meta[name="description"]').setAttribute(
          'content',
          prev.description,
        );
      if (prev.ogTitle)
        ensureMeta('meta[property="og:title"]').setAttribute(
          'content',
          prev.ogTitle,
        );
      if (prev.ogDescription)
        ensureMeta('meta[property="og:description"]').setAttribute(
          'content',
          prev.ogDescription,
        );
      if (prev.ogUrl)
        ensureMeta('meta[property="og:url"]').setAttribute(
          'content',
          prev.ogUrl,
        );
      const c = document.querySelector('link[rel="canonical"]');
      if (c) {
        if (prev.canonical) c.setAttribute('href', prev.canonical);
        else c.remove();
      }
    };
  }, [language]);

  const isAuthenticated = !!userState?.user;
  const currentYear = new Date().getFullYear();

  return (
    <div
      className='vancine-public-page vancine-ai-media-api-page'
      style={{ minHeight: '100vh', background: 'var(--vc-page-bg)' }}
    >
      <AiMediaHeader />
      <main>
        <HeroSection />
        <ContentSections />
        <ApiExamplesSection />
      </main>

      {/* footer */}
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
          © {currentYear} Vancine · {t('footer')}
        </p>
      </div>
    </div>
  );
};

export default AiMediaApi;
