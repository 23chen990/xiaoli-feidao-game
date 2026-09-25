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
