// ONYX VAULT SaveTrigger - AUDIT-FIXES 2026-10-16:
//   HIGH-3:   Token aus URL-Hash (#t=) statt Query (?t=) -> leakt nicht in Server-Logs/Referer
//             window.history.replaceState() direkt nach Lesen entfernt Token aus URL
//   MED/HIGH-4: Inline-Scripts raus (CSP ohne unsafe-inline), lokale pdf.js (vendor/)
//   MED-5:    Signatur wird in Hermes.sendKillCommand gesetzt (BIP-340 Schnorr),
//             App verifiziert server-received Events selbst (KillCommandListener.kt)
'use strict';

// pdf.js Worker-Pfad auf lokale Vendor-Datei
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

const IS_ONION = location.hostname.endsWith('.onion');

// Oracle Health Check: zeige Fallback-Banner auf .onion wenn Server down
if (IS_ONION) {
  fetch(location.origin + '/relay-health', { signal: AbortSignal.timeout(5000) })
    .then(r => r.json()).then(d => {
      if (!d.ok) throw new Error('relay-health down');
    }).catch(() => {
      const banner = document.createElement('div');
      banner.className = 'fallback-banner';
      banner.innerHTML = '⚠️ Oracle Relay-Server nicht erreichbar! Nutze stattdessen die GitHub-Fallback-Seite: ' +
        '<a href="https://supportonyxvault.github.io/onyxvault-website/savetrigger.html' + location.hash +
        '">HIER KLICKEN</a>';
      document.querySelector('.container').insertBefore(banner, document.querySelector('.hero'));
    });
}

let masterPayload = null;
let decryptedEvent = null;

function base64ToUint8(b64) {
  const clean = b64.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(clean), c => c.charCodeAt(0));
}
function hexToUint8(hex) {
  const o = new Uint8Array(hex.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(hex.substr(i * 2, 2), 16);
  return o;
}

async function deriveKeyFromToken(tokenHex) {
  const tokenBuf = hexToUint8(tokenHex);
  const hash = await crypto.subtle.digest('SHA-256', tokenBuf);
  return crypto.subtle.importKey('raw', new Uint8Array(hash), 'AES-GCM', false, ['decrypt']);
}

async function decryptCipher(cipherB64, key) {
  const combined = base64ToUint8(cipherB64);
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
  return new TextDecoder().decode(plain);
}

// ──────────────────────────────────────────────────────────────────
// AUDIT HIGH-3: Token aus URL-HASH, NICHT aus Query. Danach replaceState.
// ──────────────────────────────────────────────────────────────────
// URL-Hash (#t=TOKEN) wird NIE an Server gesendet, taucht nicht in
// nginx access_logs oder Referer-Headers auf. Query (?t=TOKEN) landet
// ueberall. Nach dem Lesen entfernen wir den Hash sofort aus der URL
// damit er auch nicht in Browser-History bleibt.
let token = null;
const hashParams = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : location.hash);
token = hashParams.get('t');

// Backward-compat: alte SaveCards hatten ?t= in Query, akzeptiere das
// einmalig und migriere direkt in den Hash + replaceState
if (!token) {
  const qp = new URLSearchParams(location.search);
  token = qp.get('t');
}

// Token sofort aus URL entfernen (replaceState kein History-Entry)
try {
  if (token) {
    window.history.replaceState({}, document.title, location.pathname);
  }
} catch (e) { /* ignore */ }

if (!token || token.length !== 32) {
  document.getElementById('statusMsg').innerHTML = '<span class="err">❌ Kein Token in URL. Diese Seite nur über SaveCard-QR öffnen.</span>';
} else {
  document.getElementById('statusMsg').textContent = '✅ Token erkannt. Jetzt Rückseite der Karte scannen.';
  document.getElementById('scanCard').style.display = 'block';
  startCamera();
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const vid = document.getElementById('camVideo');
    vid.srcObject = stream;
    scanLoop(vid);
  } catch (e) {
    document.getElementById('scanStatus').textContent = 'Kamera nicht verfügbar — bitte Foto hochladen.';
  }
}

