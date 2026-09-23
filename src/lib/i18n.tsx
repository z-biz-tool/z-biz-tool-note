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
  meta: {
    aliases: string;
    fields: string;
    addTag: string;
    removeTag: string;
    addAlias: string;
    removeAlias: string;
  };
  panel: {
    outline: string;
    backlinks: string;
    ai: string;
    graph: string;
    standard: string;
    wide: string;
    toStandardTitle: string;
    toWideTitle: string;
    closeTitle: string;
    noHeadings: string;
  };
  status: {
    saved: string;
    saving: string;
    savingTitle: string;
    saveFailed: string;
    saveFailedTitle: string;
    unsaved: string;
    focus: string;
    focusTitle: string;
    typewriter: string;
    typewriterTitle: string;
    richText: string;
    source: string;
    toSourceTitle: string;
    toRichTitle: string;
    wide: string;
    wideOnTitle: string;
    wideOffTitle: string;
    words: string;
    characters: string;
    blocks: string;
    about: string;
    minutes: string;
    statsTitle: string;
    themeTitle: string;
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
    meta: {
      aliases: 'Aliases',
      fields: 'fields',
      addTag: 'Add tag',
      removeTag: 'Remove tag {tag}',
      addAlias: 'Add alias',
      removeAlias: 'Remove alias {alias}',
    },
    panel: {
      outline: 'Outline',
      backlinks: 'Backlinks',
      ai: 'AI Assistant',
      graph: 'Knowledge Graph',
      standard: 'Standard',
      wide: 'Wide',
      toStandardTitle: 'Switch to the standard view',
      toWideTitle: 'Switch to wide view (fills the right side, editor hidden)',
      closeTitle: 'Close panel',
      noHeadings: 'No headings yet',
    },
    status: {
      saved: 'Saved',
      saving: 'Saving',
      savingTitle: 'Saving…',
      saveFailed: 'Save failed',
      saveFailedTitle: 'Save failed (content kept in the WAL)',
      unsaved: 'Unsaved',
      focus: 'Focus',
      focusTitle: 'Focus mode: only the current paragraph is lit up',
      typewriter: 'Typewriter',
      typewriterTitle: 'Typewriter mode: the caret stays centered',
      richText: 'Rich text',
      source: 'Source',
      toSourceTitle: 'Switch to source: edit the Markdown directly ({key})',
      toRichTitle: 'Back to rich text: what-you-see-is-what-you-get ({key})',
      wide: 'Wide',
      wideOnTitle: 'Leave wide mode and restore the right panel',
      wideOffTitle: 'Wide: hide the right panel and let the document fill the window',
      words: 'words',
      characters: 'chars',
      blocks: 'blocks',
      about: 'about',
      minutes: 'min',
      statsTitle: 'Word count: CJK counts characters, Latin counts words; reading time assumes 200 chars/min',
      themeTitle: 'Current theme: {theme} — click to switch',
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
      toggleLang: '切换为英文',
    },
    prompt: {
      imageUrl: '图片地址：',
      linkUrl: '链接地址：',
    },
    meta: {
      aliases: '别名',
      fields: '个字段',
      addTag: '加标签',
      removeTag: '移除标签 {tag}',
      addAlias: '加别名',
      removeAlias: '移除别名 {alias}',
    },
    panel: {
      outline: '大纲',
      backlinks: '反向链接',
      ai: 'AI 助手',
      graph: '知识图谱',
      standard: '标准',
      wide: '宽屏',
      toStandardTitle: '切换为标准视图',
      toWideTitle: '切换为宽屏视图（占满右侧，编辑器隐藏）',
      closeTitle: '关闭面板',
      noHeadings: '暂无标题',
    },
    status: {
      saved: '已保存',
      saving: '保存中',
      savingTitle: '正在保存',
      saveFailed: '保存失败',
      saveFailedTitle: '保存失败（内容已暂存到 WAL）',
      unsaved: '未保存',
      focus: '专注',
      focusTitle: '专注模式：只点亮当前段落',
      typewriter: '打字机',
      typewriterTitle: '打字机模式：光标始终居中',
      richText: '富文本',
      source: '源码',
      toSourceTitle: '切到源码模式：直接编辑 Markdown 原文（{key}）',
      toRichTitle: '返回富文本模式：所见即所得渲染（{key}）',
      wide: '宽屏',
      wideOnTitle: '退出宽屏，恢复右侧面板',
      wideOffTitle: '宽屏：隐藏右侧面板，文档占满中间',
      words: '词',
      characters: '字',
      blocks: '段',
      about: '约',
      minutes: '分钟',
      statsTitle: '词数：中文按字计、英文按词计；阅读时长按 200 字/分钟估算',
      themeTitle: '当前主题：{theme}，点击切换',
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
