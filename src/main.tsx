import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './lib/i18n';
import { applyTheme, storedThemeName } from './lib/themes';

// 主题必须在第一次绘制之前就挂到 <html> 上：以前它是在 App 的 useEffect 里 applyTheme 的，
// 于是深色主题每次冷启动都先按 index.css 的 :root（浅色）画一帧再 0.3s 渐变过来 —— 一整片白闪。
// 顺带让首帧的计算值就是主题值，不用等 transition 走完。
applyTheme(storedThemeName());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Provider 必须在 App 之上：App 自己也要读语言（右侧面板那几处标题） */}
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);