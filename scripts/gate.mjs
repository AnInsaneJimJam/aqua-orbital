const action = process.argv[2];
const reasons={lint:'A dedicated lint configuration is not implemented. Use pnpm typecheck for the available static checks.','test:invariants':'The required invariant campaign is not implemented. No zero-test run is counted as a pass.'};
console.error(`${action}: ${reasons[action]??'Unavailable until protocol gates and deployment verification are complete. No transaction submitted.'} See PROGRESS.md.`);
process.exitCode = 1;
