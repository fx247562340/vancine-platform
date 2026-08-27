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
  getGlm53ApiCtaLabelKey,
  getGlm53ApiCtaTarget,
  GLM53_API_CTA_EVENT,
  GLM53_API_CODE_EXAMPLES,
  GLM53_API_RESOURCE_EVENT,
} from '../lib/glm-5-3-api'
import { CopyableCode } from './copyable-code'

export interface QuickstartProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/**
 * Switchable Python / cURL examples. Every example targets
 * https://vancine.com/v1, defaults to glm-5.3, shows the one-line
 * switch to glm-5.3-flash, and reads the API key exclusively from the
 * VANCINE_API_KEY environment variable — never a hardcoded secret.
 */
export function Quickstart(props: QuickstartProps): ReactElement {
  const { t } = useTranslation()
  const ctaTarget = getGlm53ApiCtaTarget(props.isAuthenticated, props.search)
  const ctaLabelKey = getGlm53ApiCtaLabelKey(props.isAuthenticated)

  return (
    <section
      id='quickstart'
      aria-labelledby='glm-5-3-api-quickstart-title'
      className='mx-auto w-full max-w-4xl px-4 py-16 md:px-6'
    >
      <div className='flex flex-col gap-2'>
        <h2 id='glm-5-3-api-quickstart-title' className='text-3xl font-bold'>
          {t('Quickstart')}
        </h2>
        <p className='text-muted-foreground'>
          {t(
            'Point your OpenAI SDK or curl at https://vancine.com/v1, set the VANCINE_API_KEY environment variable, and use model glm-5.3 — or glm-5.3-flash when you want the lower token cost. Vancine supports the OpenAI-compatible chat completions request, response, and streaming formats. Provider-specific errors may differ.'
          )}
        </p>
      </div>

      <p
        data-testid='glm53-model-switch-hint'
        className='text-foreground/80 mt-4 text-sm font-medium'
      >
        {t(
          'Default model glm-5.3 — switch to glm-5.3-flash by changing only the model id.'
        )}
      </p>

      <Tabs defaultValue='python' className='mt-6'>
        <TabsList aria-label={t('Quickstart languages')}>
          {GLM53_API_CODE_EXAMPLES.map((example) => (
            <TabsTrigger key={example.id} value={example.id}>
              {example.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {GLM53_API_CODE_EXAMPLES.map((example) => (
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
            trackEvent(GLM53_API_RESOURCE_EVENT, {
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
            trackEvent(GLM53_API_CTA_EVENT, { location: 'glm53_quickstart' })
          }
        >
          <HugeiconsIcon
            icon={Key01Icon}
            data-icon='inline-start'
            aria-hidden='true'
          />
          {t(ctaLabelKey)}
        </Button>
      </div>
    </section>
  )
}
