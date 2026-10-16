// Extrahiert aus register.html fuer CSP-Compliance (AUDIT MED/HIGH-4, 2026-10-16)
'use strict';

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('dropZone');
  const input = document.getElementById('fileInput');
  ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag-over'); }));
  ['dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag-over'); }));
  zone.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) processRegQrFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', e => { if (e.target.files[0]) processRegQrFile(e.target.files[0]); });
});

async function processRegQrFile(file) {
  OnyxUI.status('uploadStatus', '🔍 Lese QR aus Bild...');
  try {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(data.data, data.width, data.height);
    if (!code) {
      OnyxUI.status('uploadStatus', '❌ Kein QR-Code im Bild gefunden', 'err');
      return;
    }
    OnyxUI.status('uploadStatus', '⚙️ Wandle in Master-QR um...');
    const result = await Hermes.transformRegToMaster(code.data, null);
    renderResult(result);
  } catch (e) {
    OnyxUI.status('uploadStatus', '❌ ' + e.message, 'err');
  }
}

function renderResult(result) {
  if (!result.ok) {
    OnyxUI.status('uploadStatus', '❌ ' + result.error, 'err');
    return;
  }
  OnyxUI.status('uploadStatus', '✅ Master-QR erfolgreich erzeugt', 'ok');
  document.getElementById('masterSection').style.display = 'block';
  document.getElementById('displayAppId').innerText = result.appId;

  // SYNCHRON Canvas-Rendering mit qrcode-generator Library (Kazuhiko Arase)
  // Diese Lib hat KEIN async rendering - danach ist Canvas 100% fertig
  try {
    renderQRToCanvas(result.masterQrString, document.getElementById('masterCanvas'));
    document.getElementById('dlStatus').innerText = 'QR fertig · ' + result.masterQrString.length + ' Zeichen';
  } catch (e) {
    document.getElementById('dlStatus').innerText = '❌ Rendering-Fehler: ' + e.message;
    alert('QR-Rendering fehlgeschlagen: ' + e.message);
    return;
  }

  document.getElementById('masterSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Synchron Canvas-Rendering mit qrcode-generator.
 * Garantiert dass canvas.toDataURL() danach eine echte PNG liefert.
 */
function renderQRToCanvas(text, canvas) {
  // Automatisch die kleinste type-number waehlen die den Text aufnimmt
  let qr = null;
  for (let typeNum = 4; typeNum <= 40; typeNum++) {
    try {
      qr = qrcode(typeNum, 'M');
      qr.addData(text);
      qr.make();
      break;
    } catch (e) {
      qr = null;
      if (typeNum === 40) throw e;
    }
  }
  if (!qr) throw new Error('QR konnte nicht erzeugt werden (text zu lang)');

  const modules = qr.getModuleCount();
  const cellSize = 6;         // 6 Pixel pro Modul = handliche Groesse
  const margin = 4;           // 4 Module Rand (quiet zone)
  const totalPx = (modules + margin * 2) * cellSize;

  canvas.width = totalPx;
  canvas.height = totalPx;
  const ctx = canvas.getContext('2d');

  // Weisser Hintergrund
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalPx, totalPx);

  // Schwarze Module
  ctx.fillStyle = '#000000';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect((c + margin) * cellSize, (r + margin) * cellSize, cellSize, cellSize);
      }
    }
  }
}

/**
 * Download: 3 Fallback-Strategien
 * 1. Native App-Bruecke (In-App WebView): OnyxVault.saveMasterQR()
 * 2. <a download> Click (normaler Browser)
 * 3. window.open (Letzter Ausweg)
 */
function downloadMasterQR() {
  const canvas = document.getElementById('masterCanvas');
  if (!canvas || !canvas.width) {
    document.getElementById('dlStatus').innerText = '❌ QR noch nicht gerendert';
    return;
  }

  let dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch (e) {
    document.getElementById('dlStatus').innerText = '❌ Canvas-Export fehlgeschlagen';
    return;
  }

  if (!dataUrl || dataUrl.length < 100) {
    document.getElementById('dlStatus').innerText = '❌ Canvas leer';
    return;
  }

  // Weg 1: Native App-Bruecke (In-App WebView)
  if (window.OnyxVault && typeof window.OnyxVault.saveMasterQR === 'function') {
    try {
      const ok = window.OnyxVault.saveMasterQR(dataUrl, 'ONYX_VAULT_MASTER.png');
      if (ok) {
        document.getElementById('dlStatus').innerHTML = '<span style="color:var(--teal)">✅ In Galerie gespeichert</span>';
        return;
      }
      document.getElementById('dlStatus').innerText = 'Native speichern fehlgeschlagen - versuche Browser-Download';
    } catch (e) {
      console.error('native save threw:', e);
    }
  }

  // Weg 2: <a download> Click (normaler Browser)
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'ONYX_VAULT_MASTER.png';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 500);
    document.getElementById('dlStatus').innerHTML = '<span style="color:var(--teal)">✅ Download gestartet (prüfe Downloads-Ordner)</span>';
    return;
  } catch (e) {
    console.error('a.download failed:', e);
  }

  // Weg 3: window.open als Letzter Ausweg
  try {
    window.open(dataUrl, '_blank');
    document.getElementById('dlStatus').innerText = 'Rechtsklick auf Bild → "Bild speichern unter..."';
  } catch (e) {
    document.getElementById('dlStatus').innerText = '❌ Alle Download-Wege fehlgeschlagen: ' + e.message;
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Datei lesen fehlgeschlagen'));
    reader.readAsDataURL(file);
  });
}

// ─── Event handlers (ehemals inline onclick/onchange etc.) ─────
document.getElementById('dropZone').addEventListener('click', function(ev){
  // Klick auf Zone -> File-Input öffnen (aber nicht wenn direkt auf Input geklickt)
  if (ev.target.id !== 'fileInput') document.getElementById('fileInput').click();
});
document.getElementById('auto_handler_1').addEventListener('click', function(ev){ downloadMasterQR(); });
