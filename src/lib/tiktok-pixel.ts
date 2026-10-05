"use client";

export const TIKTOK_PIXEL_ID = "DB1FAO3C77U1PLPL6HHG";
const CONSENT_KEY = "rezlee-marketing-consent-v1";
const REGISTRATION_KEY = "rezlee-tiktok-registration-v1";
export type MarketingConsent = "accepted" | "declined" | null;

declare global {
  interface Window {
    ttq?: {
      track: (event: string) => void;
      revokeConsent: () => void;
      disableCookie: () => void;
    };
  }
}

export function isPixelPage(url: URL): boolean {
  return ["rezlee.com", "www.rezlee.com"].includes(url.hostname) &&
    url.pathname === "/" &&
    [...url.searchParams.keys()].every(key => /^(utm_(source|medium|campaign|term|content|id)|ttclid)$/.test(key));
}

let currentConsent: MarketingConsent = null;
export function readMarketingConsent(): MarketingConsent {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    currentConsent = value === "accepted" || value === "declined" ? value : null;
  } catch { /* Storage can be disabled; consent still works for this page. */ }
  return currentConsent;
}

// TikTok's supplied bootstrap, loaded only after a marketing opt-in.
export const TIKTOK_BASE_CODE = `!function(w,d,t){
w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};
n=d.createElement("script");n.type="text/javascript";n.async=!0;n.src=r+"?sdkid="+e+"&lib="+t;
e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
ttq.load("DB1FAO3C77U1PLPL6HHG");ttq.grantConsent();ttq.page();
}(window,document,"ttq");`;

export function loadTikTokPixel(): void {
  if (readMarketingConsent() !== "accepted" || !isPixelPage(new URL(window.location.href)) ||
      document.getElementById("rezlee-tiktok-pixel")) return;
  const script = document.createElement("script");
  script.id = "rezlee-tiktok-pixel";
  script.textContent = TIKTOK_BASE_CODE;
  document.head.appendChild(script);
}

export function saveMarketingConsent(value: Exclude<MarketingConsent, null>): void {
  currentConsent = value;
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* Optional storage. */ }
  if (value === "accepted") {
    loadTikTokPixel();
  } else if (window.ttq) {
    window.ttq.revokeConsent();
    window.ttq.disableCookie();
    for (const name of ["_ttp", "ttcsid", "ttcsid_" + TIKTOK_PIXEL_ID]) {
      for (const domain of ["", "; Domain=rezlee.com", "; Domain=.rezlee.com"]) {
        document.cookie = name + "=; Max-Age=0; Path=/" + domain + "; Secure; SameSite=Lax";
      }
    }
    // A fresh document also removes SDK observers after consent is withdrawn.
    window.location.reload();
  }
}

let registrationTracked = false;
export function trackWaitlistRegistration(): void {
  // Analytics must never turn a successful signup into an error.
  try {
    if (readMarketingConsent() !== "accepted" || !isPixelPage(new URL(window.location.href)) ||
        !window.ttq || registrationTracked) return;
    try { if (sessionStorage.getItem(REGISTRATION_KEY)) return; } catch { /* Optional storage. */ }
    window.ttq.track("CompleteRegistration");
    registrationTracked = true;
    try { sessionStorage.setItem(REGISTRATION_KEY, "1"); } catch { /* Optional storage. */ }
  } catch { /* Ad blockers and SDK failures must not affect the waitlist. */ }
}
