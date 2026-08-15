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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { useUpdateOption } from '../hooks/use-update-option'
import type { UpdateOptionRequest } from '../types'

/**
 * PayPal gateway option values (mirrors Classic SettingsPaymentGatewayPayPal).
 */
export interface PayPalSettingsValues {
  PayPalEnabled: boolean
  PayPalTestMode: boolean
  PayPalClientId: string
  PayPalClientSecret: string
  PayPalWebhookId: string
  PayPalSandboxClientId: string
  PayPalSandboxClientSecret: string
  PayPalSandboxWebhookId: string
  PayPalMinTopUp: number
  PayPalCurrency: string
}

interface PayPalSettingsSectionProps {
  defaultValues: PayPalSettingsValues
}

/** Masked secrets come back from the backend containing '***'. */
function isMasked(value: string): boolean {
  return value.includes('***')
}

/**
 * Self-contained PayPal gateway settings (aligned with Classic). Saves each
 * option through the existing /api/option/ PUT. Secret fields that are empty or
 * masked are NOT submitted, so existing secrets are never overwritten with a
 * blank/masked value (same semantics as Classic / the Stripe section).
 */
export function PayPalSettingsSection({
  defaultValues,
}: PayPalSettingsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const [enabled, setEnabled] = useState(defaultValues.PayPalEnabled)
  const [testMode, setTestMode] = useState(defaultValues.PayPalTestMode)
  const [inputs, setInputs] = useState({
    PayPalClientId: defaultValues.PayPalClientId,
    PayPalClientSecret: defaultValues.PayPalClientSecret,
    PayPalWebhookId: defaultValues.PayPalWebhookId,
    PayPalSandboxClientId: defaultValues.PayPalSandboxClientId,
    PayPalSandboxClientSecret: defaultValues.PayPalSandboxClientSecret,
    PayPalSandboxWebhookId: defaultValues.PayPalSandboxWebhookId,
    PayPalMinTopUp: defaultValues.PayPalMinTopUp,
    PayPalCurrency: defaultValues.PayPalCurrency,
  })
  const [saving, setSaving] = useState(false)

  // Re-sync local state when the hydrated defaults change (e.g. after the
  // options refetch), mirroring the Waffo/Stripe sections so a refresh or
  // section switch does not leave stale local values.
  useEffect(() => {
    setEnabled(defaultValues.PayPalEnabled)
    setTestMode(defaultValues.PayPalTestMode)
    setInputs({
      PayPalClientId: defaultValues.PayPalClientId,
      PayPalClientSecret: defaultValues.PayPalClientSecret,
      PayPalWebhookId: defaultValues.PayPalWebhookId,
      PayPalSandboxClientId: defaultValues.PayPalSandboxClientId,
      PayPalSandboxClientSecret: defaultValues.PayPalSandboxClientSecret,
      PayPalSandboxWebhookId: defaultValues.PayPalSandboxWebhookId,
      PayPalMinTopUp: defaultValues.PayPalMinTopUp,
      PayPalCurrency: defaultValues.PayPalCurrency,
    })
  }, [defaultValues])

  const setField = (key: keyof typeof inputs, value: string | number) => {
    setInputs((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates: UpdateOptionRequest[] = []
      // Booleans are stored as 'true'/'false' strings (Classic contract).
      updates.push({ key: 'PayPalEnabled', value: enabled ? 'true' : 'false' })
      updates.push({
        key: 'PayPalTestMode',
        value: testMode ? 'true' : 'false',
      })

      // Secrets: only submit when non-empty and not masked.
      const secretKeys = [
        'PayPalClientId',
        'PayPalClientSecret',
        'PayPalWebhookId',
        'PayPalSandboxClientId',
        'PayPalSandboxClientSecret',
        'PayPalSandboxWebhookId',
      ] as const
      for (const key of secretKeys) {
        const value = inputs[key]
        if (value && !isMasked(value)) {
          updates.push({ key, value })
        }
      }

      updates.push({
        key: 'PayPalMinTopUp',
        value: String(inputs.PayPalMinTopUp || 1),
      })
      updates.push({
        key: 'PayPalCurrency',
        value: inputs.PayPalCurrency || 'USD',
      })

      for (const update of updates) {
        await updateOption.mutateAsync(update)
      }
    } finally {
      setSaving(false)
    }
  }

  const secretField = (
    key: keyof typeof inputs,
    label: string,
    placeholder: string
  ) => (
    <div className='grid gap-1.5'>
      <Label>{label}</Label>
      <Input
        type='password'
        autoComplete='new-password'
        value={inputs[key] as string}
        placeholder={placeholder}
        onChange={(event) => setField(key, event.target.value)}
      />
    </div>
  )

  return (
    <div className='space-y-4 pt-4'>
      <div>
        <h3 className='text-lg font-medium'>{t('PayPal Gateway')}</h3>
        <p className='text-muted-foreground text-sm'>
          {t('Configuration for PayPal payment integration')}
        </p>
      </div>

      <Alert>
        <AlertDescription className='space-y-1 text-xs'>
          <p>
            {t('Return URL:')}{' '}
            <code className='bg-muted rounded px-1 py-0.5'>
              {'<ServerAddress>/api/paypal/return'}
            </code>
          </p>
          <p>
            {t('Webhook URL:')}{' '}
            <code className='bg-muted rounded px-1 py-0.5'>
              {'<ServerAddress>/api/paypal/webhook'}
            </code>
          </p>
        </AlertDescription>
      </Alert>

      <div className='grid gap-4 sm:grid-cols-2'>
        <SettingsSwitchField
          checked={enabled}
          onCheckedChange={setEnabled}
          label={t('Enable PayPal')}
          className='border-b-0 py-0'
        />
        <SettingsSwitchField
          checked={testMode}
          onCheckedChange={setTestMode}
          label={t('Sandbox mode')}
          className='border-b-0 py-0'
        />
      </div>

      <div className='grid grid-cols-2 gap-4'>
        {secretField('PayPalClientId', t('Client ID (Production)'), '')}
        {secretField('PayPalClientSecret', t('Client Secret (Production)'), '')}
      </div>
      <div className='grid gap-1.5'>
        <Label>{t('Webhook ID (Production)')}</Label>
        <Input
          value={inputs.PayPalWebhookId}
          onChange={(event) => setField('PayPalWebhookId', event.target.value)}
        />
      </div>

      <div className='grid grid-cols-2 gap-4'>
        {secretField('PayPalSandboxClientId', t('Client ID (Sandbox)'), '')}
        {secretField(
          'PayPalSandboxClientSecret',
          t('Client Secret (Sandbox)'),
          ''
        )}
      </div>
      <div className='grid gap-1.5'>
        <Label>{t('Webhook ID (Sandbox)')}</Label>
        <Input
          value={inputs.PayPalSandboxWebhookId}
          onChange={(event) =>
            setField('PayPalSandboxWebhookId', event.target.value)
          }
        />
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='grid gap-1.5'>
          <Label>{t('Minimum Top-Up')}</Label>
          <Input
            type='number'
            min={1}
            value={inputs.PayPalMinTopUp}
            onChange={(event) =>
              setField('PayPalMinTopUp', Number(event.target.value) || 1)
            }
          />
        </div>
        <div className='grid gap-1.5'>
          <Label>{t('Currency')}</Label>
          <Input
            value={inputs.PayPalCurrency}
            placeholder='USD'
            onChange={(event) => setField('PayPalCurrency', event.target.value)}
          />
        </div>
      </div>

      <div className='flex justify-end'>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t('Saving...') : t('Save PayPal Settings')}
        </Button>
      </div>
    </div>
  )
}
