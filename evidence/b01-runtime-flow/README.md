# B01 · 正常玩家流程与运行稳定性

目标游戏：`Slice Master / 小李飞刀`
目标工作区：`game/prototype-a`
工作分支：`codex/b01-runtime-flow`
参考基线：`b7e4b4b2ea7cab16c2dd27a91126fc29cde3c2ee`
被测试源码提交：`de6f11d2231398f6c655abbddd40c548d1524126`

本批走 `formal-fixer` 路由。修复只覆盖 B01，未修改历史 QA、研究原型或其他项目。

## B01-01 · 奖励入口规则

- `createCourse` 只读取关卡定义的 `bonusAvailable`，不再把 seed 奇偶作为开关。
- 保留每个关卡已有显式配置、普通/倍率/安全终点和奖励连锁逻辑。
- `runtime-flow.test.ts` 对全部关卡使用奇数和偶数 seed，检查 BONUS 入口与配置一致，且不允许的关卡没有 BONUS 入口。
- 390×844 最终浏览器截图能看到最终关卡的 BONUS 标签；本轮没有用内部 API 或隐藏按钮进入 BONUS 关。
- 自然输入命中 BONUS 分支未完成验证，报告中记为 `NOT_RUN`，不是自然路径通过。

## B01-02 · 结束、重试、下一关

- 终局场景翻转不再自动重开；终局按钮显式执行“重试本关”或可用的“下一关”。
- 终局提示改为“请使用下方按钮重试”，按钮监听阻止场景输入和重复快速点击。
- 重试清空输入、反馈、事件和结算标记，并保留本关 seed；完成记录由幂等 key 防止每帧重复写入。
- 390×844：失败→空白点击保持失败→重试 ready 连续 10 轮通过；固定普通输入轨迹完成→下一关→刷新恢复 02/12 通过。
- 1100×720：失败→空白点击→重试连续 10 轮通过；普通完成固定轨迹未到达终局，`terminal-win-1100` 为 `NOT_RUN`。

## B01-03 · 暂停、恢复、输入释放

- 新增 `src/runtime-lifecycle.ts`，统一处理 visibility、blur、persisted pagehide/pageshow、继续按钮和真实卸载。
- 暂停会释放输入并重置 wall time；BFCache 页面保留 renderer；非 persisted pagehide 才清理帧循环、监听器和 renderer。
- 逻辑测试覆盖 Continue 只恢复、不额外翻转，以及 BFCache/卸载分支。
- 两个视口都完成了合成 blur/pagehide 测试；这不是实际切后台或真实 BFCache 往返的证明，真实浏览器生命周期仍是未覆盖项。

## B01-04 · 进度保存降级

- `window.localStorage` 获取、读取和写入均可失败；损坏数据回到 level 1，不误解锁。
- 按 storage 对象隔离 session fallback；写入失败仍保留最新内存解锁，重新创建 store 可恢复；UI 显示非阻塞提示。
- 覆盖正常、损坏、读取抛错、写入抛错和 `null` storage 的 11 个新增 runtime-flow 测试全部通过。
- 本轮没有在浏览器中替换真实 `window.localStorage`，因此浏览器存储故障分支按逻辑测试记录。

## 检查结果

| 命令 | 结果 | 证据 |
|---|---|---|
| `pnpm test` | **BLOCKED（基线缺失文件）**：212 pass、1 fail | `logs/test.log` |
| `pnpm exec tsx --test tests/runtime-flow.test.ts` | **PASS**：11/11 | `logs/runtime-flow.log` |
| `pnpm typecheck` | **PASS** | `logs/typecheck.log` |
| `pnpm lint` | **PASS** | `logs/lint.log` |
| `pnpm build` | **PASS**，生成 self-contained `dist/index.html` | `logs/build.log`、`manifest.json` |

完整回归唯一失败是仓库既有 `tests/asset-manifest.test.ts`：它读取仓库根目录 `artifacts/asset-manifest.json`，该文件在参考基线和当前 clone 中均不存在；本批没有删除、跳过或放宽该测试，也没有添加无关归档文件。

