// 「最近打开」的唯一真源：落盘、命名、变更通知都收在这里。
// 之前 Sidebar 和 Welcome 各自读一遍 localStorage、各自写自己的 name，
// 于是同一篇笔记在两个列表里叫法不同；而且只有侧栏点击会记账，
// 双链 Cmd+点、快速切换、图谱、恢复暂存打开的笔记根本进不了列表。
import type { RecentFile } from '../types';
import { displayName } from './fileTypes';

const STORAGE_KEY = 'recentFiles';
const MAX_ENTRIES = 20;

/** 落盘只存路径和时间：显示名随时能由 displayName 推导，存两份必然会对不上 */
export interface RecentEntry {
  path: string;
  lastOpened: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeRecentFiles(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function writeEntries(entries: RecentEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 隐私模式/存储写满：最近列表是锦上添花，不能因为它把打开笔记的流程卡住
  }
  listeners.forEach(l => l());
}

function readEntries(): RecentEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) throw new Error('shape changed');
    return raw
      .filter((e: any) => e && typeof e.path === 'string')
      .map((e: any) => ({ path: e.path, lastOpened: Number(e.lastOpened) || 0 }));
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* 读不了大概率也删不了，忽略 */ }
    return [];
  }
}

/** 渲染用：name 一律现推导，老数据里存的「Welcome.md」也就自动跟上了当前规则 */
export function listRecentFiles(): RecentFile[] {
  return readEntries().map(e => ({ ...e, name: displayName(e.path) || e.path }));
}

/** 打开或切到某篇笔记时记一笔；重复打开只把它挪回最前 */
export function recordRecentFile(path: string): void {
  if (!path) return;
  const rest = readEntries().filter(e => e.path !== path);
  writeEntries([{ path, lastOpened: Date.now() }, ...rest].slice(0, MAX_ENTRIES));
}

/** 改名/移动后让路径跟着走；返回 null 表示这条要删掉（进了废纸篓的文件） */
export function mutateRecentFiles(change: (entry: RecentEntry) => RecentEntry | null): void {
  writeEntries(readEntries().map(change).filter((e): e is RecentEntry => e !== null));
}

/** 整列划走：只动这份列表，磁盘上的笔记一篇不碰（所以入口文案与确认框都得说清这点） */
export function clearRecentFiles(): void {
  writeEntries([]);
}

/**
 * 相对时间：列表里光有名字分不出"刚看过的"和"上周那篇"。
 * now 由调用方传进来（渲染层自己掐表），这里保持纯函数好测。
 */
export function formatRecentTime(ts: number, now: number = Date.now()): string {
  if (!ts) return '';
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '昨天';
  if (day < 7) return `${day} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
