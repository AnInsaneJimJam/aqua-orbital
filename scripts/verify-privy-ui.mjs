import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:900}});
const failures=[];page.on('pageerror',e=>failures.push(e.message.slice(0,500)));page.on('response',r=>{if(r.status()>=400&&r.url().includes('privy'))failures.push(`${r.status()} ${new URL(r.url()).pathname}`);});
let loginVisible=false;let error;
try{
 await page.goto('http://127.0.0.1:3002/');
 await page.getByRole('button',{name:'Connect wallet',exact:true}).waitFor({timeout:45000});
 await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await page.getByPlaceholder(/email/i).waitFor({timeout:20000});loginVisible=true;
}catch(e){error=e.message.slice(0,1000);}
await page.screenshot({path:'test/evidence/privy-login.png',fullPage:true});
const result={observedAt:new Date().toISOString(),origin:'http://127.0.0.1:3002',appId:'cmtrvczqp00qh0cjv4b16j1ag',loginVisible,error,failures,scope:'Public login UI only. No email, wallet creation, signature, or transaction.'};
await writeFile('test/evidence/privy-login.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));await browser.close();
