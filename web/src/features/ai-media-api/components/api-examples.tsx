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
import { BookOpen01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyableCode } from '@/features/kimi-k3-api/components/copyable-code'
import { trackEvent } from '@/lib/analytics'

import { AI_MEDIA_API_EXAMPLES, AI_MEDIA_RESOURCE_EVENT } from '../lib/landing'

/**
 * API examples with keyboard-accessible tabs and copyable cURL snippets.
 * Endpoints and model IDs mirror the current Docs.
 */
export function ApiExamples(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      id='api-examples'
      aria-labelledby='ai-media-examples-title'
      className='mx-auto w-full max-w-4xl scroll-mt-24 px-4 py-16 md:px-6'
    >
      <div className='flex flex-col gap-2'>
        <h2 id='ai-media-examples-title' className='text-3xl font-bold'>
          {t('Make your first request in minutes')}
        </h2>
        <p className='text-muted-foreground'>
          {t(
            'Call the documented media endpoints with any HTTP client. Availability and pricing follow the live Docs and Pricing.'
          )}
        </p>
      </div>

      <Tabs defaultValue='image' className='mt-8'>
        <TabsList aria-label={t('API examples')}>
          {AI_MEDIA_API_EXAMPLES.map((example) => (
            <TabsTrigger key={example.id} value={example.id}>
              {t(example.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
        {AI_MEDIA_API_EXAMPLES.map((example) => (
          <TabsContent key={example.id} value={example.id} className='mt-4'>
            <div className='flex flex-col gap-3'>
              <CopyableCode code={example.code} label={t(example.labelKey)} />
              <div>
                <Button
                  variant='outline'
                  size='sm'
                  render={
                    <Link
                      to='/docs/$slug'
                      params={{ slug: example.docsSlug }}
                    />
                  }
                  onClick={() =>
                    trackEvent(AI_MEDIA_RESOURCE_EVENT, {
                      resource: 'docs',
                      location: 'examples',
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
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
