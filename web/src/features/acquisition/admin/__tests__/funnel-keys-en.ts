/*
Copyright (C) 2023-2026 QuantumNous

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
/**
 * The exact i18n keys the acquisition funnel page owns. This is a key
 * manifest only — translations live exclusively in the production locale
 * files (src/i18n/locales/en.json and zh.json), which the tests load
 * directly, so copy changes can never drift between a fixture and reality.
 */
export const FUNNEL_KEYS = [
  'Acquisition Funnel',
  'Admin only',
  'All dates on this page are UTC dates.',
  'All sources, all campaigns, all models',
  'API keys created',
  'Attribution coverage started',
  'Complete',
  'Consume logs',
  'Consume logs are disabled, so "First successful API calls" is unavailable.',
  'Conversion rates',
  'Data completeness',
  'Date is required',
  'Date must be a valid YYYY-MM-DD date',
  'Date range cannot exceed {{days}} days',
  'Exact match, optional',
  'Failed to load the acquisition funnel',
  'Filters',
  'First successful API calls',
  'From date (UTC, inclusive)',
  'From date must be earlier than To date',
  'Historical data has not been backfilled; only data since coverage began exists.',
  'Includes the default token created automatically at signup',
  'Landing → signup conversion',
  'Landing views',
  'Signup → first call conversion',
  'Signup completed',
  'Signup started',
  'The selected range starts before attribution coverage began; results are not complete history.',
  'The server did not return funnel data. You can retry the current query.',
  'This API provides no revenue, top-up or paid-conversion metrics.',
  'This page shows aggregate metrics only — no user identities or request contents.',
  'To date (UTC, exclusive)',
  'Touches',
  'Unavailable',
  'UTM campaign',
  'UTM source',
] as const

export type FunnelKey = (typeof FUNNEL_KEYS)[number]

export default FUNNEL_KEYS
