// Extrahiert aus tor-gate.html fuer CSP-Compliance (AUDIT MED/HIGH-4, 2026-10-16)
'use strict';

const ONION_HOST = "gkxjozyouiypb2gx5okxekid2mmlxfvzmup7usztsv2pwnr2wnajmoad.onion";
const GITHUB_BASE = "https://supportonyxvault.github.io/onyxvault-website";

const params = location.search;
const onionUrl = "http://" + ONION_HOST + "/savetrigger.html" + params;
const clearnetUrl = GITHUB_BASE + "/savetrigger.html" + params;

document.getElementById('onionUrlText').textContent = onionUrl;
document.getElementById('torLink').href = onionUrl;
document.getElementById('clearnetLink').href = clearnetUrl;
document.getElementById('copyBtn').onclick = () => {
  navigator.clipboard.writeText(onionUrl).then(() => { document.getElementById('copyBtn').textContent = '✅ Kopiert!'; });
};

// Tor Browser Detection
function detectTorBrowser() {
  // Tor Browser setzt bestimmte Markers:
  // 1. navigator.userAgent enthaelt oft "Firefox" (TBB basiert auf FF)
  // 2. screen.width/height sind oft gerundet (letterbox: 1000x1000 etc.)
  // 3. navigator.plugins ist leer
  // 4. canvas fingerprint ist eingeschraenkt
  const ua = navigator.userAgent;
  const isFirefox = ua.includes('Firefox');
  const screenRound = (screen.width % 100 === 0) && (screen.height % 100 === 0);
  const noPlugins = navigator.plugins.length === 0;
  const isMobile = /Android|iPhone|iPad/.test(ua);

  // Wenn Firefox + runde Bildschirmgroesse + keine Plugins = sehr wahrscheinlich Tor Browser
  if (isFirefox && screenRound && noPlugins && !isMobile) return true;

  // Alternativer check: location.hostname war schon .onion
  if (location.hostname.endsWith('.onion')) return true;

  return false;
}

// Falls auf .onion-Seite -> direkt weiter zur savetrigger
if (location.hostname.endsWith('.onion')) {
  location.href = '/savetrigger.html' + params;
} else {
  // Pruefen ob Tor Browser
  setTimeout(() => {
    document.getElementById('checking').style.display = 'none';
    if (detectTorBrowser()) {
      document.getElementById('hasTor').style.display = 'block';
      setTimeout(() => { location.href = onionUrl; }, 2500);
    } else {
      document.getElementById('noTor').style.display = 'block';
    }
  }, 800);
}

// ─── Event handlers (ehemals inline onclick/onchange etc.) ─────
