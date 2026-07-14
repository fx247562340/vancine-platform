/*
Copyright (C) 2025 QuantumNous

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
import { useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../../context/User';
import { API } from '../../helpers';
import {
  normalizeLanguage,
  mergeLanguageIntoSetting,
} from '../../i18n/language';

/**
 * Shared language-preference helper for standalone landing pages
 * (Seedance API, AI Media API). Both pages must keep the same behavior:
 *
 *  - Guest: switch i18n immediately and persist the normalized tag to
 *    localStorage so it survives reloads.
 *  - Logged-in: switch i18n, persist locally, then mirror the choice to the
 *    backend (`PUT /api/user/self`) while preserving every other field inside
 *    the user's existing `setting` JSON. On failure, roll back to the previous
 *    language and localStorage value.
 *
 * The backend still wins after a fresh login because PageLayout / UserProvider
 * apply `user.setting.language` once user data loads — that is intentional
 * and is NOT bypassed here.
 */
export function useLanguagePreference() {
  const { i18n } = useTranslation();
  const [userState, userDispatch] = useContext(UserContext);

  const handleLanguageChange = useCallback(
    async (rawLang) => {
      const lang = normalizeLanguage(rawLang);
      if (!lang) return;

      // Snapshot current normalized language for potential rollback.
      const previousLang = normalizeLanguage(i18n.language);

      // Immediate UI switch + local persist.
      i18n.changeLanguage(lang);
      localStorage.setItem('i18nextLng', lang);

      // If a user is logged in, mirror the preference to the backend so it
      // follows the account across devices. We only mutate `setting.language`
      // and preserve all other setting fields.
      if (userState?.user?.id) {
        const nextUser = {
          ...userState.user,
          setting: mergeLanguageIntoSetting(userState.user.setting, lang),
        };

        try {
          const res = await API.put('/api/user/self', { language: lang });
          if (res.data.success) {
            // Keep UserContext and localStorage.user in sync so route
            // changes don't re-apply an older cached language.
            userDispatch({ type: 'login', payload: nextUser });
            localStorage.setItem('user', JSON.stringify(nextUser));
          } else {
            throw new Error('server returned success=false');
          }
        } catch (error) {
          // Roll back to the previous language so the UI, localStorage, and
          // backend stay consistent.
          i18n.changeLanguage(previousLang);
          localStorage.setItem('i18nextLng', previousLang);
          console.error('Failed to save language preference:', error);
        }
      }
    },
    [i18n, userState, userDispatch],
  );

  return { handleLanguageChange };
}
