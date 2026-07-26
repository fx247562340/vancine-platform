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
import C from '../constants';

const Tabs = ({ tabs, active, onChange }) => (
  <div style={{
    display: 'flex',
    gap: '4px',
    borderBottom: `1px solid ${C.border}`,
    marginBottom: '16px',
  }}>
    {tabs.map((tab) => (
      <button
        key={tab.key}
        onClick={() => onChange(tab.key)}
        style={{
          padding: '8px 16px',
          fontSize: '14px',
          fontWeight: 500,
          border: 'none',
          cursor: 'pointer',
          background: 'none',
          borderBottom: `2px solid ${active === tab.key ? C.accent : 'transparent'}`,
          color: active === tab.key ? C.accent : C.text.muted,
          marginBottom: '-1px',
        }}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export default Tabs;
