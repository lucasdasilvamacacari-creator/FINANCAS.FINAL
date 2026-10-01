/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — CAMADA DE INTERFACE
   Primitivas compartilhadas: folhas, avisos, navegação, máscara
   de privacidade e o despachante de ações. Cada tela registra os
   seus comandos em UI.actions e o clique é resolvido por
   delegação — nenhum onclick inline espalhado pelo HTML.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Dm = global.Dominus;
  var Money = Dm.Money, D = Dm.D, esc = Dm.esc, DB = Dm.DB, clamp = Dm.clamp;

  var UI = {
    page: 'dashboard',
    actions: {},
    renderers: {},
    _sheetStack: []
  };

  /* ═══════════ AVISOS ═══════════ */

  var toastTimer = null;
  UI.toast = function (msg, kind) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, kind === 'err' ? 3600 : 2400);
  };
  UI.ok = function (m) { UI.toast(m, 'ok'); };
  UI.err = function (m) { UI.toast(m, 'err'); };

  UI.buzz = function (ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) { }
  };

  /* ═══════════ FOLHAS ═══════════ */

  function sheetRefs(level) {
    var id = level === 2 ? 'sheet2' : 'sheet';
    return {
      back: document.getElementById(id),
      body: document.getElementById(id + '-body'),
      panel: document.getElementById(id + '-panel')
    };
  }

  /* `onOpen` recebe o elemento do corpo — é onde cada tela liga
     os seus próprios eventos de input, slider e foco. */
  UI.openSheet = function (html, opts) {
    opts = opts || {};
    var lvl = opts.level || 1;
    var r = sheetRefs(lvl);
    if (!r.back) return;
    r.body.innerHTML = html;
    r.back.classList.add('open');
    r.panel.scrollTop = 0;
    document.body.style.overflow = 'hidden';
    UI._sheetStack[lvl] = opts;
    if (opts.onOpen) {
      try { opts.onOpen(r.body); } catch (e) { console.error(e); }
    }
    if (opts.focus) {
      setTimeout(function () {
        var f = r.body.querySelector(opts.focus);
        if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
      }, 300);
    }
  };

  UI.closeSheet = function (lvl) {
    lvl = lvl || 1;
    var r = sheetRefs(lvl);
    if (!r.back) return;
    r.back.classList.remove('open');
    var opts = UI._sheetStack[lvl];
    UI._sheetStack[lvl] = null;
    if (lvl === 1 || !UI._sheetStack[1]) document.body.style.overflow = '';
    if (opts && opts.onClose) { try { opts.onClose(); } catch (e) { } }
    setTimeout(function () {
      if (!r.back.classList.contains('open')) r.body.innerHTML = '';
    }, 320);
  };

  UI.closeAllSheets = function () { UI.closeSheet(2); UI.closeSheet(1); };

  UI.sheetHead = function (title, opts) {
    opts = opts || {};
    return '<div class="sheet-head">' +
      '<h3 id="sheet-title">' + esc(title) + '</h3>' +
      (opts.flag ? '<span class="edit-flag">' + esc(opts.flag) + '</span>' : '') +
      '<button class="sheet-close" type="button" data-act="close-sheet"' +
      (opts.level === 2 ? ' data-level="2"' : '') + ' aria-label="Fechar">✕</button>' +
      '</div>' +
      (opts.sub ? '<p class="sheet-sub">' + opts.sub + '</p>' : '');
  };

  /* Confirmação em folha de segundo nível (nunca window.confirm,
     que trava a thread e some no modo standalone do iOS) */
  UI.confirm = function (opts) {
    return new Promise(function (resolve) {
      var settled = false;
      var done = function (v) {
        if (settled) return;
        settled = true;
        UI.closeSheet(2);
        resolve(v);
      };
      UI.openSheet(
        UI.sheetHead(opts.title || 'Confirmar', { level: 2 }) +
        '<p class="sheet-sub" style="margin-top:-6px">' + (opts.text || '') + '</p>' +
        (opts.extra || '') +
        '<div class="btn-row" style="margin-top:18px">' +
        '<button class="btn btn-ghost" type="button" data-confirm="no">' + esc(opts.cancelLabel || 'Cancelar') + '</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" type="button" data-confirm="yes">' +
        esc(opts.confirmLabel || 'Confirmar') + '</button>' +
        '</div>',
        {
          level: 2,
          onClose: function () { done(false); },
          onOpen: function (body) {
            body.querySelector('[data-confirm="yes"]').addEventListener('click', function () { done(true); });
            body.querySelector('[data-confirm="no"]').addEventListener('click', function () { done(false); });
          }
        }
      );
    });
  };

  /* ═══════════ VALORES E MÁSCARA ═══════════ */

  /* Envolve o valor numa marca que o modo privacidade embaça.
     O número continua no DOM: o leitor de tela lê, o olho de
     quem está do lado não. */
  UI.money = function (cents, opts) {
    opts = opts || {};
    var cls = 'money-mask' + (opts.cls ? ' ' + opts.cls : '');
    var style = opts.color ? ' style="color:' + opts.color + '"' : '';
    return '<span class="' + cls + '"' + style + '>' + esc(Money.fmt(cents, opts)) + '</span>';
  };

  UI.signed = function (cents) {
    var c = cents >= 0 ? Dm.Chart.incomeColor() : 'var(--expense)';
    return '<span class="money-mask" style="color:' + c + '">' +
      (cents > 0 ? '+' : '') + esc(Money.fmt(cents)) + '</span>';
  };

  UI.deltaTag = function (pct, invert) {
    if (pct == null || !isFinite(pct)) return '';
    var good = invert ? pct <= 0 : pct >= 0;
    var arrow = pct > 0 ? '▲' : (pct < 0 ? '▼' : '•');
    return '<span class="tag" style="background:' +
      (good ? 'color-mix(in srgb,var(--income) 15%,transparent)' : 'color-mix(in srgb,var(--expense) 15%,transparent)') +
      ';color:' + (good ? 'var(--income)' : 'var(--expense)') + '">' +
      arrow + ' ' + Math.abs(pct) + '%</span>';
  };

  /* ═══════════ NAVEGAÇÃO ═══════════ */

  var PAGES = ['dashboard', 'transactions', 'investments', 'goals', 'notes', 'reports', 'plan', 'settings'];

  UI.go = function (page, opts) {
    opts = opts || {};
    if (PAGES.indexOf(page) < 0) page = 'dashboard';
    PAGES.forEach(function (p) {
      var el = document.getElementById('page-' + p);
      if (el) el.classList.toggle('active', p === page);
    });
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-nav') === page);
    });
    UI.page = page;
    UI.closeAllSheets();
    Dm.Chart.hideTip();
    if (!opts.keepScroll) global.scrollTo({ top: 0, behavior: 'auto' });
    UI.renderPage(page, opts);
  };

  UI.renderPage = function (page, opts) {
    var fn = UI.renderers[page || UI.page];
    if (fn) {
      try { fn(opts || {}); }
      catch (e) {
        console.error('[Dominus] falha ao desenhar a tela ' + page, e);
        UI.err('Algo deu errado ao desenhar esta tela.');
      }
    }
    if (opts && opts.anchor) {
      setTimeout(function () {
        var t = document.getElementById('anchor-' + opts.anchor);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 90);
    }
  };

  /* Redesenha a tela atual — chamada depois de qualquer gravação */
  UI.refresh = function () {
    UI.renderPage(UI.page, { keepScroll: true });
    UI.updateInsightDot();
  };

  UI.updateInsightDot = function () {
    if (!DB.isOpen()) return;
    var dot = document.getElementById('insight-dot');
    if (!dot) return;
    try {
      var h = Dm.Insights.headline(DB.data);
      dot.hidden = h.urgent === 0;
    } catch (e) { dot.hidden = true; }
  };

  /* ═══════════ PREFERÊNCIAS VISUAIS ═══════════ */

  UI.applySettings = function () {
    if (!DB.isOpen()) return;
    var s = DB.data.settings;
    var root = document.documentElement;
    root.setAttribute('data-amoled', s.amoled ? '1' : '0');
    root.setAttribute('data-density', s.compactList ? 'compact' : 'normal');
    if (/^#[0-9a-f]{6}$/i.test(s.accent || '')) {
      root.style.setProperty('--accent', s.accent);
      root.style.setProperty('--accent-dim', shade(s.accent, -0.2));
      root.style.setProperty('--accent-wash', hexA(s.accent, .10));
      root.style.setProperty('--accent-edge', hexA(s.accent, .25));
    }
    document.body.classList.toggle('privacy', !!s.hideValues);
    var pb = document.getElementById('btn-privacy');
    if (pb) {
      pb.textContent = s.hideValues ? '🙈' : '👁️';
      pb.title = s.hideValues ? 'Mostrar valores' : 'Ocultar valores';
    }
    var prof = document.getElementById('btn-profile');
    if (prof) prof.textContent = DB.data.profile.avatar || '🦅';
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', s.amoled ? '#000000' : '#0D0D0D');
  };

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = clamp(Math.round(((n >> 16) & 255) * (1 + amt)), 0, 255);
    var g = clamp(Math.round(((n >> 8) & 255) * (1 + amt)), 0, 255);
    var b = clamp(Math.round((n & 255) * (1 + amt)), 0, 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  UI.shade = shade;
  UI.hexA = hexA;

  /* ═══════════ SELETORES REUTILIZÁVEIS ═══════════ */

  /* Grade de categorias — toque único, sem <select>: menos
     atrito que abrir uma lista nativa a cada lançamento. */
  UI.categoryGrid = function (kind, selectedId, name) {
    var cats = (DB.data.categories || []).filter(function (c) {
      return c.kind === kind && !c.archived;
    });
    return '<div class="pick-grid" data-picker="' + (name || 'categoryId') + '">' +
      cats.map(function (c) {
        return '<button type="button" class="pick' + (c.id === selectedId ? ' active' : '') +
          '" data-pick="' + esc(c.id) + '">' +
          '<span class="ic">' + c.emoji + '</span>' + esc(c.name) + '</button>';
      }).join('') + '</div>';
  };

  UI.accountSelect = function (selectedId, name) {
    var accs = (DB.data.accounts || []).filter(function (a) { return !a.archived; });
    return '<select id="' + (name || 'f-account') + '">' +
      accs.map(function (a) {
        return '<option value="' + esc(a.id) + '"' + (a.id === selectedId ? ' selected' : '') + '>' +
          a.emoji + ' ' + esc(a.name) + '</option>';
      }).join('') + '</select>';
  };

  var EMOJIS = ['🎯', '🏖️', '🏠', '🚗', '✈️', '💍', '🎓', '👶', '🐶', '💻', '📱', '🛡️', '🏥', '🎸',
    '📷', '🏍️', '⛰️', '🚢', '💰', '🪙', '📈', '🧾', '🎁', '🍀', '🔥', '⭐', '🦅', '🧠', '💼', '🛠️'];

  UI.emojiPicker = function (selected, name) {
    return '<div class="chip-scroll" data-picker="' + (name || 'emoji') + '">' +
      EMOJIS.map(function (e) {
        return '<button type="button" class="chip' + (e === selected ? ' active' : '') +
          '" data-pick="' + e + '" style="font-size:1.05rem;padding:5px 10px">' + e + '</button>';
      }).join('') + '</div>';
  };

  UI.colorPicker = function (selected, name) {
    return '<div class="swatch-grid" data-picker="' + (name || 'color') + '">' +
      Dm.Schema.CAT_COLORS.map(function (c) {
        return '<button type="button" class="swatch-pick' + (c.toLowerCase() === String(selected).toLowerCase() ? ' active' : '') +
          '" data-pick="' + c + '" style="background:' + c + '" aria-label="Cor ' + c + '"></button>';
      }).join('') + '</div>';
  };

  /* Liga toda grade `data-picker` do corpo da folha e guarda o
     valor escolhido em UI.pick[name]. */
  UI.pick = {};
  UI.bindPickers = function (body) {
    body.querySelectorAll('[data-picker]').forEach(function (grid) {
      var name = grid.getAttribute('data-picker');
      var active = grid.querySelector('.active');
      UI.pick[name] = active ? active.getAttribute('data-pick') : null;
      grid.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pick]');
        if (!b || !grid.contains(b)) return;
        grid.querySelectorAll('[data-pick]').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        UI.pick[name] = b.getAttribute('data-pick');
        UI.buzz(8);
        if (grid.hasAttribute('data-picker-emits')) {
          grid.dispatchEvent(new CustomEvent('picked', { detail: UI.pick[name], bubbles: true }));
        }
      });
    });
  };

  /* Campo de valor que aceita o que a pessoa digitar: 1.234,56 ·
     1234.56 · 1,5k — e mostra, abaixo, o que entendeu. */
  UI.bindAmountField = function (body, inputId, echoId) {
    var inp = body.querySelector('#' + inputId);
    if (!inp) return;
    var echo = echoId ? body.querySelector('#' + echoId) : null;
    var upd = function () {
      var c = Money.parse(inp.value);
      if (echo) {
        echo.textContent = (inp.value && isFinite(c) && c !== 0)
          ? '= ' + Money.fmt(Math.abs(c)) : '';
        echo.style.color = 'var(--muted)';
      }
    };
    inp.addEventListener('input', upd);
    upd();
  };

  UI.readAmount = function (body, inputId) {
    var inp = body.querySelector('#' + inputId);
    if (!inp) return NaN;
    var c = Money.parse(inp.value);
    return isFinite(c) ? Math.abs(c) : NaN;
  };

  UI.val = function (body, id) {
    var el = body.querySelector('#' + id);
    return el ? String(el.value || '').trim() : '';
  };
  UI.checked = function (body, id) {
    var el = body.querySelector('#' + id);
    return el ? !!el.checked : false;
  };

  /* ═══════════ DOWNLOAD ═══════════ */

  UI.download = function (filename, text, mime) {
    try {
      var blob = new Blob([text], { type: (mime || 'application/json') + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1200);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  UI.copy = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(function () { UI.ok('Copiado'); return true; })
        .catch(function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  };
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      if (ok) UI.ok('Copiado'); else UI.err('Copie manualmente.');
      return ok;
    } catch (e) { UI.err('Copie manualmente.'); return false; }
  }

  /* ═══════════ GRAVAÇÃO ═══════════ */

  /* Ponto único de escrita: salva, redesenha e avisa. Toda tela
     termina uma edição chamando UI.commit(). */
  UI.commit = function (msg, opts) {
    opts = opts || {};
    DB.save();
    if (!opts.noRefresh) UI.refresh();
    if (msg) UI.ok(msg);
  };

  /* ═══════════ DESPACHANTE DE AÇÕES ═══════════ */

  UI.register = function (map) {
    Object.keys(map).forEach(function (k) { UI.actions[k] = map[k]; });
  };

  UI.bindGlobal = function () {
    document.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) { UI.go(nav.getAttribute('data-nav')); return; }

      var act = e.target.closest('[data-act]');
      if (act) {
        var name = act.getAttribute('data-act');
        var fn = UI.actions[name];
        if (fn) {
          e.preventDefault();
          try { fn(act.dataset, act, e); }
          catch (err) { console.error('[Dominus] ação "' + name + '" falhou', err); UI.err('Não foi possível concluir.'); }
        }
        return;
      }
    });

    /* clique no fundo escuro fecha a folha */
    ['sheet', 'sheet2'].forEach(function (id, i) {
      var back = document.getElementById(id);
      if (!back) return;
      back.addEventListener('click', function (e) {
        if (e.target === back) UI.closeSheet(i + 1);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (UI._sheetStack[2]) UI.closeSheet(2);
        else if (UI._sheetStack[1]) UI.closeSheet(1);
      }
    });

    /* um toque revela um valor embaçado */
    document.addEventListener('click', function (e) {
      var m = e.target.closest('.money-mask');
      if (m && document.body.classList.contains('privacy')) {
        m.classList.toggle('revealed');
      }
    });

    UI.register({
      'close-sheet': function (ds) { UI.closeSheet(ds.level === '2' ? 2 : 1); },
      'goto': function (ds) { UI.go(ds.page, { anchor: ds.anchor }); }
    });
  };

  Dm.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
