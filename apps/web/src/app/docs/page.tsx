import type {Metadata} from 'next';
import {ArrowRight,ArrowUpRight,BookOpen,ChevronRight,Wallet,Layers,ExternalLink} from 'lucide-react';
import Link from '../../components/AppLink';
import {selectedChain} from '../../wallet/config';
import StrategyDiagram from './StrategyDiagram';
import styles from './page.module.css';

export const metadata:Metadata={title:'Docs — How Orbital works',description:'Understand Orbital’s stablecoin curve, wallet-held liquidity, SwapVM execution, fees, and atomic USDC payments. A practical guide to the protocol.'};

const chapters=[
 {label:'Understand the protocol',links:[['overview','Overview'],['shared-liquidity','One strategy, many pairs'],['custody','Where your tokens live'],['concentration','The Orbital curve']]},
 {label:'Use Orbital',links:[['swaps','How a swap settles'],['fees','Fees & slippage'],['liquidity','Providing liquidity'],['payments','USDC payments']]},
 {label:'Go deeper',links:[['execution','Under the hood'],['questions','Common questions'],['glossary','Glossary'],['further-reading','Further reading']]},
];

function Contents(){return <nav aria-label="Documentation sections">{chapters.map(chapter=><div className={styles.chapter} key={chapter.label}><p>{chapter.label}</p>{chapter.links.map(([id,label])=><a key={id} href={`#${id}`}>{label}</a>)}</div>)}</nav>;}

