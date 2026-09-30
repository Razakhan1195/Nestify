import { PublicPage } from "@/components/marketing/public-page";
import { ContactForm } from "@/components/marketing/contact-form";
import { waitlistConfig } from "@/lib/waitlist/server";
import styles from "@/components/marketing/public-page.module.css";
export const metadata={title:"Contact Rezlee | Support and enquiries"};
export default function Page(){const c=waitlistConfig();return <PublicPage title="Let’s help you get sorted." intro="A question, a problem or an idea? Get in touch with the Rezlee team."><div className={styles.contactGrid}><aside className={styles.contactAside}><h2>Email us</h2><a href={`mailto:${c.contact}`}>{c.contact}</a><p>For app support, waitlist questions, partnerships and privacy requests.</p><p>Using the beta? Include your phone type, app version and what happened. Never send your password or a verification code.</p><p>For an immediate safety risk, contact emergency services or the relevant utility. This inbox is not an emergency service.</p><details id="mailing"><summary>Rezlee mailing details</summary><p>{c.address}</p></details></aside><ContactForm/></div></PublicPage>}
