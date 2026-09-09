/** A read-only search bound, never an approval or transaction amount. */
export function paymentQuoteLimit(balance:bigint,custom?:bigint){
 if(typeof balance!=='bigint'||balance<=0n||balance>=1n<<256n)throw Error('No available input tokens. Fund this wallet or select another token.');
 if(custom!==undefined&&(typeof custom!=='bigint'||custom<=0n||custom>=1n<<256n))throw Error('Enter a positive spending limit or leave it blank for automatic calculation.');
 return custom!==undefined&&custom<balance?custom:balance;
}
