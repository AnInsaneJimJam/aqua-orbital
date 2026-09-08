"""Retain pinned, licensed upstream sources without nested Git repositories."""
import json, subprocess, hashlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCES={
 'swap-vm':('https://github.com/1inch/swap-vm.git','f09a41e689240adc645934f965c8061749397cd2'),
 'aqua':('https://github.com/1inch/aqua.git','81c26e4619ce21556ab02b3284ee2685de21fb18'),
 'forge-std':('https://github.com/foundry-rs/forge-std.git','v1.11.0'),
}
manifest={}
for name,(url,revision) in SOURCES.items():
 cache=ROOT/'.cache'/name
 if not cache.exists(): subprocess.run(['git','clone','--no-checkout',url,str(cache)],check=True)
 commit=subprocess.check_output(['git','-C',str(cache),'rev-parse',f'{revision}^{{commit}}'],text=True).strip()
 tree=subprocess.check_output(['git','-C',str(cache),'ls-tree','-r','--name-only',commit],text=True).splitlines()
 dest=ROOT/'packages/contracts/vendor'/name
 hashes={}
 for file in tree:
  if not(file.startswith(('src/','test/','mocks/','LICENSE')) or file in ['LICENSE','README.md','package.json','foundry.toml']): continue
  content=subprocess.check_output(['git','-C',str(cache),'show',f'{commit}:{file}'])
  path=dest/file; path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(content)
  hashes[file]=hashlib.sha256(content).hexdigest()
  if name=='swap-vm':
   fork=ROOT/'packages/contracts/vendor/swap-vm-orbital'/file
   # Never overwrite an existing fork mutation on repeat acquisition.
   if not fork.exists(): fork.parent.mkdir(parents=True,exist_ok=True); fork.write_bytes(content)
 manifest[name]={'url':url,'revision':commit,'files':hashes}
out=ROOT/'test/evidence/upstream.json';out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Vendored source identities:',{k:v['revision'] for k,v in manifest.items()})
