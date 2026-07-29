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

import React, { useContext, useEffect, useRef, useState } from 'react';
import { API, copy, showSuccess } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { StatusContext } from '../../context/Status';
import { UserContext } from '../../context/User';
import { useActualTheme } from '../../context/Theme';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import NoticeModal from '../../components/layout/NoticeModal';
import HeroSection from '../../components/home/HeroSection';
import AvailableNowSection from '../../components/home/AvailableNowSection';
import StackSection from '../../components/home/StackSection';
import EvidenceSection from '../../components/home/EvidenceSection';
import WhySection from '../../components/home/WhySection';
import MarketplaceSection from '../../components/home/MarketplaceSection';
import CTASection from '../../components/home/CTASection';
import { normalizePricingResponse } from '../../components/home/homepage-pricing';

const HOME_CONTENT_SOFT_TIMEOUT_MS = 1500;

const PRICING_LOADING = Object.freeze({
  status: 'loading',
  count: null,
  models: [],
  featured: [],
  marketplace: [],
  vendors: [],
  rawVendors: [],
});

const PRICING_ERROR = Object.freeze({
  status: 'error',
  count: null,
  models: [],
  featured: [],
  marketplace: [],
  vendors: [],
  rawVendors: [],
});

const Home = () => {
  const { t, i18n } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const [userState] = useContext(UserContext);
  const actualTheme = useActualTheme();
  const isMobile = useIsMobile();
  const isAuthenticated = Boolean(userState?.user);

  // ── Single shared pricing state: exactly one GET /api/pricing per
  // homepage instance, consumed by Hero stats, Available now, Marketplace
  // and Connected providers. No session/local/module caches. ──
  const [pricingState, setPricingState] = useState(PRICING_LOADING);
  const pricingFetchedRef = useRef(false);

  // ── Operator custom home override (home_page_content) ──
  // 'builtin' shows the acquisition sections; never blank.
  const [homeView, setHomeView] = useState(() => {
    const cached =
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem('home_page_content')) ||
      '';
    return cached
      ? { mode: 'override', content: cached }
      : { mode: 'builtin', content: '' };
  });
  const [noticeVisible, setNoticeVisible] = useState(false);

  const docsLink = statusState?.status?.docs_link || '';
  const serverAddress =
    statusState?.status?.server_address || `${window.location.origin}`;

  useEffect(() => {
    if (pricingFetchedRef.current) return;
    pricingFetchedRef.current = true;
    API.get('/api/pricing')
      .then((res) => setPricingState(normalizePricingResponse(res.data)))
      .catch(() => setPricingState(PRICING_ERROR));
  }, []);

  useEffect(() => {
    let settled = false;
    const softTimer = setTimeout(() => {
      // Still pending and nothing cached yet: commit to the built-in home
      // so the viewport is never blank while the network is slow.
      setHomeView((current) =>
        current.mode === 'builtin' ? current : current,
      );
    }, HOME_CONTENT_SOFT_TIMEOUT_MS);

    const applyContent = (raw) => {
      if (!raw) {
        localStorage.removeItem('home_page_content');
        setHomeView({ mode: 'builtin', content: '' });
        return;
      }
      const content = raw.startsWith('https://') ? raw : marked.parse(raw);
      localStorage.setItem('home_page_content', content);
      setHomeView({ mode: 'override', content });
    };

    API.get('/api/home_page_content')
      .then((res) => {
        settled = true;
        const { success, data } = res.data;
        if (success) {
          applyContent(data);
        } else {
          // Network says no custom content: fall back to built-in unless
          // a cached override is already on screen.
          setHomeView((current) =>
            current.mode === 'override'
              ? current
              : { mode: 'builtin', content: '' },
          );
        }
      })
      .catch(() => {
        settled = true;
        // Error: keep any cached override already shown; otherwise built-in.
      })
      .finally(() => clearTimeout(softTimer));

    return () => {
      if (!settled) clearTimeout(softTimer);
    };
  }, []);

  // Theme/lang propagation for operator iframe overrides.
  useEffect(() => {
    const iframe = document.querySelector('.home-content-iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ themeMode: actualTheme }, '*');
      iframe.contentWindow.postMessage({ lang: i18n.language }, '*');
    }
  }, [actualTheme, i18n.language, homeView]);

  useEffect(() => {
    const checkNoticeAndShow = async () => {
      const lastCloseDate = localStorage.getItem('notice_close_date');
      const today = new Date().toDateString();
      if (lastCloseDate !== today) {
        try {
          const res = await API.get('/api/notice');
          const { success, data } = res.data;
          if (success && data && data.trim() !== '') {
            setNoticeVisible(true);
          }
        } catch (error) {
          console.error('Failed to fetch notice:', error);
        }
      }
    };
    checkNoticeAndShow();
  }, []);

  const handleCopyBaseURL = async () => {
    const ok = await copy(serverAddress + '/v1');
    if (ok) {
      showSuccess(t('已复制到剪切板'));
    }
  };

  return (
    <div
      className='vancine-public-page vancine-home-page w-full overflow-x-hidden'
      style={{ background: 'var(--vc-page-bg)' }}
    >
      <NoticeModal
        visible={noticeVisible}
        onClose={() => setNoticeVisible(false)}
        isMobile={isMobile}
      />
      {homeView.mode === 'builtin' ? (
        <>
          <HeroSection
            serverAddress={serverAddress}
            modelCount={pricingState.count}
            docsLink={docsLink}
            onCopy={handleCopyBaseURL}
            isMobile={isMobile}
            isAuthenticated={isAuthenticated}
          />
          <AvailableNowSection
            pricingState={pricingState}
            isMobile={isMobile}
          />
          <StackSection isMobile={isMobile} />
          <EvidenceSection isMobile={isMobile} />
          <WhySection isMobile={isMobile} />
          <MarketplaceSection pricingState={pricingState} isMobile={isMobile} />
          <CTASection isMobile={isMobile} isAuthenticated={isAuthenticated} />
        </>
      ) : (
        <div className='overflow-x-hidden w-full'>
          {homeView.content.startsWith('https://') ? (
            <iframe
              src={homeView.content}
              className='home-content-iframe w-full h-screen border-none'
              title={t('Custom Home Page')}
            />
          ) : (
            <div
              className='vancine-public-page vancine-home-page mt-[60px]'
              style={{ color: 'var(--vc-text-body)' }}
              dangerouslySetInnerHTML={{ __html: homeView.content }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Home;
