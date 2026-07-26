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

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import C from '../constants';
import { navGroups } from '../nav';
import SearchBox from './SearchBox';

const Sidebar = () => {
  const { t } = useTranslation('docs');
  const { slug } = useParams();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (targetSlug) => {
    navigate(`/docs/${targetSlug}`);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <nav style={{
      position: 'sticky',
      top: '80px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <SearchBox />
      {navGroups.map((group) => (
        <div key={group.groupKey}>
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            color: C.text.subtle,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '0 12px',
            marginBottom: '4px',
          }}>
            {t(`nav.${group.groupKey}`)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {group.items.map((item) => {
              const active = slug === item.slug;
              return (
                <button
                  key={item.slug}
                  onClick={() => handleNav(item.slug)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontSize: '14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: 'none',
                    background: active ? C.accentBg : 'transparent',
                    color: active ? C.accent : C.text.muted,
                    fontWeight: active ? 600 : 400,
                    borderLeft: active ? `2px solid ${C.accent}` : '2px solid transparent',
                  }}
                >
                  {t(`nav.${item.titleKey}`)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        style={{
          display: 'none',
          width: '100%',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: 500,
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          background: C.bg.light,
          color: C.text.body,
          cursor: 'pointer',
          marginBottom: '16px',
          textAlign: 'left',
        }}
      >
        {t('common.navigation')} {mobileOpen ? '▲' : '▼'}
      </button>
      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="lg:hidden" style={{ marginBottom: '16px' }}>
          {sidebarContent}
        </div>
      )}
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:block"
        style={{ width: '224px', flexShrink: 0 }}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default Sidebar;
