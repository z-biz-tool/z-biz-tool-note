import type { Template } from '../types';

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'tpl-daily',
    name: '日常日志',
    builtin: true,
    content: `# {{date}}

## 今日计划
- [ ]

## 随手记

## 复盘

## 明天
- [ ]
`,
  },
  {
    id: 'tpl-meeting',
    name: '会议记录',
    builtin: true,
    content: `# {{title}}

**日期：** {{date}} {{time}}
**参与人：**

## 议题
-

## 记录
-

## 待办
- [ ]
`,
  },
  {
    id: 'tpl-todo',
    name: '任务清单',
    builtin: true,
    content: `# {{title}}

- [ ]
- [ ]
- [ ]
`,
  },
  {
    id: 'tpl-knowledge',
    name: '知识卡片',
    builtin: true,
    content: `# {{title}}

> 一句话结论。

## 为什么
## 是什么
## 怎么用
## 参考资料
-
`,
  },
];

export function applyTemplate(content: string, title: string = '未命名'): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);
  return content
    .replace(/\{\{date\}\}/g, dateStr)
    .replace(/\{\{time\}\}/g, timeStr)
    .replace(/\{\{title\}\}/g, title);
}

export function dailyNotePath(dir: string, date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${dir}/Daily/${y}-${m}-${d}.md`;
}

export function todayTitle(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
