export const copy={
 brand:'Orbital',
 heroTitle:'Liquidity, in your orbit.',
 heroBody:'Concentrate stablecoin liquidity around the peg. Keep your tokens in your wallet. Trade through a shared, multi-token curve.',
 disclosure:'Testnet application. Demo tokens have no redemption value. Concentrated liquidity can lose value.',
 attribution:'Powered by SwapVM — © Degensoft Ltd 2025',
 swap:{
  unavailable:'Quote unavailable. The amounts could not be checked. Try again.',
  readOnly:'Quote observation. Review checks current funds, strategy availability and transaction simulation before any signature.',
  expired:'Quote expired. Refresh to check current amounts.',
  empty:'No route was found in the inspected strategies.',
 },
 invoice:{
  invalid:'Use the full 32-byte invoice identifier from the correct network.',
  unavailable:'Canonical invoice history could not be checked. Refresh to try again.',
  loading:'Reading the verified deployment and its indexed invoice history.',
  readOnly:'These are indexed invoice terms. A payment review checks current wallet funds, invoice state and transaction simulation separately.',
  stale:'The index is behind or its latest check is old. Refresh to check for updates.',
  demoSettlement:'This deployment uses demo USDC with no redemption value.',
  demoInput:'The input asset in this test receipt is a demo token with no redemption value.',
 },
};
export const presets=[
 {name:'Wide',description:'More room for changing prices.',shares:[50,30,20],thresholds:['Full range','0.90 reference','0.99 reference']},
 {name:'Balanced',description:'A measured balance of focus and coverage.',shares:[10,30,60],thresholds:['Full range','0.95 reference','0.99 reference']},
 {name:'Focused',description:'More liquidity close to equal prices.',shares:[10,20,70],thresholds:['Full range','0.99 reference','0.999 reference']},
] as const;
