# B01-R2 修订说明

目标游戏：`Slice Master / 小李飞刀`  
目标工作区：`game/prototype-a`  
分支：`codex/b01-runtime-flow`  
被测源码：`de6f11d2231398f6c655abbddd40c548d1524126`  
被测构建 SHA-256：`8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d`

## R1 结果如何映射到 R2

R1 的原始报告和截图保留不变。R1 的 ordinary 轨迹在 `phase=ordinary,status=won` 之前进入 `status=failed,failReason=fall`，因此 R2 将其保留为“目标检查点未达到 / `NOT_RUN`”；它不是已经达到结算检查点后违反产品断言的 `FAIL`。R1 的两个 BONUS 轨迹都没有观察到自然 `phase=bonus`，同样保持 `NOT_RUN`。只有浏览器启动、页面异常或证据工具故障才映射为 `BLOCKED`。

R2 的机器化分类规则写在 `qa-natural-r2.mjs` 和 `r2-browser-report.json`：

- 目标检查点未达到：`NOT_RUN`；同时保留有效的负向观测和失败阶段。
- 目标检查点达到后，blank/next/reload 或 BONUS 进入后输入响应断言失败：`FAIL`。
- 浏览器或工具无法提供检查点证据：`BLOCKED`。
- 单局输入轨迹失败本身不升级为产品 `FAIL`。

## 本轮脚本修正

`qa-natural-r2.mjs` 补齐了以下检查：

- ordinary 目标必须同时满足 `phase=ordinary`、`status=won`、`finishPhase=terminal`；结算前检查终局操作仍隐藏。
- 结算后点击空白必须保持状态不变；然后点击“下一关”，确认第二关 `ready`。
- 刷新后确认第二关仍为 `ready`，再发送预先冻结的可见画布输入，记录 `pointerdown/pointerup` receipt 和短窗口状态/事件响应。
- BONUS 进入后再发送正常输入，要求仍处于 `phase=bonus` 并有可观测响应；只看到标签、配置或 phase 字段不算通过。
- 每个结果都记录 `rawOutcome`、`classification`、`validObservation`、`failureStage`、`requiredCheckpoint`、输入轨迹和 console/pageerror；错误另存于 `r2-natural-console-errors.json`。

正式自然脚本没有在本轮执行，因为诊断阶段没有找到可见的普通通关策略。脚本已具备正式执行入口，但不会把重复失败的诊断轨迹升级成 PASS。

## 失败轨迹与最小对照

从 R1 首次 failed 之前的固定输入前缀重跑两个全新 `1100×720` context：同一构建、同一视口、同一坐标和同一输入计划，只改变是否在输入间截取截图。每次输入记录计划/发送/按下/释放时间、浏览器 `pointerdown/pointerup` receipt、输入前后 phase/status、`vx/vy`、姿态和事件尾部。两种模式均收到全部 10 次输入，未调用调试入口、状态注入或模拟 step。

重跑时间为 `2026-09-25T11:02:04.850Z`，完整报告为 `r2-ordinary-capture-compare.json`。截图模式在第 10 次输入后进入 `failed/spike`，无截图模式第 10 次输入后仍为 `anchored`；第 4 次输入时轨迹位置差为约 `41.91`，速度差为 `0`，事件计数未出现首个事件流分歧。这个结果支持“截图等待可能改变 wall-clock 输入节奏”作为待检验假设，但没有证明截图是根因，也没有证明源码存在缺陷。

R1 terminal 的边界观测保留为 `y≈-127.6`，满足源码中的上方掉落条件 `y + 17 < -110`；终局后速度归零并产生 `fall` 事件。它解释了已观测的失败条件，但没有解释截图模式与无截图模式的因果关系。

## 当前结论与剩余观测

- R2 新增 6 次 bounded diagnosis（2 次取证模式对照 + 4 次固定节奏探索），成功到达 ordinary won：0。
- ordinary `1100×720`、BONUS `390×844`、BONUS `1100×720` 的正式自然检查点仍为 `NOT_RUN`。
- 独立 QA 已完成脚本和证据审查；由于没有找到可见通关策略，独立浏览器复现尚未启动，记录为 `NOT_RUN`。
- 已排除：本轮对照不是因未收到鼠标事件；receipt、发送时间和状态轨迹均已记录；当前没有 console/pageerror 证据；没有源代码改动。
- 尚未确定：截图等待是否通过 wall-clock 漂移改变了物理轨迹；需要 timing-normalized 的后续对照或可见稳定操作策略才能继续自然验收。

R1 文件、历史 browser report、回归日志和历史截图均保留；本轮新增文件仅追加在 `evidence/b01-runtime-flow/`，没有覆盖成“全绿”。真实切后台、真实 BFCache、浏览器存储故障注入仍按未覆盖处理。
