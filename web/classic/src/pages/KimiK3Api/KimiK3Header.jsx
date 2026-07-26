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
import React, { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Languages } from 'lucide-react';
import { Button, Dropdown } from '@douyinfe/semi-ui';
import { trackEvent } from '../../helpers/analytics';
import { getLogo, getSystemName } from '../../helpers';
import { UserContext } from '../../context/User';
import { useLanguagePreference } from '../../hooks/common/useLanguagePreference';
import {
  LANGUAGE_OPTIONS,
  normalizeLanguage,
} from '../../i18n/language';
import { MOBILE_MAX, DESKTOP_NAV_MIN } from '../../constants/breakpoints';
import { getKimiK3CtaDestination } from './landing';

// Whether we are below the mobile breakpoint (<= MOBILE_MAX).
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return isMobile;
}

// Whether the horizontal nav should be visible (>= DESKTOP_NAV_MIN).
function useIsDesktopNavVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(`(min-width: ${DESKTOP_NAV_MIN}px)`);
    const update = () => setVisible(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return visible;
}

const C = {
  text: {
    strong: 'var(--vc-text-strong)',
    body: 'var(--vc-text-body)',
    muted: 'var(--vc-text-muted)',
  },
  border: 'var(--vc-border)',
  accent: 'var(--vc-accent)',
  accentBg: 'var(--vc-accent-bg)',
};

const KimiK3Header = ({ labels }) => {
  const { t, i18n } = useTranslation();
  const [userState] = useContext(UserContext);
  const navigate = useNavigate();
  const user = userState?.user;
  const isAuthenticated = !!user;
  const systemName = getSystemName();
  const logo = getLogo();
  const currentLang = normalizeLanguage(i18n.language);
  const showDesktopNav = useIsDesktopNavVisible();
  const isMobile = useIsMobile();
  const { handleLanguageChange } = useLanguagePreference();

  const destination = getKimiK3CtaDestination(
    isAuthenticated,
    typeof window === 'undefined' ? '' : window.location.search,
  );

  const handlePrimary = () => {
    trackEvent('get_started_clicked', { location: 'kimi_k3_header' });
    navigate(destination);
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(16px)',
        background: 'rgba(9,9,9,0.7)',
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          maxWidth: 1152,
          margin: '0 auto',
          height: 56,
          paddingLeft: 16,
          paddingRight: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <a
          href='/'
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
          }}
        >
          <img
            src={logo}
            alt={systemName}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              objectFit: 'contain',
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text.strong }}>
            {systemName}
          </span>
        </a>

        {showDesktopNav && (
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              whiteSpace: 'nowrap',
            }}
            aria-label='Primary'
          >
            {[
              { href: '#quickstart', label: labels.quickstartLink },
              { href: '#agents', label: labels.agents },
              { href: '#evidence', label: labels.evidenceNav },
              {
                href: 'https://vancine.com/docs',
                label: labels.docs,
                external: true,
              },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noopener noreferrer' : undefined}
                style={{
                  fontSize: 14,
                  lineHeight: '20px',
                  color: C.text.muted,
                  textDecoration: 'none',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = C.text.strong)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = C.text.muted)
                }
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Dropdown
            position='bottomRight'
            render={
              <Dropdown.Menu>
                {LANGUAGE_OPTIONS.map((lang) => (
                  <Dropdown.Item
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    className={
                      currentLang === lang.code
                        ? 'semi-dropdown-item-active'
                        : ''
                    }
                  >
                    {lang.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            }
          >
            <Button
              icon={<Languages size={18} />}
              aria-label={t('common.changeLanguage')}
              theme='borderless'
              type='tertiary'
              style={{ padding: 6, borderRadius: 9999 }}
            />
          </Dropdown>

          {isAuthenticated ? (
            <Button
              size='small'
              theme='solid'
              type='primary'
              onClick={handlePrimary}
            >
              {t('Go to Playground')}
            </Button>
          ) : (
            <>
              {!isMobile && (
                <Button
                  size='small'
                  type='tertiary'
                  onClick={() => navigate('/login')}
                >
                  {t('Login')}
                </Button>
              )}
              <Button
                size='small'
                theme='solid'
                type='primary'
                onClick={handlePrimary}
              >
                {t('Start Free')}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default KimiK3Header;
