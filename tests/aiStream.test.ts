// src/lib/aiStream.ts 的回归。
//
// Why 该测（2026-10-25 实测出来的真缺口）：
//   Rust 侧 `ai_chat_stream` 的 SSE 实现是完整的，三个事件
//   （token / done / error）后端都 emit 了，而**前端一次都没调、一次都没 listen**
//   ⇒ 整条流式链路是死的 ⇒ 用户只能等整段生成完。
//
//   本测试用**假 listen / 假 start** 把编排逻辑单独测掉（不碰 Tauri、不碰 React）：
//   重点是三个容易写错的地方 ——
//     ① **先订阅再触发命令**（反了就可能漏掉第一个 token）；
//     ② **无论怎么结束都要取消订阅**（不然每聊一次漏一个监听器）；
//     ③ **done 事件可能早于命令返回**（Rust 是先 emit 再 return，两条 IPC 谁先到不定）。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

const { runAiStream, AI_STREAM_EVENTS } = await import("../src/lib/aiStream.ts");

/** 让出一轮微任务 + 宏任务：等 runAiStream 里的三个订阅真正建好。
 *  ⚠ 真实运行时后端是**订阅建好之后**（start() 之后）才 emit 的，
 *    所以「订阅之前的事件」本来就不该到 —— 测试里也必须遵守同一个顺序。 */
const tick = () => new Promise((r) => setTimeout(r, 0));

/** 假事件通道：能订阅、能 emit、能数「还挂着几个监听器」 */
function fakeBus() {
  const handlers = new Map<string, Array<(p: unknown) => void>>();
  const unlistenCalls: string[] = [];
  const listen = async (event: string, cb: (p: unknown) => void) => {
    if (!handlers.has(event)) handlers.set(event, []);
    handlers.get(event)!.push(cb);
    return () => {
      unlistenCalls.push(event);
      const arr = handlers.get(event)!;
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    };
  };
  return {
    listen,
    emit(event: string, payload?: unknown) {
      for (const cb of [...(handlers.get(event) ?? [])]) cb(payload);
    },
    unlistenCalls,
    liveListeners() {
      let n = 0;
      for (const arr of handlers.values()) n += arr.length;
      return n;
    },
  };
}

test("逐 token 回调增量，最后 resolve 完整文本", async () => {
  const bus = fakeBus();
  const deltas: string[] = [];
  const p = runAiStream(
    {
      listen: bus.listen,
      start: async () => {
        bus.emit(AI_STREAM_EVENTS.token, "你");
        bus.emit(AI_STREAM_EVENTS.token, "好");
      },
    },
    (d) => deltas.push(d),
  );
  await tick();
  bus.emit(AI_STREAM_EVENTS.token, "！");
  bus.emit(AI_STREAM_EVENTS.done, { full: "你好！" });
  assert.equal(await p, "你好！");
  assert.deepEqual(deltas, ["你", "好", "！"]);
});

test("done 里没有 full 时用累计值", async () => {
  const bus = fakeBus();
  const p = runAiStream(
    {
      listen: bus.listen,
      start: async () => {
        bus.emit(AI_STREAM_EVENTS.token, "甲");
        bus.emit(AI_STREAM_EVENTS.token, "乙");
      },
    },
    () => {},
  );
  await tick();
  bus.emit(AI_STREAM_EVENTS.done, {});
  assert.equal(await p, "甲乙");
});

test("error 事件 ⇒ reject", async () => {
  const bus = fakeBus();
  const p = runAiStream({ listen: bus.listen, start: async () => {} }, () => {});
  await tick();
  bus.emit(AI_STREAM_EVENTS.error, "AI服务返回错误: 401");
  await assert.rejects(p, /401/);
});

test("start 抛错 ⇒ reject", async () => {
  const bus = fakeBus();
  await assert.rejects(
    runAiStream(
      {
        listen: bus.listen,
        start: async () => {
          throw new Error("命令没跑起来");
        },
      },
      () => {},
    ),
    /命令没跑起来/,
  );
});

test("无论成功还是失败，都必须取消订阅", async () => {
  const bus = fakeBus();
  const p = runAiStream(
    {
      listen: bus.listen,
      start: async () => {
        bus.emit(AI_STREAM_EVENTS.token, "x");
        bus.emit(AI_STREAM_EVENTS.done, { full: "x" });
      },
    },
    () => {},
  );
  await p;
  assert.equal(bus.liveListeners(), 0, "成功后还有监听器挂着");
  assert.equal(bus.unlistenCalls.length, 3, "三个事件都该被取消订阅");

  const bus2 = fakeBus();
  const p2 = runAiStream({ listen: bus2.listen, start: async () => {} }, () => {});
  await tick();
  bus2.emit(AI_STREAM_EVENTS.error, "挂了");
  await assert.rejects(p2);
  assert.equal(bus2.liveListeners(), 0, "失败后还有监听器挂着");
});

test("订阅失败 ⇒ reject（不能带着半个监听器往下跑）", async () => {
  const bus = fakeBus();
  let n = 0;
  await assert.rejects(
    runAiStream(
      {
        listen: async (event, cb) => {
          if (n++ === 1) throw new Error("订阅失败");
          return bus.listen(event, cb);
        },
        start: async () => {},
      },
      () => {},
    ),
    /订阅失败/,
  );
});

test("done 早于命令返回（Rust 先 emit 再 return）也能正确结束", async () => {
  const bus = fakeBus();
  let releaseStart: (() => void) | null = null;
  const p = runAiStream(
    {
      listen: bus.listen,
      start: () =>
        new Promise<void>((res) => {
          releaseStart = () => res();
        }),
    },
    () => {},
  );
  await tick();
  bus.emit(AI_STREAM_EVENTS.done, { full: "先到的 done" });
  releaseStart!();
  assert.equal(await p, "先到的 done");
});

test("命令回来了却一直没等到 done ⇒ 超时报错（不能永远挂着）", async () => {
  const bus = fakeBus();
  await assert.rejects(
    runAiStream(
      { listen: bus.listen, start: async () => {}, timeoutMs: 20 },
      () => {},
    ),
    /超时/,
  );
});

test("第一个 token 不能丢：订阅必须在触发命令之前", async () => {
  const bus = fakeBus();
  const seen: string[] = [];
  const p = runAiStream(
    {
      listen: bus.listen,
      start: async () => {
        // 命令一触发就吐 token —— 如果订阅还没建好，这里就漏了
        bus.emit(AI_STREAM_EVENTS.token, "第一个");
      },
    },
    (d) => seen.push(d),
  );
  await new Promise((r) => setTimeout(r, 0));
  bus.emit(AI_STREAM_EVENTS.done, { full: "第一个" });
  await p;
  assert.deepEqual(seen, ["第一个"]);
});
