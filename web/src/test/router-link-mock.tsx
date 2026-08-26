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

For commercial licensing, please contact support@quantumnous.com.
*/
/**
 * Shared TanStack Router Link mock for Vitest tests. jsdom has no
 * router, so components that import `Link` from `@tanstack/react-router`
 * need a minimal `<a>` shim that preserves `aria-current` (used by
 * the Canvas Composer header navigation).
 */
export const routerLinkMock = {
  Link: (props: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    className?: string
    'aria-current'?: 'page'
  }) => {
    let href = props.to
    for (const [key, value] of Object.entries(props.params ?? {})) {
      href = href.replace(`$${key}`, value)
    }
    return (
      <a
        href={href}
        className={props.className}
        aria-current={props['aria-current']}
      >
        {props.children}
      </a>
    )
  },
}
