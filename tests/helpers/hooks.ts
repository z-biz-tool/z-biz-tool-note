// 前端单测的公共装载器。
//
// Why 需要它：仓里的前端测试跑在 `node --experimental-strip-types --test` 上，
// 没有 vitest（不引新依赖是硬约束）。Node 的 ESM 解析器**不做扩展名补全**，
// 而仓里的源码是 Vite 风格的无扩展名相对导入（`import { x } from './fileTypes'`），
// 直接 import 会 ERR_MODULE_NOT_FOUND。这里补一条解析钩子把无扩展名相对路径
// 补成 .ts。
//
// 顺带把 'react' 短路成桩：frontmatter.ts 顶部为 useFrontmatter 引了 react，
// 而本仓的测试只碰纯函数、不调 Hook，装一个真的 React 进来只会让加载变慢。
//
// 用法：先 installHooks()，再 await import() 目标模块（钩子只对之后的解析生效）。
import module from "node:module";

const REACT_STUB =
  "data:text/javascript," +
  encodeURIComponent(
    "export const useState=()=>[undefined,()=>{}];" +
      "export const useEffect=()=>{};" +
      "export const useCallback=(f)=>f;" +
      "export const useRef=(v)=>({current:v});" +
      "export const useMemo=(f)=>f();" +
      "export const createContext=()=>({Provider:()=>null});" +
      "export const createElement=()=>null;",
  );

let installed = false;

export function installHooks(): void {
  if (installed) return;
  installed = true;

  module.registerHooks({
    // 注意：Node 的同步加载路径（resolveSync）要求 resolve 钩子**同步返回**，
    // 写成 async 会让框架拿到一个还没 resolve 的 Promise，报
    // ERR_INVALID_RETURN_PROPERTY_VALUE（url 为 undefined）。
    resolve(specifier: string, context: any, nextResolve: Function) {
      if (specifier === "react") return { url: REACT_STUB, shortCircuit: true };
      // 相对路径且没有扩展名 → 补 .ts / .tsx（Vite 的写法在 Node 里要自己补；
      // dialogs.tsx 这类 .tsx 模块只补 .ts 会解析失败）
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !/\.[cm]?[jt]sx?$/i.test(specifier)
      ) {
        for (const ext of [".ts", ".tsx"]) {
          try {
            return nextResolve(`${specifier}${ext}`, context);
          } catch {
            // 换下一个扩展名再试
          }
        }
      }
      return nextResolve(specifier, context);
    },
  });
}
