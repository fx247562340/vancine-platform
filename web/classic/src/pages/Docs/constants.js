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

/* ──────────────────── Color constants ──────────────────── */

const C = {
  text: {
    h1: 'var(--vc-text-strong)',
    body: 'var(--vc-text-body)',
    muted: 'var(--vc-text-muted)',
    subtle: 'var(--vc-text-subtle)',
  },
  bg: {
    light: 'var(--semi-color-fill-0)',
    card: 'var(--vc-card-bg)',
    code: 'var(--vc-code-bg)',
  },
  border: 'var(--vc-border)',
  accent: 'var(--vc-accent)',
  accentBg: 'var(--vc-accent-bg)',
  codeText: 'var(--vc-code-text)',
  badge: {
    purple: { bg: 'var(--semi-color-primary-light-default)', text: 'var(--semi-color-primary)' },
    green: { bg: 'var(--semi-color-success-light-default)', text: 'var(--semi-color-success)' },
    blue: { bg: 'var(--semi-color-info-light-default)', text: 'var(--semi-color-info)' },
    orange: { bg: 'var(--semi-color-warning-light-default)', text: 'var(--semi-color-warning)' },
    red: { bg: 'var(--semi-color-danger-light-default)', text: 'var(--semi-color-danger)' },
    gray: { bg: 'var(--semi-color-fill-0)', text: 'var(--semi-color-text-2)' },
  },
  method: {
    GET: 'var(--semi-color-success)',
    POST: 'var(--semi-color-info)',
    PUT: 'var(--semi-color-warning)',
    DELETE: 'var(--semi-color-danger)',
  },
};

export default C;
