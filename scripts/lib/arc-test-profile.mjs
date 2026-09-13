// A forward-only test view, not a replacement deployment history.
export function testStartBlock(value, manifest, head, skipVerification) {
  if (value === undefined) return manifest.startBlock;
  if (!skipVerification || manifest.chainId !== 5042002 || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw Error('A fresh test index requires Arc Testnet and explicit verification opt-out.');
  }
  const start = BigInt(value);
  if (start < BigInt(manifest.startBlock) || start > head - 2n) {
    throw Error('Test start block must be confirmed and not precede deployment.');
  }
  return value;
}
