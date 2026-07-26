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
import { H2 } from '../components/Headings';

const FAQ_ITEMS = ['verifyKey', 'video3dResults', 'ttsNotJson', 'seedreamSize'];

const Faq = ({ baseUrl }) => {
  const { t } = useTranslation('docs');

  return (
    <div>
      <H2 id="faq-title">{t('faq.title')}</H2>
      {FAQ_ITEMS.map((itemKey, i) => (
        <div key={i} style={{ marginBottom: '16px', border: `1px solid ${C.border}`, borderRadius: '12px', padding: '20px' }}>
          <h4 style={{ fontWeight: 600, color: C.text.h1, marginBottom: '8px' }}>{t(`faq.items.${itemKey}.q`)}</h4>
          <p style={{ fontSize: '14px', color: C.text.muted, lineHeight: 1.7 }}>{t(`faq.items.${itemKey}.a`, { baseUrl })}</p>
        </div>
      ))}
    </div>
  );
};

export default Faq;
