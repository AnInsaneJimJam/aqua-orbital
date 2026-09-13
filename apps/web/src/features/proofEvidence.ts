/** Curated source, runnable tests and historical records; never live state. */
export const repositoryUrl = 'https://github.com/AnInsaneJimJam/aqua-orbital';
export const repositoryFile = (path: string) => `${repositoryUrl}/blob/main/${path}`;

// The archive below is explicitly Arc Testnet (5042002), including in a local profile.
// Never build an explorer URL from API-provided text or the currently connected wallet.
export const recordedArcExplorer = 'https://testnet.arcscan.app';
export const recordedArcReceipts = [
  {
    title: 'Strategy activation',
    summary: 'Three assets. Three concentration ticks.',
    amount: '10 units per asset',
    detail: 'USDC, oUSD6 and oUSD18 allocated with a 0.05% swap fee.',
    block: '61,144,147',
    hash: '0x93fe7e8e901e8b12939bd5c3af3f0ec59b30368f1e926999f7f0c2b540f542cb',
    receiptLabel: 'Activation receipt',
    recordLabel: 'Activation record',
    record: 'test/evidence/arc-integration/first-strategy.json',
  },
  {
    title: 'Orbital swap',
    summary: 'An executed trade through Orbital and Aqua.',
    amount: '1 USDC → 0.998491 oUSD6',
    detail: 'Exact input and output transfers checked; 0.0005 USDC curve fee.',
    block: '61,147,486',
    hash: '0xc27397b2bb8557175cc1a824e501046eb4c1373fe396f437c7a0b6737c488e56',
    receiptLabel: 'Swap receipt',
    recordLabel: 'Swap record',
    record: 'test/evidence/arc-integration/first-swap.json',
  },
  {
    title: 'Swap-funded payment',
    summary: 'Token conversion and invoice settlement together.',
    amount: '0.5 USDC paid',
    detail: '0.5 oUSD6 input produced 0.500507 USDC; 0.000507 USDC returned to the payer.',
    block: '61,149,658',
    hash: '0xb785144b6eb1ed84de359553602c8a3b6e429a6303f3312294f5961576b01877',
    receiptLabel: 'Payment receipt',
    recordLabel: 'Payment record',
    record: 'test/evidence/arc-integration/first-payment.json',
  },
] as const;

export const evidenceTopics = [
  {
    title: 'Paper & reference',
    detail: 'Notation, implementation choices and the independent numerical reference.',
    links: [
      {label: 'Paper-to-code map', path: 'docs/PAPER_IMPLEMENTATION.md'},
      {label: 'Reference traversal tests', path: 'packages/reference/tests/test_reachable_traversal.py'},
      {label: 'Mathematical definitions', path: 'docs/MATH.md'},
    ],
  },
  {
    title: 'Curve execution',
    detail: 'Contract source, initialized tick crossings and recorded local results.',
    links: [
      {label: 'Orbital router source', path: 'packages/contracts/src/OrbitalSwapVMRouter.sol'},
      {label: 'Mixed execution test', path: 'packages/contracts/test/MixedExecution.t.sol'},
      {label: 'Basic engine validation', path: 'test/evidence/engine-basic/README.md'},
      {label: 'Complete existing test suite', path: 'test/evidence/engine-suite/README.md'},
      {label: 'Execution evidence', path: 'test/evidence/mixed-execution.md'},
      {label: 'Recorded contract run', path: 'test/evidence/contracts-current.json'},
    ],
  },
  {
    title: 'Payments & wallet reviews',
    detail: 'Settlement, bounded approvals and separate review/signature behavior.',
    links: [
      {label: 'Payment adapter source', path: 'packages/contracts/src/OrbitalPayments.sol'},
      {label: 'Payment contract test', path: 'packages/contracts/test/MixedInvoice.t.sol'},
      {label: 'Payment review tests', path: 'packages/sdk/test/payment-review.test.ts'},
      {label: 'Payment workflow tests', path: 'apps/web/test/payment.spec.ts'},
    ],
  },
] as const;

