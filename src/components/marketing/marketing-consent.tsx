"use client";

import { useEffect, useState } from "react";
import { isPixelPage, loadTikTokPixel, readMarketingConsent, saveMarketingConsent } from "@/lib/tiktok-pixel";
import styles from "./marketing-consent.module.css";

export function MarketingConsent() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const showSettings = () => {
      if (window.location.hash === "#privacy-settings") setOpen(true);
    };
    const frame = requestAnimationFrame(() => {
      if (isPixelPage(new URL(window.location.href))) {
        setOpen(readMarketingConsent() === null);
        loadTikTokPixel();
      }
      showSettings();
    });
    const changed = (event: StorageEvent) => {
      if (event.key === "rezlee-marketing-consent-v1" && window.ttq) window.location.reload();
    };
    window.addEventListener("hashchange", showSettings);
    window.addEventListener("storage", changed);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", showSettings);
      window.removeEventListener("storage", changed);
    };
  }, []);

  function choose(value: "accepted" | "declined") {
    if (window.location.hash === "#privacy-settings") {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    saveMarketingConsent(value);
    setOpen(false);
  }

  return <>
    <button type="button" className={styles.settings} onClick={() => setOpen(true)}>Cookie settings</button>
    {open ? <section className={styles.banner} aria-label="Marketing cookie choices">
      <h2>A choice about cookies</h2>
      <p>With your permission, we use TikTok to measure our ads and match visits and waitlist signups to TikTok accounts. You can join either way. <a href="/privacy">Privacy details</a></p>
      <div className={styles.actions}>
        <button type="button" onClick={() => choose("declined")}>Decline</button>
        <button type="button" onClick={() => choose("accepted")}>Accept marketing cookies</button>
      </div>
    </section> : null}
  </>;
}
