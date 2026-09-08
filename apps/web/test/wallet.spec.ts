import {test,expect} from '@playwright/test';

test('external wallet fixture connects, shows wrong chain, and supports keyboard dialog',async({page})=>{
 await page.addInitScript(()=>{
  const listeners=new Map<string,Set<(value:unknown)=>void>>();let connected=false;
  const provider={isMetaMask:true,isConnected:()=>connected,on:(event:string,listener:(value:unknown)=>void)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(listener);return provider;},removeListener:(event:string,listener:(value:unknown)=>void)=>{listeners.get(event)?.delete(listener);return provider;},request:async({method}:{method:string})=>{
   if(method==='eth_chainId')return '0x1';
   if(method==='eth_accounts')return connected?['0x0000000000000000000000000000000000000001']:[];
   if(method==='eth_requestAccounts'){connected=true;return ['0x0000000000000000000000000000000000000001'];}
   if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];
   if(method==='wallet_getPermissions')return [];
   if(method==='wallet_revokePermissions'){connected=false;return null;}
   throw Object.assign(Error(`Fixture does not support ${method}`),{code:4200});
  }};
  Object.defineProperty(window,'ethereum',{value:provider,configurable:true});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await page.getByRole('button',{name:'Manage connected wallet'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByText('Wrong network · switch to Arc Testnet')).toBeVisible();
 await expect(page.getByRole('button',{name:'External wallet'})).toContainText('0x0000000000000000000000000000000000000001');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toBeHidden();
 await expect(page.getByRole('button',{name:'Manage connected wallet'})).toBeFocused();
});
