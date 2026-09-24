# 参考型小游戏工厂优化：以“小李飞刀”为校准样本

目标游戏是 `mobile-slice-adaptation-20260830`，唯一目标工作区是
`/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/workspace/prototype-a`。
本轮修改共享工厂，并向该 run 写入诊断与证据副本；没有修改生成游戏的源码或构建。

结构化投诉记录：
`runs/mobile-slice-adaptation-20260830/artifacts/factory-quality-regression-triage-20260908.json`。
对象 × 状态分支 × 呈现路径 × 视口矩阵：
`runs/mobile-slice-adaptation-20260830/artifacts/factory-quality-regression-reproduction-matrix-20260908.json`。

针对“完整录屏仍无法还原第一关”的追加记录：
`runs/mobile-slice-adaptation-20260830/artifacts/factory-recording-level-fidelity-triage-20260908.json`；修复前矩阵位于
`runs/mobile-slice-adaptation-20260830/artifacts/factory-recording-level-fidelity-reproduction-matrix-20260908.json`。

## 为什么有完整竞品资料仍会做差

旧流程在几个关键位置把“流程执行过”误当成“产品体验已经成立”。

| 漏洞 | 旧流程能证明什么 | 它没有证明什么 | 在小李飞刀上的结果 |
|---|---|---|---|
| 只登记参考文件和 SHA | 文件身份存在 | Agent 是否理解了输入、状态、空间、失败、反馈和重玩 | 文档里写了首关低压教学，成品首关仍放入致命危险和密集对象 |
| 产品体验契约以泛化文字为主 | 有目标描述 | 哪个对象、哪个状态分支、哪个视口、什么顺序必须发生 | “像竞品”在交接中退化成对象数量和 HUD 文案 |
| Builder 过早做完整内容 | 项目看起来内容较多 | 最短核心循环是否好玩、清楚、可预测 | 首屏同时出现大墙、危险物、倍率、教程、重玩和多种对象 |
| 感知 QA 使用单一桌面页、任意控件点击和文本变化 | 页面能启动、某些文字会变化 | 玩家是否看得清、反馈是否因果相连、移动端是否可玩 | `finish-approach` 与 `finish-settlement` 是同一张失败画面也能留下“终点”标签 |
| 确定性采集器可以给出通过结果 | 自动化脚本执行完成 | 独立的人是否认可画面与手感 | 失败终局被当成默认旅程完成，replay 仍为 `null` |

当前 390×844 首屏中，刀被大型白色结构遮挡，进行中持续显示“重玩”和屏幕边缘倍率按钮。自然路径在切割四个对象后以“碰到危险物”终止；桌面路径以“跌出路线”终止。两条记录都没有证明成功终点和重玩恢复。参考关卡表则把 1–5 关定义为单目标、无危险、高成功率的教学段。因此这里的首要问题是体验拓扑和验收失真，后续才是美术精修。

## 新的不可绕过流程

