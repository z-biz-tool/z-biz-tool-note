import type { ThemeOption, ThemeName } from '../types';

export const THEMES: ThemeOption[] = [
  {
    name: 'light',
    label: 'Light',
    colors: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f8f9fa',
      bgTertiary: '#e9ecef',
      textPrimary: '#212529',
      textSecondary: '#6c757d',
      textMuted: '#adb5bd',
      borderColor: '#dee2e6',
      accentColor: '#4f46e5',
      accentHover: '#4338ca',
      codeBg: '#f1f3f5',
    },
  },
  {
    name: 'dark',
    label: 'Dark',
    colors: {
      bgPrimary: '#1a1b26',
      bgSecondary: '#16161e',
      bgTertiary: '#1f2335',
      textPrimary: '#c0caf5',
      textSecondary: '#9aa5ce',
      textMuted: '#565f89',
      borderColor: '#2a2e42',
      accentColor: '#7aa2f7',
      accentHover: '#89b4fa',
      codeBg: '#1e2030',
    },
  },
  {
    name: 'sepia',
    label: 'Sepia',
    colors: {
      bgPrimary: '#f4ecd8',
      bgSecondary: '#efe6cf',
      bgTertiary: '#e8dcc0',
      textPrimary: '#5b4636',
      textSecondary: '#8a7967',
      textMuted: '#b0a18f',
      borderColor: '#d4c5a9',
      accentColor: '#9c6b30',
      accentHover: '#b8823b',
      codeBg: '#e8dcc0',
    },
  },
  {
    name: 'solarized',
    label: 'Solarized',
    colors: {
      bgPrimary: '#fdf6e3',
      bgSecondary: '#eee8d5',
      bgTertiary: '#e6ddc4',
      textPrimary: '#586e75',
      textSecondary: '#839496',
      textMuted: '#93a1a1',
      borderColor: '#d6ceb5',
      accentColor: '#268bd2',
      accentHover: '#1a6ba8',
      codeBg: '#eee8d5',
    },
  },
  {
    name: 'dracula',
    label: 'Dracula',
    colors: {
      bgPrimary: '#282a36',
      bgSecondary: '#21222c',
      bgTertiary: '#343746',
      textPrimary: '#f8f8f2',
      textSecondary: '#bcbcbc',
      textMuted: '#6272a4',
      borderColor: '#44475a',
      accentColor: '#bd93f9',
      accentHover: '#caa9fc',
      codeBg: '#21222c',
    },
  },
  {
    name: 'nord',
    label: 'Nord',
    colors: {
      bgPrimary: '#2e3440',
      bgSecondary: '#272c36',
      bgTertiary: '#3b4252',
      textPrimary: '#d8dee9',
      textSecondary: '#81a1c1',
      textMuted: '#4c566a',
      borderColor: '#434c5e',
      accentColor: '#88c0d0',
      accentHover: '#8fbcbb',
      codeBg: '#2e3440',
    },
  },
];

export function applyTheme(themeName: ThemeName) {
  const theme = THEMES.find(t => t.name === themeName) || THEMES[0];
  const root = document.documentElement;
  const c = theme.colors;
  root.style.setProperty('--bg-primary', c.bgPrimary);
  root.style.setProperty('--bg-secondary', c.bgSecondary);
  root.style.setProperty('--bg-tertiary', c.bgTertiary);
  root.style.setProperty('--text-primary', c.textPrimary);
  root.style.setProperty('--text-secondary', c.textSecondary);
  root.style.setProperty('--text-muted', c.textMuted);
  root.style.setProperty('--border-color', c.borderColor);
  root.style.setProperty('--accent-color', c.accentColor);
  root.style.setProperty('--accent-hover', c.accentHover);
  root.style.setProperty('--code-bg', c.codeBg);
  root.setAttribute('data-theme', themeName);
  localStorage.setItem('theme', themeName);
}
