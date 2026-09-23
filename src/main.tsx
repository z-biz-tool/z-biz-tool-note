import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './lib/i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Provider 必须在 App 之上：App 自己也要读语言（右侧面板那几处标题） */}
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);