## 浏览器证据

脚本：`qa-natural.mjs`。每个用例从新 browser context 开始，390×844 使用触控事件，1100×720 使用鼠标事件；输入时间表固定预先声明，不通过 `getState` 驱动下一次输入，不调用 `selectLevel`、`debugPlacePlayer`、`debugEnterFinishGate` 或 `enterBonusChallenge`。`getState` 只在操作后作辅助核对。

最终报告：`browser-report.json`。结果摘要：

- `390x844`：failure/retry **PASS（10 cycles）**；ordinary win→next→reload **PASS**；synthetic lifecycle **PASS**；console errors `0`。
- `1100x720`：failure/retry **PASS（10 cycles）**；ordinary win→next→reload **NOT_RUN**（两个固定候选都在失败终局）；synthetic lifecycle **PASS**；console errors `0`。
- BONUS 自然进入：**NOT_RUN**；逻辑一致性和可见 BONUS 标签分别有测试/截图证据。

关键可见证据：

- `screenshots/390x844-terminal.png`、`screenshots/390x844-replay.png`
- `screenshots/390x844-ordinary-terminal.png`、`screenshots/390x844-next-level.png`、`screenshots/390x844-reload-level-2.png`
- `screenshots/390x844-paused-continue.png`、`screenshots/390x844-pageshow-resumed.png`
- `screenshots/1100x720-terminal.png`、`screenshots/1100x720-replay.png`
- `screenshots/1100x720-paused-continue.png`、`screenshots/1100x720-pageshow-resumed.png`

## 文件用途

- `src/game-core.ts`：奖励入口来源和终局翻转行为。
- `src/main.ts`：终局按钮、输入释放、生命周期接线、进度告警和幂等完成记录。
- `src/runtime-lifecycle.ts`：暂停/继续、BFCache、卸载协调器。
- `src/level-progress.ts`：存储访问保护、迁移、session fallback 和告警。
- `src/theme.ts`、`index.html`、`src/style.css`：终局/继续/存储告警的可见文案和布局。
- `tests/runtime-flow.test.ts` 及相关已有测试：B01 逻辑回归。
- `dist/index.html`：本批最终构建产物。

证据文件只使用仓库相对路径。当前交付应以 Draft PR 供负责人复核；不合并，不开始 B02，不宣称平台包或真机验收。

## B01-R1 · 负责人批准的自然流程补验

本轮继续使用 `codex/b01-runtime-flow`，目标构建源码为
`de6f11d2231398f6c655abbddd40c548d1524126`，被测 `dist/index.html`
SHA-256 为 `8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d`。
源码审阅没有发现可复现的 B01 缺陷，因此没有修改 `game/prototype-a`。

正式脚本先固定输入时间表，再从新 browser context 执行；仅向可见画布发送鼠标或触控输入。
本轮没有调用 `selectLevel`、`debugPlacePlayer`、`debugEnterFinishGate`、
`enterBonusChallenge`、模拟 `step`，也没有修改存储。探索期的诊断轨迹与正式证据分开，
见 `r1-exploration-log.json`。

### A · 1100×720 普通完成→下一关→刷新

- 完整探索次数：6；成功次数：0。
- 六次探索均在 `phase=ordinary,status=won` 之前掉落；正式固定尝试记录
  `phase=ordinary,status=failed,failReason=fall`，所以该目标分类为 `NOT_RUN`，
  不是产品终局断言 `FAIL`。
- 由于没有到达普通结算检查点，没有声称空白点击、下一关或刷新后的第二关通过；
  对应脚本、连续步骤截图、console/pageerror 记录在
  `r1-formal-ordinary-fixed.mjs`、`r1-ordinary-report.json` 和 `r1-ordinary/`。

### B · 自然进入 BONUS

