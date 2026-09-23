// 界面里的修饰键此前一律硬写 "Cmd"，但快捷键处理器实际接受 metaKey || ctrlKey；
// 于是 Windows/Linux 上照提示按 ⌘ 找不到键，macOS 上按提示的 Ctrl 又和系统习惯相反。
// 这里只在展示层做替换，绑定逻辑仍然两种都收。
const uaPlatform: string =
  (navigator as any).userAgentData?.platform || navigator.platform || navigator.userAgent || '';

export const IS_MAC = /mac|iphone|ipad|ipod/i.test(uaPlatform);

export const MOD = IS_MAC ? '⌘' : 'Ctrl';

/**
 * 把文案里的 Cmd / Ctrl / Mod 归一成当前平台的主修饰键；
 * macOS 顺带把 Shift / Alt 换成菜单惯用符号（⇧ / ⌥）。
 */
export function modKeys(text: string): string {
  let out = text.replace(/\b(Cmd|Ctrl|Mod)\b/g, MOD);
  if (IS_MAC) out = out.replace(/\bShift\b/g, '⇧').replace(/\bAlt\b/g, '⌥');
  return out;
}
