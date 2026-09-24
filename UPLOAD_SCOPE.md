# 上传范围说明

本仓库由 `mobile-slice-adaptation-20260830` 的小李飞刀目标工作区和
`slice-master-research-20260830` 研究 run 组成。

包含：

- `game/prototype-a/`：web-lite 源码、测试、脚本、构建产物和 TapTap 适配源配置。
- `research/`：黑盒研究脚本、截图、录屏和研究 QA 报告。
- `evidence/artifacts/`：结构化研究、竞品契约、修复和质量报告。
- `evidence/final-repair/`：2026-09-23 最终修复周期及独立 QA 证据。
- `evidence/platform-*`：TapTap 各项构建、设备 QA 和阻塞记录。
- `reference/`：绑定到目标 run 的参考证据及 provenance manifest；这些文件是证据，不是游戏资产。

为了保持仓库可克隆且不混入机器缓存，未上传 `node_modules`、Cocos `library/`、
Playwright trace zip、历史 QA 视频副本和临时缓存。结构化报告仍保留；最终修复的可审查截图也保留。

TapTap 包只代表已经生成的包体快照。仓库中的 QA 报告明确记录了后台扫码、精确 SHA 真机复测
尚未完成，因此不能把它当作已发布包。
