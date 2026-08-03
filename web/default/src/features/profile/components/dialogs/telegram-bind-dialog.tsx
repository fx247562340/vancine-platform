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
along with the program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TelegramLoginWidget } from '@/features/auth/components/telegram-login-widget'

// ============================================================================
// Telegram Bind Dialog Component
// ============================================================================
//
// Binding uses the Telegram Login Widget in redirect mode (data-auth-url),
// matching the Classic theme's `dataAuthUrl='/api/oauth/telegram/bind'`. After
// the user authorizes, Telegram navigates the browser to the bind endpoint;
// the backend verifies the HMAC signature, attaches the Telegram ID to the
// current session's user, and 302-redirects back to the profile page — which
// is a full page load, so the refreshed binding is picked up automatically.
// Backend error responses (already bound / disabled / bad signature) surface
// on that navigated page, same as Classic.

interface TelegramBindDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  botName: string
  onSuccess: () => void
}

export function TelegramBindDialog({
  open,
  onOpenChange,
  botName,
}: TelegramBindDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Bind Telegram Account')}</DialogTitle>
          <DialogDescription>
            {t('Click the button below to bind your Telegram account')}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-4'>
          <Alert>
            <Send className='h-4 w-4' />
            <AlertDescription>
              {t(
                'You will be redirected to Telegram to complete the binding process.'
              )}
            </AlertDescription>
          </Alert>

          <div className='flex flex-col items-center justify-center gap-4 rounded-lg border p-6'>
            <p className='text-muted-foreground text-sm'>
              {t('Bot:')}{' '}
              <span className='font-mono font-semibold'>@{botName}</span>
            </p>

            <TelegramLoginWidget
              botName={botName}
              authUrl='/api/oauth/telegram/bind'
            />

            <p className='text-muted-foreground text-center text-xs'>
              {t(
                "After clicking the button, you'll be asked to authorize the bot"
              )}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
