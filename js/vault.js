/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — COFRE (schema, migrações, histórico, backup)
   Regra de ouro deste arquivo: nenhum dado antigo é descartado.
   Toda migração e toda importação gravam um ponto de restauração
   ANTES de mexer em qualquer coisa.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Dm = global.Dominus;
  var Money = Dm.Money, D = Dm.D, Sec = Dm.Sec, Store = Dm.Store;
  var uid = Dm.uid, clamp = Dm.clamp, deepClone = Dm.deepClone;
  var SCHEMA = Dm.schema, APP_VERSION = Dm.version;

  /* ═══════════ PALETA DE CATEGORIAS ═══════════
     As 8 primeiras cores são as fatias validadas para o fundo
     escuro (#1A1A1A): faixa de luminosidade, piso de croma,
     separação para daltonismo e contraste — todas aprovadas.
     As 4 últimas só aparecem em contextos com rótulo direto
     (lista, legenda nomeada, barra rotulada), nunca como única
     pista de identidade.                                        */
  var CAT_COLORS = [
    '#3987e5', '#d95926', '#199e70', '#c98500',
    '#d55181', '#008300', '#9085e9', '#e66767',
    '#12a594', '#a0763c', '#7f8da3', '#6b7280'
  ];

  function cat(id, name, emoji, color, kind, group) {
    return {
      id: id, name: name, emoji: emoji, color: color,
      kind: kind, group: group, budget: 0, archived: false, system: true
    };
  }

  /* group: 'essencial' (necessidades) · 'estilo' (desejos) · 'futuro' (poupar/investir) */
  function defaultCategories() {
    return [
      cat('cat_alimentacao', 'Alimentação', '🍔', '#d95926', 'expense', 'essencial'),
      cat('cat_mercado', 'Mercado', '🛒', '#c98500', 'expense', 'essencial'),
      cat('cat_transporte', 'Transporte', '🚗', '#3987e5', 'expense', 'essencial'),
      cat('cat_moradia', 'Moradia', '🏠', '#9085e9', 'expense', 'essencial'),
      cat('cat_contas', 'Contas & Serviços', '💡', '#12a594', 'expense', 'essencial'),
      cat('cat_saude', 'Saúde', '💊', '#199e70', 'expense', 'essencial'),
      cat('cat_educacao', 'Educação', '📚', '#008300', 'expense', 'futuro'),
      cat('cat_lazer', 'Lazer', '🎮', '#d55181', 'expense', 'estilo'),
      cat('cat_compras', 'Compras', '🛍️', '#a0763c', 'expense', 'estilo'),
      cat('cat_assinaturas', 'Assinaturas', '🔁', '#e66767', 'expense', 'estilo'),
      cat('cat_dividas', 'Dívidas & Juros', '🧾', '#FF1F3D', 'expense', 'essencial'),
      cat('cat_impostos', 'Impostos & Taxas', '🏛️', '#7f8da3', 'expense', 'essencial'),
      cat('cat_investimento', 'Aporte / Investimento', '📈', '#199e70', 'expense', 'futuro'),
      cat('cat_outros', 'Outros', '📦', '#6b7280', 'expense', 'estilo'),

      cat('cat_salario', 'Salário', '💼', '#199e70', 'income', 'renda'),
      cat('cat_extra', 'Renda extra', '🧑‍💻', '#3987e5', 'income', 'renda'),
      cat('cat_rendimentos', 'Rendimentos', '📊', '#c98500', 'income', 'renda'),
      cat('cat_dividendos', 'Dividendos', '💰', '#d55181', 'income', 'renda'),
      cat('cat_reembolso', 'Reembolso / Presente', '🎁', '#9085e9', 'income', 'renda'),
      cat('cat_outras_receitas', 'Outras receitas', '📥', '#6b7280', 'income', 'renda')
    ];
  }

  function defaultAccounts() {
    return [
      { id: 'acc_carteira', name: 'Carteira', emoji: '👛', kind: 'cash', color: '#c98500', opening: 0, archived: false, system: true },
      { id: 'acc_corrente', name: 'Conta Corrente', emoji: '🏦', kind: 'checking', color: '#3987e5', opening: 0, archived: false, system: true },
      { id: 'acc_poupanca', name: 'Poupança / Reserva', emoji: '🐷', kind: 'savings', color: '#199e70', opening: 0, archived: false, system: true },
      { id: 'acc_credito', name: 'Cartão de Crédito', emoji: '💳', kind: 'credit', color: '#d55181', opening: 0, archived: false, system: true }
    ];
  }

  function defaultPlan() {
    return {
      monthlyIncome: 0,
      method: '50-30-20',
      groupTargets: { essencial: 50, estilo: 30, futuro: 20 },
      savingsTargetPct: 20,
      budgets: {},            /* categoryId → centavos por mês */
      emergencyMonths: 6,
      riskProfile: 'moderado',
      horizonYears: 10,
      expectedReturnPct: 10.5,
      inflationPct: 4.5,
      payday: 5,
      updatedAt: null
    };
  }

  function defaultSettings() {
    return {
      theme: 'dark',
      amoled: false,
      accent: '#FF1F3D',
      cvdSafe: false,          /* paleta reforçada p/ daltonismo */
      hideValues: false,       /* modo privacidade: valores embaçados */
      startPage: 'dashboard',
      autoLockMin: 15,
      brapiToken: '',
      autoRefreshPrices: true,
      dashboardCharts: ['cashflow', 'categories', 'balance', 'savings'],
      autoSnapshot: true,
      snapshotKeep: 30,
      compactList: false,
      showCents: true,
      remindersEnabled: true
    };
  }

  function blank(displayName) {
    var t = new Date().toISOString();
    return {
      schema: SCHEMA,
      appVersion: APP_VERSION,
      profile: {
        displayName: displayName || 'Você',
        avatar: '🦅',
        currency: 'BRL',
        locale: 'pt-BR',
        onboarded: false,
        createdAt: t
      },
      settings: defaultSettings(),
      plan: defaultPlan(),
      categories: defaultCategories(),
      accounts: defaultAccounts(),
      transactions: [],
      recurrences: [],
      goals: [],
      investments: [],
      notes: [],
      meta: { createdAt: t, updatedAt: t, saves: 0, lastSnapshotAt: null, lastRecurrenceRun: null }
    };
  }

  /* ═══════════ NORMALIZAÇÃO ═══════════
     Roda em toda abertura de cofre. Conserta campos ausentes,
     coage dinheiro para inteiro, normaliza datas e remove ids
     duplicados — é o que mantém o app estável depois de uma
     importação manual ou de um backup antigo.                   */

  function toCents(v, fallback) {
    if (v == null || v === '') return fallback || 0;
    if (typeof v === 'number') return Dm.roundHalfUp(v);
    var p = Money.parse(v);
    return isFinite(p) ? p : (fallback || 0);
  }
  function toInt(v, fallback) {
    var n = parseInt(v, 10);
    return isFinite(n) ? n : (fallback || 0);
  }
  function toNum(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }
  function str(v, fallback) {
    return (v == null || v === '') ? (fallback || '') : String(v);
  }
  function bool(v, d) { return v == null ? !!d : !!v; }

  function dedupeIds(arr, prefix) {
    var seen = {};
    (arr || []).forEach(function (o) {
      if (!o.id || seen[o.id]) o.id = uid(prefix);
      seen[o.id] = true;
    });
    return arr;
  }

  function normalize(data) {
    var out = data && typeof data === 'object' ? data : {};
    var base = blank();

    out.schema = toInt(out.schema, SCHEMA);
    out.appVersion = str(out.appVersion, APP_VERSION);

    /* perfil */
    out.profile = out.profile || {};
    out.profile.displayName = str(out.profile.displayName, base.profile.displayName);
    out.profile.avatar = str(out.profile.avatar, '🦅');
    out.profile.currency = 'BRL';
    out.profile.locale = 'pt-BR';
    out.profile.onboarded = bool(out.profile.onboarded, false);
    out.profile.createdAt = str(out.profile.createdAt, base.profile.createdAt);

    /* configurações — preenche só o que falta, preserva o resto */
    var ds = defaultSettings();
    out.settings = out.settings || {};
    Object.keys(ds).forEach(function (k) {
      if (out.settings[k] === undefined || out.settings[k] === null) out.settings[k] = ds[k];
    });
    out.settings.autoLockMin = clamp(toInt(out.settings.autoLockMin, 15), 0, 480);
    out.settings.snapshotKeep = clamp(toInt(out.settings.snapshotKeep, 30), 5, 100);
    if (!Array.isArray(out.settings.dashboardCharts) || !out.settings.dashboardCharts.length) {
      out.settings.dashboardCharts = ds.dashboardCharts.slice();
    }

    /* categorias — garante as do sistema, preserva as do usuário */
    var cats = Array.isArray(out.categories) ? out.categories : [];
    var byId = {};
    cats.forEach(function (c) { if (c && c.id) byId[c.id] = c; });
    defaultCategories().forEach(function (dc) {
      if (!byId[dc.id]) { cats.push(dc); byId[dc.id] = dc; }
    });
    cats.forEach(function (c, i) {
      c.id = str(c.id, uid('cat'));
      c.name = str(c.name, 'Categoria');
      c.emoji = str(c.emoji, '📦');
      c.color = /^#[0-9a-f]{6}$/i.test(str(c.color)) ? c.color : CAT_COLORS[i % CAT_COLORS.length];
      c.kind = (c.kind === 'income' || c.kind === 'expense') ? c.kind : 'expense';
      c.group = str(c.group, c.kind === 'income' ? 'renda' : 'estilo');
      c.budget = Math.max(0, toCents(c.budget, 0));
      c.archived = bool(c.archived, false);
    });
    out.categories = dedupeIds(cats, 'cat');

    /* contas */
    var accs = Array.isArray(out.accounts) ? out.accounts : [];
    var aById = {};
    accs.forEach(function (a) { if (a && a.id) aById[a.id] = a; });
    defaultAccounts().forEach(function (da) { if (!aById[da.id]) { accs.push(da); aById[da.id] = da; } });
    accs.forEach(function (a) {
      a.id = str(a.id, uid('acc'));
      a.name = str(a.name, 'Conta');
      a.emoji = str(a.emoji, '🏦');
      a.kind = str(a.kind, 'checking');
      a.color = /^#[0-9a-f]{6}$/i.test(str(a.color)) ? a.color : '#3987e5';
      a.opening = toCents(a.opening, 0);
      a.archived = bool(a.archived, false);
    });
    out.accounts = dedupeIds(accs, 'acc');

    /* plano */
    var dp = defaultPlan();
    out.plan = out.plan || {};
    Object.keys(dp).forEach(function (k) {
      if (out.plan[k] === undefined || out.plan[k] === null) out.plan[k] = dp[k];
    });
    out.plan.monthlyIncome = Math.max(0, toCents(out.plan.monthlyIncome, 0));
    out.plan.savingsTargetPct = clamp(toNum(out.plan.savingsTargetPct, 20), 0, 90);
    out.plan.emergencyMonths = clamp(toInt(out.plan.emergencyMonths, 6), 1, 36);
    out.plan.horizonYears = clamp(toInt(out.plan.horizonYears, 10), 1, 50);
    out.plan.expectedReturnPct = clamp(toNum(out.plan.expectedReturnPct, 10.5), 0, 40);
    out.plan.inflationPct = clamp(toNum(out.plan.inflationPct, 4.5), 0, 40);
    out.plan.payday = clamp(toInt(out.plan.payday, 5), 1, 31);
    out.plan.groupTargets = out.plan.groupTargets || dp.groupTargets;
    ['essencial', 'estilo', 'futuro'].forEach(function (g) {
      out.plan.groupTargets[g] = clamp(toNum(out.plan.groupTargets[g], dp.groupTargets[g]), 0, 100);
    });
    var budg = {};
    Object.keys(out.plan.budgets || {}).forEach(function (k) {
      if (byId[k]) budg[k] = Math.max(0, toCents(out.plan.budgets[k], 0));
    });
    out.plan.budgets = budg;

    /* transações */
    var fallbackCat = { expense: 'cat_outros', income: 'cat_outras_receitas' };
    out.transactions = (Array.isArray(out.transactions) ? out.transactions : []).map(function (t) {
      t = t || {};
      t.id = str(t.id, uid('tx'));
      t.type = t.type === 'income' ? 'income' : 'expense';
      t.desc = str(t.desc, t.type === 'income' ? 'Receita' : 'Despesa').slice(0, 120);
      /* `amount` em centavos é a fonte da verdade; `value` é o
         campo float legado e só é lido se amount não existir */
      t.amount = Math.abs(t.amount != null ? toCents(t.amount, 0) : Money.fromFloat(toNum(t.value, 0)));
      delete t.value;
      t.categoryId = byId[t.categoryId] ? t.categoryId : fallbackCat[t.type];
      t.accountId = aById[t.accountId] ? t.accountId : 'acc_corrente';
      t.date = D.isValid(t.date) ? t.date : D.norm(t.date || t.createdAt || new Date());
      t.createdAt = str(t.createdAt, D.parse(t.date).toISOString());
      t.updatedAt = str(t.updatedAt, t.createdAt);
      t.note = str(t.note, '').slice(0, 500);
      t.tags = Array.isArray(t.tags) ? t.tags.filter(Boolean).map(String).slice(0, 10) : [];
      t.recurrenceId = t.recurrenceId || null;
      t.installment = (t.installment && t.installment.of > 1)
        ? { n: toInt(t.installment.n, 1), of: toInt(t.installment.of, 1), groupId: str(t.installment.groupId, uid('inst')) }
        : null;
      t.goalId = t.goalId || null;
      return t;
    });
    dedupeIds(out.transactions, 'tx');
    /* ordem canônica: data desc, depois criação desc */
    out.transactions.sort(function (a, b) {
      return a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt))
        : b.date.localeCompare(a.date);
    });

    /* recorrências */
    out.recurrences = (Array.isArray(out.recurrences) ? out.recurrences : []).map(function (r) {
      r = r || {};
      r.id = str(r.id, uid('rec'));
      r.desc = str(r.desc, 'Recorrência').slice(0, 120);
      r.type = r.type === 'income' ? 'income' : 'expense';
      r.amount = Math.abs(toCents(r.amount, 0));
      r.categoryId = byId[r.categoryId] ? r.categoryId : fallbackCat[r.type];
      r.accountId = aById[r.accountId] ? r.accountId : 'acc_corrente';
      r.frequency = ['monthly', 'weekly', 'yearly'].indexOf(r.frequency) >= 0 ? r.frequency : 'monthly';
      r.dayOfMonth = clamp(toInt(r.dayOfMonth, 5), 1, 31);
      r.weekday = clamp(toInt(r.weekday, 1), 0, 6);
      r.startDate = D.isValid(r.startDate) ? r.startDate : D.today();
      r.endDate = D.isValid(r.endDate) ? r.endDate : null;
      r.lastRun = D.isValid(r.lastRun) ? r.lastRun : null;
      r.active = bool(r.active, true);
      return r;
    });
    dedupeIds(out.recurrences, 'rec');

    /* metas */
    out.goals = (Array.isArray(out.goals) ? out.goals : []).map(function (g) {
      g = g || {};
      g.id = str(g.id, uid('goal'));
      g.name = str(g.name, 'Meta').slice(0, 80);
      g.emoji = str(g.emoji, '🎯');
      g.color = /^#[0-9a-f]{6}$/i.test(str(g.color)) ? g.color : '#3987e5';
      g.kind = str(g.kind, 'outro');
      g.target = Math.max(0, toCents(g.target, 0));
      g.deadline = D.isValid(g.deadline) ? g.deadline : null;
      g.priority = clamp(toInt(g.priority, 2), 1, 3);
      g.monthlyPlan = Math.max(0, toCents(g.monthlyPlan, 0));
      g.linkAccountId = aById[g.linkAccountId] ? g.linkAccountId : null;
      g.archived = bool(g.archived, false);
      g.createdAt = str(g.createdAt, new Date().toISOString());
      g.note = str(g.note, '').slice(0, 500);
      g.contributions = (Array.isArray(g.contributions) ? g.contributions : []).map(function (c) {
        return {
          id: str(c.id, uid('ctb')),
          date: D.isValid(c.date) ? c.date : D.norm(c.date || new Date()),
          amount: toCents(c.amount, 0),
          note: str(c.note, '').slice(0, 160)
        };
      });
      /* `saved` é sempre derivado das contribuições — nunca
         confiamos num total gravado que possa ter dessincronizado */
      g.saved = g.contributions.reduce(function (s, c) { return s + c.amount; }, 0);
      return g;
    });
    dedupeIds(out.goals, 'goal');

    /* investimentos */
    out.investments = (Array.isArray(out.investments) ? out.investments : []).map(function (v) {
      v = v || {};
      v.id = str(v.id, uid('inv'));
      v.type = ['acao', 'fii', 'rf'].indexOf(v.type) >= 0 ? v.type : 'acao';
      v.addedAt = str(v.addedAt, new Date().toISOString());
      v.note = str(v.note, '').slice(0, 300);

      v.dividends = (Array.isArray(v.dividends) ? v.dividends : []).map(function (d) {
        return {
          id: str(d.id, uid('div')),
          date: D.isValid(d.date) ? d.date : D.norm(d.date || new Date()),
          amount: Math.max(0, toCents(d.amount, 0)),
          note: str(d.note, '').slice(0, 120)
        };
      });

      if (v.type === 'rf') {
        v.name = str(v.name, 'Renda Fixa').slice(0, 80);
        v.principal = Math.max(0, toCents(v.principal != null ? v.principal : v.value, 0));
        v.yieldValue = toCents(v.yieldValue != null ? v.yieldValue : v.rent, 0);
        v.indexer = str(v.indexer, 'CDI');
        v.ratePct = toNum(v.ratePct, 0);
        v.maturity = D.isValid(v.maturity) ? v.maturity : null;
        v.lots = [];
      } else {
        v.ticker = str(v.ticker, '').toUpperCase().slice(0, 12);
        v.name = str(v.name, v.ticker);
        v.longName = str(v.longName, v.ticker);
        /* lotes são a fonte da verdade do preço médio; se o cofre
           antigo só tinha qty+avgPrice, viram um lote de compra */
        v.lots = (Array.isArray(v.lots) ? v.lots : []).map(function (l) {
          return {
            id: str(l.id, uid('lot')),
            kind: l.kind === 'sell' ? 'sell' : 'buy',
            date: D.isValid(l.date) ? l.date : D.norm(l.date || v.addedAt),
            qty: Math.abs(Dm.roundTo(toNum(l.qty, 0), 8)),
            price: Math.max(0, toCents(l.price, 0)),
            fees: Math.max(0, toCents(l.fees, 0))
          };
        }).filter(function (l) { return l.qty > 0; });

        if (!v.lots.length && toNum(v.qty, 0) > 0) {
          v.lots = [{
            id: uid('lot'), kind: 'buy', date: D.norm(v.addedAt),
            qty: Dm.roundTo(toNum(v.qty, 0), 8),
            price: toCents(v.avgPrice != null ? v.avgPrice : Money.fromFloat(toNum(v.avgPrice, 0)), 0),
            fees: 0
          }];
        }
        v.lots.sort(function (a, b) { return a.date.localeCompare(b.date); });
        delete v.qty; delete v.avgPrice;

        v.currentPrice = v.currentPrice == null ? null : Math.max(0, toCents(v.currentPrice, 0));
        v.changePct = toNum(v.changePct != null ? v.changePct : v.regularMarketChangePercent, 0);
        delete v.regularMarketChangePercent;
        v.lastUpdated = v.lastUpdated || null;
      }
      return v;
    });
    dedupeIds(out.investments, 'inv');

    /* notas */
    out.notes = (Array.isArray(out.notes) ? out.notes : []).map(function (n) {
      n = n || {};
      n.id = str(n.id, uid('note'));
      n.title = str(n.title, '').slice(0, 120);
      n.body = str(n.body, '').slice(0, 20000);
      n.color = str(n.color, 'default');
      n.pinned = bool(n.pinned, false);
      n.archived = bool(n.archived, false);
      n.tags = Array.isArray(n.tags) ? n.tags.filter(Boolean).map(String).slice(0, 12) : [];
      n.checklist = (Array.isArray(n.checklist) ? n.checklist : []).map(function (i) {
        return { id: str(i.id, uid('chk')), text: str(i.text, '').slice(0, 200), done: bool(i.done, false) };
      });
      n.remindAt = D.isValid(n.remindAt) ? n.remindAt : null;
      n.createdAt = str(n.createdAt, new Date().toISOString());
      n.updatedAt = str(n.updatedAt, n.createdAt);
      return n;
    });
    dedupeIds(out.notes, 'note');

    /* meta */
    out.meta = out.meta || {};
    out.meta.createdAt = str(out.meta.createdAt, new Date().toISOString());
    out.meta.updatedAt = str(out.meta.updatedAt, out.meta.createdAt);
    out.meta.saves = toInt(out.meta.saves, 0);
    out.meta.lastSnapshotAt = out.meta.lastSnapshotAt || null;
    out.meta.lastRecurrenceRun = out.meta.lastRecurrenceRun || null;

    return out;
  }

  /* ═══════════ MIGRAÇÕES ═══════════
     Cada passo é uma função schema N → N+1. Rodam em cadeia, de
     onde o cofre estiver até o schema atual. Nunca removem
     campos antigos sem antes copiá-los para o novo formato.     */

  var MIGRATIONS = {
    /* 1→2: `value` float vira `amount` em centavos */
    2: function (d) {
      (d.transactions || []).forEach(function (t) {
        if (t.amount == null && t.value != null) t.amount = Money.fromFloat(t.value);
      });
      return d;
    },
    /* 2→3: categoria por nome vira categoryId; data ISO vira YYYY-MM-DD */
    3: function (d) {
      var nameMap = {};
      defaultCategories().forEach(function (c) { nameMap[c.name.toLowerCase()] = c.id; });
      nameMap['investimento'] = 'cat_investimento';
      (d.transactions || []).forEach(function (t) {
        if (!t.categoryId && t.category) {
          t.categoryId = nameMap[String(t.category).toLowerCase()] ||
            (t.type === 'income' ? 'cat_outras_receitas' : 'cat_outros');
        }
        if (t.date) t.date = D.norm(t.date);
        delete t.category;
      });
      return d;
    },
    /* 3→4: meta única vira lista de metas */
    4: function (d) {
      if (!Array.isArray(d.goals)) d.goals = [];
      var legacyGoal = d.goal;
      if (legacyGoal && toNum(legacyGoal, 0) > 0 && !d.goals.length) {
        d.goals.push({
          id: uid('goal'), name: 'Minha meta', emoji: '🎯', color: '#FF1F3D',
          kind: 'outro', target: Money.fromFloat(toNum(legacyGoal, 0)),
          deadline: null, priority: 1, monthlyPlan: 0, contributions: [],
          note: 'Importada da versão anterior do app.',
          createdAt: new Date().toISOString(), archived: false
        });
      }
      d.legacyGoal = legacyGoal == null ? null : legacyGoal;  /* preservado, não apagado */
      delete d.goal;
      return d;
    },
    /* 4→5: investimentos passam a ter lotes e dividendos datados */
    5: function (d) {
      (d.investments || []).forEach(function (v) {
        if (typeof v.dividends === 'number' || typeof v.dividends === 'string') {
          /* o campo antigo era um total float em REAIS, não em centavos */
          var amt = Money.fromFloat(toNum(v.dividends, 0));
          v.dividends = amt > 0
            ? [{ id: uid('div'), date: D.norm(v.addedAt || new Date()), amount: amt, note: 'Importado' }]
            : [];
        }
        if (v.type === 'rf') {
          if (v.principal == null && v.value != null) v.principal = Money.fromFloat(toNum(v.value, 0));
          if (v.yieldValue == null && v.rent != null) v.yieldValue = Money.fromFloat(toNum(v.rent, 0));
        } else if (!v.lots && toNum(v.qty, 0) > 0) {
          v.lots = [{
            id: uid('lot'), kind: 'buy', date: D.norm(v.addedAt || new Date()),
            qty: Dm.roundTo(toNum(v.qty, 0), 8),
            price: Money.fromFloat(toNum(v.avgPrice, 0)), fees: 0
          }];
        }
        if (v.currentPrice != null && v.currentPrice < 1000 && !Number.isInteger(v.currentPrice)) {
          v.currentPrice = Money.fromFloat(v.currentPrice);
        }
      });
      return d;
    }
  };

  /* Converte o localStorage da v2 (dominus_data_v2) num cofre v5 */
  function fromLegacy(legacy) {
    var d = deepClone(legacy) || {};
    d.schema = 1;
    d.transactions = Array.isArray(d.transactions) ? d.transactions : [];
    d.investments = Array.isArray(d.investments) ? d.investments : [];
    /* o preço vindo da v2 era float em reais */
    d.investments.forEach(function (v) {
      if (v.currentPrice != null) v.currentPrice = Money.fromFloat(toNum(v.currentPrice, 0));
      v.changePct = toNum(v.regularMarketChangePercent, 0);
    });
    var res = migrate(d);
    var full = normalize(Object.assign(blank(), res.data));
    full.profile.onboarded = false;
    return full;
  }

  function migrate(data) {
    var d = data || {};
    var from = toInt(d.schema, 1);
    var applied = [];
    for (var v = from + 1; v <= SCHEMA; v++) {
      if (MIGRATIONS[v]) {
        try { d = MIGRATIONS[v](d) || d; applied.push(v); }
        catch (e) { console.error('[Dominus] falha na migração para schema ' + v, e); }
      }
      d.schema = v;
    }
    d.schema = SCHEMA;
    return { data: d, applied: applied, from: from };
  }

  /* ═══════════ HISTÓRICO / PONTOS DE RESTAURAÇÃO ═══════════ */

  var History = {
    read: function (userId) {
      var h = Store.get(Store.histKey(userId), null);
      if (!h || !Array.isArray(h.entries)) h = { v: 1, entries: [] };
      return h;
    },
    write: function (userId, h) { return Store.set(Store.histKey(userId), h); },

    /* Grava um ponto de restauração. `reason`:
       'auto' | 'manual' | 'migration' | 'import' | 'update' | 'pre-restore' | 'pre-wipe' */
    add: function (ctx, snapshotData, label, reason) {
      var h = History.read(ctx.userId);
      var payload = {
        id: uid('snap'),
        at: new Date().toISOString(),
        label: String(label || 'Ponto de restauração'),
        reason: reason || 'auto',
        schema: snapshotData.schema || SCHEMA,
        appVersion: snapshotData.appVersion || APP_VERSION,
        counts: {
          tx: (snapshotData.transactions || []).length,
          goals: (snapshotData.goals || []).length,
          inv: (snapshotData.investments || []).length,
          notes: (snapshotData.notes || []).length
        }
      };
      var body = JSON.stringify(snapshotData);
      payload.bytes = body.length;

      var store = function (sealed) {
        payload.enc = sealed.enc;
        payload.data = sealed.data;
        h.entries.unshift(payload);
        History.prune(h, ctx.keep);
        var res = History.write(ctx.userId, h);
        if (!res.ok && res.quota) {
          /* sem espaço: descarta os automáticos mais antigos e tenta de novo */
          h.entries = h.entries.filter(function (e, i) { return i === 0 || e.reason !== 'auto'; }).slice(0, 8);
          res = History.write(ctx.userId, h);
        }
        return res;
      };

      if (ctx.enc === 'aes' && ctx.dek) {
        return Sec.encryptJson(ctx.dek, snapshotData, 'dominus-history')
          .then(function (p) { return store({ enc: 'aes', data: p }); });
      }
      return Promise.resolve(store({ enc: 'none', data: snapshotData }));
    },

    /* Mantém todos os pontos manuais/migração/atualização e só
       poda os automáticos, dos mais antigos para os mais novos. */
    prune: function (h, keep) {
      keep = clamp(toInt(keep, 30), 5, 100);
      if (h.entries.length <= keep) return h;
      var protectedReasons = { manual: 1, migration: 1, update: 1, import: 1, 'pre-restore': 1, 'pre-wipe': 1 };
      var autos = [];
      h.entries.forEach(function (e, i) { if (!protectedReasons[e.reason]) autos.push(i); });
      while (h.entries.length > keep && autos.length) {
        var idx = autos.pop();
        h.entries.splice(idx, 1);
        autos = autos.map(function (i) { return i > idx ? i - 1 : i; });
      }
      /* se ainda estourou, os protegidos mais antigos saem por último */
      if (h.entries.length > keep) h.entries = h.entries.slice(0, keep);
      return h;
    },

    list: function (userId) {
      return History.read(userId).entries.map(function (e) {
        return {
          id: e.id, at: e.at, label: e.label, reason: e.reason,
          schema: e.schema, appVersion: e.appVersion,
          counts: e.counts || {}, bytes: e.bytes || 0, enc: e.enc
        };
      });
    },

    load: function (ctx, snapId) {
      var h = History.read(ctx.userId);
      var entry = null;
      for (var i = 0; i < h.entries.length; i++) if (h.entries[i].id === snapId) entry = h.entries[i];
      if (!entry) return Promise.reject(new Error('SNAPSHOT_NOT_FOUND'));
      if (entry.enc === 'aes') {
        if (!ctx.dek) return Promise.reject(new Error('LOCKED'));
        return Sec.decryptJson(ctx.dek, entry.data, 'dominus-history');
      }
      return Promise.resolve(deepClone(entry.data));
    },

    remove: function (userId, snapId) {
      var h = History.read(userId);
      h.entries = h.entries.filter(function (e) { return e.id !== snapId; });
      return History.write(userId, h);
    },

    clear: function (userId) { Store.del(Store.histKey(userId)); }
  };

  /* ═══════════ COFRE ═══════════ */

  var Vault = {
    exists: function (userId) {
      return Store.get(Store.vaultKey(userId), null) !== null;
    },

    /* Lê e descriptografa. Em caso de falha NUNCA sobrescreve o
       que está no disco — devolve o erro para a UI decidir.     */
    open: function (userId, dek) {
      var raw = Store.get(Store.vaultKey(userId), null);
      if (!raw) return Promise.resolve(null);
      if (raw.enc === 'aes') {
        if (!dek) return Promise.reject(new Error('LOCKED'));
        return Sec.decryptJson(dek, { iv: raw.iv, ct: raw.ct }, 'dominus-vault')
          .catch(function () { throw new Error('DECRYPT_FAILED'); });
      }
      return Promise.resolve(raw.data);
    },

    save: function (userId, dek, enc, data) {
      var write = function (payload) {
        var res = Store.set(Store.vaultKey(userId), payload);
        if (!res.ok && res.quota) {
          /* libera espaço podando histórico automático e tenta de novo */
          var h = History.read(userId);
          h.entries = h.entries.filter(function (e, i) { return i < 3 || e.reason !== 'auto'; });
          History.write(userId, h);
          res = Store.set(Store.vaultKey(userId), payload);
        }
        return res;
      };
      if (enc === 'aes' && dek) {
        return Sec.encryptJson(dek, data, 'dominus-vault').then(function (p) {
          return write({ v: 1, enc: 'aes', iv: p.iv, ct: p.ct, at: new Date().toISOString() });
        });
      }
      return Promise.resolve(write({ v: 1, enc: 'none', data: data, at: new Date().toISOString() }));
    },

    destroy: function (userId) {
      Store.del(Store.vaultKey(userId));
      Store.del(Store.histKey(userId));
    }
  };

  /* ═══════════ DB — estado vivo da sessão ═══════════ */

  var DB = {
    userId: null,
    dek: null,
    enc: 'none',
    data: null,
    dirty: false,
    lastError: null,
    _listeners: [],

    isOpen: function () { return !!(DB.userId && DB.data); },

    ctx: function () {
      return {
        userId: DB.userId, dek: DB.dek, enc: DB.enc,
        keep: (DB.data && DB.data.settings && DB.data.settings.snapshotKeep) || 30
      };
    },

    onChange: function (fn) { DB._listeners.push(fn); },
    emit: function (what) {
      DB._listeners.forEach(function (f) { try { f(what); } catch (e) { console.error(e); } });
    },

    /* Abre a sessão: lê, migra (com ponto de restauração antes),
       normaliza e grava de volta se algo mudou.                  */
    mount: function (userId, dek, enc, displayName) {
      DB.userId = userId; DB.dek = dek; DB.enc = enc;
      return Vault.open(userId, dek).then(function (raw) {
        if (!raw) {
          DB.data = normalize(blank(displayName));
          return DB.saveNow().then(function () { return { fresh: true, migrated: [] }; });
        }
        var res = migrate(deepClone(raw));
        var needsSnapshot = res.applied.length > 0 ||
          (raw.appVersion && raw.appVersion !== APP_VERSION);

        var proceed = Promise.resolve();
        if (needsSnapshot) {
          /* o retrato é do dado ORIGINAL, antes de qualquer mexida */
          var label = res.applied.length
            ? 'Antes de migrar para o formato v' + SCHEMA
            : 'Antes de atualizar para a versão ' + APP_VERSION;
          proceed = History.add(DB.ctx(), raw, label,
            res.applied.length ? 'migration' : 'update').catch(function (e) {
              console.warn('[Dominus] não foi possível gravar o ponto de restauração', e);
            });
        }

        return proceed.then(function () {
          DB.data = normalize(res.data);
          DB.data.appVersion = APP_VERSION;
          if (needsSnapshot) return DB.saveNow().then(function () { return { fresh: false, migrated: res.applied, from: res.from }; });
          return { fresh: false, migrated: [], from: res.from };
        });
      });
    },

    unmount: function () {
      DB.userId = null; DB.dek = null; DB.enc = 'none'; DB.data = null; DB.dirty = false;
    },

    /* Grava agora. Decide sozinho se é hora de um ponto de
       restauração automático (no máximo 1 a cada 30 min).        */
    saveNow: function (opts) {
      opts = opts || {};
      if (!DB.userId || !DB.data) return Promise.resolve({ ok: false });
      DB.data.meta.updatedAt = new Date().toISOString();
      DB.data.meta.saves = (DB.data.meta.saves || 0) + 1;
      DB.data.appVersion = APP_VERSION;

      var pre = Promise.resolve();
      var s = DB.data.settings || {};
      if (s.autoSnapshot && !opts.noSnapshot) {
        var last = DB.data.meta.lastSnapshotAt ? new Date(DB.data.meta.lastSnapshotAt).getTime() : 0;
        if (Date.now() - last > 30 * 60 * 1000) {
          DB.data.meta.lastSnapshotAt = new Date().toISOString();
          pre = History.add(DB.ctx(), deepClone(DB.data), 'Backup automático', 'auto')
            .catch(function () { });
        }
      }

      return pre.then(function () {
        return Vault.save(DB.userId, DB.dek, DB.enc, DB.data);
      }).then(function (res) {
        DB.dirty = !res.ok;
        DB.lastError = res.ok ? null : res;
        if (!res.ok) DB.emit('save-error');
        return res;
      });
    },

    /* Salvamento normal usado pela UI: agrupa rajadas de edição */
    save: function () {
      DB.dirty = true;
      DB._debounced();
      DB.emit('data');
    },

    snapshot: function (label, reason) {
      if (!DB.isOpen()) return Promise.resolve({ ok: false });
      DB.data.meta.lastSnapshotAt = new Date().toISOString();
      return History.add(DB.ctx(), deepClone(DB.data), label || 'Ponto manual', reason || 'manual');
    },

    restore: function (snapId) {
      if (!DB.isOpen()) return Promise.reject(new Error('CLOSED'));
      /* antes de restaurar, guarda o estado atual — restaurar
         também é uma alteração que o usuário pode querer desfazer */
      return DB.snapshot('Antes de restaurar um ponto anterior', 'pre-restore')
        .then(function () { return History.load(DB.ctx(), snapId); })
        .then(function (snap) {
          var res = migrate(deepClone(snap));
          DB.data = normalize(res.data);
          return DB.saveNow({ noSnapshot: true });
        })
        .then(function (r) { DB.emit('restored'); return r; });
    }
  };

  DB._debounced = Dm.debounce(function () { DB.saveNow(); }, 450);

  /* ═══════════ BACKUP ═══════════ */

  var Backup = {
    build: function (data) {
      return {
        format: 'dominus-finance-backup',
        formatVersion: 2,
        schema: data.schema,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        data: deepClone(data)
      };
    },

    filename: function (data) {
      var who = (data.profile && data.profile.displayName || 'dominus')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return 'dominus-' + who + '-' + D.today() + '.json';
    },

    /* Aceita o backup novo e também o JSON cru da versão antiga */
    parse: function (text) {
      var obj = JSON.parse(text);
      var payload = (obj && obj.format === 'dominus-finance-backup') ? obj.data : obj;
      if (!payload || typeof payload !== 'object') throw new Error('BACKUP_INVALIDO');
      var looksLikeVault = payload.transactions || payload.investments ||
        payload.goals || payload.notes || payload.profile;
      if (!looksLikeVault) throw new Error('BACKUP_INVALIDO');
      var res = migrate(deepClone(payload));
      return normalize(Object.assign(blank(), res.data));
    },

    /* merge: 'replace' troca tudo · 'merge' soma sem duplicar */
    apply: function (incoming, mode) {
      if (!DB.isOpen()) return Promise.reject(new Error('CLOSED'));
      return DB.snapshot('Antes de importar um backup', 'import').then(function () {
        if (mode === 'replace') {
          var keepSettings = deepClone(DB.data.settings);
          DB.data = incoming;
          /* preferências de aparência/segurança do aparelho atual
             continuam valendo, não vêm do arquivo */
          DB.data.settings.autoLockMin = keepSettings.autoLockMin;
          DB.data.settings.theme = keepSettings.theme;
        } else {
          DB.data = Backup.merge(DB.data, incoming);
        }
        DB.data = normalize(DB.data);
        return DB.saveNow({ noSnapshot: true });
      });
    },

    merge: function (base, inc) {
      var out = deepClone(base);
      var mergeList = function (key, keyFn) {
        var seen = {};
        (out[key] || []).forEach(function (o) { seen[keyFn(o)] = true; });
        (inc[key] || []).forEach(function (o) {
          var k = keyFn(o);
          if (!seen[k]) { out[key].push(o); seen[k] = true; }
        });
      };
      /* chave natural evita duplicar o mesmo lançamento importado
         duas vezes, mesmo que o id tenha sido regerado */
      mergeList('transactions', function (t) { return [t.date, t.amount, t.type, t.desc.toLowerCase()].join('|'); });
      mergeList('goals', function (g) { return g.name.toLowerCase() + '|' + g.target; });
      mergeList('notes', function (n) { return (n.title + '|' + n.body).toLowerCase().slice(0, 120); });
      mergeList('investments', function (v) { return v.type + '|' + (v.ticker || v.name).toLowerCase(); });
      mergeList('recurrences', function (r) { return r.desc.toLowerCase() + '|' + r.amount; });
      (inc.categories || []).forEach(function (c) {
        var has = out.categories.some(function (o) { return o.id === c.id || o.name.toLowerCase() === c.name.toLowerCase(); });
        if (!has) out.categories.push(c);
      });
      (inc.accounts || []).forEach(function (a) {
        var has = out.accounts.some(function (o) { return o.id === a.id || o.name.toLowerCase() === a.name.toLowerCase(); });
        if (!has) out.accounts.push(a);
      });
      if (!out.profile.onboarded && inc.profile && inc.profile.onboarded) {
        out.profile.onboarded = true;
        out.plan = inc.plan;
      }
      return out;
    }
  };

  Dm.Schema = {
    blank: blank, normalize: normalize, migrate: migrate, fromLegacy: fromLegacy,
    defaultCategories: defaultCategories, defaultAccounts: defaultAccounts,
    defaultPlan: defaultPlan, defaultSettings: defaultSettings,
    CAT_COLORS: CAT_COLORS, SCHEMA: SCHEMA
  };
  Dm.Vault = Vault;
  Dm.History = History;
  Dm.Backup = Backup;
  Dm.DB = DB;
})(typeof window !== 'undefined' ? window : globalThis);
