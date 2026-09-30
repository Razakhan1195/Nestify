"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowDown, ArrowRight, Check, ChevronRight, FileText, Menu, MessageCircle, Plus, ShieldCheck, Smartphone, X } from "lucide-react";
import styles from "./rezlee-landing.module.css";

const features = [
  { key: "bills", label: "Understand bills", number: "01", title: "A bill is a number.\nUnderstanding it is power.", description: "See what you were charged, what changed, and what deserves a closer look. Start with one statement. Build a clearer picture as you add history.", action: "Explore bill insights", href: "#download" },
  { key: "sharing", label: "Share costs", number: "02", title: "A shared home.\nA clear share.", description: "Record who paid, choose who shares, and see who owes what. From the internet bill to the household shop, keep the maths out of your group chat.", action: "Explore shared expenses", href: "#download" },
  { key: "vault", label: "Keep records", number: "03", title: "Find it before\nyou need it.", description: "Give receipts, policies and home-item details a place to live. Keep the original close to the information that matters.", action: "Explore your Vault", href: "#download" },
  { key: "care", label: "Care for home", number: "04", title: "One less thing\nto remember.", description: "Create a reminder, set a cleaning routine, or build a maintenance plan. Give the next task a date and keep track of what is done.", action: "Explore home care", href: "#download" },
] as const;
type Feature = typeof features[number]["key"];

