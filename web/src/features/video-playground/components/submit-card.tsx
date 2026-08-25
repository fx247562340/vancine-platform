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
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Form, FormField } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'

import type { VideoFormValues } from '../lib/form-schema'

type VideoSubmitCardProps = {
  form: UseFormReturn<VideoFormValues>
  disabled: boolean
  canSubmit: boolean
  onSubmit: (values: VideoFormValues) => Promise<void>
}

export function VideoSubmitCard({
  form,
  disabled,
  canSubmit,
  onSubmit,
}: VideoSubmitCardProps) {
  const { t } = useTranslation()

  return (
    <Form {...form}>
      <form
        className='contents'
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit(values)
        })}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t('Prompt')}</CardTitle>
            <CardDescription>
              {t('This request is charged at live prices')}{' '}
              <Link to='/pricing' className='text-primary underline'>
                {t('Pricing')}
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <FormField
                control={form.control}
                name='prompt'
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor='video-playground-prompt'>
                      {t('Prompt')}
                    </FieldLabel>
                    <Textarea
                      id='video-playground-prompt'
                      disabled={disabled}
                      aria-invalid={fieldState.invalid || undefined}
                      className='min-h-32'
                      placeholder={t('Describe the video you want to generate')}
                      {...field}
                    />
                    {fieldState.error?.message ? (
                      <FieldError>{t(fieldState.error.message)}</FieldError>
                    ) : null}
                  </Field>
                )}
              />
            </FieldGroup>
          </CardContent>
          <CardFooter className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <Link
              to='/usage-logs/$section'
              params={{ section: 'task' }}
              className='text-primary text-sm underline'
            >
              {t('View all task logs')}
            </Link>
            <Button type='submit' disabled={!canSubmit} className='sm:w-40'>
              {t('Generate')}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  )
}
