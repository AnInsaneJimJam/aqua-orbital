/** Token identity is decorative; callers retain the actual symbol as readable text. */
export default function TokenIcon({symbol,size=28}:{symbol:string;size?:number}) {
 const source=({USDC:'usdc',oUSD6:'ousd6',oUSD18:'ousd18'} as Record<string,string>)[symbol];
 return source ? <img src={`/brand/tokens/${source}.svg`} width={size} height={size} alt="" aria-hidden="true" style={{flexShrink:0,verticalAlign:'middle'}}/> : <span aria-hidden="true" style={{width:size,height:size,display:'inline-grid',placeItems:'center',borderRadius:'50%',background:'var(--surface-hover)',flexShrink:0}}>◇</span>;
}
