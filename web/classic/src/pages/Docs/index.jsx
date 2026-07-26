/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your later version).

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { Suspense, useContext, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../context/Status';
import Sidebar from './components/Sidebar';
import TOC from './components/TOC';
import Feedback from './components/Feedback';
import PrevNext from './components/PrevNext';
import { getPageComponent } from './registry';
import C from './constants';
// Inject highlight.js theme switching CSS
// In dark mode, hide github.css and show github-dark.css; vice versa for light
const themeStyles = `
.hljs-light .hljs { background: #f6f8fa; color: #24292e; }
.hljs-dark .hljs { background: #0d1117; color: #c9d1d9; }
.semi-layout-content:has(.vancine-docs-page) { overflow: visible !important; }
`;

const DocsLayout = () => {
  const { t } = useTranslation('docs');
  const { slug } = useParams();
  const [statusState] = useContext(StatusContext);

  // Derive baseUrl from server_address
  const rawServerAddress = statusState?.status?.server_address || 'https://vancine.com';
  const apiOrigin = rawServerAddress.replace(/\/+$/, '').replace(/\/v1$/i, '');
  const baseUrl = `${apiOrigin}/v1`;

  // Get the page component for this slug
  const PageComponent = getPageComponent(slug);

  // Provide context to child pages via a render prop pattern
  // Each page receives { baseUrl } as props
  const pageContext = useMemo(() => ({ baseUrl }), [baseUrl]);

  return (
    <div className="vancine-public-page vancine-docs-page" style={{
      width: '100%',
      minHeight: '100vh',
      background: 'var(--vc-page-bg)',
    }}>
      <style>{themeStyles}</style>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '96px 16px 32px',
      }}>
        {/* Three-column layout */}
        <div style={{ display: 'flex', gap: '40px' }}>
          {/* Left: Sidebar */}
          <Sidebar />

          {/* Center: Page content */}
          <main style={{ flex: 1, minWidth: 0, maxWidth: '768px' }}>
            <Suspense fallback={<div style={{ color: C.text.muted, padding: '40px 0' }}>Loading...</div>}>
              <PageComponent baseUrl={baseUrl} />
            </Suspense>
            <Feedback slug={slug} />
            <PrevNext slug={slug} />
          </main>
          {/* Right: TOC — desktop only */}
          <aside
            className="hidden lg:block"
            style={{ width: '180px', flexShrink: 0 }}
          >
            <TOCWrapper />
          </aside>
        </div>
      </div>
    </div>
  );
};

// Wrapper that reads headings from the current page
// Pages register their headings via a custom event or we scan the DOM
const TOCWrapper = () => {
  const [headings, setHeadings] = React.useState([]);

  React.useEffect(() => {
    const scanHeadings = () => {
      const main = document.querySelector('.vancine-docs-page main');
      if (!main) return;
      const els = main.querySelectorAll('h2[id], h3[id]');
      const items = Array.from(els).map((el) => ({
        id: el.id,
        title: el.textContent,
        level: el.tagName === 'H3' ? 3 : 2,
      }));
      setHeadings(items);
    };

    // Scan after a short delay to allow page content to render
    const timer = setTimeout(scanHeadings, 100);

    // Also re-scan on route changes
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      setTimeout(scanHeadings, 100);
    });

    const main = document.querySelector('.vancine-docs-page main');
    if (main) {
      observer.observe(main, { childList: true, subtree: true });
    }

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return <TOC headings={headings} />;
};

export default DocsLayout;
