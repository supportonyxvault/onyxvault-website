// ONYX VAULT SaveCard Generator - extrahiert aus savecard.html (AUDIT MED/HIGH-4: CSP ohne unsafe-inline)
'use strict';

let masterPayload = null;

function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }

async function processMasterFile(file) {
  if (!file) return;
  const status = document.getElementById('uploadStatus');
  status.textContent = '⏳ QR wird dekodiert...';
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, cv.width, cv.height);
    let code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' });
    if (!code) code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
    if (!code) throw new Error('Kein QR-Code im Bild gefunden. Bitte schaerferes Foto oder PNG-Export aus der App nutzen.');
    masterPayload = code.data;
    status.innerHTML = '<span style="color:#5eead4">✅ Master-QR erfolgreich dekodiert (' + code.data.length + ' Zeichen)</span>';
    document.getElementById('modeCard').style.display = 'block';
  } catch (err) {
    status.innerHTML = '<span style="color:#ef4444">❌ ' + err.message + '</span>';
  }
}

// --- Drag & Drop + change wiring für Master-QR ---
(function(){
  const zone  = document.getElementById('dropZoneMaster');
  const input = document.getElementById('masterQrFile');
  if (!zone || !input) return;
  zone.addEventListener('click', ev => { if (ev.target !== input) input.click(); });
  zone.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') input.click(); });
  ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag-over'); }));
  ['dragleave','drop' ].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag-over'); }));
  zone.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) processMasterFile(f); });
  input.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) processMasterFile(f); });
})();

document.getElementById('generateBtn').addEventListener('click', async () => {
  const btn = document.getElementById('generateBtn');
  btn.disabled = true; btn.textContent = '⏳ Generiere...';
  const gen = document.getElementById('genStatus');
  gen.textContent = 'Erzeuge Token + Verschluesselung...';
  document.getElementById('resultCard').style.display = 'block';

  try {
    const tokenBuf = crypto.getRandomValues(new Uint8Array(16));
    const tokenHex = Array.from(tokenBuf).map(b => b.toString(16).padStart(2, '0')).join('');
    const keyBuf = await crypto.subtle.digest('SHA-256', tokenBuf);
    const key = await crypto.subtle.importKey('raw', keyBuf, 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payloadBuf = new TextEncoder().encode(masterPayload);
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, payloadBuf);
    const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuf), iv.length);
    const cB64 = b64(combined);

    // AUDIT HIGH-3: Token in URL-HASH statt Query - leakt nicht in Server-Logs/Referer
    const landingBase = window.location.origin + window.location.pathname.replace('savecard.html', '') + 'savetrigger.html';
    const qr1Text = landingBase + '#t=' + tokenHex;
    const qr2Text = cB64;

    const qr1Cv = document.getElementById('qr1Canvas');
    const qr2Cv = document.getElementById('qr2Canvas');
    const qr1Gen = qrcode(0, 'M'); qr1Gen.addData(qr1Text); qr1Gen.make();
    const qr2Gen = qrcode(0, 'L'); qr2Gen.addData(qr2Text); qr2Gen.make();

    function drawQR(qr, canvas, size) {
      canvas.width = size; canvas.height = size;
      const cx = canvas.getContext('2d');
      const cells = qr.getModuleCount();
      const cell = size / cells;
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size);
      cx.fillStyle = '#000';
      for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++)
        if (qr.isDark(r, c)) cx.fillRect(Math.round(c * cell), Math.round(r * cell), Math.ceil(cell), Math.ceil(cell));
    }
    drawQR(qr1Gen, qr1Cv, 500);
    drawQR(qr2Gen, qr2Cv, 800);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [180, 120] });

    pdf.setFillColor(10, 20, 25); pdf.rect(0, 0, 90, 120, 'F');
    pdf.setTextColor(94, 234, 212); pdf.setFontSize(14); pdf.setFont(undefined, 'bold');
    pdf.text('ONYX VAULT', 45, 12, { align: 'center' });
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(9);
    pdf.text('SaveCard . Notfall', 45, 18, { align: 'center' });
    pdf.addImage(qr1Cv.toDataURL('image/png'), 'PNG', 15, 25, 60, 60);
    pdf.setFontSize(7); pdf.setTextColor(200, 200, 200);
    pdf.text('1. SCAN mit Phone-Kamera', 45, 93, { align: 'center' });
    pdf.text('Oeffnet die Trigger-Seite', 45, 98, { align: 'center' });
    pdf.setFontSize(6); pdf.setTextColor(239, 68, 68);
    pdf.text('NUR IM NOTFALL VERWENDEN', 45, 110, { align: 'center' });
    pdf.text('Nach Scan: Karte umdrehen', 45, 114, { align: 'center' });

    pdf.setFillColor(10, 20, 25); pdf.rect(90, 0, 90, 120, 'F');
    pdf.setTextColor(94, 234, 212); pdf.setFontSize(10); pdf.setFont(undefined, 'bold');
    pdf.text('RUECKSEITE', 135, 12, { align: 'center' });
    pdf.addImage(qr2Cv.toDataURL('image/png'), 'PNG', 105, 25, 60, 60);
    pdf.setFontSize(7); pdf.setTextColor(200, 200, 200);
    pdf.text('2. SCAN mit Trigger-Seite', 135, 93, { align: 'center' });
    pdf.text('Loest Killswitch automatisch aus', 135, 98, { align: 'center' });
    pdf.setFontSize(5); pdf.setTextColor(150, 150, 150);
    pdf.text('Token-ID: ' + tokenHex.substring(0, 8) + '...', 135, 114, { align: 'center' });

    gen.innerHTML = '<span style="color:#5eead4">✅ SaveCard erzeugt!</span>';
    document.getElementById('pdfReady').style.display = 'block';

    const isOnion = window.location.hostname.endsWith('.onion');
    const envTag = isOnion ? 'TOR' : 'GITHUB';

    document.getElementById('downloadBtn').addEventListener('click', () => {
      pdf.save('ONYX_SaveCard_' + envTag + '_' + tokenHex.substring(0, 8) + '.pdf');
    });
    btn.textContent = '🖨️ Neue Karte generieren';
    btn.disabled = false;
  } catch (err) {
    gen.innerHTML = '<span style="color:#ef4444">❌ ' + err.message + '</span>';
    btn.disabled = false; btn.textContent = '🖨️ SaveCard PDF generieren';
  }
});
