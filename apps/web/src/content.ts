export const copy={
 brand:'Orbital',
 heroTitle:'Liquidity, in your orbit.',
 heroBody:'Concentrate stablecoin liquidity around the peg. Keep your tokens in your wallet. Trade through a shared, multi-token curve.',
 disclosure:'Testnet application. Demo tokens have no redemption value. Concentrated liquidity can lose value.',
 attribution:'Powered by SwapVM — © Degensoft Ltd 2025',
};
export const presets=[
 {name:'Wide',description:'More room for changing prices.',shares:[50,30,20],thresholds:['Full range','0.90 reference','0.99 reference']},
 {name:'Balanced',description:'A measured balance of focus and coverage.',shares:[10,30,60],thresholds:['Full range','0.95 reference','0.99 reference']},
 {name:'Focused',description:'More liquidity close to equal prices.',shares:[10,20,70],thresholds:['Full range','0.99 reference','0.999 reference']},
] as const;
