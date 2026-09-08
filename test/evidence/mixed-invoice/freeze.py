"""Authenticate and archive the tested compiler project, or restore it safely.

The archive contains only the exact source/config set from forge.json, never
build outputs, account state, private keys, or an Anvil data directory.
"""
import gzip
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
PREFIX='.cache/mixed-invoice/project/'
def digest(data):return hashlib.sha256(data).hexdigest()
def main(mode):
    assert mode in ['create','verify','restore']
    result=json.loads((HERE/'forge.json').read_text())
    assert result['exit_status']==0 and result['changed_inputs']==[]
    expected={name[len(PREFIX):]:sha for name,sha in result['inputs'].items() if name.startswith(PREFIX)}
    assert len(expected)==100 and all(not name.startswith('/') and '..' not in name.split('/') for name in expected)
    archive=HERE/'source-snapshot.tar.gz'
    if mode=='create':
        buf=io.BytesIO()
        with tarfile.open(fileobj=buf,mode='w',format=tarfile.USTAR_FORMAT) as bundle:
            for name,sha in sorted(expected.items()):
                payload=(ROOT/PREFIX/name).read_bytes();assert digest(payload)==sha
                item=tarfile.TarInfo(name);item.size=len(payload);item.mode=0o644;bundle.addfile(item,io.BytesIO(payload))
        archive.write_bytes(gzip.compress(buf.getvalue(),mtime=0))
    with tarfile.open(archive,'r:gz') as bundle:
        members=bundle.getmembers();assert len(members)==len(expected) and {m.name for m in members}==set(expected)
        target=ROOT/'.cache/mixed-invoice-replay'
        for item in members:
            assert item.isfile();payload=bundle.extractfile(item).read();assert digest(payload)==expected[item.name]
            if mode=='restore':
                path=(target/item.name).resolve();assert path.is_relative_to(target.resolve())
                if path.exists():assert path.read_bytes()==payload,'Refusing to overwrite a different replay source'
                else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(payload)
    print(f'Authenticated {len(expected)} source/config archive members; SHA256 {digest(archive.read_bytes())}.')
    if mode=='restore':print('Replay with: forge test --root .cache/mixed-invoice-replay --match-contract ^MixedInvoiceTest$ --threads 2 --offline -vv')
if __name__=='__main__':main(sys.argv[1])
