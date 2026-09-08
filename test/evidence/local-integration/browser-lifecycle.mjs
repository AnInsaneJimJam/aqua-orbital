import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';
const {chromium,expect}=createRequire(new URL('../../../apps/web/package.json',import.meta.url))('@playwright/test');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1200,height:1100}}),transactions=[];page.setDefaultTimeout(45000);let hash='';
page.on('dialog',async d=>{if(d.type()==='confirm'&&d.message().startsWith('Local Anvil wallet fixture'))await d.accept();else await d.dismiss();});
page.on('response',async r=>{try{if(new URL(r.url()).port==='8545'&&r.request().postDataJSON()?.method==='eth_sendTransaction'){const v=await r.json();if(v.result){transactions.push(v.result);console.log('Submitted',v.result);}}}catch{}});
try{
 await page.goto('http://127.0.0.1:3000/liquidity/new');await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await page.getByRole('button',{name:'Manage connected wallet'}).click();await page.getByRole('button',{name:/15d34aaf54267db7d7c367839aaf71a00a2c6a65/i}).click();await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Choose concentration'}).click();await page.getByRole('button',{name:/^Focused/}).click();await page.getByRole('button',{name:'Review strategy',exact:true}).click();await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();await page.getByRole('button',{name:'Prepare publication',exact:true}).click();await page.getByRole('heading',{name:'Publish from your wallet.'}).waitFor();
 for(let i=0;i<4;i++){
  await page.getByRole('button',{name:'Review next publication step',exact:true}).click();const confirm=page.getByRole('button',{name:/^Confirm: /});await confirm.waitFor();const label=await confirm.innerText();console.log(label);await confirm.click();
  await page.getByText(/Bounded Aqua approval confirmed\.|Aqua allocation published\./).waitFor();
 }
 const scopeKey=await page.evaluate(()=>Object.keys(localStorage).find(k=>k.startsWith('orbital:publication:1:')));if(!scopeKey)throw Error('Draft not persisted');
 await page.reload();await page.getByText('Saved publication restored.',{exact:false}).waitFor();console.log('Reload resumed publication');
 // The API needs its documented two confirmations before exposing the receipt.
 const shipment=await expect.poll(async()=>{const r=await fetch('http://127.0.0.1:3001/makers/0x15d34aaf54267db7d7c367839aaf71a00a2c6a65/shipments');const v=await r.json();if(v.data?.items?.[0])hash=v.data.items[0].hash;return v.data?.items?.[0]?.status;},{timeout:20000,intervals:[1500]}).toBe('incomplete');
 console.log('Incomplete allocation indexed',hash);
 await page.goto('http://127.0.0.1:3000/liquidity');await page.getByRole('heading',{name:'Awaiting activation',exact:true}).waitFor();await page.screenshot({path:'.cache/integrated-incomplete.png',fullPage:true});
 await page.getByRole('link',{name:'Open saved publication'}).click();await page.getByRole('button',{name:'Review next publication step',exact:true}).click();await page.getByRole('button',{name:'Confirm: Activate Orbital strategy',exact:true}).click();await page.getByRole('link',{name:'View strategy',exact:true}).waitFor();
 await page.getByRole('link',{name:'View strategy',exact:true}).click();await page.getByRole('button',{name:'Review deactivation step',exact:true}).waitFor();
 await page.getByRole('button',{name:'Review deactivation step',exact:true}).click();await page.getByRole('button',{name:'Confirm: Retire strategy',exact:true}).click();await page.getByText('Strategy retirement confirmed.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Review deactivation step',exact:true}).click();await page.getByRole('button',{name:'Confirm: Dock Aqua allocation',exact:true}).click();await page.getByText('Aqua docking confirmed.',{exact:false}).waitFor();console.log('Retired and docked');await page.screenshot({path:'.cache/integrated-retired.png',fullPage:true});
 await writeFile('.cache/integrated-lifecycle.json',JSON.stringify({status:'passed',hash,transactions,body:await page.locator('body').innerText()},null,2));
}catch(e){console.log((await page.locator('body').innerText()).slice(-7500));throw e;}finally{await page.context().storageState({path:'.cache/lifecycle-browser-state.json'});await writeFile('.cache/lifecycle-transactions.json',JSON.stringify(transactions,null,2));await browser.close();}
