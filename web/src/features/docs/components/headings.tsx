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
import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { DOCS_NS } from '../i18n/loader'
import {
  activeHeadingForScroll,
  scrollHeadingIntoView,
  TOC_SCROLL_OFFSET,
} from '../lib/toc-spy'
import { useToc } from './toc-store'

interface HeadingProps {
  children: ReactNode
  id: string
}

export function DocsH2(props: HeadingProps) {
  return (
    <h2
      id={props.id}
      className='text-foreground mt-8 mb-2 scroll-mt-20 text-2xl font-bold first:mt-0'
    >
      {props.children}
    </h2>
  )
}

export function DocsH3(props: HeadingProps) {
  return (
    <h3
      id={props.id}
      className='text-foreground mt-6 mb-2 scroll-mt-20 text-lg font-semibold'
    >
      {props.children}
    </h3>
  )
}

export function DocsP(props: { children: ReactNode }) {
  return (
    <p className='text-muted-foreground mb-4 leading-7'>{props.children}</p>
  )
}

export function DocsToc() {
  const { t } = useTranslation(DOCS_NS, { useSuspense: false })
  const { headings } = useToc()

  const ids = useMemo(() => headings.map((h) => h.id), [headings])

  // Scroll spy via useSyncExternalStore: subscribes to scroll/resize and
  // derives the active heading without any setState-in-effect. The selection
  // algorithm (activeHeadingForScroll) is pure and unit-tested separately.
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener('scroll', onStoreChange, { passive: true })
    window.addEventListener('resize', onStoreChange)
    return () => {
      window.removeEventListener('scroll', onStoreChange)
      window.removeEventListener('resize', onStoreChange)
    }
  }, [])

  const getSnapshot = useCallback(() => {
    const topOf = (id: string) =>
      document.getElementById(id)?.getBoundingClientRect().top ??
      Number.POSITIVE_INFINITY
    return activeHeadingForScroll(ids, topOf, TOC_SCROLL_OFFSET)
  }, [ids])

  const activeId = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  if (headings.length === 0) return null

  const onClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    scrollHeadingIntoView(id)
  }

  return (
    <nav
      aria-label={t('common.onThisPage')}
      className='sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto'
    >
      <p className='text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase'>
        {t('common.onThisPage')}
      </p>
      <ul className='flex flex-col gap-0.5'>
        {headings.map((h) => {
          const active = activeId === h.id
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                onClick={(e) => onClick(e, h.id)}
                aria-current={active ? 'location' : undefined}
                className={cn(
                  'block rounded-md px-3 py-1 text-[13px] transition-colors',
                  'focus-visible:ring-ring focus-visible:ring-2',
                  h.level === 3 && 'pl-6',
                  active
                    ? 'text-primary bg-primary/10 font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {h.title}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
