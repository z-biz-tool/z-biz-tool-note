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
  toast: {
    saved: string;
    saveFailedStaged: string;
    saveAsFailed: string;
    unknownError: string;
    reloadFailed: string;
    keptLocal: string;
    loadedExternal: string;
    closedDeletedTabs: string;
    externalDeleted: string;
    needFolder: string;
    createFailed: string;
    createFailedRead: string;
    openFailed: string;
    noteNotFound: string;
    nothingToRestore: string;
    restoredStaged: string;
    discardedStaged: string;
    exportedHtml: string;
    exportedPdf: string;
    exportFailed: string;
    splitSaveFailed: string;
    aiEnabled: string;
    aiDisabled: string;
    dailyCreated: string;
    dailyOpened: string;
    templateCreated: string;
    renamedTo: string;
    movedTo: string;
    trashedNote: string;
    trashedFolder: string;
    deleteFailed: string;
    clearedRecent: string;
    renameFailed: string;
    targetHasFile: string;
    moveFailed: string;
    listFolderFailed: string;
    rootFolder: string;
  };
  settings: {
    title: string;
    tabAI: string;
    tabAppearance: string;
    tabTemplates: string;
    tabSearch: string;
    close: string;
    aiHint: string;
    enableAI: string;
    baseURL: string;
    apiKey: string;
    model: string;
    presets: string;
    zhipu: string;
    fontSize: string;
    font: string;
    fontSystem: string;
    fontPingFang: string;
    fontSourceSans: string;
    fontSourceSerif: string;
    aiHintTail: string;
    searchHint: string;
    indexDir: string;
    noFolder: string;
    indexed: string;
    indexedValue: string;
    unavailable: string;
    lastBuild: string;
    buildTime: string;
    neverBuilt: string;
    manualRebuild: string;
    rebuilding: string;
    rebuildNow: string;
    builtin: string;
    deleteTpl: string;
    newTpl: string;
    unnamedTpl: string;
    tplName: string;
    tplContent: string;
    placeholders: string;
    builtinNote: string;
    cancel: string;
    save: string;
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
    toast: {
      saved: 'Saved',
      saveFailedStaged: 'Save failed ({err}); the content is staged — restore it from the banner above',
      saveAsFailed: 'Save-as failed ({err}); your changes are still unsaved',
      unknownError: 'unknown error',
      reloadFailed: 'Could not reload: {err}',
      keptLocal: 'Kept your unsaved local changes',
      loadedExternal: 'Loaded the version on disk',
      closedDeletedTabs: 'Closed tabs pointing at deleted files',
      externalDeleted: 'The file was deleted on disk; related tabs were closed',
      needFolder: 'Open a folder first',
      createFailed: 'Could not create ({err})',
      createFailedRead: 'the file just written cannot be read back',
      openFailed: 'Cannot open {name}: {reason}',
      noteNotFound: 'Note not found: {name}',
      nothingToRestore: 'No recently closed tabs to restore',
      restoredStaged: 'Restored the staged copy — review it and save',
      discardedStaged: 'Discarded the staged copy',
      exportedHtml: 'Exported HTML: {path}',
      exportedPdf: 'Exported PDF: {path}',
      exportFailed: 'Export failed: {err}',
      splitSaveFailed: 'Split-pane save failed ({err}); the content is staged — restore it from the banner above',
      aiEnabled: 'AI assistant enabled',
      aiDisabled: 'AI assistant disabled',
      dailyCreated: 'Daily note created',
      dailyOpened: "Opened today's daily note",
      templateCreated: 'Note created from template',
      renamedTo: 'Renamed to {name}',
      movedTo: 'Moved to {name}',
      trashedNote: 'Note moved to trash',
      trashedFolder: 'Folder moved to trash',
      deleteFailed: 'Delete failed: {err}',
      clearedRecent: 'Cleared "recently opened"',
      renameFailed: 'Rename failed: {err}',
      targetHasFile: 'The target folder already has {name}',
      moveFailed: 'Move failed: {err}',
      listFolderFailed: 'Cannot list the folder',
      rootFolder: 'the root folder',
    },
    settings: {
      title: 'Settings',
      tabAI: 'AI Services',
      tabAppearance: 'Appearance',
      tabTemplates: 'Templates',
      tabSearch: 'Search',
      close: 'Close settings',
      aiHint: 'Works with any OpenAI-compatible endpoint: OpenAI, DeepSeek, Zhipu, Kimi, Ollama (',
      aiHintTail: '), etc.',
      enableAI: 'Enable AI assistant',
      baseURL: 'Base URL',
      apiKey: 'API Key',
      model: 'Model',
      presets: 'Presets:',
      zhipu: 'Zhipu',
      fontSize: 'Font size',
      font: 'Font',
      fontSystem: 'System default',
      fontPingFang: 'PingFang SC',
      fontSourceSans: 'Source Han Sans SC',
      fontSourceSerif: 'Source Han Serif SC',
      searchHint: 'Full-text search uses the local SQLite FTS5 index. Opening a folder aligns it by mtime, and files changed by an external editor are re-indexed automatically.',
      indexDir: 'Indexed folder',
      noFolder: 'No folder open',
      indexed: 'Indexed',
      indexedValue: '{a} of {total} notes',
      unavailable: 'Unavailable',
      lastBuild: 'Last alignment',
      buildTime: '{sec}s spent',
      neverBuilt: 'Not fully built in this session',
      manualRebuild: 'Rebuild',
      rebuilding: 'Aligning…',
      rebuildNow: 'Align index now',
      builtin: 'Built-in',
      deleteTpl: 'Delete template',
      newTpl: 'New template',
      unnamedTpl: 'Untitled template',
      tplName: 'Template name',
      tplContent: 'Template content — {{date}}, {{title}} and {{time}} are supported',
      placeholders: 'Placeholders:',
      builtinNote: ' · Built-in templates can be edited but not deleted',
      cancel: 'Cancel',
      save: 'Save',
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
    toast: {
      saved: '已保存',
      saveFailedStaged: '保存失败（{err}），内容已暂存，可在顶部横幅恢复',
      saveAsFailed: '另存为失败（{err}），内容仍未保存',
      unknownError: '未知错误',
      reloadFailed: '重新加载失败: {err}',
      keptLocal: '已保留本地未保存的修改',
      loadedExternal: '已加载外部修改',
      closedDeletedTabs: '已关闭指向被删除文件的标签',
      externalDeleted: '文件已被外部删除，相关标签已关闭',
      needFolder: '请先打开一个文件夹',
      createFailed: '创建失败（{err}）',
      createFailedRead: '刚写入的文件读不回来',
      openFailed: '无法打开 {name}：{reason}',
      noteNotFound: '未找到笔记: {name}',
      nothingToRestore: '没有最近关闭的标签可以恢复',
      restoredStaged: '已恢复暂存内容，请检查后保存',
      discardedStaged: '已丢弃本地暂存内容',
      exportedHtml: '已导出 HTML：{path}',
      exportedPdf: '已导出 PDF：{path}',
      exportFailed: '导出失败: {err}',
      splitSaveFailed: '分屏保存失败（{err}），内容已暂存，可在顶部横幅恢复',
      aiEnabled: 'AI 助手已启用',
      aiDisabled: 'AI 助手已关闭',
      dailyCreated: '今日日记已创建',
      dailyOpened: '已打开今日日记',
      templateCreated: '已从模板新建笔记',
      renamedTo: '已重命名为 {name}',
      movedTo: '已移动到 {name}',
      trashedNote: '笔记已移到废纸篓',
      trashedFolder: '文件夹已移到废纸篓',
      deleteFailed: '删除失败: {err}',
      clearedRecent: '已清空「最近打开」',
      renameFailed: '重命名失败: {err}',
      targetHasFile: '目标文件夹里已有 {name}',
      moveFailed: '移动失败: {err}',
      listFolderFailed: '无法列出文件夹',
      rootFolder: '根目录',
    },
    settings: {
      title: '设置',
      tabAI: 'AI 服务',
      tabAppearance: '外观',
      tabTemplates: '模板',
      tabSearch: '搜索',
      close: '关闭设置',
      aiHint: '支持任意 OpenAI 兼容接口：OpenAI、DeepSeek、智谱、Kimi、Ollama（',
      aiHintTail: '）等。',
      enableAI: '启用 AI 助手',
      baseURL: '接口地址 Base URL',
      apiKey: 'API Key',
      model: '模型',
      presets: '预设：',
      zhipu: '智谱',
      fontSize: '字体大小',
      font: '字体',
      fontSystem: '系统默认',
      fontPingFang: '苹方',
      fontSourceSans: '思源黑体',
      fontSourceSerif: '思源宋体',
      searchHint: '全文搜索走本地 SQLite FTS5 索引。打开目录时会按 mtime 增量对齐，外部编辑器改过的文件也会自动重新入库。',
      indexDir: '索引目录',
      noFolder: '尚未打开文件夹',
      indexed: '已索引',
      indexedValue: '{a} / {total} 条',
      unavailable: '不可用',
      lastBuild: '上次对齐',
      buildTime: '耗时 {sec} 秒',
      neverBuilt: '本会话尚未全量构建',
      manualRebuild: '手动重建',
      rebuilding: '对齐中…',
      rebuildNow: '立即对齐索引',
      builtin: '内置',
      deleteTpl: '删除模板',
      newTpl: '新建模板',
      unnamedTpl: '未命名模板',
      tplName: '模板名称',
      tplContent: '模板内容，可用 {{date}}、{{title}}、{{time}} 作为占位符',
      placeholders: '占位符：',
      builtinNote: ' · 内置模板可修改内容，但不可删除',
      cancel: '取消',
      save: '保存',
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
