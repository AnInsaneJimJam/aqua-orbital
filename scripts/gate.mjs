const action = process.argv[2];
const reasons={lint:'A dedicated lint configuration is not implemented. Use pnpm typecheck for the available static checks.','test:invariants':'The full invariant release matrix has not passed. A bounded frozen interior campaign is reproducible with python test/evidence/interior-stateful/run.py ci; see test/evidence/interior-stateful.md and docs/TESTS.md for its scope and remaining requirements.'};
console.error(`${action}: ${reasons[action]??'Unavailable until protocol gates and deployment verification are complete. No transaction submitted.'} See docs/TESTS.md.`);
process.exitCode = 1;
