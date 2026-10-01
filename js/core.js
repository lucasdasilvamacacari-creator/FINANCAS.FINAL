/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — CORE
   Precisão (centavos inteiros), datas sem deriva de fuso,
   criptografia de cofre, migrações versionadas e histórico.
   Script clássico (sem módulos) → funciona em file:// e em
   qualquer hospedagem estática.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var APP_VERSION = '3.0.0';
  var SCHEMA = 5;

  /* ═══════════ 1. UTILIDADES ═══════════ */

  function uid(prefix) {
    var rnd;
    if (global.crypto && global.crypto.getRandomValues) {
      var b = new Uint8Array(8);
      global.crypto.getRandomValues(b);
      rnd = Array.prototype.map.call(b, function (x) {
        return x.toString(36);
      }).join('').slice(0, 8);
    } else {
      rnd = Math.random().toString(36).slice(2, 10);
    }
    return (prefix || 'id') + '_' + Date.now().toString(36) + rnd;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* Arredondamento "half away from zero" — evita o viés do
     Math.round com negativos (Math.round(-0.5) === -0) */
  function roundHalfUp(n) {
    return n < 0 ? -Math.round(-n) : Math.round(n);
  }

  function roundTo(n, dp) {
    var f = Math.pow(10, dp || 0);
    /* corrige o erro de representação binária antes de arredondar:
       roundTo(1.005, 2) → 1.01, e não 1.00 */
    return roundHalfUp(parseFloat((n * f).toPrecision(15))) / f;
  }

  function deepClone(o) {
    return o === undefined ? o : JSON.parse(JSON.stringify(o));
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* ═══════════ 2. DINHEIRO — inteiros em centavos ═══════════
     Todo valor monetário vive como inteiro de centavos. Nenhuma
     soma de dinheiro usa float, então 0.1 + 0.2 nunca vira
     0.30000000000000004 num extrato.                            */

  var Money = {
    /* Aceita "1.234,56" · "1234,56" · "1234.56" · "R$ 1.234,56" ·
       "1,2k" · "-50" · "1 234,56". Retorna centavos inteiros ou NaN. */
    parse: function (input) {
      if (typeof input === 'number') {
        return isFinite(input) ? roundHalfUp(input * 100) : NaN;
      }
      if (input == null) return NaN;
      var s = String(input).trim();
      if (!s) return NaN;

      var neg = /^\(.*\)$/.test(s) || /^-/.test(s);
      s = s.replace(/[()]/g, '').replace(/^-/, '');
      s = s.replace(/r\$|brl|\s| /gi, '');

      /* sufixos de magnitude: 1,5k · 2kk · 3mi · 1m */
      var mult = 1;
      var sufx = s.match(/(kk|mi|mil|k|m)$/i);
      if (sufx) {
        var k = sufx[1].toLowerCase();
        mult = (k === 'k' || k === 'mil') ? 1e3 : 1e6;
        s = s.slice(0, -sufx[1].length);
      }

      if (!/[\d]/.test(s)) return NaN;

      var lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
      if (lastComma > -1 && lastDot > -1) {
        /* o separador decimal é o que aparece por último */
        if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
      } else if (lastComma > -1) {
        /* "1,234" com 3 casas após a vírgula é separador de milhar */
        s = (s.length - lastComma - 1 === 3 && /^\d{1,3}(,\d{3})+$/.test(s))
          ? s.replace(/,/g, '')
          : s.replace(',', '.');
      } else if (lastDot > -1) {
        if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      }

      s = s.replace(/[^0-9.]/g, '');
      if (!s || s === '.') return NaN;
      var f = parseFloat(s);
      if (!isFinite(f)) return NaN;
      var cents = roundHalfUp(f * mult * 100);
      return neg ? -cents : cents;
    },

    fmt: function (cents, opts) {
      opts = opts || {};
      if (!isFinite(cents)) cents = 0;
      var v = cents / 100;
      var out = v.toLocaleString('pt-BR', {
        style: 'currency', currency: 'BRL',
        minimumFractionDigits: opts.noCents ? 0 : 2,
        maximumFractionDigits: opts.noCents ? 0 : 2
      });
      return opts.sign && cents > 0 ? '+' + out : out;
    },

    /* Rótulos curtos para eixos de gráfico */
    short: function (cents) {
      var v = Math.abs(cents) / 100, sg = cents < 0 ? '-' : '';
      if (v >= 1e6) return sg + 'R$ ' + roundTo(v / 1e6, 1).toLocaleString('pt-BR') + 'mi';
      if (v >= 1e3) return sg + 'R$ ' + roundTo(v / 1e3, 1).toLocaleString('pt-BR') + 'k';
      return sg + 'R$ ' + roundTo(v, 0).toLocaleString('pt-BR');
    },

    plain: function (cents) {
      return (cents / 100).toLocaleString('pt-BR', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });
    },

    toFloat: function (cents) { return roundTo(cents / 100, 2); },
    fromFloat: function (f) { return roundHalfUp((Number(f) || 0) * 100); },

    /* Rateio sem centavo perdido: distribui `cents` em `n` partes
       cuja soma é exatamente `cents` (os primeiros restos ficam
       com as primeiras parcelas — convenção de carnê). */
    split: function (cents, n) {
      n = Math.max(1, Math.floor(n));
      var sign = cents < 0 ? -1 : 1, abs = Math.abs(cents);
      var base = Math.floor(abs / n), rest = abs - base * n, out = [];
      for (var i = 0; i < n; i++) out.push(sign * (base + (i < rest ? 1 : 0)));
      return out;
    },

    /* percentual de a sobre b, com guarda de divisão por zero */
    pctOf: function (a, b) { return b === 0 ? 0 : roundTo(a / b * 100, 2); },
    growth: function (now, before) {
      return before === 0 ? (now === 0 ? 0 : 100) : roundTo((now - before) / Math.abs(before) * 100, 2);
    }
  };

  /* ═══════════ 3. DATAS — 'YYYY-MM-DD' local, sem UTC ═══════════
     new Date('2026-03-01') é meia-noite UTC e pode voltar um dia
     em fusos negativos. Tudo aqui usa componentes locais.        */

  var MES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var MES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var DIA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  var D = {
    MES_CURTO: MES_CURTO, MES_LONGO: MES_LONGO, DIA_CURTO: DIA_CURTO,

    today: function () { return D.toYmd(new Date()); },

    toYmd: function (dt) {
      return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
    },

    /* Date local a partir de 'YYYY-MM-DD' (ou ISO completo legado) */
    parse: function (ymd) {
      if (ymd instanceof Date) return ymd;
      var s = String(ymd || '');
      var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
      var d = new Date(s);
      return isNaN(d.getTime()) ? new Date() : d;
    },

    /* normaliza qualquer entrada (ISO legado, Date, 'YYYY-MM-DD') */
    norm: function (any) { return D.toYmd(D.parse(any)); },

    isValid: function (ymd) { return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')); },

    fmt: function (ymd) {
      var d = D.parse(ymd);
      return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
    },
    fmtShort: function (ymd) {
      var d = D.parse(ymd);
      return pad2(d.getDate()) + ' ' + MES_CURTO[d.getMonth()];
    },
    /* "hoje" / "ontem" / "12 Mar" */
    fmtRel: function (ymd) {
      var diff = D.diffDays(D.today(), ymd);
      if (diff === 0) return 'Hoje';
      if (diff === 1) return 'Ontem';
      if (diff === -1) return 'Amanhã';
      if (diff > 1 && diff < 7) return diff + ' dias atrás';
      return D.fmtShort(ymd);
    },

    monthKey: function (ymd) { return String(D.norm(ymd)).slice(0, 7); },
    monthKeyOf: function (dt) { return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1); },
    monthLabel: function (key, long) {
      var p = String(key).split('-');
      var mi = (+p[1] || 1) - 1;
      return (long ? MES_LONGO[mi] : MES_CURTO[mi]) + ' ' + p[0];
    },
    monthLabelShort: function (key) {
      var p = String(key).split('-');
      return MES_CURTO[(+p[1] || 1) - 1] + '/' + String(p[0]).slice(2);
    },

    addDays: function (ymd, n) {
      var d = D.parse(ymd); d.setDate(d.getDate() + n); return D.toYmd(d);
    },
    /* soma meses preservando o fim do mês (31/jan + 1 mês = 28/fev) */
    addMonths: function (ymd, n) {
      var d = D.parse(ymd), day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + n);
      d.setDate(Math.min(day, D.daysInMonth(d.getFullYear(), d.getMonth() + 1)));
      return D.toYmd(d);
    },
    addMonthKey: function (key, n) {
      var p = String(key).split('-');
      var d = new Date(+p[0], (+p[1] - 1) + n, 1);
      return D.monthKeyOf(d);
    },

    daysInMonth: function (y, m) { return new Date(y, m, 0).getDate(); },
    daysInMonthKey: function (key) {
      var p = String(key).split('-'); return D.daysInMonth(+p[0], +p[1]);
    },
    firstOfMonth: function (key) { return key + '-01'; },
    lastOfMonth: function (key) { return key + '-' + pad2(D.daysInMonthKey(key)); },

    diffDays: function (a, b) {
      /* dias de b até a, imune a horário de verão (usa UTC dos componentes) */
      var da = D.parse(a), db = D.parse(b);
      var ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
      var ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
      return Math.round((ua - ub) / 86400000);
    },
    diffMonths: function (a, b) {
      var da = D.parse(a), db = D.parse(b);
      return (da.getFullYear() - db.getFullYear()) * 12 + (da.getMonth() - db.getMonth());
    },

    /* lista de chaves de mês entre dois meses, inclusive */
    monthRange: function (fromKey, toKey) {
      var out = [], cur = fromKey, guard = 0;
      while (guard++ < 600) {
        out.push(cur);
        if (cur === toKey) break;
        cur = D.addMonthKey(cur, 1);
      }
      return out;
    },

    dow: function (ymd) { return D.parse(ymd).getDay(); },

    /* Interpreta datas escritas à mão no lançamento rápido */
    fromText: function (txt, base) {
      var s = String(txt || '').toLowerCase().trim();
      var today = base || D.today();
      if (/^hoje$/.test(s)) return today;
      if (/^ontem$/.test(s)) return D.addDays(today, -1);
      if (/^anteontem$/.test(s)) return D.addDays(today, -2);
      if (/^amanh[ãa]$/.test(s)) return D.addDays(today, 1);
      var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
      if (m) {
        var y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : D.parse(today).getFullYear();
        var mo = clamp(+m[2], 1, 12);
        var dd = clamp(+m[1], 1, D.daysInMonth(y, mo));
        return y + '-' + pad2(mo) + '-' + pad2(dd);
      }
      if (D.isValid(s)) return s;
      return null;
    }
  };

  /* ═══════════ 4. SHA-256 / HMAC / PBKDF2 em JS puro ═══════════
     Usado só quando crypto.subtle não existe (contexto não
     seguro). É o PBKDF2-SHA256 de verdade, apenas mais lento.   */

  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function sha256(msg) {
    var len = msg.length;
    var padLen = Math.ceil((len + 9) / 64) * 64;
    var buf = new ArrayBuffer(padLen);
    var m = new Uint8Array(buf), dv = new DataView(buf);
    m.set(msg); m[len] = 0x80;
    var bits = len * 8;
    dv.setUint32(padLen - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(padLen - 4, bits >>> 0);

    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Uint32Array(64);

    for (var i = 0; i < padLen; i += 64) {
      for (var t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (t = 16; t < 64; t++) {
        var x = w[t - 15], y = w[t - 2];
        var s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
        var s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K256[t] + w[t]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = new Uint8Array(32), odv = new DataView(out.buffer);
    for (i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
    return out;
  }

  function hmacSha256(key, msg) {
    var bk = new Uint8Array(64);
    if (key.length > 64) bk.set(sha256(key)); else bk.set(key);
    var ip = new Uint8Array(64 + msg.length), op = new Uint8Array(64 + 32);
    for (var i = 0; i < 64; i++) { ip[i] = bk[i] ^ 0x36; op[i] = bk[i] ^ 0x5c; }
    ip.set(msg, 64);
    op.set(sha256(ip), 64);
    return sha256(op);
  }

  function pbkdf2Js(pass, salt, iters, dkLen) {
    var out = new Uint8Array(dkLen), done = 0, block = 1;
    while (done < dkLen) {
      var si = new Uint8Array(salt.length + 4);
      si.set(salt);
      si[salt.length] = (block >>> 24) & 255; si[salt.length + 1] = (block >>> 16) & 255;
      si[salt.length + 2] = (block >>> 8) & 255; si[salt.length + 3] = block & 255;
      var u = hmacSha256(pass, si), acc = u.slice(0);
      for (var i = 1; i < iters; i++) {
        u = hmacSha256(pass, u);
        for (var j = 0; j < 32; j++) acc[j] ^= u[j];
      }
      var take = Math.min(32, dkLen - done);
      out.set(acc.subarray(0, take), done);
      done += take; block++;
    }
    return out;
  }

  /* ═══════════ 5. SEGURANÇA ═══════════ */

  var SUBTLE = (function () {
    try { return global.crypto && global.crypto.subtle ? global.crypto.subtle : null; }
    catch (e) { return null; }
  })();

  var ITERS_WEBCRYPTO = 310000;  /* alinhado à recomendação OWASP p/ PBKDF2-SHA256 */
  var ITERS_JS = 20000;          /* fallback em JS puro: mais lento por iteração */

  var Sec = {
    hasSubtle: !!SUBTLE,
    iterations: function () { return SUBTLE ? ITERS_WEBCRYPTO : ITERS_JS; },
    canEncrypt: function () { return !!SUBTLE; },

    randomBytes: function (n) {
      var b = new Uint8Array(n);
      if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(b);
      else for (var i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
      return b;
    },

    utf8: function (s) {
      if (global.TextEncoder) return new global.TextEncoder().encode(s);
      var u = unescape(encodeURIComponent(String(s))), a = new Uint8Array(u.length);
      for (var i = 0; i < u.length; i++) a[i] = u.charCodeAt(i);
      return a;
    },
    fromUtf8: function (bytes) {
      if (global.TextDecoder) return new global.TextDecoder().decode(bytes);
      var s = '';
      for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return decodeURIComponent(escape(s));
    },

    b64: function (bytes) {
      var s = '';
      for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return global.btoa(s);
    },
    unb64: function (str) {
      var s = global.atob(str), a = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
      return a;
    },

    /* Comparação em tempo constante — não vaza o prefixo correto */
    equalBytes: function (a, b) {
      if (!a || !b || a.length !== b.length) return false;
      var diff = 0;
      for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      return diff === 0;
    },

    /* PBKDF2-SHA256 → bytes da chave */
    deriveBits: function (password, salt, iters, lenBytes) {
      var pwBytes = Sec.utf8(password);
      if (!SUBTLE) {
        return Promise.resolve(pbkdf2Js(pwBytes, salt, iters, lenBytes));
      }
      return SUBTLE.importKey('raw', pwBytes, { name: 'PBKDF2' }, false, ['deriveBits'])
        .then(function (k) {
          return SUBTLE.deriveBits(
            { name: 'PBKDF2', salt: salt, iterations: iters, hash: 'SHA-256' }, k, lenBytes * 8);
        })
        .then(function (bits) { return new Uint8Array(bits); });
    },

    /* AES-GCM 256 — requer crypto.subtle */
    encrypt: function (keyBytes, plainBytes, aad) {
      if (!SUBTLE) return Promise.reject(new Error('NO_SUBTLE'));
      var iv = Sec.randomBytes(12);
      return SUBTLE.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt'])
        .then(function (k) {
          var p = { name: 'AES-GCM', iv: iv, tagLength: 128 };
          if (aad) p.additionalData = Sec.utf8(aad);
          return SUBTLE.encrypt(p, k, plainBytes);
        })
        .then(function (ct) {
          return { iv: Sec.b64(iv), ct: Sec.b64(new Uint8Array(ct)) };
        });
    },

    decrypt: function (keyBytes, payload, aad) {
      if (!SUBTLE) return Promise.reject(new Error('NO_SUBTLE'));
      return SUBTLE.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'])
        .then(function (k) {
          var p = { name: 'AES-GCM', iv: Sec.unb64(payload.iv), tagLength: 128 };
          if (aad) p.additionalData = Sec.utf8(aad);
          return SUBTLE.decrypt(p, k, Sec.unb64(payload.ct));
        })
        .then(function (pt) { return new Uint8Array(pt); });
    },

    encryptJson: function (keyBytes, obj, aad) {
      return Sec.encrypt(keyBytes, Sec.utf8(JSON.stringify(obj)), aad);
    },
    decryptJson: function (keyBytes, payload, aad) {
      return Sec.decrypt(keyBytes, payload, aad).then(function (b) {
        return JSON.parse(Sec.fromUtf8(b));
      });
    },

    /* Código de recuperação: 24 caracteres sem ambiguidade visual,
       agrupados em 6 blocos de 4 → DOMI-NUS7-... */
    makeRecoveryCode: function () {
      var AB = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';  /* sem 0/O/1/I */
      var b = Sec.randomBytes(24), out = [];
      for (var i = 0; i < 24; i++) {
        out.push(AB[b[i] % AB.length]);
        if (i % 4 === 3 && i < 23) out.push('-');
      }
      return out.join('');
    },
    normalizeRecoveryCode: function (s) {
      return String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    },

    /* Força da senha — 0..4 + motivo */
    strength: function (pw) {
      pw = String(pw || '');
      var score = 0, tips = [];
      if (pw.length >= 8) score++; else tips.push('use ao menos 8 caracteres');
      if (pw.length >= 12) score++; else if (pw.length >= 8) tips.push('12+ caracteres deixam bem mais forte');
      if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++; else tips.push('misture maiúsculas e minúsculas');
      if (/\d/.test(pw)) score++; else tips.push('inclua um número');
      if (/[^A-Za-z0-9]/.test(pw)) score++; else tips.push('inclua um símbolo');
      if (/^(.)\1+$/.test(pw) || /^(123|abc|qwe|000)/i.test(pw)) { score = Math.min(score, 1); tips.push('evite sequências óbvias'); }
      return { score: clamp(score, 0, 5), tips: tips };
    }
  };

  /* ═══════════ 6. ARMAZENAMENTO ═══════════ */

  var LS_USERS = 'dominus_users_v1';
  var LS_VAULT = 'dominus_vault_';
  var LS_HIST = 'dominus_hist_';
  var LS_LAST = 'dominus_last_user_v1';
  var SS_SESSION = 'dominus_session_v1';
  var LEGACY_KEYS = ['dominus_data_v2', 'dominus_data_v1'];

  var Store = {
    available: (function () {
      try {
        global.localStorage.setItem('__dmn_t', '1');
        global.localStorage.removeItem('__dmn_t');
        return true;
      } catch (e) { return false; }
    })(),

    get: function (key, fallback) {
      try {
        var raw = global.localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try {
        global.localStorage.setItem(key, JSON.stringify(value));
        return { ok: true };
      } catch (e) {
        var quota = e && (e.name === 'QuotaExceededError' ||
          e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
        return { ok: false, quota: !!quota, error: e };
      }
    },
    del: function (key) { try { global.localStorage.removeItem(key); } catch (e) { } },

    session: {
      get: function (key, fallback) {
        try {
          var raw = global.sessionStorage.getItem(key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set: function (key, value) {
        try { global.sessionStorage.setItem(key, JSON.stringify(value)); return true; }
        catch (e) { return false; }
      },
      del: function (key) { try { global.sessionStorage.removeItem(key); } catch (e) { } }
    },

    usersKey: LS_USERS,
    vaultKey: function (id) { return LS_VAULT + id; },
    histKey: function (id) { return LS_HIST + id; },
    lastUserKey: LS_LAST,
    sessionKey: SS_SESSION,
    legacyKeys: LEGACY_KEYS,

    /* Espaço aproximado ocupado pelo app, em bytes de UTF-16 */
    usage: function () {
      var total = 0, mine = 0;
      try {
        for (var i = 0; i < global.localStorage.length; i++) {
          var k = global.localStorage.key(i);
          var n = (k.length + (global.localStorage.getItem(k) || '').length) * 2;
          total += n;
          if (k.indexOf('dominus') === 0) mine += n;
        }
      } catch (e) { }
      return { total: total, mine: mine };
    }
  };

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return roundTo(n / 1024, 1).toLocaleString('pt-BR') + ' KB';
    return roundTo(n / 1048576, 2).toLocaleString('pt-BR') + ' MB';
  }

  global.Dominus = global.Dominus || {};
  global.Dominus.version = APP_VERSION;
  global.Dominus.schema = SCHEMA;
  global.Dominus.uid = uid;
  global.Dominus.esc = esc;
  global.Dominus.clamp = clamp;
  global.Dominus.roundTo = roundTo;
  global.Dominus.roundHalfUp = roundHalfUp;
  global.Dominus.deepClone = deepClone;
  global.Dominus.debounce = debounce;
  global.Dominus.Money = Money;
  global.Dominus.D = D;
  global.Dominus.Sec = Sec;
  global.Dominus.Store = Store;
  global.Dominus.fmtBytes = fmtBytes;
  global.Dominus._sha256 = sha256;   /* exposto para o autoteste */
})(typeof window !== 'undefined' ? window : globalThis);
