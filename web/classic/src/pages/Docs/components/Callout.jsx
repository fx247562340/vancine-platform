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
import C from '../constants';

const Callout = ({ type = 'info', children }) => {
  const styles = {
    info: { border: 'var(--semi-color-info)', bg: 'var(--semi-color-info-light-default)', text: 'var(--semi-color-info)' },
    warning: { border: 'var(--semi-color-warning)', bg: 'var(--semi-color-warning-light-default)', text: 'var(--semi-color-warning)' },
    tip: { border: 'var(--semi-color-success)', bg: 'var(--semi-color-success-light-default)', text: 'var(--semi-color-success)' },
    danger: { border: 'var(--semi-color-danger)', bg: 'var(--semi-color-danger-light-default)', text: 'var(--semi-color-danger)' },
  };
  const s = styles[type] || styles.info;
  const icons = { info: 'ℹ️', warning: '⚠️', tip: '💡', danger: '🚫' };
  return (
    <div style={{
      borderLeft: `4px solid ${s.border}`,
      borderRadius: '0 8px 8px 0',
      padding: '12px 16px',
      marginBottom: '16px',
      fontSize: '14px',
      background: s.bg,
      color: s.text,
    }}>
      <span style={{ marginRight: '4px' }}>{icons[type]}</span> {children}
    </div>
  );
};

export default Callout;
