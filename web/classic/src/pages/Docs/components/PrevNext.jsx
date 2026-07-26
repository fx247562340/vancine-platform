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
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import C from '../constants';
import { allSlugs, slugToTitleKey } from '../nav';

const cardStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '16px',
  border: `1px solid ${C.border}`,
  borderRadius: '12px',
  textDecoration: 'none',
  color: C.text.body,
  background: C.bg.card,
  minWidth: 0,
};

const labelStyle = {
  fontSize: '12px',
  color: C.text.muted,
  fontWeight: 500,
};

const titleStyle = {
  fontSize: '14px',
  fontWeight: 600,
  color: C.text.h1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const PrevNext = ({ slug }) => {
  const { t } = useTranslation('docs');
  const idx = allSlugs.indexOf(slug);
  if (idx === -1) return null;

  const prevSlug = idx > 0 ? allSlugs[idx - 1] : null;
  const nextSlug = idx < allSlugs.length - 1 ? allSlugs[idx + 1] : null;
  if (!prevSlug && !nextSlug) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '12px',
      marginTop: '40px',
      paddingTop: '24px',
      borderTop: `1px solid ${C.border}`,
    }}>
      {prevSlug ? (
        <Link to={`/docs/${prevSlug}`} style={{ ...cardStyle, alignItems: 'flex-start' }}>
          <span style={labelStyle}>← {t('common.prevPage')}</span>
          <span style={titleStyle}>{t(`nav.${slugToTitleKey[prevSlug]}`)}</span>
        </Link>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }} />
      )}
      {nextSlug ? (
        <Link to={`/docs/${nextSlug}`} style={{ ...cardStyle, alignItems: 'flex-end', textAlign: 'right' }}>
          <span style={labelStyle}>{t('common.nextPage')} →</span>
          <span style={titleStyle}>{t(`nav.${slugToTitleKey[nextSlug]}`)}</span>
        </Link>
      ) : null}
    </div>
  );
};

export default PrevNext;
