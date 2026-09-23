export interface TabTitleItem {
  title: string;
  filePath?: string;
}

/**
 * 同名笔记在标签栏分不出彼此（两篇 Code 都只显示 "Code"）。
 * 这里只改"显示用的名字"：先原名，撞名就逐级往上补目录段（Code · Examples，
 * 还撞就 Code · demo/Examples），补不出来才保留同名——不动 tab.title，
 * 因为它是搜索/双链匹配用的名字，被这里的后缀污染就再也对不上 [[Code]] 了。
 */
export function disambiguateTabTitles(items: TabTitleItem[]): string[] {
  const names = items.map(i => i.title || '未命名');
  // 路径按段存好：撞名时从最近一级目录开始往外补
  const dirTails = items.map(i => (i.filePath || '').split('/').filter(Boolean).slice(0, -1));
  const maxDepth = dirTails.reduce((m, t) => Math.max(m, t.length), 0);

  const dupKeys = (list: string[]) => {
    const count = new Map<string, number>();
    list.forEach(n => count.set(n, (count.get(n) ?? 0) + 1));
    return new Set([...count.entries()].filter(([, c]) => c > 1).map(([n]) => n));
  };

  const result = [...names];
  let ambiguous = dupKeys(names);
  for (let depth = 1; depth <= maxDepth && ambiguous.size > 0; depth++) {
    for (let i = 0; i < result.length; i++) {
      if (!ambiguous.has(result[i])) continue;
      const tail = dirTails[i].slice(-depth).join('/');
      if (tail) result[i] = `${names[i]} · ${tail}`;
    }
    // 判重看的是"当前这一行的显示名"，每补一级都要用补完的结果重新算
    ambiguous = dupKeys(result);
  }
  return result;
}
