import type { Template } from '../types';

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'tpl-daily',
    name: 'Daily Journal',
    builtin: true,
    content: `# {{date}}

## Plan
- [ ]

## Notes

## Reflection

## Tomorrow
- [ ]
`,
  },
  {
    id: 'tpl-meeting',
    name: 'Meeting Notes',
    builtin: true,
    content: `# {{title}}

**Date:** {{date}}
**Attendees:**

## Agenda
-

## Notes
-

## Action Items
- [ ]
`,
  },
  {
    id: 'tpl-todo',
    name: 'Task List',
    builtin: true,
    content: `# {{title}}

- [ ]
- [ ]
- [ ]
`,
  },
  {
    id: 'tpl-knowledge',
    name: 'Knowledge Card',
    builtin: true,
    content: `# {{title}}

> One-line summary.

## Why

## What

## How

## References
- 
`,
  },
];

export function applyTemplate(content: string, title: string = 'Untitled'): string {
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