- `390×844`：1 次冻结正式尝试，在普通分支掉落；未观察到 `phase=bonus`，分类 `NOT_RUN`。
- `1100×720`：1 次冻结正式尝试结束于普通分支 airborne；未观察到 `phase=bonus`，分类 `NOT_RUN`。
- 没有把 BONUS 标签、配置值或调试诊断当作自然进入 PASS；也没有声称奖励玩法响应。
- 证据在 `r1-formal-bonus-fixed.mjs`、`r1-bonus-report.json`、
  `r1-bonus/` 和两张 ready 截图中。

独立 QA 的新 context 复现与审查单独记录在 `r1-independent-review.json`。
真实切后台、真实 BFCache 往返和浏览器存储故障注入本轮未执行，继续保持未覆盖。
历史 `browser-report.json` 的旧结果保留，R1 汇总见 `r1-browser-report.json`。

### R1 工程回归

同环境回归见 `r1-regression.json`：当前 `lint` 和 `typecheck` 通过；`pnpm test`
为 212 pass、1 fail。用 base SHA 的可复现归档运行同一命令得到 201 pass、1 fail，
两次唯一失败都是仓库根目录缺失 `artifacts/asset-manifest.json` 的既有
`ASSET-MANIFEST-001`，没有删测试、跳过测试或伪造资源清单。

## B01-R2 · 失败轨迹解释与取证方式对照

R1 的所有原始文件保留。R2 只新增验收脚本和证据，没有修改 `game/prototype-a`
源码，也没有重新构建；被测源码和构建 SHA 仍与上面的 R1 记录一致。

### 脚本修订

`qa-natural-r2.mjs` 现在为每个用例记录 `rawOutcome`、`result`、
`validObservation`、`failureStage`、`requiredCheckpoint`、输入 receipt、状态/事件轨迹
和 console/pageerror。普通用例严格要求 `phase=ordinary,status=won,finishPhase=terminal`，
结算后验证空白点击不变、下一关 ready、刷新后第二关 ready 且可由可见输入开始游玩。
BONUS 用例在自然进入 `phase=bonus` 后再发送正常输入，要求 phase 保持并出现响应。
目标未达到是 `NOT_RUN`，到达目标后断言失败才是 `FAIL`，浏览器/工具故障才是
`BLOCKED`；到达目标且所有断言满足才是 `PASS`。分类逻辑自检命令
`R2_SCRIPT_SELF_CHECK=1 node evidence/b01-runtime-flow/qa-natural-r2.mjs` 返回 6/6 PASS，
记录在 `r2-acceptance-script-self-check.json`。R1 的分类映射和修订理由见 `r2-revision-notes.md`。

### R2 诊断结果

- 同一构建、`1100×720`、同一输入计划做两次 fresh context 对照，只改变输入间是否截取截图。
  两种模式均记录到 10 次 `pointerdown/pointerup` receipt。截图模式在第 10 次输入后为
  `failed/spike`，无截图模式仍为 `anchored`；第 4 次输入已出现约 41.91 像素位置差。
- 该差异支持“取证等待可能扰动 wall-clock 输入节奏”这一待检验假设，尚未证明因果，
  不作为源码缺陷或自然验收 PASS。完整对照见 `r2-ordinary-capture-compare.json`，
  运行时间为 `2026-09-25T11:02:04.850Z`。
- 另有 4 次固定节奏可见输入探索；合计 6 次诊断均未到达 ordinary won，未找到可复用的
  普通通关策略。R2 不把这些失败尝试升级为产品 FAIL。
- 因为还没有可见通关策略，R2 正式自然验收和独立浏览器复现均保持 `NOT_RUN`；
  `qa-natural-r2.mjs` 已准备好，但本轮没有用重复失败轨迹伪造正式 PASS。

R2 汇总：`r2-browser-report.json`；独立 QA 审查：`r2-independent-review.json`；
console/pageerror 汇总格式：`r2-natural-console-errors.json`（正式自然脚本尚未执行）。
真实切后台、真实 BFCache、浏览器存储故障注入继续标记为未覆盖。

