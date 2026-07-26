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

// Navigation groups for the docs sidebar.
// groupKey and titleKey are i18n keys in the docs namespace: nav.<groupKey>, nav.<titleKey>
export const navGroups = [
  {
    groupKey: 'gettingStarted',
    items: [
      { slug: 'quickstart', titleKey: 'quickstart' },
      { slug: 'migrate', titleKey: 'migrate' },
      { slug: 'models', titleKey: 'models' },
    ],
  },
  {
    groupKey: 'apiCapabilities',
    items: [
      { slug: 'chat', titleKey: 'chat' },
      { slug: 'image', titleKey: 'image' },
      { slug: 'video', titleKey: 'video' },
      { slug: 'td', titleKey: 'td' },
      { slug: 'audio', titleKey: 'audio' },
    ],
  },
  {
    groupKey: 'integrationGuide',
    items: [
      { slug: 'sdks', titleKey: 'sdks' },
      { slug: 'agents', titleKey: 'agents' },
    ],
  },
  {
    groupKey: 'reference',
    items: [
      { slug: 'auth', titleKey: 'auth' },
      { slug: 'capabilities', titleKey: 'capabilities' },
      { slug: 'errors', titleKey: 'errors' },
      { slug: 'faq', titleKey: 'faq' },
    ],
  },
];

// Flat list of all slugs for validation / prev-next navigation
export const allSlugs = navGroups.flatMap((g) => g.items.map((i) => i.slug));

// slug → titleKey lookup (titleKey is used with t(`nav.${titleKey}`))
export const slugToTitleKey = Object.fromEntries(
  navGroups.flatMap((g) => g.items.map((i) => [i.slug, i.titleKey])),
);
