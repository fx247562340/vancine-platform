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
import { BookOpen01Icon, Key01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { trackEvent } from '@/lib/analytics'

import {
  getKimiK3CtaTarget,
  KIMI_K3_CODE_EXAMPLES,
  KIMI_K3_CTA_EVENT,
  KIMI_K3_RESOURCE_EVENT,
} from '../lib/landing'
import { CopyableCode } from './copyable-code'

export interface QuickstartProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/**
 * Switchable cURL / Python / Node.js / OpenCode examples. Every example uses
 * the public endpoint and an environment-variable API key.
 */
export function Quickstart(props: QuickstartProps): ReactElement {
  const { t } = useTranslation()
  const ctaTarget = getKimiK3CtaTarget(props.isAuthenticated, props.search)

  return (
    <section
      id='quickstart'
      aria-labelledby='kimi-k3-quickstart-title'
      className='mx-auto w-full max-w-4xl scroll-mt-24 px-4 py-16 md:px-6'
    >
      <div className='flex flex-col gap-2'>
        <h2 id='kimi-k3-quickstart-title' className='text-3xl font-bold'>
          {t('OpenAI-compatible quickstart')}
        </h2>
        <p className='text-muted-foreground'>
          {t(
            'Send your first Kimi K3 chat completion with an environment variable, not a pasted secret.'
          )}
        </p>
      </div>

      <Tabs defaultValue='curl' className='mt-8'>
        <TabsList aria-label={t('Quickstart languages')}>
          {KIMI_K3_CODE_EXAMPLES.map((example) => (
            <TabsTrigger key={example.id} value={example.id}>
              {example.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {KIMI_K3_CODE_EXAMPLES.map((example) => (
          <TabsContent key={example.id} value={example.id} className='mt-4'>
            <CopyableCode code={example.code} label={example.label} />
          </TabsContent>
        ))}
      </Tabs>

      <Separator className='my-8' />

      <div className='flex flex-wrap items-center gap-3'>
        <Button
          variant='outline'
          render={<Link to='/docs/$slug' params={{ slug: 'chat' }} />}
          onClick={() =>
            trackEvent(KIMI_K3_RESOURCE_EVENT, {
              resource: 'docs',
              location: 'quickstart',
            })
          }
        >
          <HugeiconsIcon
            icon={BookOpen01Icon}
            data-icon='inline-start'
            aria-hidden='true'
          />
          {t('Read API documentation')}
        </Button>
        <Button
          render={<Link to={ctaTarget.to} search={ctaTarget.search} />}
          onClick={() =>
            trackEvent(KIMI_K3_CTA_EVENT, { location: 'kimi_k3_quickstart' })
          }
        >
          <HugeiconsIcon
            icon={Key01Icon}
            data-icon='inline-start'
            aria-hidden='true'
          />
          {t('Create an API key')}
        </Button>
      </div>
    </section>
  )
}
