# decode-uri-component CommonJS compatibility copy

Source: published decode-uri-component@0.5.0 (MIT). Upstream fixes GHSA-vcc3-ghjq-m6fr. Expo SDK57 uses query-string7, which requires a callable CommonJS export; upstream0.5 is ESM. The only source change is `export default function decodeUriComponent` -> `module.exports = function decodeUriComponent`. No decoder algorithm changes.

Upstream index.js SHA256: 9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa
Tarball SHA256: f42d289f996e6c9f0e33d8f31de1fe9a7a077c612dca489cafdb2df4cbb6122f

Remove this compatibility copy after Expo’s supported dependency chain adopts the patched decoder. Do not replace it with the vulnerable0.2 series to silence peer warnings.