R2 工程回归见 `r2-regression.json`：lint 和 typecheck 通过；测试保持 212 pass、1 fail，
唯一失败仍是仓库根目录缺失 `artifacts/asset-manifest.json`，与 R1 基线相同。

## B01-R2 补交 · 首次分歧对齐

远端 HEAD 和本地 HEAD 均为 `04bea373c2598549c8cf497061c0a8299527948c`，工作树干净。
`git diff 3715502..04bea373 -- game/prototype-a` 为空，确认 R1→R2 没有游戏源码变化。
4175 服务返回的 `dist/index.html` SHA-256 与记录的
`8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d` 一致。

原对照的启动状态存在混杂：页面刚加载时两个 context 的 `worldTime` 不同。本次对照在可选
ready 截图后调用已有 `resetGame()`，统一到 seed 31、level 1、ordinary/ready、worldTime 0、
相同进度，再沿用原始 wall-time 输入表；BONUS 没有重跑。

新增 `r2-ordinary-capture-align.mjs`，默认关闭周期轮询。每个 pointerdown 由浏览器 capture
监听器记录原生处理前状态，由 bubble 监听器记录游戏 shell handler 返回后的状态，均带 120Hz
物理步、姿态、速度、anchor、事件顺序和 receipt 时间；另保留输入后的固定物理步检查点。
这避免把截图结束时间误当成两组共同检查点。两种执行顺序都跑过：

- 截图先执行：输入 1–3 是最后确认的事件窗口，输入 4 首次出现实质状态差；此时物理步为
  385 vs 383，说明输入已落在不同步。
- 无截图先执行：输入 4 两组都在物理步 383，且 pointerdown handler 都立即产生同一个
  `flip`；差异已存在于输入前的 x/y/vy（435.2/446.75/310 对 418.95/416.42/245）。

因此可复验解释是：截图取证改变了输入之间的 wall-clock 路径，导致后续物理步和输入前姿态
分叉；交换执行顺序没有显示输入 handler 的截图特异语义变化。私有 `ActionInput` accepted/
buffered 标志仍未通过源码 hook 暴露，未发生可见状态转移时只能保留为
`buffered-or-ignored`，不会伪造 accepted=true。

对齐汇总：`r2-ordinary-capture-alignment.json`；原始顺序报告：
`r2-ordinary-capture-align-with-first.json`、`r2-ordinary-capture-align-without-first.json`。
该结果仍是 diagnosis-only，普通通关和 BONUS 自然验收状态不变。

## B01-R2 补交：普通首关路径已建立

本节是 R2 补交后的当前结果；上面的 R1 和 R2 中间诊断段落保留为历史记录，不覆盖原始证据。

### 版本与构建核对

`r2-version-check.json` 记录了版本核对：本地和远端 `codex/b01-runtime-flow` 都是
`04bea373c2598549c8cf497061c0a8299527948c`；`git diff 3715502..04bea373 -- game/prototype-a`
为空；`dist/index.html` 与 4175 服务实际返回内容的 SHA-256 都是
`8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d`。本补交只改
`evidence/b01-runtime-flow/`，没有改游戏源码，也没有重建游戏。

### 普通首关正式路径

诊断搜索得到的合法动作轨迹先记录在 `r2-ordinary-candidate.json`，不直接当作 PASS。
随后正式浏览器脚本 `qa-natural-r2.mjs` 使用同一构建、全新 context 和预先写明的可见策略：

- 视口 `1100×720`，鼠标点击画布可见位置 `(550,518.4)`；
- ready 后固定等待 `400ms`，再在 `150ms + 975ms*n` 发送点击；
- 不读取隐藏状态决定下一次输入，不调用 debug 入口、状态注入或模拟 step；取证只保留 ready、结算、下一关 ready、刷新后 ready 四个关键截图。

