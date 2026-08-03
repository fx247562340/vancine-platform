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
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { DOCS_NS } from '../i18n/loader'
import { readFeedback, saveFeedback } from '../lib/feedback'
import { getNextSlug, getPrevSlug, SLUG_TO_TITLE_KEY } from '../nav'
import type { DocsSlug } from '../types'

export function DocsPrevNext(props: { slug: DocsSlug }) {
  const { t } = useTranslation(DOCS_NS, { useSuspense: false })
  const prevSlug = getPrevSlug(props.slug)
  const nextSlug = getNextSlug(props.slug)

  if (!prevSlug && !nextSlug) return null

  return (
    <div className='border-border mt-10 flex flex-wrap gap-3 border-t pt-6'>
      {prevSlug ? (
        <Link
          to='/docs/$slug'
          params={{ slug: prevSlug }}
          className='border-border bg-card hover:bg-muted/50 flex flex-1 flex-col gap-1 rounded-xl border p-4 transition-colors'
        >
          <span className='text-muted-foreground text-xs font-medium'>
            ← {t('common.prevPage')}
          </span>
          <span className='text-foreground truncate text-sm font-semibold'>
            {t(`nav.${SLUG_TO_TITLE_KEY[prevSlug]}`)}
          </span>
        </Link>
      ) : (
        <div className='flex-1' />
      )}
      {nextSlug && (
        <Link
          to='/docs/$slug'
          params={{ slug: nextSlug }}
          className='border-border bg-card hover:bg-muted/50 flex flex-1 flex-col items-end gap-1 rounded-xl border p-4 text-right transition-colors'
        >
          <span className='text-muted-foreground text-xs font-medium'>
            {t('common.nextPage')} →
          </span>
          <span className='text-foreground truncate text-sm font-semibold'>
            {t(`nav.${SLUG_TO_TITLE_KEY[nextSlug]}`)}
          </span>
        </Link>
      )}
    </div>
  )
}

export function DocsFeedback(props: { slug: DocsSlug }) {
  const { t } = useTranslation(DOCS_NS, { useSuspense: false })
  // Lazy initializer reads persisted feedback once per mount. The component is
  // keyed by slug in the layout, so it remounts (and re-reads) on slug change —
  // no effect-driven setState required.
  const [submitted, setSubmitted] = useState(
    () => readFeedback(props.slug) !== null
  )

  const submit = (value: string) => {
    saveFeedback(props.slug, value)
    setSubmitted(true)
  }

  return (
    <div className='border-border bg-card mt-10 flex flex-wrap items-center gap-3 rounded-xl border p-4'>
      {submitted ? (
        <span className='text-muted-foreground text-sm'>
          {t('common.feedbackThanks')}
        </span>
      ) : (
        <>
          <span className='text-foreground text-sm font-medium'>
            {t('common.feedbackQuestion')}
          </span>
          <div className='flex gap-2'>
            <button
              type='button'
              onClick={() => submit('yes')}
              className='border-border bg-muted/50 hover:bg-muted cursor-pointer rounded-lg border px-4 py-1.5 text-[13px] font-medium transition-colors'
            >
              {t('common.feedbackYes')}
            </button>
            <button
              type='button'
              onClick={() => submit('no')}
              className='border-border bg-muted/50 hover:bg-muted cursor-pointer rounded-lg border px-4 py-1.5 text-[13px] font-medium transition-colors'
            >
              {t('common.feedbackNo')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
