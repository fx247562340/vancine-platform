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
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { trackEvent } from '@/lib/analytics'
import { useSystemConfig } from '@/hooks/use-system-config'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Footer } from '@/components/layout/components/footer'
import { HeaderLogo } from '@/components/layout/components/header-logo'
import {
  KIMI_K3_CODE_EXAMPLES,
  KIMI_K3_CTA_EVENT,
  KIMI_K3_CTA_LOCATIONS,
  KIMI_K3_FAQ,
  KIMI_K3_OPENCODE_CONFIG,
  KIMI_K3_PORTFOLIO,
  KIMI_K3_RESOURCE_EVENT,
  KIMI_K3_RESOURCE_LOCATIONS,
  KIMI_K3_RESOURCE_VALUES,
  copyTextToClipboard,
  getKimiK3CtaDestination,
  getKimiK3Metadata,
} from './lib/landing'

interface MetaSnapshot {
  element: HTMLMetaElement | HTMLLinkElement | null
  existed: boolean
  hadAttribute: boolean
  value: string
}

function snapshotMeta(selector: string, attribute = 'content'): MetaSnapshot {
  const element = document.head.querySelector<
    HTMLMetaElement | HTMLLinkElement
  >(selector)
  return {
    element,
    existed: Boolean(element),
    hadAttribute: element?.hasAttribute(attribute) ?? false,
    value: element?.getAttribute(attribute) ?? '',
  }
}

function setMeta(
  snapshot: MetaSnapshot,
  tag: 'meta' | 'link',
  identityAttribute: string,
  identityValue: string,
  attribute: string,
  value: string
) {
  const element =
    snapshot.element ?? document.head.appendChild(document.createElement(tag))
  element.setAttribute(identityAttribute, identityValue)
  element.setAttribute(attribute, value)
  snapshot.element = element
}

function restoreMeta(snapshot: MetaSnapshot, attribute = 'content') {
  if (!snapshot.element) return
  if (!snapshot.existed) {
    snapshot.element.remove()
  } else if (snapshot.hadAttribute) {
    snapshot.element.setAttribute(attribute, snapshot.value)
  } else {
    snapshot.element.removeAttribute(attribute)
  }
}

function CopyableCode({ code }: { code: string }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const statusId = useId()
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = useCallback(async () => {
    const clipboard =
      typeof navigator === 'undefined' ? undefined : navigator.clipboard
    const result = await copyTextToClipboard(code, clipboard)
    setStatus(result)
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus('idle'), 2000)
  }, [code])

  const announcement =
    status === 'copied'
      ? t('Code copied')
      : status === 'error'
        ? t('Unable to copy code')
        : ''

  return (
    <div className='relative'>
      <Button
        variant='outline'
        size='sm'
        className='absolute top-3 right-3'
        type='button'
        onClick={copy}
        aria-label={t('Copy example code to clipboard')}
        aria-describedby={statusId}
      >
        {status === 'copied'
          ? t('Code copied')
          : status === 'error'
            ? t('Unable to copy code')
            : t('Copy')}
      </Button>
      <pre className='bg-muted overflow-x-auto rounded-xl p-5 pr-20 text-left text-xs leading-6 sm:text-sm'>
        <code>{code}</code>
      </pre>
      <p id={statusId} className='sr-only' role='status' aria-live='polite'>
        {announcement}
      </p>
    </div>
  )
}

