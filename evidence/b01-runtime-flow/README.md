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
