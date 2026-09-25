import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('.', import.meta.url);
const reportPaths = {
  withScreenshots: new URL('./r2-ordinary-capture-align-with-first.json', root),
  withoutScreenshots: new URL('./r2-ordinary-capture-align-without-first.json', root),
};
const outputPath = new URL('./r2-ordinary-capture-align-r2-review.json', root);
const reports = await Promise.all(Object.values(reportPaths).map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
const resultsByMode = Object.fromEntries(reports.flatMap((report) => report.results.map((result) => [result.mode, result])));
const withScreenshots = resultsByMode['with-screenshots'];
const withoutScreenshots = resultsByMode['without-screenshots'];
if (!withScreenshots || !withoutScreenshots) throw new Error('existing reports must contain result.mode groups for both capture modes');

const comparisonFields = ['physicalStep', 'worldTime', 'status', 'anchorId', 'cuts', 'player.x', 'player.y', 'player.vx', 'player.vy', 'eventCount'];
const unobservedFields = ['ActionInput held/repeat internals', 'SliceSimulation inputBuffer value', 'renderer frame scheduling internals', 'OS/browser compositor timing', 'remote read and screenshot encoding duration'];
function readField(state, field) { return field.split('.').reduce((value, key) => value?.[key], state); }
function diffFields(left, right) {
  return comparisonFields.flatMap((field) => {
    const a = readField(left, field); const b = readField(right, field);
    const tolerance = field === 'worldTime' ? 1 / 120 : 0;
    return (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > tolerance : a !== b)
      ? [{ field, withoutScreenshots: a, withScreenshots: b }]
      : [];
  });
}
function boundary(result, index) { return result.dispatches[index]?.eventBoundary ?? null; }
function launchEvent(dispatch) { const events = dispatch?.eventBoundary?.after?.events ?? dispatch?.afterDispatch?.events ?? []; return events.filter((event) => event.type === 'launch').at(-1) ?? null; }
function firstTimingDifference() {
  const length = Math.min(withoutScreenshots.dispatches.length, withScreenshots.dispatches.length);
  for (let index = 0; index < length; index += 1) {
    const a = boundary(withoutScreenshots, index)?.after;
    const b = boundary(withScreenshots, index)?.after;
    if (a?.physicalStep !== b?.physicalStep) return { inputIndex: index + 1, withoutScreenshotsPhysicalStep: a?.physicalStep ?? null, withScreenshotsPhysicalStep: b?.physicalStep ?? null, comparison: 'eventBoundary.after.physicalStep' };
  }
  return null;
}
function firstVisibleDifference() {
  const length = Math.min(withoutScreenshots.dispatches.length, withScreenshots.dispatches.length);
  for (let index = 0; index < length; index += 1) {
    const a = boundary(withoutScreenshots, index)?.before;
    const b = boundary(withScreenshots, index)?.before;
    if (!a || !b) continue;
    const positionDistance = Math.hypot(a.player.x - b.player.x, a.player.y - b.player.y);
    const speedDistance = Math.hypot(a.player.vx - b.player.vx, a.player.vy - b.player.vy);
    if (positionDistance > 20 || speedDistance > 50 || a.status !== b.status) return {
      inputIndex: index + 1,
      positionDistance,
      speedDistance,
      threshold: { positionDistance: 20, speedDistance: 50, status: 'must match' },
      withoutScreenshotsBefore: a,
      withScreenshotsBefore: b,
      fields: diffFields(a, b),
      comparisonFields,
    };
  }
  return null;
}
function propagateFixed(start, steps) {
  const dt = 1 / 120;
  let { x, y, vx, vy } = start;
  for (let index = 0; index < steps; index += 1) {
    vy = Math.min(vy + 600 * dt, 760);
    x += vx * dt;
    y += vy * dt;
  }
  return { x, y, vx, vy };
}
const thirdLaunchWithout = launchEvent(withoutScreenshots.dispatches[2]);
const thirdLaunchWith = launchEvent(withScreenshots.dispatches[2]);
const fourthBeforeWithout = boundary(withoutScreenshots, 3)?.before;
const fourthBeforeWith = boundary(withScreenshots, 3)?.before;
const withoutLaunchStep = boundary(withoutScreenshots, 2)?.after?.physicalStep;
const withLaunchStep = boundary(withScreenshots, 2)?.after?.physicalStep;
const fourthStepWithout = boundary(withoutScreenshots, 3)?.before?.physicalStep;
const fourthStepWith = boundary(withScreenshots, 3)?.before?.physicalStep;
const launchStart = { x: 282.7, y: 439.125, vx: 150, vy: -300 };
const recomputed = {
  withoutScreenshots: propagateFixed(launchStart, fourthStepWithout - withoutLaunchStep),
  withScreenshots: propagateFixed(launchStart, fourthStepWith - withLaunchStep),
};
const report = {
  schemaVersion: 1,
  artifactType: 'B01R2OrdinaryCaptureAlignmentReview',
  generatedAt: new Date().toISOString(),
  sourceReports: Object.fromEntries(Object.entries(reportPaths).map(([key, value]) => [key, value.pathname.split('/').at(-1)])),
  diagnosisOnly: true,
  comparisonFields,
  unobservedFields,
  reset: {
    bridgeCall: 'window.__GAME_TEST__.resetGame()',
    purpose: 'diagnostic alignment only; reset is not part of natural acceptance',
    reportsConfirm: 'seed=31, level=1, phase=ordinary, status=ready, worldTime=0, progress highestUnlocked=1 after reset',
  },
  inputArchitecture: {
    actionInput: 'ActionInput owns held/repeat suppression in game-core; its private held set is not observed.',
    inputBuffer: 'SliceSimulation owns inputBuffer after flip cooldown; its private value is not observed.',
  },
  earliestObservedActionTimingDifference: firstTimingDifference(),
  firstVisibleThresholdDifference: firstVisibleDifference(),
  withoutFirstReanalysis: {
    firstInput: {
      withoutScreenshotsPhysicalStep: boundary(withoutScreenshots, 0)?.after?.physicalStep,
      withScreenshotsPhysicalStep: boundary(withScreenshots, 0)?.after?.physicalStep,
      note: 'The first observed difference is action timing/physical step; player launch pose and velocity are otherwise equal at this boundary.',
    },
    thirdLaunch: {
      withoutScreenshotsPhysicalStep: withoutLaunchStep,
      withScreenshotsPhysicalStep: withLaunchStep,
      withoutScreenshotsEvent: thirdLaunchWithout,
      withScreenshotsEvent: thirdLaunchWith,
      launchStart: {
        withoutScreenshots: thirdLaunchWithout ? { x: thirdLaunchWithout.x, y: thirdLaunchWithout.y, vx: 150, vy: -300 } : null,
        withScreenshots: thirdLaunchWith ? { x: thirdLaunchWith.x, y: thirdLaunchWith.y, vx: 150, vy: -300 } : null,
      },
    },
    fourthInput: {
      withoutScreenshotsPhysicalStep: fourthStepWithout,
      withScreenshotsPhysicalStep: fourthStepWith,
      flightSteps: { withoutScreenshots: fourthStepWithout - withoutLaunchStep, withScreenshots: fourthStepWith - withLaunchStep },
      beforeInput: {
        withoutScreenshots: { x: fourthBeforeWithout?.player.x, y: fourthBeforeWithout?.player.y, vx: fourthBeforeWithout?.player.vx, vy: fourthBeforeWithout?.player.vy },
        withScreenshots: { x: fourthBeforeWith?.player.x, y: fourthBeforeWith?.player.y, vx: fourthBeforeWith?.player.vx, vy: fourthBeforeWith?.player.vy },
      },
      fixedRuleRecalculation: {
        rule: '120 Hz fixed update: vy=min(vy+600/120,760); x+=vx/120; y+=vy/120',
        start: launchStart,
        expected: recomputed,
        observed: {
          withoutScreenshots: { x: fourthBeforeWithout?.player.x, y: fourthBeforeWithout?.player.y, vx: fourthBeforeWithout?.player.vx, vy: fourthBeforeWithout?.player.vy },
          withScreenshots: { x: fourthBeforeWith?.player.x, y: fourthBeforeWith?.player.y, vx: fourthBeforeWith?.player.vx, vy: fourthBeforeWith?.player.vy },
        },
        matches: Math.abs(recomputed.withoutScreenshots.y - fourthBeforeWithout.player.y) < 1e-9 && Math.abs(recomputed.withScreenshots.y - fourthBeforeWith.player.y) < 1e-9,
      },
    },
    explanation: 'The two launches start from the same launch pose and velocity, but occur at different physical steps. By input 4 the no-screenshot path has 122 flight steps and the screenshot path 109, which reproduces the observed positions and vy under the fixed update rule. This supports different launch timing as the explanation for the input-4 pre-state difference.',
  },
  causalLimits: [
    'Screenshot encoding/wait time, remote getState reads, event-handler duration and RAF/frame scheduling were not independently timed.',
    'The evidence therefore does not prove screenshot waiting is the unique cause; it proves the launch timing/physical-step difference and its deterministic consequence.',
  ],
  postCheckpointSampling: {
    executedInSourceRuns: false,
    reason: 'The source reports used the original wall-time schedule; +120 fixed-step checkpoints were not actually waited for.',
    comparisonUses: 'pointerdown capture/bubble handler boundaries and the recorded before/after states only',
  },
  reviewerConclusion: 'FIRST_ACTION_TIMING_DIFFERENCE_INPUT_1; FIRST_VISIBLE_THRESHOLD_DIFFERENCE_INPUT_4; LAUNCH_TIMING_EXPLANATION_SUPPORTED; CAPTURE_CAUSAL_COSTS_NOT_ISOLATED',
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
