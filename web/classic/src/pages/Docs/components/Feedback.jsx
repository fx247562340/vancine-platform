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

const storageKey = (slug) => `docs-feedback:${slug}`;

const Feedback = ({ slug }) => {
  const { t } = useTranslation('docs');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    try {
      setSubmitted(!!localStorage.getItem(storageKey(slug)));
    } catch {
      setSubmitted(false);
    }
  }, [slug]);

  const submit = (value) => {
    try {
      localStorage.setItem(storageKey(slug), value);
    } catch {
      // ignore quota / private mode
    }
    setSubmitted(true);
  };

  const btnStyle = {
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: 500,
    borderRadius: '8px',
    border: `1px solid ${C.border}`,
    background: C.bg.light,
    color: C.text.body,
    cursor: submitted ? 'default' : 'pointer',
    opacity: submitted ? 0.5 : 1,
  };

  return (
    <div style={{
      marginTop: '40px',
      padding: '16px 20px',
      border: `1px solid ${C.border}`,
      borderRadius: '12px',
      background: C.bg.card,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '12px',
    }}>
      {submitted ? (
        <span style={{ fontSize: '14px', color: C.text.muted }}>{t('common.feedbackThanks')}</span>
      ) : (
        <>
          <span style={{ fontSize: '14px', color: C.text.body, fontWeight: 500 }}>
            {t('common.feedbackQuestion')}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={btnStyle} onClick={() => submit('yes')} disabled={submitted}>
              {t('common.feedbackYes')}
            </button>
            <button type="button" style={btnStyle} onClick={() => submit('no')} disabled={submitted}>
              {t('common.feedbackNo')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Feedback;
