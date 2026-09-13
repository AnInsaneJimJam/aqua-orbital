export const copy={
 brand:'ORBITAL SWAP',
 heroTitle:'The best swap for stablecoins.',
 heroBody:'Stablecoin swaps. Powered by Orbital.',
 attribution:'Powered by SwapVM — © Degensoft Ltd 2025',
 strategy:{
  invalid:'Use the full 32-byte strategy hash from the correct network.',
  unavailable:'Canonical strategy state could not be checked. Refresh to try again.',
  stale:'This observation is stale. Refresh before relying on these amounts.',
  custody:'Tokens stay in the maker’s wallet. Other wallet activity can reduce this strategy’s available inventory.',
  capacity:'The output ceiling is a funding bound at the observed block. A fresh curve quote may return less or find no executable trade.',
  fees:'Fees have already been received in the maker’s wallet. They are separate from principal and are not a claimable reward or an APY.',
 },
 swap:{
  unavailable:'Quote unavailable temporarily. Retrying automatically; you can also retry now.',
  readOnly:'Quote observation. Review checks current funds, strategy availability and transaction simulation before any signature.',
  expired:'Updating the quote automatically. Current amounts will appear when checked.',
  empty:'No route was found in the inspected strategies.',
  selfTrade:'You cannot swap against your own liquidity. Connect a different wallet to trade with this strategy.',
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