1. **证据进入所属 run。** `evidence:ingest` 复制原文件、记录 SHA-256，并为 DOCX/文本生成分析侧车。证据需标记 `gameplay-reference`、`design-document`、`platform-qa`、`package-identity` 或 `other`。只有前两类可以生成玩法契约。
2. **ResearchAgent 生成五维行为分析。** 每条检查必须引用 evidence pack 中已有的路径、哈希与精确定位，并声明对象类型、生命周期/状态分支、正常玩家输入、预期状态变化、空间因果、反馈锚点、事件顺序和视口。输入/状态、空间关系、失败/恢复、反馈顺序、终点/重玩缺一项即阻塞。
3. **产品体验契约绑定真实产品。** v2 契约绑定 target game、run、workspace、runtime、运行入口、来源契约哈希；每个功能还绑定来源检查 ID、自然触发、负向断言和所需视口。
4. **Builder 只做一个黄金核心切片。** 首次交接包含产品体验契约与参考保真契约。关卡扩展、进度系统、广告和非必要 HUD 在核心切片通过前不进入 Builder 上下文。
5. **QA 分成两条独立轨道。** 工程轨验证状态、碰撞、物理和重放确定性；玩家体验轨从新浏览器开始，只用正常输入，逐一覆盖功能 × 视口 × 对象/分支，并检查实际像素、因果反馈、失败归因和恢复。
6. **采集器不能自我验收。** Playwright 采集可以生成截图和轨迹，但其审核结果保持 BLOCKED。只有独立 QAAgent 或 HumanReviewer 可以提交与契约哈希、构建哈希一致的感知报告。
7. **真人先接受核心切片。** 参考保真与感知矩阵通过后，run 停在 `WAITING_FOR_HUMAN_PLAYTEST`。真人只判断这一个短流程是否符合预期；通过后才允许扩关和 UI 扩展。
8. **失败回到最早责任点。** 来源缺失回研究，行为关系错误回产品契约，明确实现错误进入 Builder/Fixer。核心循环、状态机、多模块和重复失败保留 QA → Fixer → QA 及五次上限。

## 已落地的录屏级还原链

旧流程把录屏当作一个文件引用，无法约束关卡的摆放与时序。现在已增加一条贯穿 Research → Builder → QA → Fix 的强制链：

1. 已核验的 gameplay-reference 录屏先通过 AVFoundation 确定性抽帧，输出真实请求/实际时间戳、源尺寸、逐帧 SHA-256 和 4×4 联系表；目标 run、游戏、工作区或录屏哈希不一致即阻塞。
2. ResearchAgent 必须根据联系表和事件邻帧提交 Zod 校验的 `reference-level-reconstruction.json`。对象、生命周期、检查点、输入、反馈、关系、镜头、终态与重玩不完整，或仍有未知项时，Builder 不会启动。
3. 工厂派生 `reference-level-implementation-contract.json`。它保留玩法因果与粗粒度空间拓扑，同时剔除源录屏原始坐标、第三方资产、名称/文案、UI 表达、音频和原始调参值。
4. Builder 必须逐项接线，并只暴露 `getSnapshot` 与 `getNaturalInputTarget` 两个只读运行时方法。探针不能推进、复位或修改游戏。
5. 独立 QA 从 fresh browser 开始，用真实鼠标/触控输入运行声明动作，生成绑定契约哈希与 build hash 的运行轨迹。比较门逐项检查对象/生命周期、检查点可见内容、粗粒度摆放、空间关系、动作目的检查点、镜头、终态归因、结算与重玩。
6. 比较失败会写入正式 QA issue。`replica-preview` 和完整流水线都会进入 Fixer → QA 复测，并保留最多五次自动修复上限；Fixer 不能削弱契约、容差或探针定义。

用“小李飞刀”唯一核验录屏进行的真实校准结果为：源文件 36.492 秒、1100×720、SHA-256 `3781e4dcd3d21094f186cf442b3ee30cddfbb2fbe68d87c5c7470a2c742bf75a`；8 FPS 共请求并提取 292 帧，生成 19 张联系表。派生目录共 311 个文件、约 31.45 MiB。重复执行会先重新核验所有文件哈希并返回复用结果，不重复生成。标准清单位于 `runs/mobile-slice-adaptation-20260830/artifacts/reference-frame-manifest.json`。

修复后验证矩阵位于 `runs/mobile-slice-adaptation-20260830/artifacts/factory-recording-level-fidelity-verification-matrix-20260908.json`。其中录屏提取、重建契约、Builder 交接和独立 QA/Fix 闭环均为 PASS；历史游戏在 390×844 与 430×932 两个产品视口保持 BLOCKED，直到它在标准新 run 中完成重建与独立验收。

这条门禁约束通用玩法、关卡因果和空间拓扑，不复制第三方代码、素材、名称、文案、UI 表达或具体数值。它也不替代独立感知 QA 和真人试玩：机器比较通过但画面不清楚、反馈不自然或操作手感差，仍然不能完成 run。

