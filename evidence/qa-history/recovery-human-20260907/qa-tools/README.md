# 独立 QA 采集工具（准备阶段）

目标游戏：`mobile-slice-adaptation-20260830`。
唯一游戏工作区：`/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/workspace/prototype-a`。
本次只准备工具，没有启动游戏、浏览器或服务器，没有读取修复中的源码快照，也没有修改游戏。

等待根任务发送完成构建的 `dist/index.html` SHA-256 与新输出目录，然后才执行：

```sh
node record.mjs --outputDirectory ABSOLUTE_NEW_DIRECTORY --expectedBuildSha256 EXACT_SHA256 --viewport portrait --cadenceMs 800 --activeMs 45000
pnpm exec tsx generate-reports.ts ABSOLUTE_CAPTURE_DIRECTORY
pnpm exec tsx generate-reports.ts ABSOLUTE_CAPTURE_DIRECTORY REVIEWED_MATRIX_JSON
```

实际调用时使用这两个脚本的完整路径。输出目录必须是本轮 `recovery-human-20260907` 内一个尚不存在的目录，不能放在 `qa-tools` 内。默认原始报告写入 `reports`，人工像素审阅后的报告写入独立 `reports-reviewed`；两者均拒绝覆盖。

每个视口最多三次预先声明的输入策略，具体执行范围服从后续根任务派发。手机为 390×844（touch），桌面为 1100×720（mouse）；推荐每组先 800ms，再 650ms、950ms，策略必须在该次开始前确定。单次主动输入默认 45 秒，之后保留 30 秒结算观察时间。不根据 `getState`、目标坐标、碰撞距离或内部事件决定点击。

输入按绝对时钟计划独立运行。观察、图片和视频不在点击循环中 `await`；记录每次计划、实际发出和完成时间，错过整个间隔时跳过该次，不追赶连点。实际输入仍可能受到浏览器协议/渲染负载影响，报告实际偏差，不声称精确人类节奏。视频使用 Playwright 全程录制；最初 2.4 秒另外使用 Chromium 原生 screencast 每帧 JPEG，记录浏览器时间与接收时间。后续约每秒截图，并单独保存启动、真实终态、重玩。首切帧间隔超过 100ms 或没有帧时，精确反馈顺序继续 BLOCKED，不能让字段计数替代逐帧审阅。

终态判断必须先看到 `关卡完成` 或明确失败面板，再用只读状态交叉确认 `won/failed`。`收益揭示`、局部收益和始终可见的重玩按钮都不触发重玩。普通输入计划结束后仍持续观察，最多等待额外 30 秒；只在真实终态截图后点击可见重玩按钮。

每次执行前后校验 `dist/index.html` 的派发 SHA，保存 `src`、`dist` 和入口配置的逐文件 SHA。构建变化、捕获异常、自然未到达与产品缺陷分别记录。所有自然操作禁止 debug URL、存储注入、测试 setter、fixture 和内部事件分发。没有显式新任务时不运行工程 fixture。

报告复用 QaReportSchema、NaturalFlowEvidenceSchema、PerceptualQaReportSchema、MatrixSchema、ResultSchema。未传入独立审阅矩阵时，所有感知项默认 BLOCKED；桌面结果不会关闭手机矩阵。原始轨迹、视频和帧必须用 `view_image` 等工具审阅后，才填写精确对象及状态分支的 PASS/FAIL/BLOCKED。参考帧只使用之前已绑定核验录屏的 `qa-recovery-20260907/reference-frames/manifest.json`。

准备验证采用 test-driven-development 技能：终态误判、输入时间表和运行配置边界的三项回归测试先失败，再通过。`policy-test.log` 保存通过结果。准备期只执行这些不访问游戏的纯策略测试、语法检查、TypeScript 检查和 `--help`。
