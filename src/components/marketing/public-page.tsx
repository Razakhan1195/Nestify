import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import styles from "./public-page.module.css";
export function PublicPage({title, intro, children}: {title:string;intro:string;children:ReactNode}) {
 return <div className={styles.page}><header className={styles.header}><Link href="/" className={styles.brand}><Image src="/rezlee-mark.svg" width={28} height={28} alt=""/>rezlee</Link><Link href="/#waitlist" className={styles.cta}>Join waitlist</Link></header><main className={styles.main}><Link href="/" className={styles.back}>← Back to Rezlee</Link><h1>{title}</h1><p className={styles.intro}>{intro}</p><div className={styles.content}>{children}</div></main><footer className={styles.footer}><nav aria-label="Support and legal"><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/disclosures">Disclosures</Link><Link href="/delete-account">Account deletion</Link><Link href="/waitlist/terms">Founding offer</Link></nav><p>Rezlee · Your place, under control.</p></footer></div>;
}