function scanLoop(vid) {
  const cv = document.createElement('canvas');
  const tick = () => {
    if (vid.readyState === vid.HAVE_ENOUGH_DATA) {
      cv.width = vid.videoWidth; cv.height = vid.videoHeight;
      cv.getContext('2d').drawImage(vid, 0, 0, cv.width, cv.height);
      const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
      const code = jsQR(data.data, data.width, data.height);
      if (code) {
        handleQR2(code.data);
        return;
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
}

async function processTriggerFile(file) {
  if (!file) return;
  const status = document.getElementById('scanStatus');
  status.textContent = '⏳ Lese Datei...';
  try {
    let canvasList = [];
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      status.textContent = '⏳ Lade PDF...';
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 3.0 });
        const cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        canvasList.push(cv);
        // Zusaetzliche Crops: linke + rechte Haelfte sowie 4 Quadranten
        // damit jsQR auch dichte oder randstaendige QRs findet
        const hw = Math.floor(vp.width / 2);
        const hh = Math.floor(vp.height / 2);
        const makeCrop = (sx, sy, sw, sh) => {
          const c = document.createElement('canvas');
          c.width = sw; c.height = sh;
          c.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
          return c;
        };
        canvasList.push(makeCrop(0,  0,  hw, vp.height));          // linke Haelfte (voll)
        canvasList.push(makeCrop(hw, 0,  hw, vp.height));          // rechte Haelfte (voll)
        canvasList.push(makeCrop(0,  0,  hw, hh));                 // Quadrant oben-links
        canvasList.push(makeCrop(hw, 0,  hw, hh));                 // Quadrant oben-rechts
        canvasList.push(makeCrop(0,  hh, hw, hh));                 // Quadrant unten-links
        canvasList.push(makeCrop(hw, hh, hw, hh));                 // Quadrant unten-rechts
      }
    } else {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
      canvasList.push(cv);
    }
    status.textContent = '⏳ Scanne ' + canvasList.length + ' Bereiche...';
    let foundQR = null;
    for (const cv of canvasList) {
      const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
      for (const opts of [{}, { inversionAttempts: 'attemptBoth' }, { inversionAttempts: 'onlyInvert' }]) {
        const code = jsQR(data.data, data.width, data.height, opts);
        if (code && code.data && !code.data.startsWith('http') && code.data.length > 20) {
          foundQR = code.data; break;
        }
      }
      if (foundQR) break;
    }
    if (foundQR) { handleQR2(foundQR); }
    else { status.innerHTML = '<span class="err">❌ Kein QR2 (verschluesselter Code) in Datei gefunden.</span>'; }
  } catch (err) { status.innerHTML = '<span class="err">❌ Fehler: ' + err.message + '</span>'; }
}

// --- Drag & Drop + change wiring für Trigger-Upload ---
(function(){
  const zone  = document.getElementById('dropZoneQr');
  const input = document.getElementById('qrFile');
  if (!zone || !input) return;
  zone.addEventListener('click', ev => { if (ev.target !== input) input.click(); });
  zone.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') input.click(); });
  ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag-over'); }));
  ['dragleave','drop' ].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag-over'); }));
  zone.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) processTriggerFile(f); });
  input.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) processTriggerFile(f); });
})();

async function handleQR2(cipher) {
  try {
    document.getElementById('scanStatus').textContent = '⏳ Entschlüssele...';
    try { document.getElementById('camVideo').srcObject.getTracks().forEach(t => t.stop()); } catch (e) {}
    const key = await deriveKeyFromToken(token);
    const plain = await decryptCipher(cipher, key);
    masterPayload = plain;
    document.getElementById('scanCard').style.display = 'none';
    document.getElementById('actionCard').style.display = 'block';
    decryptedEvent = plain;
  } catch (e) {
    document.getElementById('scanStatus').innerHTML = '<span class="err">❌ Entschlüsselung fehlgeschlagen: ' + e.message + '</span>';
  }
}

document.getElementById('triggerBtn').addEventListener('click', async () => {
  const btn = document.getElementById('triggerBtn');
  const stat = document.getElementById('triggerStatus');
  btn.disabled = true; btn.textContent = '⏳ Signiere + Sende...';
  stat.textContent = 'Lade Master-Payload in Hermes...';
  try {
    if (!window.Hermes || !Hermes.saveIdentity || !Hermes.sendKillCommand) {
      throw new Error('hermes.js nicht geladen - Seite neu laden');
    }
    const idRes = await Hermes.saveIdentity(decryptedEvent);
    if (!idRes.ok) {
      throw new Error('Master-QR Fehler: ' + (idRes.error || 'unbekannt'));
    }
    stat.textContent = '✅ Identitaet geladen (' + idRes.appId + '). Signiere Kill-Event...';
    const killRes = await Hermes.sendKillCommand();
    if (killRes.ok) {
      stat.innerHTML = '<span class="ok">✅ KILL-SIGNAL GESENDET an ' + killRes.relaysReached + '/' + killRes.relaysTotal + ' Nostr-Relays!</span><br>' +
        '<span class="meta">Event-ID: ' + killRes.eventId.substring(0, 16) + '...</span><br>' +
        '<span class="meta">Das Handy der Zielperson wird bei naechster Online-Verbindung geloescht.</span>';
      btn.textContent = '✅ Gesendet';
    } else {
      throw new Error('Nostr-Versand fehlgeschlagen: ' + (killRes.error || 'unbekannt'));
    }
  } catch (e) {
    stat.innerHTML = '<span class="err">❌ ' + e.message + '</span>';
    btn.disabled = false; btn.textContent = '💀 JETZT KILLSWITCH AUSLÖSEN';
  }
});
