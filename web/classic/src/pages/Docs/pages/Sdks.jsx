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

import React from 'react';
import { useTranslation } from 'react-i18next';
import C from '../constants';
import { H2, P } from '../components/Headings';

const Sdks = () => {
  const { t } = useTranslation('docs');

  const sdks = [
    { name: 'OpenAI Python SDK', install: 'pip install openai' },
    { name: 'OpenAI Node.js SDK', install: 'npm install openai' },
    { name: 'requests / fetch', install: t('sdks.requestsDesc') },
    { name: 'cURL', install: t('sdks.curlDesc') },
  ];

  return (
    <div>
      <H2 id="sdks-title">{t('sdks.title')}</H2>
      <P>{t('sdks.desc')}</P>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {sdks.map((sdk) => (
          <div key={sdk.name} style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px' }}>
            <h4 style={{ fontWeight: 600, color: C.text.h1, marginBottom: '4px' }}>{sdk.name}</h4>
            <code style={{ fontSize: '12px', color: C.text.muted, background: C.bg.light, padding: '2px 8px', borderRadius: '4px' }}>{sdk.install}</code>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sdks;