## 历史 run 迁移审计

共享工厂新增 `pnpm factory audit-reference <run-id> [--workspace <absolute-path>]`。它只读取游戏工作区，并把 Zod 校验后的结果写到所属 run 的 `artifacts/reference-quality-audit.json`。审计同时检查：

- `gameplay-reference` 与 `design-document` 证据是否属于当前游戏/工作区、是否保有 run 内副本、实际字节是否匹配 SHA-256；
- `state.json`、`input/seed.yaml`、`pipeline-plan.json` 是否组成可恢复的标准控制面；
- `permission-manifest.json` 是否包含全部当前 stage，并允许 `REFERENCE_DEEP_RESEARCH` 读取 `reference-evidence/`；
- 五维行为分析、参考保真契约、产品体验契约、独立参考/感知 QA 和 `CORE_DEMO` 是否按当前阶段存在且互相绑定。

对“小李飞刀”的实际审计结果是 `REQUIRES_NEW_RUN_MIGRATION`：5 份玩法/设计证据全部通过目标、run 内副本和哈希校验；但历史目录没有 `state.json`、`input/seed.yaml`、`artifacts/pipeline-plan.json` 和权限清单，所以不能安全调用 `resume`，也不能在原目录补造这些冻结输入。报告位于 `runs/mobile-slice-adaptation-20260830/artifacts/reference-quality-audit.json`。后续应从经校验的 `reference_reskin` seed 创建标准新 run，再把这 5 份已核验来源重新摄入并绑定到新 run 的 `workspace/game`。

新证据摄入默认绑定标准 `workspace/game`，修复了此前默认落到 `workspace/prototype-a`、随后被 ResearchAgent 判为工作区不匹配的问题。历史项目仍可通过 `--workspace` 显式指定旧工作区，不会被静默改绑。

## 小李飞刀下一轮的最小验收面

| 体验 | 当前实际 | 最早偏差 | 修复责任 | 必需复测 |
|---|---|---|---|---|
| 首关启动 | 刀被墙遮挡，中央动作区域被多层信息挤压 | 关卡/呈现契约 | Formal Fixer | 390×844、430×932、1100×720 的 fresh ready 截图 |
| 首关教学压力 | 四次切割后碰到危险物 | 关卡拓扑 | Formal Fixer | 首关单目标、无致命危险、高成功率的自然输入轨迹 |
| 切割反馈 | 有分数变化，但完整接触→切开→掉落→局部奖励链未被同对象证明 | 行为契约与呈现 | Formal Fixer + QA | 同一对象 ID 的连续画面、事件顺序和世界内奖励 |
| 终点倍率 | 屏幕右边常驻倍率按钮，与世界终点脱离 | 产品/呈现契约 | Formal Fixer | 可到达的世界内倍率区，接触结果先于结算 |
| 失败与重玩 | 有失败文案，replay 未观察到；进行中已出现重玩按钮 | 状态/界面契约 | Formal Fixer + QA | 终局后才显示重玩，轻触后回到 fresh ready |

这一轮工厂修改不会让历史游戏自动变好，也不构成该游戏的 FIX 完成。该工作区已有重复修复历史，且问题覆盖核心循环、关卡拓扑、呈现和多个视口，所以游戏修改必须继续走 formal-fixer。完成标准是上表每一项都有同一构建哈希下的自然输入与独立感知证据，而不是“测试绿了”或“能走到某个终局”。

## 工厂验收边界

`pnpm factory eval` 仍用于路由与控制面回归；它不能证明生成游戏好玩。产品质量由 reference fidelity gate、perceptual QA gate 和真人核心试玩三道门共同决定。任一对象/状态/视口未观察、任何感知项 BLOCKED、或默认路径仍包含旧体验，run 都不能报告完成。
