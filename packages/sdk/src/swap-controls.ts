export type SwapSettings={slippageBps:number;deadlineSeconds:60|180|600};
export function swapSettings(value:unknown={slippageBps:10,deadlineSeconds:180}):SwapSettings{
 const s=value as SwapSettings;
 if(!s||!Number.isInteger(s.slippageBps)||s.slippageBps<1||s.slippageBps>500||![60,180,600].includes(s.deadlineSeconds))throw Error('Use 1–500 integer basis points and a 60, 180 or 600 second deadline');
 return {slippageBps:s.slippageBps,deadlineSeconds:s.deadlineSeconds};
}
/** Arc's six-decimal ERC-20 view shares its eighteen-decimal gas inventory.
 * Missing remaining-action costs cannot authorize an entire-balance Max. */
export function maximumSwapInput(balanceRaw:bigint,gasSharesInput:boolean,remainingGasNative?:readonly bigint[]):bigint|null{
 if(typeof balanceRaw!=='bigint'||balanceRaw<0n||balanceRaw>=1n<<256n)throw Error('Invalid token balance');
 if(!gasSharesInput)return balanceRaw;
 if(!remainingGasNative?.length)return null;
 if(remainingGasNative.some(v=>typeof v!=='bigint'||v<0n))throw Error('Invalid remaining gas estimate');
 const gasRaw=(remainingGasNative.reduce((a,b)=>a+b,0n)+10n**12n-1n)/10n**12n;
 const reserve=2n*gasRaw>50000n?2n*gasRaw:50000n;
 return balanceRaw>reserve?balanceRaw-reserve:0n;
}
/** Candidate amounts are simulated, never signed. The reserve only grows;
 * acceptance requires the final candidate's own remaining-gas estimate. */
export async function estimateMaximumSwap(balanceRaw:bigint,estimate:(candidateRaw:bigint)=>Promise<{stage:'approval'|'swap';gasCostNative:bigint}>):Promise<bigint>{
 let candidate=maximumSwapInput(balanceRaw,true,[0n])!;
 for(let step=0;step<3;step++){
  if(candidate===0n)throw Error('Balance is too small for the gas reserve');
  const result=await estimate(candidate);
  if(result.stage!=='swap')throw Error('Gas for the remaining approval and swap is unavailable. Enter an amount with a gas reserve.');
  const next=maximumSwapInput(balanceRaw,true,[result.gasCostNative])!;
  if(next>=candidate)return candidate;
  candidate=next;
 }
 throw Error('Gas estimates changed. Refresh the balance and try Max again.');
}
