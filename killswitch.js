// Extrahiert aus killswitch.html fuer CSP-Compliance (AUDIT MED/HIGH-4, 2026-10-16)
'use strict';

const fileInput = document.getElementById('fileInput');
const dropZone  = document.getElementById('dropZone');

['dragover','dragenter'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.style.borderColor = 'var(--red)'; }));
['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.style.borderColor = ''; }));
dropZone.addEventListener('drop', e => { if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', e => { if (e.target.files.length) processFile(e.target.files[0]); });

async function processFile(file) {
  OnyxUI.status('uploadStatus', '📂 Lese ' + file.name + '...', 'info');
  const img = new Image();
  img.onload = async () => {
    OnyxUI.status('uploadStatus', '📐 Scanne QR-Code...', 'info');
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imgData.data, imgData.width, imgData.height);
    if (!code) {
      OnyxUI.status('uploadStatus', '❌ Kein QR-Code im Bild erkannt.', 'err');
      alert('Kein QR-Code im Bild erkannt.');
      return;
    }
    OnyxUI.status('uploadStatus', '🔑 Prüfe Master-QR...', 'info');
    const res = await Hermes.saveIdentity(code.data);
    if (res.ok) {
      OnyxUI.status('uploadStatus', '✅ Tresor identifiziert — bereit zum Senden', 'ok');
      document.getElementById('displayAppId').textContent = res.appId;
      document.getElementById('killSection').style.display = 'block';
    } else {
      OnyxUI.status('uploadStatus', '❌ ' + res.error, 'err');
      alert('Fehler: ' + res.error);
    }
  };
  img.onerror = () => { OnyxUI.status('uploadStatus', '❌ Bild konnte nicht geladen werden.', 'err'); };
  img.src = URL.createObjectURL(file);
}

async function triggerKillNow() {
  if (!Hermes.isReady()) {
    alert('Bitte zuerst Master-QR hochladen.');
    return;
  }
  if (!confirm('⚠️ KILL SWITCH JETZT AUSLÖSEN?\n\nDiese Aktion ist UNUMKEHRBAR!\nAlle Daten werden forensisch vernichtet.\n\nFortfahren?')) return;
  const res = await Hermes.sendKillCommand();
  if (res.ok) {
    alert('💥 KILL-SIGNAL GESENDET an ' + res.relaysReached + '/' + res.relaysTotal + ' Nostr-Relays!\n\nEvent-ID: ' + res.eventId.substring(0,16) + '...\n\nDein Tresor wird bei der nächsten Verbindung vernichtet.');
  } else {
    alert('❌ Nostr-Versand fehlgeschlagen: ' + (res.error || 'unbekannt'));
  }
}

// ─── Event handlers (ehemals inline onclick/onchange etc.) ─────
document.getElementById('dropZone').addEventListener('click', function(ev){ document.getElementById( });
document.getElementById('auto_handler_1').addEventListener('click', function(ev){ triggerKillNow() });