正式记录 `r2-ordinary-formal.json` 为 `PASS`：终点同时满足
`phase=ordinary,status=won,finishPhase=terminal`，结算前终局操作隐藏；结算后空白点击状态不变；
点击下一关进入 level 2 ready；刷新后仍是 level 2 ready；刷新后的可见输入产生实际状态/事件响应。

独立 QA 在两个新的 browser context 中分别用同一策略复现，记录为
`r2-ordinary-independent-qa-1.json` 和 `r2-ordinary-independent-qa-2.json`，结果均为 `PASS`；
三份报告的输入 receipt 完整且 console/pageerror 均为空。截图和连续输入记录分别在
`r2-natural/formal-ordinary/`、`r2-natural/independent-qa-1/`、
`r2-natural/independent-qa-2/`。正式 ordinary 共 3 次，成功 3 次；诊断阶段原有 6 次失败
仍保留在旧报告中，不被覆盖成“全绿”。

### 当前分类

- `A-ordinary-1100x720`: **PASS**（正式 1 次 + 独立 QA 2 次均通过）。
- `B-bonus-390x844`: **NOT_RUN**，按本补交范围保留，不重复失败前置路径。
- `B-bonus-1100x720`: **NOT_RUN**，按本补交范围保留，不重复失败前置路径。
- 真实切后台、真实 BFCache、浏览器存储故障注入：继续明确为未覆盖。

分类脚本的自动化自检仍由
`R2_SCRIPT_SELF_CHECK=1 node evidence/b01-runtime-flow/qa-natural-r2.mjs` 完成，结果见
`r2-acceptance-script-self-check.json`；目标未达到仍为 `NOT_RUN`，到达目标后断言失败才为
`FAIL`，浏览器/工具障碍才为 `BLOCKED`。

## B01-R2 小修补验：验收缺口与首次分歧已修正

本节是当前小修补验结果；上方 R1/R2 中间段落保留为历史记录。v2.1 验收脚本和首次分歧复核只修改 `evidence/b01-runtime-flow/`，没有修改 `game/prototype-a`，也没有重新构建被测游戏。

- `r2-ordinary-capture-align.mjs` 按 `result.mode` 分组，默认写入独立的 `r2-ordinary-capture-align-r2/` 报告和截图目录，不覆盖历史 compare 与截图。复核报告把最早已观测时机差异和首次可视阈值差异分开记录。
- `without-first` 原始记录中，第一次输入为无截图 109 步、截图 108 步；第三次 launch 为 261/274 步，均从 `(282.7,439.125)`、`(150,-300)` 起跳；第四次输入均在 383 步，飞行 122/109 步。按 `vy=min(vy+600/120,760); x+=vx/120; y+=vy/120` 复算，得到无截图 `(435.2,446.75), vy=310`、截图 `(418.95,416.4166666667), vy=245`，与观测一致。
- 这支持“起跳时机不同造成飞行步数不同”的解释。截图编码、远程读取、事件处理、RAF 调度以及私有 `ActionInput`/`inputBuffer` 没有独立隔离，所以没有宣称截图是唯一原因。诊断 reset 明确记录为 `window.__GAME_TEST__.resetGame()`；原始运行没有实际执行统一 `+120` 固定步检查点。
- 验收脚本现在要求每个检查点均 `executed=true`、`validObservation=true` 且断言通过。它被动记录 normal、contact、reward、celebration 阶段的终局控件实际可见性，结算后才要求控件可见。输入回执用发送前长度和序号切片，输入响应必须有本次新增的 `launch`、`flip` 或 `cut` 事件，只有自然运动不算响应。
- 自检命令 `R2_SCRIPT_SELF_CHECK=1 node evidence/b01-runtime-flow/qa-natural-r2.mjs` 为 `10/10 PASS`，覆盖无效观测、旧回执复用、控件提前显示、自然运动无动作、产品断言后工具异常等反例。早期修补尝试的 `NOT_RUN` 报告、失败阶段和证据目录均保留；它们不是产品 `FAIL`。