export const integrationTopics = [
  {
    title: 'Arc deployment identity',
    detail: 'Twelve user-signed deployment transactions, runtime code and contract bindings verified. The unchanged upstream AquaRouter was project-deployed on Arc Testnet.',
    links: [
      {label: 'Deployment verification report', path: 'deployments/5042002/verification.json'},
      {label: 'Deployed application smoke', path: 'test/evidence/arc-integration/deployed-ui.json'},
    ],
    contracts: [
      {label: 'Upstream AquaRouter', address: '0xE60f79571E7EDba477ff98BAdeE618b5605DF7aE'},
      {label: 'Orbital router', address: '0x449420E9042c48Eac6E695020613678aD5A55D41'},
      {label: 'Payments adapter', address: '0xf64e4664D534AeA5d240e1E29DAE9E80D2e393d6'},
    ],
  },
  {
    title: 'Privy wallet integration',
    detail: 'Privy connection and the shared transaction bridge are implemented. The retained sign-in observation is unauthenticated; executable tests use wallet fixtures.',
    links: [
      {label: 'Privy sign-in smoke', path: 'test/evidence/arc-integration/privy-login.json'},
      {label: 'Wallet receipt validation', path: 'test/evidence/privy-association-basic/README.md'},
      {label: 'Wallet integration tests', path: 'apps/web/test/wallet.spec.ts'},
      {label: 'Privy wallet source', path: 'apps/web/src/wallet/PrivyWallet.tsx'},
    ],
    contracts: [],
  },
  {
    title: 'Financial-flow tests',
    detail: 'Runnable tests cover swap and payment reviews, bounded approvals and receipt recovery with wallet fixtures. Actual Arc transactions are recorded above.',
    links: [
      {label: 'Swap execution tests', path: 'apps/web/test/swap-execution.spec.ts'},
      {label: 'Payment workflow tests', path: 'apps/web/test/payment.spec.ts'},
      {label: 'Connected local flow receipts', path: 'test/evidence/local-integration/receipts-after-restart.json'},
    ],
    contracts: [],
  },
] as const;

/** Only known repository files can be linked from generated status rows. */
export const checkpointLinks: Record<string, {label: string; path: string}[]> = {
  'local-integration': [{label: 'Recorded local receipts', path: 'test/evidence/local-integration/receipts-after-restart.json'}],
  reference: [{label: 'Recorded reference test results', path: 'test/evidence/engine-suite/README.md'}, {label: 'Earlier reference evidence', path: 'test/evidence/reference-audit/manifest.json'}],
  contracts: [{label: 'Recorded contract test results', path: 'test/evidence/engine-suite/README.md'}],
  sdk: [{label: 'Swap review tests', path: 'packages/sdk/test/swap-review.test.ts'}],
  indexer: [{label: 'Indexer evidence', path: 'test/evidence/backend-reorg.md'}],
  api: [{label: 'API evidence', path: 'test/evidence/backend-api.md'}],
  'engine-basic': [{label: 'Eight-case engine result', path: 'test/evidence/engine-basic/README.md'}],
  'engine-suite': [{label: 'Full existing suite results', path: 'test/evidence/engine-suite/README.md'}],
  engine: [{label: 'Mathematical scope', path: 'docs/MATH.md'}],
  'privy-login': [{label: 'Privy login observation', path: 'test/evidence/arc-integration/privy-login.json'}],
  'financial-flow': [{label: 'Recorded Arc swap', path: 'test/evidence/arc-integration/first-swap.json'}, {label: 'Recorded Arc invoice payment', path: 'test/evidence/arc-integration/first-payment.json'}],
  'receipt-association': [{label: 'Receipt validation result', path: 'test/evidence/privy-association-basic/README.md'}],
  'privy-flow': [{label: 'Basic association validation', path: 'test/evidence/privy-association-basic/README.md'}, {label: 'Wallet integration tests', path: 'apps/web/test/wallet.spec.ts'}],
  arc: [{label: 'Arc deployment record', path: 'deployments/5042002/verification.json'}],
  release: [{label: 'Testing scope', path: 'docs/TESTS.md'}],
};
