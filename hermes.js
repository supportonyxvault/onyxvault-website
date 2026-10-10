/**
 * ONYX VAULT - HERMES AGENT v4.1 (Reg->Master Flow)
 *
 * Zero-Server-Architektur. Alle Kommunikation ueber oeffentliche Nostr-Relays (wss://).
 *
 * FORMATE:
 *   ONYX3:<appId>:<encBase64>       - Registrierungs-QR (aus der App)
 *   ONYX3P:<appId>:<encBase64>      - Registrierungs-QR mit Passphrase
 *   ONYX_MASTER:<appId>:<encBase64> - Master-QR (NUR von register.html erzeugt)
 *   ONYX_MASTER_P:<appId>:<encBase64> - Master-QR mit Passphrase
 *
 * FLUSS:
 *   1. App zeigt Reg-QR (ONYX3:...)
 *   2. User laedt Reg-QR auf register.html hoch
 *   3. register.html ruft Hermes.transformRegToMaster() auf
 *   4. User speichert resulting Master-QR 3-fach
 *   5. recovery.html / killswitch.html akzeptieren NUR ONYX_MASTER:...
 *
 * (c) 2026 ONYX VAULT Project - AGPL-3.0
 */

(function(global) {
  'use strict';

  const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.wine',
    'wss://offchain.pub'
  ];

  const KDF_ITER = 600000;
  const KDF_SALT_LEN = 16;
  const NONCE_LEN = 12;
  const KIND_KILL = 30078;
  const KIND_RECOVERY = 30081;

  async function pbkdf2DeriveKey(passBytes, salt, iterations, keyLenBits) {
    const baseKey = await crypto.subtle.importKey(
      'raw', passBytes, { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: keyLenBits },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptContainer(plaintext, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(KDF_SALT_LEN));
    const iv   = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
    const passBytes = new TextEncoder().encode(passphrase);
    const key = await pbkdf2DeriveKey(passBytes, salt, KDF_ITER, 256);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(plaintext)
    );
    const ctBytes = new Uint8Array(ct);
    const out = new Uint8Array(salt.length + iv.length + ctBytes.length);
    out.set(salt, 0);
    out.set(iv, salt.length);
    out.set(ctBytes, salt.length + iv.length);
    let b64 = '';
    for (let i = 0; i < out.length; i++) b64 += String.fromCharCode(out[i]);
    return btoa(b64);
  }

  async function decryptContainer(b64Payload, passphrase) {
    try {
      const raw = Uint8Array.from(atob(b64Payload), c => c.charCodeAt(0));
      if (raw.length < KDF_SALT_LEN + NONCE_LEN + 16) return null;
      const salt = raw.slice(0, KDF_SALT_LEN);
      const iv   = raw.slice(KDF_SALT_LEN, KDF_SALT_LEN + NONCE_LEN);
      const ct   = raw.slice(KDF_SALT_LEN + NONCE_LEN);
      const passBytes = new TextEncoder().encode(passphrase);
      const key = await pbkdf2DeriveKey(passBytes, salt, KDF_ITER, 256);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
      return new TextDecoder().decode(pt);
    } catch (e) {
      console.warn('[Hermes] decrypt failed:', e.message);
      return null;
    }
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const Hermes = {
    version: '4.1',

    _session: {
      appId: null,
      masterPub: null,
      nostrPrivKey: null,
      relays: null
    },

    /**
     * Nimmt Reg-QR (ONYX3:...) und erzeugt Master-QR (ONYX_MASTER:...).
     */
    transformRegToMaster: async function(regQrString, userPassphrase) {
      try {
        if (typeof regQrString !== 'string') return { ok: false, error: 'kein gueltiger QR' };
        const t = regQrString.trim();
        if (t.startsWith('ONYX_MASTER')) {
          return { ok: false, error: 'Das ist bereits ein Master-QR, kein Registrierungs-QR.' };
        }
        if (!t.startsWith('ONYX3:') && !t.startsWith('ONYX3P:')) {
          return { ok: false, error: 'Das ist kein Registrierungs-QR aus der App (ONYX3-Format erwartet).' };
        }

        const parts = t.split(':');
        if (parts.length < 3) return { ok: false, error: 'QR-Format defekt' };

        const protocol = parts[0];
        const appId = parts[1];
        const payload = parts.slice(2).join(':');

        let passphrase;
        if (protocol === 'ONYX3P') {
          if (!userPassphrase) return { ok: false, error: 'Dieser QR ist passwortgeschuetzt. Bitte Passwort eingeben.' };
          passphrase = appId + ':' + userPassphrase;
        } else {
          passphrase = appId;
        }

        const plaintext = await decryptContainer(payload, passphrase);
        if (!plaintext) {
          return { ok: false, error: 'Entschluesselung fehlgeschlagen. Falsches Passwort oder beschaedigter QR?' };
        }

        const identity = JSON.parse(plaintext);
        if (!identity.app_id || !identity.ks_priv || !identity.pub) {
          return { ok: false, error: 'QR enthaelt keine gueltige Identitaet.' };
        }

        // Master-Marker hinzufuegen
        const entropy = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
        const masterPayload = Object.assign({}, identity, {
          type: 'MASTER',
          origin: 'website_v4',
          minted_at: Math.floor(Date.now() / 1000),
          entropy: entropy
        });

        const masterPassphrase = userPassphrase ? (appId + ':' + userPassphrase) : appId;
        const masterEnc = await encryptContainer(JSON.stringify(masterPayload), masterPassphrase);
        const prefix = userPassphrase ? 'ONYX_MASTER_P' : 'ONYX_MASTER';

        return {
          ok: true,
          masterQrString: prefix + ':' + appId + ':' + masterEnc,
          appId: appId
        };
      } catch (e) {
        console.error('[Hermes] transform error', e);
        return { ok: false, error: e.message || 'Unbekannter Fehler' };
      }
    },

    /**
     * Lade Master-Identitaet. Lehnt Reg-QR mit klarer Fehlermeldung ab.
     */
    saveIdentity: async function(qrString, userPassphrase) {
      try {
        if (typeof qrString !== 'string') return { ok: false, error: 'kein gueltiger QR' };
        const t = qrString.trim();

        if (t.startsWith('ONYX3:') || t.startsWith('ONYX3P:')) {
          return {
            ok: false,
            error: 'Das ist dein Registrierungs-QR, nicht dein Master-QR. Erzeuge zuerst den Master-QR auf der Registrierungs-Seite.'
          };
        }
        if (!t.startsWith('ONYX_MASTER:') && !t.startsWith('ONYX_MASTER_P:')) {
          return { ok: false, error: 'Unbekanntes QR-Format.' };
        }

        const parts = t.split(':');
        if (parts.length < 3) return { ok: false, error: 'QR defekt' };

        const protocol = parts[0];
        const appId = parts[1];
        const payload = parts.slice(2).join(':');

        let passphrase;
        if (protocol === 'ONYX_MASTER_P') {
          if (!userPassphrase) {
            const pw = prompt('5-Wort-Passphrase eingeben (space-separiert):');
            if (!pw) return { ok: false, error: 'Passphrase erforderlich' };
            passphrase = appId + ':' + pw;
          } else {
            passphrase = appId + ':' + userPassphrase;
          }
        } else {
          passphrase = appId;
        }

        const plaintext = await decryptContainer(payload, passphrase);
        if (!plaintext) {
          return { ok: false, error: 'Entschluesselung fehlgeschlagen. Falsches Passwort oder beschaedigter Master-QR?' };
        }

        const identity = JSON.parse(plaintext);
        if (identity.type !== 'MASTER') {
          return { ok: false, error: 'QR ist kein gueltiger Master.' };
        }
        if (!identity.app_id || !identity.ks_priv || !identity.pub) {
          return { ok: false, error: 'Master-QR beschaedigt (fehlende Felder).' };
        }

        this._session.appId = identity.app_id;
        this._session.masterPub = identity.pub;
        this._session.nostrPrivKey = identity.ks_priv;
        this._session.relays = Array.isArray(identity.relays) && identity.relays.length
          ? identity.relays
          : DEFAULT_RELAYS;

        try { sessionStorage.setItem('onyx_app_id_display', identity.app_id); } catch(e) {}

        console.log('[Hermes] master identity loaded, app_id=' + identity.app_id);
        return { ok: true, appId: identity.app_id };
      } catch (e) {
        console.error('[Hermes] saveIdentity error', e);
        return { ok: false, error: e.message };
      }
    },

    isReady: function() {
      return !!(this._session.nostrPrivKey && this._session.masterPub);
    },

    getAppId: function() {
      return this._session.appId;
    },

    sendKillCommand: async function(mode) {
      return this._sendCommand(KIND_KILL, {
        action: 'EXECUTE_ONYX_KILL',
        mode: mode || 'FULL_SYSTEM',
        issued_at: Math.floor(Date.now() / 1000)
      });
    },

    sendRecoveryCommand: async function(newPinHash) {
      return this._sendCommand(KIND_RECOVERY, {
        action: 'EXECUTE_ONYX_RECOVERY',
        new_pin_hash: newPinHash || null,
        issued_at: Math.floor(Date.now() / 1000)
      });
    },

    _sendCommand: async function(kind, payloadObj) {
      if (!this.isReady()) return { ok: false, error: 'identity not loaded' };
      if (!global.NostrTools) return { ok: false, error: 'nostr-tools library missing' };

      const priv = this._session.nostrPrivKey;
      const content = JSON.stringify(payloadObj);
      try {
        const event = {
          kind: kind,
          pubkey: global.NostrTools.getPublicKey(priv),
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['p', this._session.masterPub],
            ['t', kind === KIND_KILL ? 'onyx_kill' : 'onyx_recovery']
          ],
          content: content
        };
        event.id = global.NostrTools.getEventHash(event);
        event.sig = global.NostrTools.signEvent(event, priv);
        this._wipeSecrets();
        const results = await Promise.all(
          this._session.relays.map(url => this._publishToRelay(url, event))
        );
        const successCount = results.filter(r => r).length;
        return {
          ok: successCount > 0,
          relaysReached: successCount,
          relaysTotal: this._session.relays.length,
          eventId: event.id
        };
      } catch (e) {
        this._wipeSecrets();
        return { ok: false, error: e.message };
      }
    },

    _publishToRelay: function(url, event) {
      return new Promise(resolve => {
        try {
          const ws = new WebSocket(url);
          const timer = setTimeout(() => { try { ws.close(); } catch(e){} resolve(false); }, 5000);
          ws.onopen = () => {
            ws.send(JSON.stringify(['EVENT', event]));
            setTimeout(() => { try { ws.close(); } catch(e){} resolve(true); }, 700);
          };
          ws.onerror = () => { clearTimeout(timer); resolve(false); };
        } catch (e) { resolve(false); }
      });
    },

    _wipeSecrets: function() {
      if (this._session.nostrPrivKey) {
        try { this._session.nostrPrivKey = '0'.repeat(this._session.nostrPrivKey.length); } catch(e){}
      }
      this._session.nostrPrivKey = null;
      this._session.masterPub = null;
    },

    sendRecoveryWithPassphrase: async function(fiveWordPhrase) {
      if (!fiveWordPhrase || fiveWordPhrase.split(/\s+/).filter(Boolean).length !== 5) {
        return { ok: false, error: 'genau 5 BIP-39 Woerter erforderlich' };
      }
      const encoder = new TextEncoder();
      const salt = encoder.encode('ONYX_VAULT_RECOVERY_v4');
      const material = encoder.encode(fiveWordPhrase.trim().toLowerCase().replace(/\s+/g, ' '));
      const combined = new Uint8Array(salt.length + material.length);
      combined.set(salt);
      combined.set(material, salt.length);

      const hashBuf = await crypto.subtle.digest('SHA-256', combined);
      const hashHex = bytesToHex(new Uint8Array(hashBuf));
      if (!global.NostrTools) return { ok: false, error: 'nostr-tools missing' };

      const ephPriv = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const event = {
        kind: KIND_RECOVERY,
        pubkey: global.NostrTools.getPublicKey(ephPriv),
        created_at: Math.floor(Date.now() / 1000),
        tags: [['t', 'onyx_recovery_challenge'], ['hash', hashHex]],
        content: JSON.stringify({
          action: 'ONYX_PASSPHRASE_CHALLENGE',
          hash: hashHex,
          issued_at: Math.floor(Date.now() / 1000)
        })
      };
      event.id = global.NostrTools.getEventHash(event);
      event.sig = global.NostrTools.signEvent(event, ephPriv);

      const results = await Promise.all(
        DEFAULT_RELAYS.map(url => this._publishToRelay(url, event))
      );
      const successCount = results.filter(r => r).length;
      try { fiveWordPhrase = '0'.repeat(fiveWordPhrase.length); } catch(e){}
      return {
        ok: successCount > 0,
        relaysReached: successCount,
        relaysTotal: DEFAULT_RELAYS.length,
        hashSent: hashHex.substring(0, 16) + '...'
      };
    }
  };

  function uiStatus(id, html, kind) {
    const el = document.getElementById(id);
    if (!el) return;
    const color = kind === 'err' ? 'var(--red)' : kind === 'ok' ? 'var(--teal)' : 'var(--silver)';
    el.innerHTML = '<span style="color:' + color + '">' + html + '</span>';
  }

  global.Hermes = Hermes;
  global.OnyxUI = { status: uiStatus };

})(typeof window !== 'undefined' ? window : this);
