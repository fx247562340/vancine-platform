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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import C from '../constants';
import { allSlugs, slugToTitleKey } from '../nav';

const MAX_RESULTS = 8;
const SNIPPET_RADIUS = 40;
const DEBOUNCE_MS = 200;

const flattenValues = (obj, out = []) => {
  if (obj == null) return out;
  if (typeof obj === 'string') {
    out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item) => flattenValues(item, out));
    return out;
  }
  if (typeof obj === 'object') {
    Object.values(obj).forEach((v) => flattenValues(v, out));
  }
  return out;
};

const getDocsBundle = (i18n) => {
  const lang = i18n.resolvedLanguage || i18n.language;
  if (typeof i18n.getResourceBundle === 'function') {
    const bundle = i18n.getResourceBundle(lang, 'docs');
    if (bundle) return bundle;
  }
  return i18n.store?.data?.[lang]?.docs || {};
};

const buildIndex = (i18n) => {
  const bundle = getDocsBundle(i18n);
  const nav = bundle.nav || {};
  return allSlugs.map((slug) => {
    const titleKey = slugToTitleKey[slug] || slug;
    const title = nav[titleKey] || slug;
    const pageObj = bundle[slug] || {};
    const bodyParts = flattenValues(pageObj);
    const body = bodyParts.join(' ');
    return {
      slug,
      title,
      titleLower: String(title).toLowerCase(),
      body,
      bodyLower: body.toLowerCase(),
    };
  });
};

const makeSnippet = (text, query, queryLower) => {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(queryLower);
  if (idx === -1) return '';
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + query.length + SNIPPET_RADIUS);
  let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
};

const searchIndex = (index, query) => {
  const q = query.trim();
  if (!q) return [];
  const qLower = q.toLowerCase();
  const results = [];
  for (const item of index) {
    const titleHit = item.titleLower.includes(qLower);
    const bodyIdx = item.bodyLower.indexOf(qLower);
    if (!titleHit && bodyIdx === -1) continue;
    const score = titleHit ? 0 : 1;
    const snippet = titleHit ? '' : makeSnippet(item.body, q, qLower);
    results.push({ slug: item.slug, title: item.title, snippet, score });
  }
  results.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));
  return results.slice(0, MAX_RESULTS);
};

const SearchBox = () => {
  const { t, i18n } = useTranslation('docs');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const index = useMemo(
    () => buildIndex(i18n),
    // Rebuild when language changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n.language, i18n.resolvedLanguage],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const results = useMemo(() => searchIndex(index, debounced), [index, debounced]);
  const showDropdown = open && debounced.trim().length > 0;

  const go = (slug) => {
    navigate(`/docs/${slug}`);
    setQuery('');
    setDebounced('');
    setOpen(false);
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', marginBottom: '8px', padding: '0 4px' }}>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('common.searchPlaceholder')}
        aria-label={t('common.searchPlaceholder')}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 12px',
          fontSize: '13px',
          borderRadius: '8px',
          border: `1px solid ${C.border}`,
          background: C.bg.light,
          color: C.text.body,
          outline: 'none',
        }}
      />
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 50,
          marginTop: '4px',
          maxHeight: '320px',
          overflowY: 'auto',
          border: `1px solid ${C.border}`,
          borderRadius: '10px',
          background: C.bg.card,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          {results.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: '13px', color: C.text.muted }}>
              {t('common.searchNoResults')}
            </div>
          ) : (
            results.map((r) => (
              <button
                key={r.slug}
                type="button"
                onClick={() => go(r.slug)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  border: 'none',
                  borderBottom: `1px solid ${C.border}`,
                  background: 'transparent',
                  cursor: 'pointer',
                  color: C.text.body,
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: C.text.h1, marginBottom: r.snippet ? '4px' : 0 }}>
                  {r.title}
                </div>
                {r.snippet ? (
                  <div style={{
                    fontSize: '12px',
                    color: C.text.muted,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {r.snippet}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBox;