function BillDemo() {
  const [history, setHistory] = useState(true);
  return <div className={styles.billDemo}>
    <div className={styles.demoTop}><span className={styles.miniBrand}><Image src="/marketing/providers/rogers.png" alt="Rogers" width={108} height={35} /></span><span className={styles.account}>Internet · •• 3083</span></div>
    <div className={styles.demoSwitch} aria-label="Example data available">
      <button type="button" aria-pressed={!history} onClick={() => setHistory(false)}>One bill</button>
      <button type="button" aria-pressed={history} onClick={() => setHistory(true)}>With history</button>
    </div>
    <div className={styles.amount}><span>Current-period charges</span><strong>$90.40 <small>CAD</small></strong><span>September 1–30 · Includes $10.40 HST</span></div>
    {history ? <><div className={styles.chartHeader}><strong>Your bill history</strong><span>Monthly charges · CAD</span></div>
      <div className={styles.chart} role="img" aria-label="Example monthly charges including tax: April, May and June $79.10; July, August and September $90.40.">
        {[["Apr",79.1],["May",79.1],["Jun",79.1],["Jul",90.4],["Aug",90.4],["Sep",90.4]].map(([month, amount]) => <div key={month}><span style={{ height: `${Number(amount) * 1.12}px` }} /><small>{month}</small></div>)}
      </div><div className={styles.finding}><span className={styles.findingDot} /><div><strong>A discount ended in July</strong><p>In this example, the $10 monthly credit ended. That explains the $11.30 increase after tax.</p></div></div></>
      : <><div className={styles.chargeRow}><span>Internet service</span><strong>$80.00</strong></div><div className={styles.chargeRow}><span>HST</span><strong>$10.40</strong></div><div className={styles.finding}><FileText size={20} /><div><strong>Your charges, explained</strong><p>One statement gives you a breakdown. Add an earlier bill to see what changed.</p></div></div></>}
    <p className={styles.exampleNote}>Illustrative data, not a customer account or an assessment of this provider.</p>
  </div>;
}
function SharingDemo() {
  return <div className={styles.sharingDemo}><div className={styles.demoTop}><strong>Our place</strong><span className={styles.tag}>Shared expenses</span></div>
    <div className={styles.receipt}><div className={styles.receiptTitle}><FileText size={22}/><span>Household shop</span></div><strong>$126.00</strong><p>Paid by Maya · Split equally</p><div className={styles.receiptLine}/>{[["M","Maya","Paid $126"],["A","Alex","Owes Maya $42"],["J","Jordan","Owes Maya $42"]].map(([initial,name,amount])=><div className={styles.personRow} key={name}><span className={styles.avatar}>{initial}</span><span>{name}</span><strong>{amount}</strong></div>)}</div>
    <div className={styles.finding}><Check size={20}/><div><strong>Everyone’s share, clear</strong><p>Each person’s share is $42. Record settlements when they happen.</p></div></div>
    <p className={styles.exampleNote}>Illustrative split in CAD. Rezlee records expenses and settlements; it does not move money.</p>
  </div>;
}
function VaultDemo() {
  return <div className={styles.vaultDemo}><div className={styles.demoTop}><strong>Your Vault</strong><span className={styles.tag}>Everything in its place</span></div>
    <div className={styles.paperStack}><div className={styles.paperBehind}/><div className={styles.paper}><Image src="/marketing/providers/canadian-tire.png" alt="Canadian Tire" width={105} height={45}/><span>PURCHASE RECEIPT</span><strong>Ready when<br/>you need it.</strong><i/><i/><i/><div className={styles.paperCheck}><Check size={16}/> Original saved</div></div></div>
    <div className={styles.recordRow}><FileText size={22}/><div><strong>Kitchen appliance receipt</strong><span>Linked to your home item</span></div><ChevronRight size={18}/></div>
    <p className={styles.exampleNote}>Illustrative record. Warranty coverage depends on the original terms.</p>
  </div>;
}
function CareDemo() {
  return <div className={styles.careDemo}><div className={styles.demoTop}><strong>A little care goes a long way</strong><span className={styles.tag}>This week</span></div>
    <div className={styles.calendarArt}><span>OCTOBER</span><strong>01</strong><small>A fresh start.</small></div>
    {[["Check the furnace filter","Maintenance · Thursday",false],["Clean the kitchen","Cleaning routine · Saturday",false],["Save the service receipt","Completed",true]].map(([title,detail,done])=><div className={styles.taskRow} key={String(title)}><span className={done ? styles.taskDone : styles.taskCircle}>{done ? <Check size={16}/> : null}</span><div><strong>{title}</strong><span>{detail}</span></div></div>)}
    <p className={styles.exampleNote}>Example tasks. Choose a schedule that fits your home and equipment.</p>
  </div>;
}
const questions = [
  ["Do I need to connect a utility account?", "No. Upload a statement or enter a bill yourself. One bill can give you a charge breakdown; a history of comparable bills can reveal changes over time. Connections are optional."],
  ["Which providers can I connect?", "Green Button connections are available for supported Ontario utilities. Availability and the data returned vary by provider. Other provider connections are being tested and are offered only where available in the app. If your provider is not listed, you can still upload statements."],
  ["Will Rezlee tell me if I am overpaying?", "Rezlee can explain recorded charges and flag changes supported by your data, such as an expired discount. A higher bill is not automatically an error. Plan comparisons need the right tariff and usage data; any scenarios should be treated as scenarios, not guaranteed savings."],
  ["Can I use it with my partner or roommates?", "Yes. Shared expenses let you record a payer, choose participants, split costs and record settlements. A tracked participant is not automatically a household member. An invitation must be accepted before they receive household access. Rezlee does not process payments."],
  ["What can Ask Rezlee help with?", "Ask Rezlee can help explain available household information, organise next steps and work through home questions. It can make mistakes. Check important details against your documents and use qualified help for hazardous repairs or emergencies."],
  ["Is Rezlee available yet?", "Rezlee is in beta testing on iPhone and Android. Public App Store and Google Play downloads are not available yet. The download section will link to each store once the app is released. Some features and connections may vary during beta."],
];
export function RezleeLanding({ supportEmail, privacyUrl, termsUrl }: { supportEmail?: string; privacyUrl?: string; termsUrl?: string }) {
  const [selected, setSelected] = useState<Feature>("bills");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const feature = features.find(item => item.key === selected)!;
  return <div className={styles.site}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className={styles.header} onKeyDown={event => { if (event.key === "Escape" && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); } }}><Link href="/" aria-label="Rezlee home" className={styles.logo}><Image src="/rezlee-mark.svg" alt="" width={30} height={30}/>rezlee<span>beta</span></Link>
      <nav className={styles.desktopNav} aria-label="Main navigation"><a href="#product">The app</a><a href="#connections">Connections</a><a href="#questions">Good to know</a></nav>
      <div className={styles.headerActions}><div className={styles.storeLinks} aria-label="Get the Rezlee app"><a href="#download-ios" className={styles.storeLink}><span>App Store</span><small>Coming soon</small></a><a href="#download-android" className={styles.storeLink}><span>Google Play</span><small>Coming soon</small></a></div><button ref={menuButton} aria-expanded={menuOpen} aria-controls="mobile-marketing-nav" aria-label={menuOpen ? "Close menu" : "Open menu"} className={styles.menuButton} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen ? <X/> : <Menu/>}</button></div>
      {menuOpen ? <nav id="mobile-marketing-nav" className={styles.mobileNav} aria-label="Mobile navigation">{[["The app","#product"],["Connections","#connections"],["Good to know","#questions"],["Get the app","#download"]].map(([label,href])=><a key={href} href={href} onClick={()=>setMenuOpen(false)}>{label}<ArrowRight size={18}/></a>)}</nav> : null}
    </header>
    <main id="main-content" tabIndex={-1}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}><p className={styles.eyebrow}>YOUR PLACE, UNDER CONTROL.</p><h1>Less home admin.<br/><em>More home.</em></h1><p className={styles.heroDescription}>Understand your bills. Share the costs. Keep the important stuff together. A little more clarity for the place you call home.</p><div className={styles.heroActions}><a href="#product" className={styles.primary}>Meet Rezlee <ArrowDown size={18}/></a><Link href="#download" className={styles.textLink}>Get the app <ArrowRight size={18}/></Link></div><p className={styles.heroFootnote}>For Canadian renters, homeowners and the people they share with.</p></div>
        <div className={styles.heroVisual}><Image src="/marketing/hero-home.png" alt="A sunlit living room with a green sofa and warm natural details" fill priority sizes="(max-width: 760px) 100vw, 50vw" className={styles.heroPhoto}/><div className={styles.heroPhotoShade}/><div className={styles.homeCard}><div className={styles.homeCardHeading}><span className={styles.smallMark}><Image src="/rezlee-mark.svg" alt="" width={22} height={22}/></span><span>Good to be home.</span><span className={styles.liveDot}/></div><div className={styles.homeCardRow}><span className={styles.homeCardIcon}><FileText size={20}/></span><div><strong>Your internet bill changed</strong><span>See what is behind the difference</span></div><ChevronRight size={17}/></div><div className={styles.homeCardRow}><span className={styles.homeCardIcon}><Check size={20}/></span><div><strong>Everyone’s share, clear</strong><span>Household shop · Split three ways</span></div><ChevronRight size={17}/></div><p>Illustrative product preview</p></div></div>
      </section>
      <section className={styles.introStrip} aria-label="A simpler starting point"><span>Start with what you have.</span><p>A bill. A receipt. A reminder.<br/>You do not need to connect an account to get started.</p><a href="#product" aria-label="Explore how Rezlee works"><ArrowDown size={22}/></a></section>
      <section id="product" className={styles.product}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>ONE HOME. A CLEARER PICTURE.</p><h2>Less scattered.<br/>More sorted.</h2><p>Bring the everyday details together, without turning home into another job.</p></div>
        <div className={styles.productTabs} role="tablist" aria-label="Explore Rezlee features">{features.map((item,index)=><button key={item.key} id={`tab-${item.key}`} role="tab" type="button" aria-selected={selected===item.key} aria-controls="feature-panel" tabIndex={selected===item.key?0:-1} onClick={()=>setSelected(item.key)} onKeyDown={event=>{let target=index;if(event.key==="ArrowRight")target=(index+1)%features.length;else if(event.key==="ArrowLeft")target=(index+features.length-1)%features.length;else if(event.key==="Home")target=0;else if(event.key==="End")target=features.length-1;else return;event.preventDefault();setSelected(features[target].key);document.getElementById(`tab-${features[target].key}`)?.focus();}}><span>{item.number}</span>{item.label}<ArrowRight size={17}/></button>)}</div>
        <div id="feature-panel" role="tabpanel" aria-labelledby={`tab-${selected}`} className={styles.featurePanel}>
          <div className={styles.featureCopy}><span className={styles.featureNumber}>{feature.number} / REZLEE</span><h3>{feature.title}</h3><p>{feature.description}</p><Link href={feature.href} className={styles.textLink}>{feature.action}<ArrowRight size={18}/></Link><small>Product examples below use illustrative data.</small></div>
          <div className={`${styles.demoSurface} ${styles[selected]}`} key={selected}>{selected==="bills"?<BillDemo/>:selected==="sharing"?<SharingDemo/>:selected==="vault"?<VaultDemo/>:<CareDemo/>}</div>
        </div>
      </section>
      <section id="connections" className={styles.connections}>
        <div className={styles.connectionCopy}><p className={styles.eyebrow}>LESS INPUT. MORE CONTEXT.</p><h2>Your utility data.<br/>On your terms.</h2><p>Connect a supported Ontario utility through Green Button to bring available bills and usage into Rezlee.</p><p className={styles.connectionDetail}>Review the access you grant during authorisation. The information available depends on your utility and connection. No connection? Upload your bills instead.</p><Link href="#download" className={styles.lightButton}>Explore Rezlee <ArrowRight size={18}/></Link><small>Ontario utilities only for this connection option. Wider coverage is being explored.</small></div>
        <div className={styles.connectionArt}><div className={styles.providerLogo}><Image src="/marketing/providers/elexicon.png" alt="Elexicon Energy" width={150} height={56}/></div><div className={styles.connectionPath}><span/><ShieldCheck size={25}/><span/></div><div className={styles.connectionHub}><Image src="/rezlee-mark.svg" alt="" width={37} height={37}/><strong>rezlee</strong><span>Your home, in view</span></div><div className={styles.connectionMeta}><span>Green Button</span><span>Supported Ontario utilities</span></div><p>Provider availability is confirmed in the app. Logos identify providers and do not imply endorsement.</p></div>
      </section>
      <section className={styles.everyday}><div><p className={styles.eyebrow}>BUILT AROUND REAL LIFE</p><h2>For the home you have.<br/>And the life in it.</h2></div><div className={styles.lifeGrid}><article><span>01</span><h3>Renting your first place?</h3><p>Keep the lease handy, split the internet bill and give shared costs a clear home.</p></article><article><span>02</span><h3>Making a home together?</h3><p>Know who paid, keep track of what is coming up, and take less of the admin on alone.</p></article><article><span>03</span><h3>Keeping a house running?</h3><p>Build bill history, organise your records, and stay on top of the little jobs.</p></article></div></section>
      <section className={styles.ask}><div className={styles.askCopy}><p className={styles.eyebrow}>ASK REZLEE</p><h2>A little help.<br/>With your home<br/>in mind.</h2><p>Make sense of a bill. Find a next step for a home problem. Start with a question, and use your available records to add context.</p><Link href="#download" className={styles.textLink}>Meet your home assistant <ArrowRight size={18}/></Link></div><div className={styles.conversation}><div className={styles.conversationHeader}><MessageCircle size={23}/><strong>Ask Rezlee</strong><span>Example</span></div><div className={styles.userBubble}>Why did my internet bill go up?</div><div className={styles.answerBubble}><span className={styles.answerMark}>r</span><div><p>In these example statements, your monthly credit ended in July.</p><div className={styles.answerMath}><span>Credit ended</span><strong>+$10.00</strong><span>Additional HST</span><strong>+$1.30</strong><span>Change in this bill</span><strong>+$11.30</strong></div><p>This explains the increase. It does not, on its own, show a billing error.</p><span className={styles.evidencePill}><FileText size={14}/> Based on two example statements</span></div></div><p className={styles.aiNote}>Illustrative response. AI can make mistakes; check important details against the original.</p></div></section>
      <section className={styles.how} id="how-it-works"><div><p className={styles.eyebrow}>A SMALL START IS STILL A START</p><h2>Make room for<br/>less to remember.</h2></div><ol><li><span>1</span><div><h3>Add something useful</h3><p>Start with a bill, a receipt or a task. No complete home profile required.</p></div></li><li><span>2</span><div><h3>Review the details</h3><p>Check extracted information, correct what needs it and confirm what to save.</p></div></li><li><span>3</span><div><h3>Build from there</h3><p>Return when the next bill arrives, a task comes due or something needs your attention.</p></div></li></ol></section>
      <section id="questions" className={styles.faq}><div><p className={styles.eyebrow}>GOOD TO KNOW</p><h2>A few things<br/>you might ask.</h2></div><div>{questions.map(([question,answer])=><details key={question}><summary>{question}<Plus size={20}/></summary><p>{answer}</p></details>)}</div></section>
      <section id="download" className={styles.closing}><p className={styles.eyebrow}>YOUR PLACE, UNDER CONTROL.</p><h2>Feel more<br/><em>at home.</em></h2><p className={styles.downloadIntro}>Rezlee for iPhone and Android. Currently in beta testing.</p><div className={styles.downloadOptions}>
        <article id="download-ios" className={styles.downloadCard}><Smartphone size={24} aria-hidden="true"/><h3>Rezlee for iPhone</h3><span className={styles.storeStatus}>App Store · Coming soon</span><p>Our iPhone app is being tested through TestFlight. Public downloads will be available here after release.</p></article>
        <article id="download-android" className={styles.downloadCard}><Smartphone size={24} aria-hidden="true"/><h3>Rezlee for Android</h3><span className={styles.storeStatus}>Google Play · Coming soon</span><p>Our Android app is in testing. Public downloads will be available here after release on Google Play.</p></article>
      </div><p>Already invited to the beta? Use your tester installation link.</p></section>
    </main>
    <footer className={styles.footer}><div className={styles.footerTop}><Link href="/" className={styles.footerLogo}>rezlee<span>Your place, under control.</span></Link><nav aria-label="Footer navigation"><a href="#product">The app</a><a href="#connections">Connections</a><a href="#questions">Questions</a><a href="#download">Get the app</a>{supportEmail?<a href={`mailto:${supportEmail}`}>Contact</a>:null}{privacyUrl?<a href={privacyUrl}>Privacy</a>:null}{termsUrl?<a href={termsUrl}>Terms</a>:null}</nav></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} Rezlee</span><span>Made for the everyday details of home.</span></div><p className={styles.footerDisclosure}>Beta availability and features may change. Connections depend on provider support. Examples use illustrative data; no savings are guaranteed. Rezlee does not move money or replace professional advice.</p></footer>
  </div>;
}
