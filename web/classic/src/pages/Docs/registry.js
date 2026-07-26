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

import React, { lazy } from 'react';
import { useTranslation } from 'react-i18next';
import C from './constants';

// Lazy-load page components — add more as pages are implemented
const QuickStart = lazy(() => import('./pages/QuickStart'));
const Migrate = lazy(() => import('./pages/Migrate'));
const Chat = lazy(() => import('./pages/Chat'));
const Image = lazy(() => import('./pages/Image'));
const Video = lazy(() => import('./pages/Video'));
const Td = lazy(() => import('./pages/Td'));
const Audio = lazy(() => import('./pages/Audio'));
const Auth = lazy(() => import('./pages/Auth'));
const Capabilities = lazy(() => import('./pages/Capabilities'));
const Models = lazy(() => import('./pages/Models'));
const Errors = lazy(() => import('./pages/Errors'));
const Sdks = lazy(() => import('./pages/Sdks'));
const Agents = lazy(() => import('./pages/Agents'));
const Faq = lazy(() => import('./pages/Faq'));

// Slug → page component mapping
const pageRegistry = {
  quickstart: QuickStart,
  migrate: Migrate,
  chat: Chat,
  image: Image,
  video: Video,
  td: Td,
  audio: Audio,
  auth: Auth,
  capabilities: Capabilities,
  models: Models,
  errors: Errors,
  sdks: Sdks,
  agents: Agents,
  faq: Faq,
};

// Placeholder for unimplemented pages
const ComingSoon = () => {
  const { t } = useTranslation('docs');
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '300px',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '48px',
        marginBottom: '16px',
      }}>🚧</div>
      <h2 style={{
        fontSize: '24px',
        fontWeight: 700,
        color: C.text.h1,
        marginBottom: '8px',
      }}>{t('common.comingSoon')}</h2>
      <p style={{
        fontSize: '16px',
        color: C.text.muted,
      }}>{t('common.pageNotReady')}</p>
    </div>
  );
};

export const getPageComponent = (slug) => {
  return pageRegistry[slug] || ComingSoon;
};

export default pageRegistry;
