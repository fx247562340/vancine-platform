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
import { useNavigate } from '@tanstack/react-router'
import { SearchIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { useDocsI18n } from '../i18n/docs-i18n-context'
import { DOCS_NS, getDocsBundle } from '../i18n/loader'
import { buildSearchIndex, searchDocs } from '../lib/search'
import {
  createSearchKeyboardState,
  searchKeyToAction,
  searchKeyboardReducer,
  searchOptionId,
} from '../lib/search-keyboard'
import type { SearchResult } from '../types'

const DEBOUNCE_MS = 200

export function DocsSearchBox() {
  const { t } = useTranslation(DOCS_NS, { useSuspense: false })
  const navigate = useNavigate()
  // Consuming the context subscribes this component to the provider's revision
  // bumps, so it re-renders once a lazy bundle finishes loading even though
  // only `locale` is read directly below.
  const { locale } = useDocsI18n()
  // Unique per instance so the desktop sidebar and the mobile drawer never
  // share listbox/option ids.
  const idBase = useId()
  const listboxId = `${idBase}-listbox`

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [rawActiveIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)

  // The bundle object is the real data dependency: it is a stable reference
  // while the store is unchanged and changes when the provider adds a freshly
  // loaded bundle, so the index rebuilds on first load and on language change.
  const bundle = getDocsBundle(locale)
  const index = useMemo(() => buildSearchIndex(bundle), [bundle])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const results: SearchResult[] = useMemo(
    () => searchDocs(index, debounced),
    [index, debounced]
  )

  // Derived (clamped) active index: always valid for the current result set so
  // aria-activedescendant never points at a non-existent option. Computing it
  // during render avoids an effect-driven setState when results shrink.
  const activeIndex = rawActiveIndex < results.length ? rawActiveIndex : -1

  const showDropdown = open && debounced.trim().length > 0

  const go = (slug: string) => {
    void navigate({ to: '/docs/$slug', params: { slug } })
    setQuery('')
    setDebounced('')
    setOpen(false)
    setActiveIndex(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (showDropdown && activeIndex >= 0 && activeIndex < results.length) {
        e.preventDefault()
        go(results[activeIndex].slug)
      }
      return
    }
    const action = searchKeyToAction(e.key, showDropdown)
    if (!action) return
    e.preventDefault()
    const next = searchKeyboardReducer(
      {
        ...createSearchKeyboardState(results.length),
        open: showDropdown,
        activeIndex,
      },
      action
    )
    setOpen(next.open)
    setActiveIndex(next.activeIndex)
  }

  const activeDescendant =
    showDropdown && activeIndex >= 0 && activeIndex < results.length
      ? searchOptionId(listboxId, activeIndex)
      : undefined

  return (
    <div ref={rootRef} className='relative mb-2 px-1'>
      <div className='relative'>
        <SearchIcon
          aria-hidden='true'
          className='text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2'
        />
        <input
          type='search'
          role='combobox'
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('common.searchPlaceholder')}
          aria-label={t('common.searchPlaceholder')}
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete='list'
          className='border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-lg border py-2 pr-3 pl-9 text-[13px] outline-none focus-visible:ring-2'
        />
      </div>
      {showDropdown && (
        <ul
          id={listboxId}
          role='listbox'
          aria-label={t('common.searchPlaceholder')}
          className='border-border bg-card absolute top-full right-0 left-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border shadow-lg'
        >
          {results.length === 0 ? (
            <li className='text-muted-foreground px-3.5 py-3 text-[13px]'>
              {t('common.searchNoResults')}
            </li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.slug}
                id={searchOptionId(listboxId, i)}
                role='option'
                aria-selected={i === activeIndex}
                onClick={() => go(r.slug)}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  'border-border block w-full cursor-pointer border-b px-3.5 py-2.5 text-left last:border-b-0',
                  i === activeIndex && 'bg-muted/70'
                )}
              >
                <span className='text-foreground block text-[13px] font-semibold'>
                  {r.title}
                </span>
                {r.snippet && (
                  <span className='text-muted-foreground mt-0.5 line-clamp-2 block text-xs leading-snug'>
                    {r.snippet}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
