# Changelog

z-biz-tool-note 版本变更记录。格式遵循 [Conventional Commits](https://www.conventionalcommits.org/)。

## [1.2.0] - 2026-10-30

自 v1.1.0 以来共 8 个提交：4 个 feat、3 个 fix、1 个 style。核心是 **AI 设置接上供应商预设** —— 从「自己填一堆地址和模型名」变成「选一家、填一个 key」，并且填错了能说清错在哪。同时修掉了更新通道的两个家族级 bug。

### Features

- AI 设置接入供应商预设：预设下拉、按预设取模型列表、一键测连接，失败时给结构化错误（是 key 无效、地址不通、还是模型名不存在），不再是一句笼统的「请求失败」
- 按 `base_url` 反查供应商预设身份：host 匹配 + 协议族校验，用户手填的地址能自动认回是哪一家，避免「填了 OpenAI 兼容地址却按别家协议发请求」
- 接通 AI 流式对话：回复逐字出现，长回答不再长时间空白等待
- 笔记名解析收成唯一真源：标题、文件名、引用三处口径统一

### Fixes

- **更新通道两个家族级 bug**（静默失效，不报错但永远收不到更新）：
  - 片段目录名为 `.updater-fragments`，`actions/upload-artifact@v4` 默认不上传隐藏目录 ⇒ 四平台全报 `No files were found` ⇒ `latest.json` 从未成功推出去。改为不带前导点的目录名
  - `latest.json` 里的下载链接用本地文件名拼，但同一 Release 里两个 macOS 矩阵产出同名 `.app.tar.gz`，tauri-action 上传时会自动加架构后缀消歧 ⇒ 拼出来的 URL 全部 404。改为回查 release 资产按「同扩展名 + 同架构词」唯一匹配，并用远端 `.sig` 与本地 `.sig` 逐字节比对确认是同一个包
- 交互契约第二轮：保存时间解析留痕；CI 补上 capability 依赖
- clippy 门禁两条：冗余闭包、`bool` 断言比较

## [1.1.0]

首个带完整交互契约与本地库索引的版本（详见仓库历史）。
