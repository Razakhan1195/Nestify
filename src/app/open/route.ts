export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const roadmap = new URL(request.url).searchParams.get("screen") === "roadmap";
  const href = roadmap ? "rezlee://roadmap" : "rezlee://";
  // No credentials, arbitrary destinations or account information in email links.
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open Rezlee</title></head>
<body style="margin:0;background:#F8F7F3;color:#202D28;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"><main style="max-width:440px;margin:8vh auto;padding:32px 24px;">
<div style="font-size:30px;font-weight:600;letter-spacing:-1px;color:#264D3E;margin-bottom:36px;">rezlee</div>
<h1 style="font-size:30px;line-height:1.2;letter-spacing:-.5px;">Your place, under control.</h1>
<p style="font-size:17px;line-height:1.6;color:#58665F;">${roadmap ? "Share ideas, vote and follow our roadmap in the Rezlee mobile app." : "Your account, bills, records and household live in the Rezlee mobile app."}</p>
<a href="${href}" style="display:inline-block;padding:16px 24px;border-radius:12px;background:#264D3E;color:#FAF7EF;text-decoration:none;font-weight:600;">Open Rezlee</a>
<p style="font-size:15px;line-height:1.6;color:#58665F;margin-top:28px;">Already have the app open? Switch back to Rezlee to continue.</p>
<p style="font-size:15px;line-height:1.6;color:#58665F;">On a computer? Continue on your phone. If you haven’t installed Rezlee, use your testing invitation, then open this link again.</p>
</main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } });
}
