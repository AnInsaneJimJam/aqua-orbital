'use client';
import type {ProofItem} from '@orbital/shared';
import type {ReactNode} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {useResource} from './api';
import {checkpointLinks,evidenceTopics,integrationTopics,recordedArcExplorer,recordedArcReceipts,repositoryFile,repositoryUrl} from './proofEvidence';
import styles from './Proof.module.css';
function EvidenceLink({href,children}:{href:string;children:ReactNode}){
 return <a className="inline-link" href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={15} aria-hidden="true"/></a>;
}
export default function Proof(){
 const data=useResource<{generatedAt:string|null;items:ProofItem[]}>('/proof');
 return <section className={`page ${styles.page}`}><div className="page-head"><div><div className="eyebrow">Behind Orbital</div><h1>Protocol notes</h1><p>Inspect the mathematics, execution, and receipts behind the application.</p></div></div>
  <section className={styles.section} aria-labelledby="arc-receipts"><div className={styles.sectionHeading}><div><h2 id="arc-receipts">Onchain receipts</h2><p>Recorded user-signed Arc Testnet transactions · chain 5042002</p></div><span className="pill">Observed September 9, 2026 · IST</span></div>
   <div className={styles.receipts}>{recordedArcReceipts.map(receipt=><article className={`panel ${styles.receipt}`} key={receipt.hash}>
    <div className={styles.receiptIntro}><h3>{receipt.title}</h3><p>{receipt.summary}</p></div><p className={styles.amount}>{receipt.amount}</p><p>{receipt.detail}</p>
    <p className={styles.block}>Block {receipt.block}</p><div className={styles.links}><EvidenceLink href={`${recordedArcExplorer}/tx/${receipt.hash}`}>{receipt.receiptLabel}</EvidenceLink><EvidenceLink href={repositoryFile(receipt.record)}>{receipt.recordLabel}</EvidenceLink></div>
   </article>)}</div>
   <p className={styles.note}>Recorded Arc Testnet actions, with exact transfer checks in the linked verification records.</p>
  </section>
  <section className={styles.section} aria-labelledby="integration-checks"><div className={styles.sectionHeading}><div><h2 id="integration-checks">Integration evidence</h2><p>Recorded Arc identity and receipts, wallet source, and runnable integration tests.</p></div></div>
   <div className={styles.topics}>{integrationTopics.map(topic=><article className={`panel ${styles.topic}`} key={topic.title}><h3>{topic.title}</h3><p>{topic.detail}</p><div className={styles.links}>{topic.links.map(link=><EvidenceLink key={link.path} href={repositoryFile(link.path)}>{link.label}</EvidenceLink>)}</div>{topic.contracts.length>0&&<details><summary>Verified contract addresses</summary>{topic.contracts.map(contract=><div key={contract.address}><EvidenceLink href={`${recordedArcExplorer}/address/${contract.address}`}>{contract.label}</EvidenceLink><p className="mono">{contract.address}</p></div>)}</details>}</article>)}</div>
  </section>
  <section className={styles.section} aria-labelledby="source-checks"><div className={styles.sectionHeading}><div><h2 id="source-checks">Source &amp; local checks</h2><p>Read the implementation alongside its tests and retained results.</p></div><EvidenceLink href={repositoryUrl}>Open repository</EvidenceLink></div>
   <div className={styles.topics}>{evidenceTopics.map(topic=><article className={`panel ${styles.topic}`} key={topic.title}><h3>{topic.title}</h3><p>{topic.detail}</p><div className={styles.links}>{topic.links.map(link=><EvidenceLink key={link.path} href={repositoryFile(link.path)}>{link.label}</EvidenceLink>)}</div></article>)}</div>
   <div className={styles.sourceFoot}><p className={styles.note}>Local test results apply to their recorded inputs and source versions. Repository access may be required.</p><EvidenceLink href={repositoryFile('docs/TESTS.md')}>Testing scope</EvidenceLink></div>
  </section>
  <section className={styles.section} aria-labelledby="build-checkpoint"><div className={styles.sectionHeading}><div><h2 id="build-checkpoint">Build checkpoint</h2><p>Statuses from the configured evidence manifest; older snapshots may predate the receipts above.</p></div></div>
   {data.data?.generatedAt&&<p className={styles.timestamp}>Recorded <time dateTime={data.data.generatedAt}>{data.data.generatedAt.replace('T',' ').replace('Z',' UTC')}</time></p>}
   <div className={`panel ${styles.evidence}`}>
    {data.isPending?<p role="status">Loading evidence…</p>:data.error?<div className="notice" role="status">{data.error.message}</div>:!data.data?.items.length?<p className="hint">No evidence manifest is configured for this deployment yet.</p>:data.data.items.map(item=><article key={item.id} className={styles.item}><div className={styles.heading}><h3>{item.label}</h3><span className="pill">{item.status}</span></div><p>{item.detail}</p>{Object.prototype.hasOwnProperty.call(checkpointLinks,item.id)&&<div className={styles.links}>{checkpointLinks[item.id]!.map(link=><EvidenceLink key={link.path} href={repositoryFile(link.path)}>{link.label}</EvidenceLink>)}</div>}</article>)}
   </div>
  </section>
  <aside className={styles.limits} aria-labelledby="remaining-acceptance"><h2 id="remaining-acceptance">What remains open</h2><p>Record the Privy wallet-provider association for the demonstrated financial receipts. Full mathematical and release campaigns and an independent security audit also remain open; the verified Arc deployment and executed financial flows are recorded above.</p><EvidenceLink href={repositoryFile('docs/TESTS.md')}>Read the testing requirements</EvidenceLink></aside>
 </section>;
}