正式小修补验使用新的 `1100×720` context、默认首关和玩家可读策略：ready 后等待 400ms，只点击可见画布 `(550,518.4)`，从 150ms 起每 975ms 一次；以可见 pointer receipt 和新增动作事件确认操作，等待期间不暂停、不手动 step、不按隐藏状态改节奏。正式报告 `r2-ordinary-formal-r2patch-v8.json` 与独立 QA 新 context `r2-ordinary-independent-qa-r2patch-v8.json` 都通过 ordinary/won、结算前控件隐藏、结算后控件可见、空白点击不重开、下一关 level 2 ready、刷新后仍为 level 2 ready、刷新后新增动作响应等检查。

两个 BONUS 视口、真实切后台、真实 BFCache、浏览器存储故障注入仍为 `NOT_RUN`/未覆盖。历史三份 ordinary PASS、R1 原始证据和已知 asset-manifest 缺失失败均保留。

## B01-R2 验收收口 · v2.2 观测区间与响应归因

在基线 `603ecc42ba2f6aa0a1cf93cd9450e60c910959b2` 上，验收脚本升级为 `B01-R2-acceptance-v2.2`。没有重跑截图/无截图对照，也没有修改游戏源码。

- 控件 observer 在第一条正常玩家输入前启动；ready 样本与 normal-running 样本分开。formal 与 independent 两次运行都记录了 `normal-running-start`、`contact`、`reward`、`celebration` 和 terminal 样本。observer 起止时间、是否中断以及 style 属性变化均被记录。
- contact、reward、celebration 现在是三个独立检查点；缺少任一阶段都会使该检查点 `NOT_RUN`，不会由其它过渡样本代替。
- 刷新后的关键输入使用原生 pointer receipt、发送前后事件边界和 causal launch 证据；只有自动碰撞产生的 cut 而没有 causal launch/flip 时，不再算作输入响应。响应后的画面保存为 `ordinary-1100-reload-after-input.png`。
- 初始导航和 level 2 reload 都记录了浏览器实际主文档响应的状态与 SHA-256，均与被测构建一致。
- 反例自检现在直接调用正式的 `buildOrdinaryChecks` 与 `summarizeOrdinary`，19 项全部通过，包含 ready-only、observer 晚启动、单独 contact、自动 cut、终局观测无效以及 FAIL 后工具异常等情况。终局已到达但观测无效时，`result=NOT_RUN` 且 `rawOutcome=target-checkpoint-observation-invalid`，两者一致。

当前新增正式运行与独立复现均为 PASS，v8 报告及其已支持子检查点继续保留为历史证据。BONUS 两个视口、真实切后台、真实 BFCache 和浏览器存储故障注入继续 `NOT_RUN`。

玩家说明的反馈来源仅是可见画面：刀具在画布上开始运动、路线/碰撞反馈和结算界面变化。pointer receipt、handler 边界和 launch 事件只属于 QA 取证，不能作为玩家决定下一次操作的依据。

## B01-R2 离线最终收口 · v2.3

本轮没有新的浏览器运行、自然通关、截图对照或游戏源码改动。两个 v2.2 ordinary 成功 JSON 保持原样，并由 `r2-acceptance-offline-recheck-v23.mjs` 离线重构检查点：formal 与 independent QA 均复算为 `PASS / target-checkpoint-passed`。浏览器原脚本版本/hash 与离线复核程序版本/hash 在 `r2-acceptance-offline-recheck-v23.json` 中分开记录。

验收器现在按 `phase/status/finishPhase` 归类样本；`reason=mutation` 且 `coverage=transition` 的 ordinary airborne/anchored idle 样本仍进入 normal 控件检查。观察完整性和动作成功分开记录：刷新 ready 输入有完整 receipt/handler 观测却没有应有 launch 时为 `FAIL`，缺 receipt 或 handler 观测为 `NOT_RUN`。反例均通过正式 `buildOrdinaryChecks` 与 `summarizeOrdinary` 构造，而非单独测试布尔函数。

