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

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
} from 'react';
import {
  normalizeThemeMode,
  resolveActualTheme,
  readStoredThemeMode,
  THEME_STORAGE_KEY,
} from './theme-mode.js';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const ActualThemeContext = createContext(null);
export const useActualTheme = () => useContext(ActualThemeContext);

const SetThemeContext = createContext(null);
export const useSetTheme = () => useContext(SetThemeContext);

// 检测系统主题偏好
const getSystemTheme = () => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
};

export const ThemeProvider = ({ children }) => {
  // Initial preference MUST go through normalizeThemeMode / readStoredThemeMode
  // so a legacy or garbage localStorage value never becomes state. Matches the
  // index.html boot probe: illegal → dark (never a light flash after mount).
  const [theme, _setTheme] = useState(() => {
    try {
      return readStoredThemeMode(
        typeof localStorage !== 'undefined' ? localStorage : null,
      );
    } catch {
      return 'dark';
    }
  });

  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  // Actual painted theme via the shared helper (never the bare
  // `theme === 'auto' ? systemTheme : theme` ternary — that leaked garbage
  // strings into the DOM effect's light branch).
  const actualTheme = resolveActualTheme(theme, systemTheme);

  // 监听系统主题变化
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleSystemThemeChange = (e) => {
        setSystemTheme(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handleSystemThemeChange);

      return () => {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      };
    }
  }, []);

  // 应用主题到DOM
  useEffect(() => {
    const body = document.body;
    if (actualTheme === 'dark') {
      body.setAttribute('theme-mode', 'dark');
      document.documentElement.classList.add('dark');
    } else {
      body.removeAttribute('theme-mode');
      document.documentElement.classList.remove('dark');
    }
  }, [actualTheme]);

  const setTheme = useCallback((newTheme) => {
    let themeValue;

    if (typeof newTheme === 'boolean') {
      // 向后兼容原有的 boolean 参数
      themeValue = newTheme ? 'dark' : 'light';
    } else if (typeof newTheme === 'string') {
      // Normalize so illegal strings are never persisted or painted as light.
      themeValue = normalizeThemeMode(newTheme);
    } else {
      // Non-string / non-boolean keeps the historical default of 'auto'.
      themeValue = 'auto';
    }

    _setTheme(themeValue);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeValue);
    } catch {
      // Private mode / blocked storage — state still updates in-memory.
    }
  }, []);

  return (
    <SetThemeContext.Provider value={setTheme}>
      <ActualThemeContext.Provider value={actualTheme}>
        <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
      </ActualThemeContext.Provider>
    </SetThemeContext.Provider>
  );
};
