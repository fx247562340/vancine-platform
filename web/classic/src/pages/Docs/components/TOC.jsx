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

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import C from '../constants';

const TOC = ({ headings }) => {
  const { t } = useTranslation('docs');
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const handleScroll = () => {
      for (let i = headings.length - 1; i >= 0; i--) {
        const el = document.getElementById(headings[i].id);
        if (el && el.getBoundingClientRect().top <= 120) {
          setActiveId(headings[i].id);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headings]);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!headings || headings.length === 0) return null;

  return (
    <nav style={{
      position: 'sticky',
      top: '80px',
      maxHeight: 'calc(100vh - 120px)',
      overflowY: 'auto',
    }}>
      <div style={{
        fontSize: '12px',
        fontWeight: 600,
        color: C.text.muted,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '8px',
      }}>
        {t('common.onThisPage')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {headings.map((h) => {
          const active = activeId === h.id;
          const isH3 = h.level === 3;
          return (
            <button
              key={h.id}
              onClick={() => scrollTo(h.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: `${isH3 ? '4px' : '6px'} 12px`,
                fontSize: '13px',
                borderRadius: '6px',
                cursor: 'pointer',
                border: 'none',
                background: active ? C.accentBg : 'transparent',
                color: active ? C.accent : C.text.muted,
                fontWeight: active ? 600 : 400,
                paddingLeft: isH3 ? '24px' : '12px',
              }}
            >
              {h.title}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default TOC;