本轮反例输出：mutation idle visible=`FAIL`；完整观测无起跳=`FAIL`；缺少必要观测=`NOT_RUN`；终局观测无效=`NOT_RUN / target-checkpoint-observation-invalid`；产品 FAIL 后工具异常仍=`FAIL`。两个视口 BONUS、真实切后台、BFCache 和存储故障注入继续未覆盖/`NOT_RUN`。刷新后实际游玩图片沿用两份 v2.2 原图，未重新截图。

## B01-BONUS-01 · 1100×720 首关自然 BONUS（本轮）

本轮基线为 `f3cc348e8502582f2e1cebee75baa20500fa7c54`，只验证 1100×720 BONUS。源码确认首关窄 BONUS gate 为 `game/prototype-a/src/game-levels.ts:134-141` 的 `star-cache`（x=3000,y=438）；`game-core.ts:1555-1564` 负责窄窗口选择，`1583-1592` 负责合法结算并调用 `enterBonus`，`1612-1640` 切换到 bonus 并发出 bonus 事件。普通成功路线命中 `jade-two` y=200，因此不能代替 BONUS 路径。

真实 SliceSimulation seed 31 的可见状态诊断找到过 BONUS 候选，但转换后的正式浏览器节奏在普通关约 9.19 秒因 `fall` 失败，未执行 BONUS 检查点。正式记录 `r2-bonus-1100-formal-v01-final.json` 分类为 `NOT_RUN / ordinary-terminal-failed-before-target`；console/pageerror 为空。根据停止条件未执行独立 QA，未把未进入 BONUS 记为产品 FAIL。首次脚本计时偏差的原始记录 `r2-bonus-1100-formal-v01.json` 也保留。

本轮仅增加 BONUS 输入响应检查与反例：因果证据必须匹配同一 `inputId`；自动 cut 或缺 receipt/handler 不得冒充 BONUS 输入响应。验收脚本版本为 `B01-R2-acceptance-v2.4`。390×844 BONUS、切后台、BFCache、存储故障注入继续 `NOT_RUN`。

## B01-BONUS-01 补交：白柱对齐与汇总修复

基于 `ee991e08dce20ec88be9bb72c4f2f021f208c007`，本轮没有新的浏览器运行。三次历史尝试由 `r2-bonus-attempt-ledger-v01.json` 完整保留：初次计时起点含 ready 截图；corrected 将起点移到截图后；final 使用离线候选比较得到的统一 +75ms 偏移。三次均未到 BONUS，未删除或重命名为成功。

新增 `r2-bonus-diagnostic-seed31-v01.ts/json` 保存默认 seed 31、level 1 的实际 SliceSimulation 合法动作轨迹。该诊断轨迹以 ready/anchored、可见中线高度和 BONUS 窄入口高度触发 flip，实际得到 `phase=bonus,status=won,finishSelection=bonus`；不使用调试入口或状态注入。

`r2-bonus-white-column-alignment-v01.json` 将候选与 final 浏览器输入 10–14 并排：最早必要差异在输入 10 的 pre-input 阶段已出现；候选输入 12 仍 anchored 并 launch，浏览器输入 12 已 airborne 并 flip。浏览器输入 13 的 `y=-57.81899387273773, vy=-940` 向前 10 个 120Hz 步到达记录的 fall 位置。该证据没有把差异归因于截图、hit-stop 或物理缺陷；输入 1–13 未安装 causal probe，前置 handler 边界仍未观测。

BONUS 汇总现在要求响应分项参与最终 `result/rawOutcome/allAssertionsPass`，并删除跨 inputId 的 causal `at(-1)` 兜底。离线反例完整经过记录选择、响应检查和汇总链路，结果见 `r2-bonus-recheck-v01.json`：缺 handler=`NOT_RUN`、上一 inputId 记录不能用于当前输入=`NOT_RUN`、产品 FAIL 后工具异常=`FAIL`、自动 cut=`FAIL`。本轮未重新执行自然 BONUS，独立 QA 保持 `NOT_RUN`。

