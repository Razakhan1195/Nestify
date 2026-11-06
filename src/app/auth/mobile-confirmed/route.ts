// Fixed mobile handoff. Never forward auth tokens or user-supplied destinations.
export function GET() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Continue in Rezlee</title><style>
  *{box-sizing:border-box}body{margin:0;background:#F8F7F3;color:#202D27;font-family:system-ui,-apple-system,sans-serif;min-height:100svh;display:grid;place-items:center;padding:28px}main{width:100%;max-width:400px}img{width:56px;height:56px;object-fit:contain;margin-bottom:24px}h1{font-size:30px;line-height:1.15;letter-spacing:-.7px}p{font-size:17px;line-height:1.55;color:#59675F}a{display:block;text-align:center;background:#244E40;color:white;text-decoration:none;padding:16px 24px;border-radius:16px;font-weight:600;margin-top:28px}small{display:block;color:#59675F;line-height:1.5;margin-top:20px}a:focus-visible{outline:3px solid #709F87;outline-offset:4px}
  </style></head><body><main><img src="/rezlee-mark.svg" alt="Rezlee"><h1 id="title">Continue in Rezlee</h1><p id="message">Return to the app and sign in with the email and password you used to create your account.</p><a href="rezlee://login">Open Rezlee</a><small>If the app doesn’t open, open Rezlee from your phone’s Home Screen. On a computer? Continue on your phone.</small></main><script>
  (function(){
    var query=new URLSearchParams(location.search), fragment=new URLSearchParams(location.hash.slice(1));
    var failed=query.has('error')||query.has('error_code')||fragment.has('error')||fragment.has('error_code');
    // Discard implicit auth tokens immediately. Login stays inside the installed app.
    history.replaceState(null,'','/auth/mobile-confirmed');
    if(failed){document.getElementById('title').textContent='This link couldn’t be used';document.getElementById('message').textContent='Open Rezlee to sign in. If your email still needs confirmation, request a new confirmation email there.';return;}
    if(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)){location.replace('rezlee://login');}
  })();
  </script></body></html>`, {headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
}
