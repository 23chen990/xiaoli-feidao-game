## B01 scope

本 PR 实现“正常玩家流程与运行稳定性”，目标游戏为 `Slice Master / 小李飞刀`，只修改 `game/prototype-a` 和 `evidence/b01-runtime-flow/`。本轮继续在 `codex/b01-runtime-flow` 执行负责人批准的 B01-R1，不合并、不启动 B02。

### Changes

- 奖励入口只由 authored level definition 的 `bonusAvailable` 决定，移除 seed 奇偶隐式开关。
- 终局场景翻转不再自动重开；失败/普通完成使用显式“重试本关”，可用时显示“下一关”，空白点击不会重置。
- 增加生命周期协调器：visibility、blur、persisted pagehide/pageshow、Continue、输入释放、wall time reset 和真实卸载清理。
- 进度存储增加安全访问、损坏数据恢复、按 storage 隔离的 session fallback、写入失败保留最新解锁和非阻塞告警。
- R1 只追加自然流程验收脚本、报告、截图、日志、manifest、triage 和 reproduction matrix；源码没有新增修改。

### Validation

- `pnpm exec tsx --test tests/runtime-flow.test.ts`: PASS, 11/11
- `pnpm typecheck`: PASS
- `pnpm lint`: PASS
- `pnpm build`: PASS
- `pnpm test`: 212 pass, 1 fail；当前与 base SHA 的同环境基线都保留既有 `ASSET-MANIFEST-001` 缺失 `artifacts/asset-manifest.json`。未删除、跳过或弱化测试。
- R1 regression: no regression; `evidence/b01-runtime-flow/r1-regression.json`

### B01-R1 natural evidence

Formal schedules were frozen before execution, then run from fresh browser contexts with visible canvas mouse/touch input only. No `selectLevel`, `debugPlacePlayer`, `debugEnterFinishGate`, `enterBonusChallenge`, simulated `step`, storage mutation, or state-driven input was used. Diagnostic traces are separated from formal evidence.

- A `1100x720` ordinary completion → blank tap → next level → reload: 6 bounded explorations, 0 successes. The formal attempt ended `phase=ordinary,status=failed,failReason=fall` before the required `phase=ordinary,status=won` checkpoint. Result `NOT_RUN`; no next/reload PASS was claimed.
- B `390x844` natural BONUS: 1 formal attempt ended ordinary `failed` before `phase=bonus`; result `NOT_RUN`.
- B `1100x720` natural BONUS: 1 formal attempt ended ordinary `airborne` without `phase=bonus`; result `NOT_RUN`.
- Independent QA reproduced the bounded ordinary path in two new `1100x720` contexts; neither reached the target won checkpoint. The independent report records missing persisted console/pageerror files as an evidence limitation.
- BONUS label/configuration/debug observations are not counted as natural entry. No post-entry reward responsiveness was claimed.
- True OS backgrounding, real BFCache navigation, and browser storage fault injection remain uncovered.

R1 aggregate: `evidence/b01-runtime-flow/r1-browser-report.json`
R1 exploration: `evidence/b01-runtime-flow/r1-exploration-log.json`
R1 independent QA: `evidence/b01-runtime-flow/r1-independent-review.json`

### Historical evidence

The previous `evidence/b01-runtime-flow/browser-report.json` results are preserved and linked as history. Its portrait ordinary win → next → reload PASS and failure/retry results are not promoted to desktop or BONUS claims.

### Commits

- Tested source: `de6f11d2231398f6c655abbddd40c548d1524126`
- R1 evidence commit: `c43e96f`
- Base: `b7e4b4b2ea7cab16c2dd27a91126fc29cde3c2ee`
- Build SHA-256: `8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d`

Evidence manifest and triage are in `evidence/b01-runtime-flow/manifest.json`, `triage.json`, and `reproduction-matrix.json`.

This remains an intentionally Draft PR for owner review. Do not merge; B02 is not started.
