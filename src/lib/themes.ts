import type { ThemeOption, ThemeName } from '../types';

export const THEMES: ThemeOption[] = [
  {
    name: 'light',
    colors: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f8f9fa',
      bgTertiary: '#e9ecef',
      textPrimary: '#212529',
      textSecondary: '#4b5157',
      textMuted: '#5f6b77',
      borderColor: '#dee2e6',
      accentColor: '#4f46e5',
      accentHover: '#4338ca',
      codeBg: '#f1f3f5',
    },
  },
  {
    name: 'dark',
    colors: {
      bgPrimary: '#1a1b26',
      bgSecondary: '#16161e',
      bgTertiary: '#1f2335',
      textPrimary: '#c0caf5',
      textSecondary: '#9da8d0',
      textMuted: '#8189b0',
      borderColor: '#2a2e42',
      accentColor: '#7aa2f7',
      accentHover: '#89b4fa',
      codeBg: '#1e2030',
    },
  },
  {
    name: 'sepia',
    colors: {
      bgPrimary: '#f4ecd8',
      bgSecondary: '#efe6cf',
      bgTertiary: '#e8dcc0',
      textPrimary: '#5b4636',
      textSecondary: '#53483e',
      textMuted: '#6d5f4d',
      borderColor: '#d4c5a9',
      accentColor: '#9c6b30',
      accentHover: '#b8823b',
      codeBg: '#e8dcc0',
    },
  },
  {
    name: 'solarized',
    colors: {
      bgPrimary: '#fdf6e3',
      bgSecondary: '#eee8d5',
      bgTertiary: '#e6ddc4',
      textPrimary: '#586e75',
      textSecondary: '#424c4e',
      textMuted: '#566363',
      borderColor: '#d6ceb5',
      accentColor: '#268bd2',
      accentHover: '#1a6ba8',
      codeBg: '#eee8d5',
    },
  },
  {
    name: 'dracula',
    colors: {
      bgPrimary: '#282a36',
      bgSecondary: '#21222c',
      bgTertiary: '#343746',
      textPrimary: '#f8f8f2',
      textSecondary: '#c1c1c1',
      textMuted: '#96a0c2',
      borderColor: '#44475a',
      accentColor: '#bd93f9',
      accentHover: '#caa9fc',
      codeBg: '#21222c',
    },
  },
  {
    name: 'nord',
    colors: {
      bgPrimary: '#2e3440',
      bgSecondary: '#272c36',
      bgTertiary: '#3b4252',
      textPrimary: '#d8dee9',
      textSecondary: '#c5d4e3',
      textMuted: '#a8b0c1',
      borderColor: '#434c5e',
      accentColor: '#88c0d0',
      accentHover: '#8fbcbb',
      codeBg: '#2e3440',
    },
  },
];

// name 是持久化标识（localStorage.theme / data-theme），不随语言变化；
// 展示名走下面两张表，切英文时别再漏出中文
const LABELS_ZH: Record<ThemeName, string> = {
  light: '浅色',
  dark: '深色',
  sepia: '米黄',
  solarized: '暖阳',
  dracula: '暗夜',
  nord: '极地',
};

const LABELS_EN: Record<ThemeName, string> = {
  light: 'Light',
  dark: 'Dark',
  sepia: 'Sepia',
  solarized: 'Solarized',
  dracula: 'Dracula',
  nord: 'Nord',
};

export const themeLabel = (name: ThemeName, lang: string = 'zh') =>
  (lang === 'en' ? LABELS_EN : LABELS_ZH)[name] ?? name;

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
  // 认不出的存值要落到实际生效的那个主题上：以前这里写回的是传进来的原名字，
  // 于是 data-theme 会挂上一个 THEMES 里不存在的值（样式、themeLabel 都对不上）
  root.setAttribute('data-theme', theme.name);
  localStorage.setItem('theme', theme.name);
}

/** localStorage 里存的主题名；认不出来就回 light */
export function storedThemeName(): ThemeName {
  const saved = localStorage.getItem('theme');
  return THEMES.some((t) => t.name === saved) ? (saved as ThemeName) : 'light';
}
