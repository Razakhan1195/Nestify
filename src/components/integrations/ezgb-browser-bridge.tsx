"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  ezgbBrowserMarker,
} from "../../../apps/mobile/src/lib/ezgb-browser-contract";

import { readEzgbBrowserReturn, saveEzgbBrowserMarker } from "@/lib/ezgb/browser-storage";

function browserStorage() {
  try { return window.sessionStorage; } catch { return null; }
}

export function EzgbBrowserStart() {
  const initialized = useRef(false);
  const warning = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const marker = ezgbBrowserMarker(window.location.hash);
    try {
      if (!saveEzgbBrowserMarker(marker, browserStorage(), document) && warning.current) warning.current.hidden = false;
    } catch {
      if (marker && warning.current) warning.current.hidden = false;
    }
    if (marker) history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  return <p ref={warning} hidden role="alert" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
    This browser couldn’t save the return to Rezlee. Close this connection and try again in your usual browser.
  </p>;
}

const subscribe = () => () => {};
function storedReturn(outcome: "success" | "error") {
  try { return readEzgbBrowserReturn(browserStorage(), document, outcome); }
  catch { return null; }
}

export function EzgbBrowserReturn({ outcome }: { outcome: "success" | "error" }) {
  const href = useSyncExternalStore(subscribe, () => storedReturn(outcome), () => null);
  const returned = useRef(false);
  useEffect(() => {
    if (returned.current) return;
    if (href) {
      returned.current = true;
      window.location.assign(href);
    } else {
      const host = window as Window & { ReactNativeWebView?: { postMessage(message: string): void } };
      host.ReactNativeWebView?.postMessage(JSON.stringify({ type: outcome === "success" ? "ezgb_authorized" : "ezgb_error" }));
    }
  }, [href, outcome]);
  return <div className="space-y-3 text-center">
    {href ? <a href={href} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#244A3A] px-6 py-3 font-semibold text-white">
      Return to Rezlee
    </a> : null}
    <p className="text-sm leading-6 text-[#657068]">
      {href ? "If Rezlee doesn’t reopen automatically, tap above." : "Return to the Rezlee app. Choose your utility and use Check connection if you already approved sharing."}
    </p>
  </div>;
}
