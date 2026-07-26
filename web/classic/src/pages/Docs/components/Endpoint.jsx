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

const MethodBadge = ({ method }) => (
  <span style={{
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#fff',
    borderRadius: '4px',
    background: C.method[method] || 'var(--semi-color-text-2)',
  }}>
    {method}
  </span>
);

const Endpoint = ({ method, path, desc }) => (
  <div style={{
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    background: C.bg.light,
    border: `1px solid ${C.border}`,
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '16px',
  }}>
    <MethodBadge method={method} />
    <div>
      <code style={{ fontSize: '14px', fontWeight: 600, color: C.text.h1 }}>{path}</code>
      {desc && <p style={{ fontSize: '14px', color: C.text.muted, marginTop: '4px' }}>{desc}</p>}
    </div>
  </div>
);

export default Endpoint;
