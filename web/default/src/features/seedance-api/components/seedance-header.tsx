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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/language-switcher'
import { HeaderLogo } from '@/components/layout/components/header-logo'
import {
  SEEDANCE_CTA_EVENT,
  SEEDANCE_CTA_LOCATIONS,
  SEEDANCE_RESOURCE_EVENT,
  SEEDANCE_RESOURCE_VALUES,
  SEEDANCE_RESOURCE_LOCATIONS,
  VANCINE_SEEDANCE_DOCS_URL,
} from '../lib/landing'

export interface SeedanceHeaderProps {
  isAuthenticated: boolean
  siteName: string
  logo?: string
}

export function SeedanceHeader(props: SeedanceHeaderProps) {
  const { t } = useTranslation()
  const { isAuthenticated } = props

  return (
    <header className='border-border/40 bg-background/70 sticky top-0 z-50 border-b backdrop-blur-xl'>
      <div className='mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6'>
        <Link to='/' className='flex items-center gap-2'>
          <HeaderLogo
            src={props.logo || '/logo.png'}
            loading={false}
            logoLoaded={true}
            className='size-7 rounded-lg'
          />
          <span className='text-sm font-semibold tracking-tight'>
            {props.siteName}
          </span>
        </Link>

        <nav
          className='hidden items-center gap-6 whitespace-nowrap lg:flex'
          aria-label='Primary'
        >
          <a
            href='#workflow'
            className='text-muted-foreground hover:text-foreground shrink-0 text-sm leading-5 font-medium transition-colors'
          >
            {t('seedance.nav.workflow')}
          </a>
          <a
            href='#api'
            className='text-muted-foreground hover:text-foreground shrink-0 text-sm leading-5 font-medium transition-colors'
          >
            {t('seedance.nav.codeExamples')}
          </a>
          <a
            href='#pricing'
            className='text-muted-foreground hover:text-foreground shrink-0 text-sm leading-5 font-medium transition-colors'
          >
            {t('seedance.nav.freeCredit')}
          </a>
          <a
            href={VANCINE_SEEDANCE_DOCS_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='text-muted-foreground hover:text-foreground shrink-0 text-sm leading-5 font-medium transition-colors'
            onClick={() =>
              trackEvent(SEEDANCE_RESOURCE_EVENT, {
                resource: SEEDANCE_RESOURCE_VALUES[0],
                location: SEEDANCE_RESOURCE_LOCATIONS[0],
              })
            }
          >
            {t('Documentation')}
          </a>
        </nav>

        <div className='flex items-center gap-2'>
          <LanguageSwitcher />
          {isAuthenticated ? (
            <Button
              size='sm'
              className='h-8 px-3 text-xs font-medium'
              render={<Link to='/playground' />}
            >
              {t('Go to Playground')}
            </Button>
          ) : (
            <Button
              size='sm'
              className='h-8 px-3 text-xs font-medium'
              render={<Link to='/sign-in' />}
            >
              {t('Sign In')}
            </Button>
          )}
          <Button
            size='sm'
            className={cn(
              'h-8 px-3 text-xs font-medium',
              isAuthenticated && 'hidden'
            )}
            render={
              <Link
                to='/sign-up'
                onClick={() =>
                  trackEvent(SEEDANCE_CTA_EVENT, {
                    location: SEEDANCE_CTA_LOCATIONS[0],
                  })
                }
              />
            }
          >
            {t('Start Free')}
          </Button>
        </div>
      </div>
    </header>
  )
}