export function KimiK3Api() {
  const { t, i18n } = useTranslation()
  const { auth } = useAuthStore()
  const { systemName, logo } = useSystemConfig()
  const [activeExample, setActiveExample] = useState('curl')
  const isAuthenticated = Boolean(auth.user)
  const search = typeof window === 'undefined' ? '' : window.location.search
  const destination = getKimiK3CtaDestination(isAuthenticated, search)
  const activeCode =
    KIMI_K3_CODE_EXAMPLES.find((example) => example.id === activeExample) ??
    KIMI_K3_CODE_EXAMPLES[0]

  useEffect(() => {
    const metadata = getKimiK3Metadata(i18n.language)
    const previousTitle = document.title
    const snapshots = {
      description: snapshotMeta('meta[name="description"]'),
      ogTitle: snapshotMeta('meta[property="og:title"]'),
      ogDescription: snapshotMeta('meta[property="og:description"]'),
      ogUrl: snapshotMeta('meta[property="og:url"]'),
      canonical: snapshotMeta('link[rel="canonical"]', 'href'),
    }

    document.title = metadata.title
    setMeta(
      snapshots.description,
      'meta',
      'name',
      'description',
      'content',
      metadata.description
    )
    setMeta(
      snapshots.ogTitle,
      'meta',
      'property',
      'og:title',
      'content',
      metadata.ogTitle
    )
    setMeta(
      snapshots.ogDescription,
      'meta',
      'property',
      'og:description',
      'content',
      metadata.ogDescription
    )
    setMeta(
      snapshots.ogUrl,
      'meta',
      'property',
      'og:url',
      'content',
      metadata.canonical
    )
    setMeta(
      snapshots.canonical,
      'link',
      'rel',
      'canonical',
      'href',
      metadata.canonical
    )

    return () => {
      document.title = previousTitle
      restoreMeta(snapshots.description)
      restoreMeta(snapshots.ogTitle)
      restoreMeta(snapshots.ogDescription)
      restoreMeta(snapshots.ogUrl)
      restoreMeta(snapshots.canonical, 'href')
    }
  }, [i18n.language])

  return (
    <div className='bg-background text-foreground flex min-h-svh flex-col'>
      <header className='border-border/40 bg-background/70 sticky top-0 z-50 border-b backdrop-blur-xl'>
        <div className='mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6'>
          <Link to='/' className='flex items-center gap-2'>
            <HeaderLogo
              src={logo || '/logo.png'}
              loading={false}
              logoLoaded={true}
              className='size-7 rounded-lg'
            />
            <span className='text-sm font-semibold tracking-tight'>
              {systemName}
            </span>
          </Link>
          <nav
            className='hidden items-center gap-5 text-sm font-medium lg:flex'
            aria-label='Primary'
          >
            <a
              href='#quickstart'
              className='text-muted-foreground hover:text-foreground'
            >
              {t('Quickstart')}
            </a>
            <a
              href='#agents'
              className='text-muted-foreground hover:text-foreground'
            >
              {t('Agent setup')}
            </a>
            <a
              href='https://vancine.com/docs'
              target='_blank'
              rel='noopener noreferrer'
              className='text-muted-foreground hover:text-foreground'
              onClick={() =>
                trackEvent(KIMI_K3_RESOURCE_EVENT, {
                  resource: KIMI_K3_RESOURCE_VALUES[0],
                  location: KIMI_K3_RESOURCE_LOCATIONS[0],
                })
              }
            >
              {t('Documentation')}
            </a>
          </nav>
          <div className='flex items-center gap-2'>
            <LanguageSwitcher />
            <Button size='sm' render={<Link to={destination} />}>
              {isAuthenticated ? t('Go to Playground') : t('Start free')}
            </Button>
          </div>
        </div>
      </header>

      <main className='flex-1'>
        <section className='relative overflow-hidden px-4 pt-20 pb-24 text-center md:px-6 md:pt-28'>
          <div
            className='from-primary/20 via-accent/10 pointer-events-none absolute -top-24 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r to-transparent blur-3xl'
            aria-hidden='true'
          />
          <div className='relative mx-auto max-w-4xl'>
            <p className='text-primary mb-4 text-sm font-semibold tracking-wide uppercase'>
              {t('China frontier AI, one developer path')}
            </p>
            <h1 className='text-4xl font-bold tracking-tight text-balance md:text-6xl'>
              {t('Kimi K3 API for Coding Agents')}
            </h1>
            <p className='text-muted-foreground mx-auto mt-6 max-w-3xl text-lg leading-relaxed'>
              {t(
                'Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one Vancine API key.'
              )}
            </p>
            <p className='border-primary/20 bg-primary/5 text-primary mt-5 inline-flex rounded-full border px-3 py-1 text-sm font-medium'>
              {t(
                '$1 free credit. No credit card required. Usage varies by model and request.'
              )}
            </p>
            <div className='mt-8 flex flex-wrap justify-center gap-3'>
              <Button
                size='lg'
                render={<Link to={destination} />}
                onClick={() =>
                  trackEvent(KIMI_K3_CTA_EVENT, {
                    location: KIMI_K3_CTA_LOCATIONS[0],
                  })
                }
              >
                {t('Get started')}
              </Button>
              <Button
                variant='outline'
                size='lg'
                render={<a href='#quickstart' />}
              >
                {t('View quickstart')}
              </Button>
            </div>
          </div>
        </section>

        <section
          id='quickstart'
          className='bg-muted/30 border-y px-4 py-18 md:px-6'
        >
          <div className='mx-auto max-w-5xl'>
            <div className='mb-8 text-center'>
              <h2 className='text-3xl font-bold'>
                {t('OpenAI-compatible quickstart')}
              </h2>
              <p className='text-muted-foreground mt-3'>
                {t(
                  'Send your first Kimi K3 chat completion with an environment variable, not a pasted secret.'
                )}
              </p>
            </div>
            <div
              className='mb-3 flex gap-2'
              role='group'
              aria-label={t('Quickstart languages')}
            >
              {KIMI_K3_CODE_EXAMPLES.map((example) => (
                <Button
                  key={example.id}
                  variant={activeExample === example.id ? 'default' : 'outline'}
                  size='sm'
                  aria-pressed={activeExample === example.id}
                  onClick={() => setActiveExample(example.id)}
                >
                  {example.label}
                </Button>
              ))}
            </div>
            <CopyableCode code={activeCode.code} />
            <div className='mt-5 flex flex-wrap justify-between gap-3'>
              <a
                href='https://vancine.com/docs'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary text-sm font-medium hover:underline'
                onClick={() =>
                  trackEvent(KIMI_K3_RESOURCE_EVENT, {
                    resource: KIMI_K3_RESOURCE_VALUES[0],
                    location: KIMI_K3_RESOURCE_LOCATIONS[1],
                  })
                }
              >
                {t('Read API documentation')}
              </a>
              <Button
                size='sm'
                render={<Link to={destination} />}
                onClick={() =>
                  trackEvent(KIMI_K3_CTA_EVENT, {
                    location: KIMI_K3_CTA_LOCATIONS[1],
                  })
                }
              >
                {t('Create an API key')}
              </Button>
            </div>
          </div>
        </section>

        <section id='agents' className='px-4 py-18 md:px-6'>
          <div className='mx-auto grid max-w-6xl gap-8 lg:grid-cols-2'>
            <div>
              <p className='text-primary text-sm font-semibold uppercase'>
                {t('OpenCode')}
              </p>
              <h2 className='mt-3 text-3xl font-bold'>
                {t('Configure a Vancine provider')}
              </h2>
              <p className='text-muted-foreground mt-4 leading-relaxed'>
                {t(
                  'Use the OpenAI-compatible SDK provider, the Vancine base URL, and an environment-backed key.'
                )}
              </p>
            </div>
            <CopyableCode code={KIMI_K3_OPENCODE_CONFIG} />
            <article className='border-border rounded-xl border p-6 lg:col-span-2'>
              <p className='text-primary text-sm font-semibold uppercase'>
                {t('Cline and Roo Code')}
              </p>
              <h3 className='mt-2 text-xl font-semibold'>
                {t('Use the same OpenAI-compatible connection')}
              </h3>
              <ol className='text-muted-foreground mt-4 list-decimal space-y-2 pl-5 leading-relaxed'>
                <li>{t('Choose OpenAI Compatible as the API provider.')}</li>
                <li>
                  {t(
                    'Set the base URL to https://vancine.com/v1 and use your VANCINE_API_KEY.'
                  )}
                </li>
                <li>{t('Select kimi-k3 as the model ID.')}</li>
              </ol>
            </article>
          </div>
        </section>

        <section className='bg-muted/30 px-4 py-18 md:px-6'>
          <div className='mx-auto max-w-6xl'>
            <h2 className='text-center text-3xl font-bold'>
              {t('One key, a focused China AI portfolio')}
            </h2>
            <p className='text-muted-foreground mx-auto mt-3 max-w-2xl text-center'>
              {t(
                'Switch models as your task changes. Features, availability, and pricing are model-specific.'
              )}
            </p>
            <div className='mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
              {KIMI_K3_PORTFOLIO.map((model) => (
                <div
                  key={model}
                  className='border-border bg-background rounded-xl border p-4 text-center font-semibold'
                >
                  {model}
                </div>
              ))}
            </div>
            <a
              href='https://vancine.com/pricing'
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary mt-6 inline-block text-sm font-medium hover:underline'
              onClick={() =>
                trackEvent(KIMI_K3_RESOURCE_EVENT, {
                  resource: KIMI_K3_RESOURCE_VALUES[1],
                  location: KIMI_K3_RESOURCE_LOCATIONS[1],
                })
              }
            >
              {t('View live pricing and availability')}
            </a>
          </div>
        </section>

        <section className='px-4 py-18 md:px-6'>
          <div className='mx-auto max-w-4xl'>
            <h2 className='text-center text-3xl font-bold'>
              {t('Frequently asked questions')}
            </h2>
            <div className='mt-8 space-y-3'>
              {KIMI_K3_FAQ.map((faq) => (
                <details
                  key={faq.question}
                  className='border-border rounded-xl border p-5'
                >
                  <summary className='cursor-pointer font-semibold'>
                    {t(faq.question)}
                  </summary>
                  <p className='text-muted-foreground mt-3 leading-relaxed'>
                    {t(faq.answer)}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className='bg-primary text-primary-foreground px-4 py-20 text-center md:px-6'>
          <div className='mx-auto max-w-3xl'>
            <h2 className='text-3xl font-bold'>
              {t('Put Kimi K3 in your coding agent today')}
            </h2>
            <p className='text-primary-foreground/80 mt-4'>
              {t(
                'Start with a documented OpenAI-compatible request, then choose the model that fits the work.'
              )}
            </p>
            <Button
              size='lg'
              variant='secondary'
              className='mt-7'
              render={<Link to={destination} />}
              onClick={() =>
                trackEvent(KIMI_K3_CTA_EVENT, {
                  location: KIMI_K3_CTA_LOCATIONS[2],
                })
              }
            >
              {t('Get started with Vancine')}
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