## B01-BONUS 白柱段可见策略验证

基线 `a48e6ae527798a4121f7b558e99e55928e1c4c2b`。本轮只执行一次 1100×720 局部浏览器验证，运行到白柱段后停止，没有继续完整 BONUS、没有独立 QA。

预先声明的玩家策略是：画面中看到刀具回落到可操作中线才点击；接近白柱后等待；只有看到刀具与白柱接触并停住，才点击一次释放；释放后看到刀具已离开白柱并沿上升弧线运动时等待，不追加额外 flip。内部 `status/y/vy` 仅被动记录，未用于决定输入。

本次局部运行在计划第 11 次输入前仍为普通关 airborne，没有可见锚定停住信号；截图显示释放后刀具仍在画面上方空中。因此本次不能证明“锚定后的 launch 不被误执行成上升期间 flip”，分类保持 `NOT_RUN`，没有继续输入或平移时间表。原生 receipt、inputId causal 记录和三张关键截图已保存。

诊断 JSON 中的 `inputStep` 是 60Hz 诊断循环编号；正式运行的浏览器计时是独立的 wall-clock 计划，不能把 inputStep 直接当 120Hz 物理步或毫秒时间。输入 10 的差异表述改为“输入 10 时已经观察到差异”，没有宣称整局首次分歧。

## B01-BONUS 白柱策略执行修正 v02

v01 复核说明见 `r2-bonus-white-column-v01-review.json`：planNotes 没有参与输入决策；第 9、10 项虽写 WAIT，固定循环仍发送点击；第 10 次点击前记录为 white-column anchored、零速度，点击后 launch，第 11 次为 airborne→flip；v01 没有释放前截图，因此不能判断当时锚定信号是否可见。v01 保持 NOT_RUN，不归因于游戏缺少提示。

v02 使用交互式浏览器上下文：固定时间表只负责前置回放到观察段，随后暂停并由操作者查看当前画面，显式发送 WAIT 或一次 RELEASE。两次连续截图显示刀具与白柱保持接触、姿态稳定后才 RELEASE；释放后只观察，不自动追加 flip。v02 记录一次可见锚定确认和一次合法释放，局部执行方法目标 PASS；没有执行完整 BONUS 或独立 QA。

## B01-BONUS 白柱视觉验证最后补证 v03

基线为 `a1d4f924ad55c1fb1af80fc9b22173050561aad3`。v03 只修改并运行独立的局部取证脚本，游戏源码、物理、关卡、存储和 BONUS 判定均未修改。前置固定节奏仅标为回放；操作端输出策略已隔离：停止前 stdout 只包含截图路径和命令提示，不输出 `status`、`anchorId`、坐标、速度、事件或 pointer receipt。隐藏状态和回执只在停止后写入 `r2-bonus-white-column-interactive-v03.json`。

本次 fresh context 为 `902f4374-fb9b-473d-b99c-c472354932ac`（实际 run/context 见 `r2-bonus-white-column-interactive-v03.json`），viewport `1100x720`，脚本 hash `331f9f260da5e18868f2c53b2a8ad757ffd6abc484640e079d0bad936cb26453`，浏览器主文档响应与构建 hash 均为 `8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d`。前置回放完成并保存 `ready.png` 与 `observation-01-after-prefix.png`；操作者在观察首图期间超过预先声明的 700ms 上限，尚未输入 WAIT，因此按停止规则终止，未发送 RELEASE，也没有伪造视觉决策。该运行分类为 `NOT_RUN`，不是产品 FAIL。

因此本轮证明了信息隔离方法，但没有新增可见锚定两帧、合法释放或释放后画面证据。v02 的 WAIT/单次释放/不追加 flip 仍保留为已接受的动作证据；“纯画面决定”在 v02 中仍有历史 caveat，v03 尚未完成该证明。390x844、完整 BONUS、独立 QA、切后台、BFCache、存储故障注入及 asset-manifest 基线失败保持原状。
