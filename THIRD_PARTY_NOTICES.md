# 依赖、资源与分发记录

## 当前运行版本：Stockfish 19（升级记录）

当前已替换下表历史版本中的引擎为 **stockfish npm 19.0.1 / Stockfish 19 完整多线程 NNUE**。来源 https://github.com/nmrugg/stockfish.js/tree/v19.0.1 ，GPL-3.0。实际阅读 npm 内 Copying.txt 和 JS 版权头，保留 Chess.com 2026 与 Stockfish 作者声明；其他依赖许可不变。

未经修改的运行文件为 `stockfish-19.js`（33,326 字节）和 `stockfish-19.wasm`（99,076,105 字节，约 94 MiB）。不使用 Lite。对应标签 v19.0.1 解引用提交 `0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6`，完整 C++ 与构建脚本归档在 `public/source/stockfish-v19.0.1.tar.gz`，SHA-256 `e5289a920554bf0069a6601c228e81d957c00522bb31c4343588dc5d7d251879`。

源码默认完整网络 `nn-1a298aa575a0.nnue` 额外存放在 `public/source/`，下载自 https://tests.stockfishchess.org/api/nn/nn-1a298aa575a0.nnue ，SHA-256 `1a298aa575a085434d29027978dc36867fe9c5bcea9376654b7a8eba1e52dfc2`（与网络文件名哈希前缀匹配）。这些源码与网络进入 dist/source，正常分析仅加载嵌入网络的 WASM，不会重复下载 source 网络。

上游当前构建要求 Emscripten 6.0.9；归档包含 build.js 和 src/Makefile。解压源码、把网络放到源码 src/ 下，参考 `node build.js --help` 及该版本 README 构建完整版。未声称已逐字节重建官方 WASM。公开分发时一起提供本应用源码、当前引擎源码、网络、构建说明及许可证，不能只发 JS/WASM。

## 首版历史记录（17.1，已不作为运行引擎）

核查日期：2026-10-18。先检查 npm 版本元数据，再阅读已安装包的实际 LICENSE / Copying.txt。核心依赖精确锁定，完整版本及完整性哈希记录在 package-lock.json。未使用外部字体、图片 CDN 或单独来源的棋子图片；棋子由 react-chessboard 随包绘制。

| 组件                               | 版本                               | 来源                                                     | 实际许可证与义务                                                          |
| ---------------------------------- | ---------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| React / React DOM                  | 18.3.1                             | https://github.com/facebook/react                        | MIT，保留版权及许可证                                                     |
| react-chessboard（含默认棋子绘制） | 4.7.3                              | https://github.com/Clariity/react-chessboard/tree/v4.7.3 | 包内 LICENSE 为 MIT，保留版权及许可证；未额外引入其他棋子集               |
| chess.js                           | 1.4.0                              | https://github.com/jhlywa/chess.js                       | BSD-2-Clause，源码及二进制分发保留版权、条件、免责声明                    |
| Stockfish.js                       | npm 17.1.0 / 引擎 17.1 Lite Single | https://github.com/nmrugg/stockfish.js/tree/v17.1.0      | GPL v3，保留版权和许可证，提供对应源码、构建脚本及必要资源；不能只发 WASM |

Stockfish 文件为未经修改的 `stockfish-17.1-lite-single-03e3232.js` / `.wasm`，分别约 21 KB / 7.28 MB。JS 顶部明确标注 Chess.com 2025、Stockfish 原作者、GPLv3，以及 Linmiao Xu 的网络 `nn-9067e33176e`。嵌入网络作为引擎资源随同分发，未声称资源免除 GPL 义务。

版本标签已通过 git ls-remote 核实：`v17.1.0` → `f9512ef9aff391026813a56855dd086cb72a2d58`。对应上游源码归档见 `public/source/stockfish-v17.1.0.tar.gz`（随构建复制到 dist/source），上游位置：

- [固定提交源码](https://github.com/nmrugg/stockfish.js/tree/f9512ef9aff391026813a56855dd086cb72a2d58)
- [固定提交源码归档](https://codeload.github.com/nmrugg/stockfish.js/tar.gz/f9512ef9aff391026813a56855dd086cb72a2d58)
- [上游构建说明](https://github.com/nmrugg/stockfish.js/tree/v17.1.0#compiling)
- [网络来源](https://tests.stockfishchess.org/nns?network_name=nn-9067e33176e)

归档约 198 MB，不会在正常走棋时下载；包含 build.js、Makefile、evaluate.cpp 和 nn-9067e33176e8.nnue。SHA-256：`53a1eb6b34fc5b48965bed53b7d249f414f167a9f3ac94bf1b139eee47ab68a6`。

上游 README 要求 Emscripten 3.1.7，提供 build.js，`./build.js --help` / `./build.js --all`。本项目复用官方 npm 构建，未声称已重建或逐字节复现 WASM。发布前应确保对应网络下载、完整源文件和工具链说明仍可取得。

本交付采用保守的 GPL-3.0-or-later 应用源码许可，与 GPLv3 引擎一起交付；引擎自身许可仍按其原文本保留。没有基于“Worker 是独立进程”推定闭源分发豁免。MIT / BSD 组件保留各自许可证。根 LICENSE 为 GPL v3 正文。

**分发整个应用或 dist 时**：同时交付应用源码（src、scripts、package-lock、配置、文档）、对应引擎源码、所有许可证、修改记录，以及重建指令。保留可访问的源码入口，不能删掉 notices 后只上传压缩 JS/WASM。GPL 允许商业使用，但不是允许剥离相应源码义务的闭源授权。若未来必须闭源商业分发，应重新评估组合分发边界，或者更换取得兼容商用授权的引擎；不能把网络或 Worker 调用作为自动规避结论。

`scripts/assets.mjs` 自动复制核心 LICENSE 到 public/licenses 并进入构建。生产依赖的递归许可清单和文本见自动生成的 `public/licenses/production-notices.txt`。开发工具仅用于构建 / 测试，版本见锁文件，不作为运行时页面内容发布。

@react-dnd/invariant / shallowequal 的 npm 包未附单独许可证文件，因此额外保留 react-dnd 主库 MIT 文本和原工具分支的许可证，存于 licenses/。来源分别为 https://github.com/react-dnd/invariant/blob/master/LICENSE 与 https://github.com/react-dnd/shallowequal/blob/master/LICENSE，含 Facebook 与 Alberto Leal 的原版权声明；构建生成的通知包含这些文本。

## Wikibooks 开局资料与翻译

开局资料按需从 https://en.wikibooks.org/wiki/Chess_Opening_Theory 获取。Wikibooks 文本使用 Creative Commons Attribution-ShareAlike 许可（具体条款见 https://en.wikibooks.org/wiki/Wikibooks:Copyrights 及原页面页脚）。应用在原文节选及 AI 译文旁保留来源链接、文章版本、作者编辑历史和许可链接；译文为机器翻译改编，沿用原文的署名-相同方式共享许可。原文提取省略图表、导航和参考文献，不将这些文章声明为本项目原创代码。资料缓存与翻译结果须保留这些来源信息。

服务器 HTML 正文解析使用 linkedom（ISC）；完整版本和传递依赖许可由 package-lock.json 及生成的 public/licenses/production-notices.txt 记录。
