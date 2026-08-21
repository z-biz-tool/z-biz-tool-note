import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Language = 'en' | 'zh';

interface Translations {
  toolbar: {
    textStyle: string;
    paragraph: string;
    heading1: string;
    heading2: string;
    heading3: string;
    heading4: string;
    heading5: string;
    heading6: string;
    bold: string;
    italic: string;
    underline: string;
    strikethrough: string;
    inlineCode: string;
    highlight: string;
    lists: string;
    bulletList: string;
    numberedList: string;
    taskList: string;
    quote: string;
    horizontalRule: string;
    insert: string;
    insertImage: string;
    insertLink: string;
    insertTable: string;
    mathFormula: string;
    subscript: string;
    superscript: string;
    emoji: string;
    align: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    wysiwyg: string;
    source: string;
    toggleLang: string;
  };
  prompt: {
    imageUrl: string;
    linkUrl: string;
  };
}

const translations: Record<Language, Translations> = {
  en: {
    toolbar: {
      textStyle: 'Text Style',
      paragraph: 'Paragraph',
      heading1: 'Heading 1',
      heading2: 'Heading 2',
      heading3: 'Heading 3',
      heading4: 'Heading 4',
      heading5: 'Heading 5',
      heading6: 'Heading 6',
      bold: 'Bold (Cmd+B)',
      italic: 'Italic (Cmd+I)',
      underline: 'Underline',
      strikethrough: 'Strikethrough',
      inlineCode: 'Inline Code',
      highlight: 'Highlight',
      lists: 'Lists',
      bulletList: 'Bullet List',
      numberedList: 'Numbered List',
      taskList: 'Task List',
      quote: 'Quote',
      horizontalRule: 'Horizontal Rule',
      insert: 'Insert',
      insertImage: 'Insert Image',
      insertLink: 'Insert Link',
      insertTable: 'Insert Table',
      mathFormula: 'Math Formula',
      subscript: 'Subscript',
      superscript: 'Superscript',
      emoji: 'Emoji',
      align: 'Align',
      alignLeft: 'Align Left',
      alignCenter: 'Align Center',
      alignRight: 'Align Right',
      wysiwyg: 'WYSIWYG',
      source: 'Source',
      toggleLang: 'Switch to Chinese',
    },
    prompt: {
      imageUrl: 'Image URL:',
      linkUrl: 'Link URL:',
    },
  },
  zh: {
    toolbar: {
      textStyle: '文字样式',
      paragraph: '正文',
      heading1: '标题 1',
      heading2: '标题 2',
      heading3: '标题 3',
      heading4: '标题 4',
      heading5: '标题 5',
      heading6: '标题 6',
      bold: '加粗 (Cmd+B)',
      italic: '斜体 (Cmd+I)',
      underline: '下划线',
      strikethrough: '删除线',
      inlineCode: '行内代码',
      highlight: '高亮',
      lists: '列表',
      bulletList: '无序列表',
      numberedList: '有序列表',
      taskList: '任务列表',
      quote: '引用',
      horizontalRule: '分割线',
      insert: '插入',
      insertImage: '插入图片',
      insertLink: '插入链接',
      insertTable: '插入表格',
      mathFormula: '数学公式',
      subscript: '下标',
      superscript: '上标',
      emoji: '表情',
      align: '对齐',
      alignLeft: '左对齐',
      alignCenter: '居中对齐',
      alignRight: '右对齐',
      wysiwyg: '所见即所得',
      source: '源代码',
      toggleLang: 'Switch to English',
    },
    prompt: {
      imageUrl: '图片地址：',
      linkUrl: '链接地址：',
    },
  },
};

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (section: keyof Translations, key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('lang') as Language | null;
    if (saved === 'en' || saved === 'zh') return saved;
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  });

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    localStorage.setItem('lang', l);
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'en' ? 'zh' : 'en');
  }, [lang, setLang]);

  const t = useCallback((section: keyof Translations, key: string) => {
    const sectionData = translations[lang][section];
    return (sectionData as Record<string, string>)[key] || key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
};
