type Check={command:string;phase:string;exitCode:number;logPath:string};
// Keep every attempt log; the final execution of a full suite supersedes its
// intermediate executions. A targeted test cannot stand in for the full suite.
export function finalChecksPass(checks:Check[]):boolean {
  const full=checks.filter(c=>c.phase==='GREEN'&&/^pnpm (?:run )?test(?:\s|$)/u.test(c.command)).at(-1);
  const lint=checks.filter(c=>c.phase==='LINT').at(-1);
  const typecheck=checks.filter(c=>c.phase==='TYPECHECK').at(-1);
  return [full,lint,typecheck].every(c=>c!==undefined&&c.exitCode===0);
}
