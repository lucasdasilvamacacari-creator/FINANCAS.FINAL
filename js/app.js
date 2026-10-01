/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — ARRANQUE
   Liga os eventos globais, retoma a sessão se houver, decide entre
   login / assistente / app, e registra o service worker.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Dm = global.Dominus;
  var UI = Dm.UI, DB = Dm.DB, Auth = Dm.Auth, F = Dm.F, D = Dm.D, Chart = Dm.Chart;

  var App = {};

  /* Entra no app com a sessão já aberta */
  App.enter = function () {
    Dm.AuthUI.hideScreen();
    var shell = document.getElementById('app-shell');
    if (shell) shell.hidden = false;
    document.body.style.overflow = '';

    UI.applySettings();
    Auth.startIdleWatch(function (reason) {
      var sh = document.getElementById('app-shell');
      if (sh) sh.hidden = true;
      Dm.AuthUI.lockScreen(reason);
    });

    /* lança recorrências vencidas, uma vez por dia */
    if (DB.data.meta.lastRecurrenceRun !== D.today()) {
      var r = F.runRecurrences(DB.data);
      DB.data.meta.lastRecurrenceRun = D.today();
      if (r.created) {
        DB.saveNow();
        setTimeout(function () {
          UI.toast('🔁 ' + r.created + ' lançamento(s) recorrente(s) adicionado(s)');
        }, 900);
      }
    }

    /* atualiza cotações se estiverem velhas e o usuário quiser */
    if (DB.data.settings.autoRefreshPrices) {
      var pf = F.portfolio(DB.data);
      var stale = !pf.lastUpdated ||
        (Date.now() - new Date(pf.lastUpdated).getTime()) > 6 * 3600 * 1000;
      if (pf.count && stale && navigator.onLine) {
        setTimeout(function () {
          Dm.refreshPrices();
        }, 2200);
      }
    }

    var start = DB.data.settings.startPage || 'dashboard';
    UI.go(start);
    UI.updateInsightDot();
  };

  Dm.runRecurrencesNow = function () {
    var r = F.runRecurrences(DB.data);
    if (r.created) UI.commit(r.created + ' lançamento(s) adicionado(s)');
    else UI.toast('Nada pendente para lançar.');
  };

  /* ═══════════ EVENTOS GLOBAIS ═══════════ */

  function bindShell() {
    UI.bindGlobal();
    Chart.bindTooltips();

    var priv = document.getElementById('btn-privacy');
    if (priv) priv.addEventListener('click', function () {
      DB.data.settings.hideValues = !DB.data.settings.hideValues;
      DB.save();
      UI.applySettings();
      document.querySelectorAll('.money-mask.revealed').forEach(function (m) {
        m.classList.remove('revealed');
      });
    });

    var ins = document.getElementById('btn-insights');
    if (ins) ins.addEventListener('click', function () { UI.actions['all-insights'](); });

    var prof = document.getElementById('btn-profile');
    if (prof) prof.addEventListener('click', function () { UI.go('settings'); });

    /* busca no extrato e nas notas */
    var txSearch = document.getElementById('tx-search');
    if (txSearch) {
      txSearch.addEventListener('input', Dm.debounce(function () {
        Dm.txState.limit = 60;
        UI.renderers.transactions({});
      }, 180));
    }
    var noteSearch = document.getElementById('note-search');
    if (noteSearch) {
      noteSearch.addEventListener('input', Dm.debounce(function () {
        UI.renderers.notes();
      }, 180));
    }

    var typeFilter = document.getElementById('tx-type-filter');
    if (typeFilter) typeFilter.addEventListener('click', function (e) {
      var b = e.target.closest('[data-txfilter]');
      if (!b) return;
      Dm.txState.type = b.getAttribute('data-txfilter');
      Dm.txState.limit = 60;
      typeFilter.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      UI.renderers.transactions({});
    });

    UI.register({
      'more-menu': function () {
        UI.openSheet(
          UI.sheetHead('Mais') +
          '<div class="menu-list">' +
          [
            ['goals', '🎯', 'Metas', 'Objetivos com valor, prazo e aportes'],
            ['notes', '📝', 'Notas', 'Seu bloco de anotações'],
            ['reports', '📊', 'Relatórios', 'Gráficos e comparações por período'],
            ['plan', '🧭', 'Meu Plano', 'Renda, orçamento, reserva e expectativas'],
            ['settings', '⚙️', 'Configurações', 'Aparência, segurança, backup e histórico']
          ].map(function (p) {
            return '<button class="menu-item" type="button" data-act="goto" data-page="' + p[0] + '">' +
              '<span class="mi-ic">' + p[1] + '</span><span class="mi-text"><b>' + p[2] + '</b>' +
              '<span>' + p[3] + '</span></span><span class="mi-arrow">›</span></button>';
          }).join('') + '</div>',
          {}
        );
      }
    });

    /* salva antes de sair, para não perder a última edição */
    global.addEventListener('beforeunload', function () {
      if (DB.isOpen() && DB.dirty) DB.saveNow();
    });
    global.addEventListener('pagehide', function () {
      if (DB.isOpen() && DB.dirty) DB.saveNow();
    });

    /* avisa se o armazenamento recusou a gravação */
    DB.onChange(function (what) {
      if (what === 'save-error') {
        UI.err('Não consegui salvar: armazenamento cheio ou bloqueado. Exporte um backup e apague pontos antigos no histórico.');
      }
    });

    global.addEventListener('online', function () { UI.toast('Conexão de volta'); });
  }

  /* ═══════════ SERVICE WORKER ═══════════ */

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;   /* não há SW em file:// */
    navigator.serviceWorker.register('serviceworker.js')
      .then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function () {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              UI.toast('✨ Nova versão instalada — reabra o app para aplicar');
            }
          });
        });
      })
      .catch(function (e) { console.warn('[Dominus] service worker:', e.message); });
  }

  /* ═══════════ BOOT ═══════════ */

  function fatal(msg, detail) {
    var box = document.getElementById('auth-content') || document.body;
    box.innerHTML = '<div class="callout callout-danger"><span class="ic">⚠️</span><span>' +
      Dm.esc(msg) + (detail ? '<br><br><span class="fine-print">' + Dm.esc(detail) + '</span>' : '') +
      '</span></div>';
    var s = document.getElementById('auth-screen');
    if (s) s.hidden = false;
  }

  function boot() {
    bindShell();
    registerSW();

    if (!Dm.Store.available) {
      fatal('Este navegador está com o armazenamento local bloqueado, então não há onde guardar seus dados em segurança.',
        'Costuma ser navegação privada ou um bloqueio de cookies/dados do site. Abra numa janela normal e permita dados para este endereço.');
      return;
    }

    Auth.restoreSession()
      .then(function (ok) {
        if (!ok) {
          if (Auth.hasUsers()) Dm.AuthUI.login();
          else Dm.AuthUI.register();
          return;
        }
        if (ok && ok.migrated && ok.migrated.length) {
          setTimeout(function () {
            UI.toast('🔧 Dados migrados para o formato v' + Dm.schema + ' — versão anterior salva no histórico');
          }, 1400);
        }
        Dm.AuthUI.afterSession();
      })
      .catch(function (e) {
        console.error('[Dominus] falha ao abrir a sessão', e);
        if (String(e.message) === 'DECRYPT_FAILED') {
          /* o cofre no disco NÃO é tocado: pedimos a senha de novo */
          Dm.AuthUI.login();
          setTimeout(function () {
            UI.err('Não consegui abrir o cofre com a chave da sessão. Entre com a sua senha.');
          }, 400);
        } else {
          Dm.AuthUI.login();
        }
      });
  }

  Dm.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
