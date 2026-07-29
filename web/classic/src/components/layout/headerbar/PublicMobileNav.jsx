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

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@douyinfe/semi-ui';
import { IconClose, IconMenu } from '@douyinfe/semi-icons';

const PANEL_ID = 'public-mobile-nav-panel';

/**
 * Public-page mobile navigation for acquisition.
 *
 * On public routes at mobile widths the inline scrolling link row is
 * replaced by this hamburger + full-screen panel so Pricing/About remain
 * reachable at 390px without horizontal page scroll. The persistent
 * Sign up / Log in acquisition controls live in the header UserArea and
 * stay visible outside this drawer.
 */
const PublicMobileNav = ({ mainNavLinks, userState, t }) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  // Console entry is auth-only for guests (design: guests get Log in).
  const links = (mainNavLinks || []).filter(
    (link) => userState?.user || link.itemKey !== 'console',
  );

  // Body scroll lock + Escape handling while the panel is open.
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        if (buttonRef.current) buttonRef.current.focus();
        return;
      }
      // Minimal focus trap: keep Tab within the panel.
      if (event.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll(
          'a[href], button:not([disabled])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const id = window.setTimeout(() => {
      const first = panelRef.current?.querySelector('a[href], button');
      if (first) first.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.clearTimeout(id);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className='flex items-center'>
      <Button
        ref={buttonRef}
        theme='borderless'
        type='tertiary'
        className='!p-2 !text-current focus:!bg-semi-color-fill-1 dark:focus:!bg-gray-700'
        aria-label={open ? t('关闭菜单') : t('打开菜单')}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen((v) => !v)}
        icon={
          open ? (
            <IconClose className='text-lg' />
          ) : (
            <IconMenu className='text-lg' />
          )
        }
      />

      {open ? (
        <div
          id={PANEL_ID}
          ref={panelRef}
          role='dialog'
          aria-modal='true'
          aria-label={t('导航菜单')}
          className='fixed inset-0 z-[60] bg-white dark:bg-zinc-900 flex flex-col pt-4 px-6 pb-10'
        >
          <div className='flex items-center justify-end mb-6'>
            <Button
              theme='borderless'
              type='tertiary'
              className='!p-2'
              aria-label={t('关闭菜单')}
              onClick={close}
              icon={<IconClose className='text-lg' />}
            />
          </div>

          <nav className='flex flex-col gap-1 flex-1 overflow-y-auto'>
            {links.map((link) => (
              <Link
                key={link.itemKey}
                to={link.to}
                onClick={close}
                className='py-3 text-lg font-semibold text-semi-color-text-0 hover:text-semi-color-primary'
              >
                {link.text}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </div>
  );
};

export default PublicMobileNav;
