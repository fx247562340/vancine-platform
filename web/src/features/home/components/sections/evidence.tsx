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

import { AnimateInView } from '@/components/animate-in-view'
import {
  KIMI_K3_OPENCODE_AGENT_EVIDENCE,
  KIMI_K3_MEASURED_USAGE_EVIDENCE,
  KIMI_K3_EVIDENCE_STARTER_REPO,
  KIMI_K3_EVIDENCE_FILE_URL,
} from '@/features/kimi-k3-api/lib/landing'
import { trackEvent } from '@/lib/analytics'

type EvidenceLinkResource = 'kimi_k3_page' | 'starter_repo' | 'verified_json'

function handleEvidenceLinkClick(resource: EvidenceLinkResource) {
  trackEvent('evidence_link_clicked', {
    location: 'homepage',
    resource,
  })
}

export function Evidence() {
  const { t } = useTranslation()

  const evidence = KIMI_K3_OPENCODE_AGENT_EVIDENCE
  const usage = KIMI_K3_MEASURED_USAGE_EVIDENCE

  const durationSeconds = (evidence.durationMs / 1000).toFixed(1)

  const metrics = [
    {
      value: `${evidence.client} ${evidence.clientVersion}`,
      label: t('OpenCode version'),
    },
    { value: evidence.model, label: t('Model under test') },
    { value: evidence.modelStepsCompleted, label: t('Model steps') },
    {
      value:
        evidence.toolCalls.read.completed +
        evidence.toolCalls.edit.completed +
        evidence.toolCalls.bash.completed,
      label: t('Tool calls'),
    },
    {
      value: t('Passed'),
      label: t('Tests'),
    },
    { value: `${durationSeconds}s`, label: t('Duration') },
    {
      value: evidence.telemetryTokens.total.toLocaleString('en-US'),
      label: t('Agent telemetry tokens'),
    },
    {
      value: `$${usage.amount.toFixed(2)} ${usage.currency}`,
      label: t('Vancine measured usage'),
    },
  ]

  return (
    <section className='border-border/40 bg-muted/5 relative z-10 border-y px-6 py-20 md:py-24'>
      <div className='mx-auto max-w-4xl'>
        <AnimateInView className='mb-10 text-center'>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t('Verified in real agent workflows')}
          </h2>
          <p className='text-muted-foreground mx-auto mt-3 max-w-2xl text-base leading-relaxed'>
            {t(
              'One controlled historical run — not a promise that every request will match these numbers.'
            )}
          </p>
        </AnimateInView>

        <AnimateInView
          animation='scale-in'
          className='border-border/40 bg-background rounded-2xl border p-6 md:p-10'
        >
          <dl className='mb-8 grid grid-cols-2 gap-6 md:grid-cols-4'>
            {metrics.map((m) => (
              <div key={m.label} className='text-center'>
                <dt className='text-2xl font-bold'>{m.value}</dt>
                <dd className='text-muted-foreground mt-1 text-xs'>
                  {m.label}
                </dd>
              </div>
            ))}
          </dl>

          <p className='text-muted-foreground/70 mb-6 text-center text-sm leading-relaxed'>
            {t(
              'Single controlled OpenCode run. Latency, tokens, and Vancine usage vary by task. This is historical evidence, not a guarantee for future calls.'
            )}
          </p>

          <div className='flex flex-wrap items-center justify-center gap-6'>
            <Link
              to='/kimi-k3-api'
              className='text-sm font-medium underline underline-offset-4'
              onClick={() => handleEvidenceLinkClick('kimi_k3_page')}
            >
              {t('View Kimi K3 page')}
            </Link>
            <a
              href={KIMI_K3_EVIDENCE_STARTER_REPO}
              target='_blank'
              rel='noopener noreferrer'
              className='text-sm font-medium underline underline-offset-4'
              onClick={() => handleEvidenceLinkClick('starter_repo')}
            >
              {t('View starter & verified evidence')}
            </a>
            <a
              href={KIMI_K3_EVIDENCE_FILE_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='text-sm font-medium underline underline-offset-4'
              onClick={() => handleEvidenceLinkClick('verified_json')}
            >
              {t('Verified evidence JSON')}
            </a>
          </div>
        </AnimateInView>
      </div>
    </section>
  )
}
