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

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useActualTheme } from '../../../context/Theme';
import C from '../constants';

// Import highlight.js and languages
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';

// Register languages
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('python', python);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);

// Import themes as CSS strings (Vite ?inline) for scoped injection
import githubLightCss from 'highlight.js/styles/github.css?inline';
import githubDarkCss from 'highlight.js/styles/github-dark.css?inline';

// Scope each selector in a CSS string under a prefix class so light/dark
// themes don't clash when both are in the same document.
const scopeCss = (css, scope) =>
  css.replace(/([^{}]+)\{/g, (match, selectors) =>
    selectors
      .split(',')
      .map((s) => `${scope} ${s.trim()}`)
      .join(', ') + ' {'
  );

// Inject scoped themes once into <head>
let hljsThemesInjected = false;
const injectHljsThemes = () => {
  if (hljsThemesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.setAttribute('data-docs-hljs-themes', 'true');
  style.textContent =
    scopeCss(githubLightCss, '.hljs-light') +
    scopeCss(githubDarkCss, '.hljs-dark');
  document.head.appendChild(style);
  hljsThemesInjected = true;
};
injectHljsThemes();

// Language detection helper
const detectLanguage = (code, title) => {
  if (title) {
    const lower = title.toLowerCase();
    if (lower.includes('curl') || lower.includes('bash') || lower.includes('shell')) return 'bash';
    if (lower.includes('python')) return 'python';
    if (lower.includes('node') || lower.includes('javascript')) return 'javascript';
    if (lower.includes('json')) return 'json';
  }
  // Fallback: auto-detect
  try {
    const result = hljs.highlightAuto(code, ['bash', 'python', 'javascript', 'json']);
    if (result.language) return result.language;
  } catch {
    // ignore
  }
  return 'bash';
};

const CodeBlock = ({ code, title, language: langProp }) => {
  const { t } = useTranslation('docs');
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);
  const actualTheme = useActualTheme();
  const isDark = actualTheme === 'dark';

  // Apply syntax highlighting
  useEffect(() => {
    if (codeRef.current) {
      const lang = langProp || detectLanguage(code, title);
      try {
        const result = hljs.highlight(code, { language: lang });
        codeRef.current.innerHTML = result.value;
      } catch {
        // Fallback: just set text content
        codeRef.current.textContent = code;
      }
    }
  }, [code, title, langProp]);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      marginBottom: '24px',
      borderRadius: '12px',
      overflow: 'hidden',
      border: `1px solid ${C.border}`,
    }}>
      {title && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: C.bg.light,
          borderBottom: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: C.text.muted }}>{title}</span>
          <button
            onClick={copy}
            style={{
              fontSize: '12px',
              color: C.text.muted,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {copied ? t('common.copied') : t('common.copy')}
          </button>
        </div>
      )}
      <pre
        className={isDark ? 'hljs-dark' : 'hljs-light'}
        style={{
          background: C.bg.code,
          color: C.codeText,
          padding: '16px',
          overflowX: 'auto',
          fontSize: '13px',
          lineHeight: 1.7,
          margin: 0,
        }}
      >
        <code ref={codeRef}>{code}</code>
      </pre>
    </div>
  );
};

export default CodeBlock;
