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
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type MediaPlaygroundHeaderProps = {
  title: string
  subtitle?: ReactNode
  /** Which playground page is active — drives aria-current on the nav. */
  active: 'image' | 'video'
  /** Optional right-aligned status slot (e.g. masked key status). */
  status?: ReactNode
}

/**
 * Shared Canvas Composer page header: title + description, visually
 * consistent Image/Video route navigation, and the Usage logs entry.
 * Presentation only — no data fetching or business state.
 */
export function MediaPlaygroundHeader(props: MediaPlaygroundHeaderProps) {
  const { t } = useTranslation()
  return (
    <header className='flex flex-col gap-4'>
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div className='space-y-1.5'>
          <h1 className='text-2xl font-semibold tracking-tight md:text-[1.75rem]'>
            {props.title}
          </h1>
          {props.subtitle ? (
            <p className='text-muted-foreground text-sm'>{props.subtitle}</p>
          ) : null}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <nav
            aria-label={t('Media type')}
            className='bg-muted/60 border-border/60 inline-flex items-center gap-0.5 rounded-xl border p-0.5'
          >
            <HeaderNavLink
              to='/playground/image'
              isActive={props.active === 'image'}
            >
              {t('Image')}
            </HeaderNavLink>
            <HeaderNavLink
              to='/playground/video'
              isActive={props.active === 'video'}
            >
              {t('Video')}
            </HeaderNavLink>
          </nav>
          <Button variant='ghost' size='sm' render={<Link to='/usage-logs' />}>
            {t('Usage logs')}
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              aria-hidden
              data-icon='inline-end'
            />
          </Button>
          {props.status}
        </div>
      </div>
    </header>
  )
}

function HeaderNavLink(props: {
  to: '/playground/image' | '/playground/video'
  isActive: boolean
  children: ReactNode
}) {
  return (
    <Link
      to={props.to}
      aria-current={props.isActive ? 'page' : undefined}
      className={cn(
        'inline-flex h-7 items-center rounded-[10px] px-3 text-[0.8rem] font-medium transition-colors',
        props.isActive
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {props.children}
    </Link>
  )
}
