/** Every stage has floor(E/8) full batches and, when E%8 != 0, one tail.
 * Validate that observed cache hits are realizable by that batch multiset. */
export function validPaymentCacheCounts(eligible:number,stages:number,members:number,batches:number):boolean{
 if(![eligible,stages,members,batches].every(Number.isInteger)||eligible<1||eligible>32||stages<1||stages>Math.min(16,Math.floor(128/eligible))||members<0||members>128||batches<0||batches>28)return false;
 const full=Math.floor(eligible/8),tail=eligible%8;
 if(tail===0)return members===8*batches&&batches<=full*stages;
 const fullHits=(members-tail*batches)/(8-tail),tailHits=batches-fullHits;
 return Number.isInteger(fullHits)&&fullHits>=0&&fullHits<=full*stages&&tailHits>=0&&tailHits<=stages;
}
