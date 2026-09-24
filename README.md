# 小李飞刀 / Xiao Li Fei Dao

这是“小李飞刀”小游戏的独立归档仓库，包含当前 web-lite 游戏、研究原型、结构化修复与 QA 证据，以及 TapTap 适配材料。

## 当前状态

- 2026-09-23 的首关 runway 尖端碰撞死点已完成 formal Fixer → 独立 QA 闭环。
- 最新自然 QA 覆盖 390×844 portrait 与 1100×720 desktop，观察到启动、切割、恢复、终局和重玩。
- 全关卡自然感知覆盖仍未完成；部分终点奖励/倍率、跨视口和性能门仍阻塞。
- WeChat、Douyin、TapTap 尚未完成独立真机发布验收。
- 研究原型已验证首段玩法，但没有完成三关、终点倍率、奖励关和武器解锁等全部观察。

仓库中的 `evidence/` 报告是当前结论的来源；不要把历史抽样 PASS 解读为整款游戏发布通过。

## 本地运行

```bash
cd game/prototype-a
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

构建完成后，开发预览入口是 `game/prototype-a/dist/index.html`。TapTap 适配说明见
`game/prototype-a/platforms/taptap-minigame/README.md`。

## 目录

- `game/`：游戏源码、测试、web-lite 构建和 TapTap 适配源。
- `research/`：`slice-master-research-20260830` 黑盒研究原型及证据。
- `evidence/artifacts/`：结构化工厂与产品质量报告。
- `evidence/final-repair/`：最新 21 次修复周期和最终自然 QA。
- `evidence/platform-*`：平台构建与阻塞证据。
- `reference/`：绑定到目标 run 的参考证据和 provenance manifest。
- `reports/`：工厂复盘和迁移审计说明。

上传范围和因 GitHub 文件限制排除的机器缓存见 [UPLOAD_SCOPE.md](UPLOAD_SCOPE.md)。