export default function Documentation(){return <div className={styles.docs}>
 <aside className={styles.sidebar} aria-label="Guide navigation">
  <Link href="/docs" className={styles.docsBrand}><BookOpen size={17} aria-hidden="true"/> Orbital Docs</Link>
  <Contents/>
  <div className={styles.sidebarFoot}><span className={styles.networkDot}/>{selectedChain.name}<Link href="/swap">Open the app <ArrowUpRight size={14} aria-hidden="true"/></Link></div>
 </aside>
 <div className={styles.readingColumn}>
  <div className={styles.breadcrumb}><Link href="/">Orbital Swap</Link><ChevronRight size={13} aria-hidden="true"/><span>Documentation</span></div>
  <details className={styles.mobileContents}><summary><BookOpen size={16} aria-hidden="true"/> In this guide</summary><Contents/></details>
  <article className={styles.article} aria-labelledby="docs-title">
   <header className={styles.intro} id="overview">
    <p className={styles.eyebrow}>The protocol, explained</p>
    <h1 id="docs-title">How Orbital <em>works.</em></h1>
    <p className={styles.lead}>Trade stablecoins. Keep liquidity in your wallet. Get paid in USDC.</p>
    <p>Orbital Swap brings those three things together. A liquidity provider defines the assets and trading rules in a <a href="#glossary">strategy</a>. Traders exchange against that strategy, and merchants use the same swap engine to accept payments in USDC.</p>
    <div className={styles.thesis}><span aria-hidden="true">↗</span><p>The key idea: <strong>liquidity is a set of trading permissions over wallet-held tokens.</strong> Tokens move when a trade settles.</p></div>
    <div className={styles.introLinks}><a href="#shared-liquidity">Start with the idea <ArrowRight size={16} aria-hidden="true"/></a><a href="#swaps">Follow a swap <ArrowRight size={16} aria-hidden="true"/></a></div>
   </header>

   <section id="shared-liquidity" aria-labelledby="shared-title">
    <p className={styles.sectionLabel}>The big picture</p><h2 id="shared-title">One strategy. <em>Every pair.</em></h2>
    <p>Imagine a maker offering USDC, oUSD6, and oUSD18. These three assets form one shared strategy: you can trade any of its six directed pairs against the same inventory and pricing state.</p>
    <p>A USDC → oUSD6 swap changes what that strategy holds. A later oUSD18 → USDC swap starts from that updated state. Each maker owns their own strategy; inventory and fees are accounted for separately between makers.</p>
    <StrategyDiagram/>
   </section>

   <section id="custody" aria-labelledby="custody-title">
    <p className={styles.sectionLabel}>Wallet-held liquidity</p><h2 id="custody-title">Your wallet holds the assets.<br/><em>The strategy sets the rules.</em></h2>
    <p>Publishing liquidity does not transfer your tokens into a pooled vault. You give Aqua a token allowance and publish an allocation that your Orbital strategy may trade.</p>
    <div className={styles.custodyDiagram}>
     <div><Wallet size={22} aria-hidden="true"/><h3>Maker’s wallet</h3><p>Holds the tokens.<br/>Receives the swap input.</p></div>
     <div className={styles.custodyMiddle}><span>Approved settlement</span><span className={styles.transferArrows} aria-hidden="true">⇄</span><small>Aqua + Orbital</small></div>
     <div><Wallet size={22} aria-hidden="true"/><h3>Trader’s wallet</h3><p>Signs the swap.<br/>Receives the output.</p></div>
    </div>
    <p>Aqua tracks the allocation; Orbital tracks the curve and principal. A trade also needs enough tokens in the maker’s actual wallet and enough allowance to move them. Spending tokens or reducing an allowance can therefore make a published strategy unavailable.</p>
    <p className={styles.asideNote}><strong>Custody still comes with permissions.</strong> An allowance authorizes transfers within its limit. Review the spender and amount before approving it.</p>
   </section>

   <section id="concentration" aria-labelledby="curve-title">
    <p className={styles.sectionLabel}>The pricing idea</p><h2 id="curve-title">Liquidity, concentrated<br/><em>around balance.</em></h2>
    <p>Stablecoins usually trade near a common value. Orbital lets a maker concentrate liquidity around that equal-price region, while keeping several assets in one trading system.</p>
    <p>Think of a strategy’s reserves as a point on a curved surface. A swap adds one asset and removes another, moving the point. The curve determines how much output is available; it does not promise a fixed one-for-one exchange.</p>
    <figure className={styles.concentrationFigure}>
     <svg viewBox="0 0 370 250" role="img" aria-label="Nested tick boundaries around an equal-price point. Smaller boundaries concentrate liquidity more tightly.">
      <ellipse cx="185" cy="127" rx="160" ry="96" fill="none" stroke="#4a4a4a"/>
      <ellipse cx="185" cy="127" rx="117" ry="68" fill="#7ed2c805" stroke="#7ed2c8" strokeOpacity=".5"/>
      <ellipse cx="185" cy="127" rx="71" ry="39" fill="#7ed2c809" stroke="#7ed2c8"/>
      <path d="M25 127h320M185 31v192" stroke="#383838" strokeDasharray="3 6"/>
      <circle cx="185" cy="127" r="5" fill="#f5f5f2"/>
      <text x="185" y="243" textAnchor="middle" fill="#a3a3a3" fontSize="12">Equal-price point at the center</text>
     </svg>
     <figcaption><h3>Choose your concentration</h3><p><strong>Tighter ticks</strong> focus more capital near equal prices.</p><p><strong>Wider ticks</strong> cover a broader set of relative prices.</p><span>Conceptual view of nested boundaries, not a live price chart.</span></figcaption>
    </figure>
    <p>These nested regions are called <strong>ticks</strong>. A strategy combines several ticks, including a full-range tick. When a trade reaches a boundary, the engine recalculates how the ticks combine before continuing.</p>
    <p>A boundary changes a tick’s contribution to pricing. It does not automatically switch off the entire multi-asset strategy. Execution continues only when the engine can validate the remaining path and available backing.</p>
    <details><summary>A closer look at the curve</summary><div className={styles.detailsBody}>
     <p>The starting geometric model for a single full-range tick is a sphere. With one coordinate per asset, its ideal frontier satisfies:</p>
     <p className={styles.equation} aria-label="The sum over assets of radius minus geometric reserve squared equals radius squared.">∑ (r − x<sub>i</sub>)<sup>2</sup> = r<sup>2</sup></p>
     <p><code>r</code> is the tick’s radius; <code>x<sub>i</sub></code> is an asset’s geometric reserve. Concentrated ticks add a cap and virtual reserves, so these coordinates are not simply your wallet balances.</p>
     <p>The engine combines interior and boundary ticks and uses conservative integer calculations to validate an output. Uncertain calculations are rejected. The <a href="https://www.paradigm.xyz/writing/orbital" target="_blank" rel="noreferrer">original Orbital paper</a> develops the geometric model; this app adapts it to independent maker-owned Aqua strategies.</p>
    </div></details>
   </section>

   <section id="swaps" aria-labelledby="swaps-title">
    <p className={styles.sectionLabel}>For traders</p><h2 id="swaps-title">From quote <em>to settlement.</em></h2>
    <p>You choose an exact input amount. The app finds an eligible strategy, reads its current state, and asks what that input can buy. A quote is an observation; the signed transaction carries the limits that protect execution.</p>
    <ol className={styles.steps}>
     <li><div><h3>Choose assets and get a quote</h3><p>Select what you want to sell and receive. Compare the quoted output, trading fee, and minimum received. The app searches the strategies it can inspect; a quote is not a promise of the best price everywhere.</p></div></li>
     <li><div><h3>Approve the input, if needed</h3><p>A token approval lets the router spend the reviewed input amount. Approval is separate from the swap and does not execute the trade.</p></div></li>
     <li><div><h3>Review a fresh transaction</h3><p>After approval, the app refreshes the quote. Check the recipient, network, deadline, minimum output, and gas estimate before confirming in your wallet.</p></div></li>
     <li><div><h3>Settle and read the receipt</h3><p>The contracts charge the input fee, run the curve, and settle the transfers through Aqua. If the required checks fail, the transaction reverts. A confirmed receipt records what actually moved.</p></div></li>
    </ol>
    <Link className={styles.textLink} href="/swap">Try a swap <ArrowRight size={16} aria-hidden="true"/></Link>
   </section>

   <section id="fees" aria-labelledby="fees-title">
    <p className={styles.sectionLabel}>Understanding your quote</p><h2 id="fees-title">A fee, a price,<br/>and <em>your minimum.</em></h2>
    <p>The maker chooses a trading fee of <strong>0.01%, 0.05%, or 0.10%</strong>. It is charged once on the gross input, even if the trade crosses several ticks. The remaining input is used to calculate output.</p>
    <div className={styles.feeExample} aria-label="Fee example: 100 USDC input at a 0.05 percent trading fee">
     <p>Example · 0.05% trading fee</p><dl><div><dt>You send</dt><dd>100.00 <small>USDC</small></dd></div><div><dt>Maker’s fee</dt><dd>0.05 <small>USDC</small></dd></div><div><dt>Input to the curve</dt><dd>99.95 <small>USDC</small></dd></div></dl>
     <span>99.95 USDC is the input used for pricing, not the amount of the other token you receive. Network gas is separate.</span>
    </div>
    <div className={styles.definitionRows}>
     <div><h3>Price impact</h3><p>The change in price caused by trading against a strategy’s finite inventory. A larger trade can move further along the curve.</p></div>
     <div><h3>Slippage tolerance</h3><p>The amount of movement you allow between the quote and execution. It sets a minimum output; it is not an additional fee.</p></div>
     <div><h3>Network gas</h3><p>The cost of executing onchain. On Arc Testnet, gas is paid in native USDC. Leave a balance for gas when choosing how much USDC to spend.</p></div>
    </div>
    <details><summary>How fees and minimum output are rounded</summary><div className={styles.detailsBody}><p>Fees use parts per million and round upward in the input token’s smallest unit:</p><pre><code>fee = ceil(gross input × fee ppm / 1,000,000){'\n'}net input = gross input − fee</code></pre><p>A fee that consumes the entire input is rejected. Minimum output rounds down in the output token’s smallest unit:</p><pre><code>minimum = floor(quoted output × (10,000 − slippage bps) / 10,000)</code></pre><p>For example, a quote of 100 tokens with 0.10% slippage has a minimum of 99.90 tokens, subject to that token’s precision.</p></div></details>
   </section>

   <section id="liquidity" aria-labelledby="liquidity-title">
    <p className={styles.sectionLabel}>For liquidity providers</p><h2 id="liquidity-title">Publish the strategy.<br/><em>Keep the custody.</em></h2>
    <p>Choose two to eight tokens from the deployment’s supported assets. On the current Arc deployment, you can select any pair of USDC, oUSD6 and oUSD18, or all three. Set equal starting amounts, a concentration profile and a fee; every pair in your basket can trade in both directions. Review the configuration before publishing it onchain.</p>
    <div className={styles.lifecycle} aria-label="Strategy publication sequence"><span>Approve</span><ArrowRight size={16} aria-hidden="true"/><span>Publish to Aqua</span><ArrowRight size={16} aria-hidden="true"/><span>Activate Orbital</span></div>
    <p>Approval permits token transfers. Publishing advertises the allocation in Aqua. Activation validates the initial backing and commits the Orbital configuration. An active order’s assets, tick structure, and fee are immutable.</p>
    <p>As swaps settle, you receive the gross input into your wallet and pay the output. Only the net input becomes curve principal. The fee is already yours in the wallet and is tracked separately; there is no extra fee-collection transaction.</p>
    <p>To stop or change a strategy, retire it and dock its Aqua allocation. Retirement is terminal for that order. A new size or configuration requires a fresh order; docking removes the advertised allocation and transfers no tokens.</p>
    <p className={styles.asideNote}><strong>Concentration changes your exposure.</strong> A stablecoin can lose its peg, and trading can leave you holding more of a weakening asset. A concentration setting is not a guaranteed dollar floor or return.</p>
    <Link className={styles.textLink} href="/liquidity">Explore liquidity <ArrowRight size={16} aria-hidden="true"/></Link>
   </section>

   <section id="payments" aria-labelledby="payments-title">
    <p className={styles.sectionLabel}>For merchants and payers</p><h2 id="payments-title">Pay in a supported token.<br/><em>Settle in USDC.</em></h2>
    <p>A merchant creates an invoice with a fixed USDC amount, an expiry, and up to three recipients. The payer can use USDC directly or swap another supported token into USDC as part of the payment.</p>
    <div className={styles.paymentExample}>
     <div className={styles.invoiceHeading}><span>Example invoice</span><strong>100 <small>USDC</small></strong></div>
     <div className={styles.paymentRoute}><span>Supported token</span><ArrowRight size={17} aria-hidden="true"/><span>Orbital swap</span><ArrowRight size={17} aria-hidden="true"/><span>USDC settlement</span></div>
     <div className={styles.splitBar} aria-label="90 percent to the merchant and 10 percent to a collaborator"><span/><span/></div>
     <div className={styles.splitLabels}><span><i/> Merchant <strong>90 USDC</strong></span><span><i/> Collaborator <strong>10 USDC</strong></span></div>
    </div>
    <p>The payment contract checks that the swap produces at least the amount due and meets the payer’s minimum. It distributes the invoice amount, refunds any excess USDC to the payer, and marks the invoice paid in the same transaction.</p>
    <p>If the swap or a required recipient transfer fails, the payment reverts together. The invoice cannot be partially paid through this flow or successfully paid twice. Any required token approval happens before the payment transaction.</p>
    <Link className={styles.textLink} href="/pay">Explore payments <ArrowRight size={16} aria-hidden="true"/></Link>
   </section>

   <section id="execution" aria-labelledby="execution-title">
    <p className={styles.sectionLabel}>The pieces, connected</p><h2 id="execution-title">What runs <em>underneath.</em></h2>
    <div className={styles.definitionRows}>
     <div><h3>Orbital</h3><p>The curve, concentration rules, strategy state, and validation of swap outputs.</p></div>
     <div><h3>Aqua</h3><p>Wallet-based allocation accounting and the settlement machinery that moves authorized tokens.</p></div>
     <div><h3>SwapVM</h3><p>The execution framework. Our custom router runs the fee and curve instructions in a fixed order.</p></div>
     <div><h3>Arc</h3><p>The target network where transactions settle. This application uses the testnet.</p></div>
     <div><h3>Privy</h3><p>Wallet connection and email-based wallet access. Your wallet handles transaction confirmation and signing.</p></div>
    </div>
    <details><summary>The two custom SwapVM instructions</summary><div className={styles.detailsBody}>
     <div className={styles.opcodes}><div><code>0x72</code><h3>OrbitalFeeIn</h3><p>Charges the input fee once, runs the curve with net input, then restores gross input for settlement.</p></div><div><code>0x52</code><h3>OrbitalSwap</h3><p>Calculates output and validates the supported tick path. Actual swaps commit state; quotes do not.</p></div></div>
     <pre><code>OrbitalFeeIn(configHash) → OrbitalSwap(configHash)</code></pre><p>Both instructions contain the same 32-byte configuration hash. The router validates the exact program, so extra instructions, repeated fees, or a mismatched configuration are rejected.</p>
     <p>The contracts support 2–8 assets and up to 8 ticks per strategy, with a maximum of 16 crossings per swap. The app’s publication flow prepares a three-asset strategy. Execution is exact-input and must satisfy the configured validation limits.</p>
    </div></details>
    <p>The API and indexer help find strategies, prepare quotes, and display activity. Contract checks determine whether a transaction can settle.</p>
   </section>

   <section id="questions" aria-labelledby="questions-title">
    <p className={styles.sectionLabel}>A few useful answers</p><h2 id="questions-title">Before you <em>begin.</em></h2>
    <div className={styles.questions}>
     <details><summary>Do I need a wallet to read or explore?</summary><div className={styles.detailsBody}><p>No. This guide and public strategy information are available without connecting. Connect a wallet when you want to publish, swap, create an invoice, or pay.</p></div></details>
     <details><summary>Why are approval and swap separate confirmations?</summary><div className={styles.detailsBody}><p>Approval changes how much a contract may spend. The swap is a separate transaction that actually exchanges assets. An existing sufficient allowance can remove the need for a new approval.</p><p>Connection permission is different again: it lets the app see an account. Reloading should restore an already-authorized wallet without asking for another connection.</p></div></details>
     <details><summary>Why can a quote become unavailable?</summary><div className={styles.detailsBody}><p>The strategy may have traded, been retired, or lost sufficient wallet balance or allowance. A deadline may have passed, or the engine may be unable to validate the proposed path. Refresh the quote and review the new result.</p></div></details>
     <details><summary>What happens if I close the tab after submitting?</summary><div className={styles.detailsBody}><p>A submitted transaction can still confirm onchain. The app saves public transaction information to recover receipts when you return. Check the transaction status before submitting another action.</p></div></details>
     <details><summary>Are these mainnet assets?</summary><div className={styles.detailsBody}><p>This is a testnet application. oUSD6 and oUSD18 are demo tokens with no redemption value, and testnet USDC is for testing. Use <Link href="/fund">Demo Tokens</Link> for funding instructions.</p></div></details>
     <details><summary>Does keeping custody remove liquidity risk?</summary><div className={styles.detailsBody}><p>No. You retain wallet custody, but approved swaps change your inventory. Depegs, changing relative prices, token allowances, and contract execution all remain relevant. A successful test transaction is not an audit or a guarantee of future results.</p></div></details>
    </div>
   </section>

   <section id="glossary" aria-labelledby="glossary-title">
    <p className={styles.sectionLabel}>Keep the vocabulary simple</p><h2 id="glossary-title">A small <em>glossary.</em></h2>
    <dl className={styles.glossary}>
     <div><dt>Maker</dt><dd>The wallet that owns and publishes a liquidity strategy.</dd></div>
     <div><dt>Taker</dt><dd>The account executing a swap against that strategy.</dd></div>
     <div><dt>Strategy</dt><dd>A registered set of assets, allocations, tick settings, and trading rules owned by one maker.</dd></div>
     <div><dt>Tick</dt><dd>A liquidity component with its own radius and concentration boundary.</dd></div>
     <div><dt>Principal</dt><dd>The token amounts assigned to the curve’s trading inventory, excluding accumulated fees.</dd></div>
     <div><dt>Allowance</dt><dd>The amount a token holder permits a particular contract to transfer.</dd></div>
     <div><dt>Atomic settlement</dt><dd>All required steps succeed together, or their onchain state changes revert together.</dd></div>
     <div><dt>Receipt</dt><dd>The confirmed transaction result and events describing what happened onchain.</dd></div>
    </dl>
   </section>

   <section id="further-reading" aria-labelledby="reading-title">
    <p className={styles.sectionLabel}>Keep exploring</p><h2 id="reading-title">From idea <em>to evidence.</em></h2>
    <div className={styles.readingLinks}><a href="https://www.paradigm.xyz/writing/orbital" target="_blank" rel="noreferrer"><span><Layers size={20} aria-hidden="true"/><strong>The Orbital paper</strong><small>The original geometric model by Dan Robinson, Ciamac Moallemi, and Dave White.</small></span><ExternalLink size={17} aria-hidden="true"/></a></div>
    <div className={styles.endNote}><span>You’ve got the idea. See it in action.</span><Link href="/swap">Open Swap <ArrowRight size={16} aria-hidden="true"/></Link><a href="#overview">Back to top ↑</a></div>
   </section>
  </article>
 </div>
</div>;}
