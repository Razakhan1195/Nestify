"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import styles from "./product-film.module.css";

type Feature = "bills" | "sharing" | "vault" | "care";
const demos: Record<Feature, { title: string; steps: string[] }> = {
  bills: { title: "Understand your bills", steps: ["See current-period charges and the recorded breakdown.", "Explore twelve saved billing periods, with daily averages for different billing lengths.", "Compare recorded charges and usage. A lower bill is not a verified saving caused by Rezlee."] },
  sharing: { title: "See how shared expenses work", steps: ["A sample $100 grocery expense is paid by one person and shared equally with Sarah.", "The saved expense records a $50 share for each person.", "The balance shows Sarah owes the payer $50. This records an obligation; no money moves."] },
  vault: { title: "Keep important records together", steps: ["Browse original statement records in the sample household’s Vault.", "Each record keeps its provider, period and attachment together. This clip shows the saved records list."] },
  care: { title: "Build your cleaning routine", steps: ["Choose a routine and review its tasks and schedule.", "Save it, then see the next tasks and due dates in Care."] },
};

export function ProductFilm({ feature }: { feature: Feature }) {
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const demo = demos[feature];
  useEffect(() => {
    const player = video.current;
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) player?.pause(); }, { threshold: 0.15 });
    if (root.current) observer.observe(root.current);
    const hide = () => { if (document.hidden) player?.pause(); };
    document.addEventListener("visibilitychange", hide);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", hide); player?.pause(); };
  }, []);
  const toggle = async () => {
    const player = video.current;
    if (!player) return;
    if (!player.paused) { player.pause(); return; }
    if (failed) { player.load(); setFailed(false); }
    if (ended) player.currentTime = 0;
    setWaiting(true);
    try { await player.play(); } catch { setWaiting(false); setFailed(true); }
  };
  return <div ref={root} className={`${styles.film} ${styles[feature]}`} data-demo-feature={feature}>
    <div className={styles.stage}>
      <div className={styles.phone} aria-label="iPhone frame">
        <div className={styles.screen}>
          <div className={styles.topChrome} aria-hidden="true"><span /></div>
          <video ref={video} className={styles.video} src={`/marketing/demos/${feature}.mp4`} poster={`/marketing/demos/${feature}.webp`} preload="none" muted playsInline aria-label={`${demo.title}. Actual beta app using sample data.`} aria-describedby={`demo-transcript-${feature}`} onPlay={() => { setPlaying(true); setEnded(false); setFailed(false); }} onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)} onWaiting={() => setWaiting(true)} onPause={() => { setPlaying(false); setWaiting(false); }} onEnded={() => { setEnded(true); setPlaying(false); }} onError={() => { setFailed(true); setWaiting(false); setPlaying(false); }} />
          <div className={styles.bottomChrome} aria-hidden="true"><span /></div>
        </div>
      </div>
    </div>
    <div className={styles.controls}>
      <button type="button" onClick={toggle} aria-label={`${playing ? "Pause" : ended ? "Replay" : failed ? "Retry" : "Play"}: ${demo.title}`}>
        {playing ? <Pause size={16} /> : ended || failed ? <RotateCcw size={16} /> : <Play size={16} />}
        {playing ? "Pause demo" : failed ? "Try again" : ended ? "Replay demo" : "Watch demo"}
      </button>
      <span role="status">{waiting ? "Loading video…" : "Actual app · Sample data · Beta"}</span>
    </div>
    {failed ? <p className={styles.error} role="alert">The video could not load. Check your connection and try again. You can still read the walkthrough below.</p> : null}
    <details className={styles.transcript}><summary>Read the walkthrough</summary><ol id={`demo-transcript-${feature}`}>{demo.steps.map(step => <li key={step}>{step}</li>)}</ol></details>
  </div>;
}
