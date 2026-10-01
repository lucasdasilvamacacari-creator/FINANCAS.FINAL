/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — MOTOR DE CÁLCULO
   Tudo que é derivado (séries mensais, orçamento, posição da
   carteira, projeções, ritmo das metas) nasce aqui. Nenhuma
   tela recalcula por conta própria — assim um número nunca
   discorda do outro.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Dm = global.Dominus;
  var Money = Dm.Money, D = Dm.D, roundTo = Dm.roundTo, roundHalfUp = Dm.roundHalfUp, clamp = Dm.clamp;

  /* ─── índices auxiliares ─── */
  function indexBy(arr, key) {
    var m = {};
    (arr || []).forEach(function (o) { m[o[key]] = o; });
    return m;
  }

  var F = {};

  /* Índices com memória: a lista de lançamentos pede a categoria
     uma vez por linha, e reconstruir o índice a cada chamada
     transformava o extrato em O(linhas × categorias). A memória é
     invalidada pela própria referência do array, que muda sempre
     que o cofre é normalizado ou recarregado. */
  function memoIndex(slot) {
    var lastArr = null, lastMap = null;
    return function (data) {
      var arr = data[slot];
      if (arr === lastArr && lastMap) return lastMap;
      lastArr = arr;
      lastMap = indexBy(arr, 'id');
      return lastMap;
    };
  }

  F.catIndex = memoIndex('categories');
  F.accIndex = memoIndex('accounts');
  F.invalidateIndex = function () { F.catIndex = memoIndex('categories'); F.accIndex = memoIndex('accounts'); };

  F.cat = function (data, id) {
    return F.catIndex(data)[id] ||
      { id: id, name: 'Sem categoria', emoji: '📦', color: '#6b7280', group: 'estilo', kind: 'expense' };
  };

  /* ═══════════ TOTAIS E FILTROS ═══════════ */

  F.totals = function (txs) {
    var income = 0, expense = 0;
    (txs || []).forEach(function (t) {
      if (t.type === 'income') income += t.amount; else expense += t.amount;
    });
    return { income: income, expense: expense, net: income - expense, count: (txs || []).length };
  };

  F.inMonth = function (txs, monthKey) {
    return (txs || []).filter(function (t) { return D.monthKey(t.date) === monthKey; });
  };

  F.between = function (txs, fromYmd, toYmd) {
    return (txs || []).filter(function (t) { return t.date >= fromYmd && t.date <= toYmd; });
  };

  F.lastNDays = function (txs, n) {
    var from = D.addDays(D.today(), -(n - 1));
    return F.between(txs, from, D.today());
  };

  /* Meses que têm movimento, do mais recente para o mais antigo */
  F.monthsWithData = function (data) {
    var set = {};
    (data.transactions || []).forEach(function (t) { set[D.monthKey(t.date)] = true; });
    return Object.keys(set).sort().reverse();
  };

  /* Série mensal contínua (sem buracos) terminando no mês atual */
  F.monthlySeries = function (data, nMonths) {
    nMonths = nMonths || 12;
    var txs = data.transactions || [];
    var current = D.monthKey(D.today());
    var keys = [];
    for (var i = nMonths - 1; i >= 0; i--) keys.push(D.addMonthKey(current, -i));

    var byMonth = {};
    keys.forEach(function (k) { byMonth[k] = { key: k, income: 0, expense: 0, count: 0 }; });
    var earliest = keys[0];
    var before = 0;   /* saldo acumulado antes da janela */

    txs.forEach(function (t) {
      var k = D.monthKey(t.date);
      if (byMonth[k]) {
        if (t.type === 'income') byMonth[k].income += t.amount; else byMonth[k].expense += t.amount;
        byMonth[k].count++;
      } else if (k < earliest) {
        before += (t.type === 'income' ? t.amount : -t.amount);
      }
    });

    var opening = (data.accounts || []).reduce(function (s, a) {
      return s + (a.archived ? 0 : a.opening);
    }, 0);
    var running = opening + before;

    return keys.map(function (k) {
      var m = byMonth[k];
      m.net = m.income - m.expense;
      running += m.net;
      m.balance = running;
      m.savingsRate = m.income > 0 ? roundTo(m.net / m.income * 100, 1) : null;
      m.label = D.monthLabelShort(k);
      return m;
    });
  };

  /* ═══════════ SALDOS ═══════════ */

  F.balance = function (data) {
    var t = F.totals(data.transactions);
    var opening = (data.accounts || []).reduce(function (s, a) {
      return s + (a.archived ? 0 : a.opening);
    }, 0);
    return opening + t.net;
  };

  F.accountBalances = function (data) {
    var bal = {};
    (data.accounts || []).forEach(function (a) { bal[a.id] = a.opening; });
    (data.transactions || []).forEach(function (t) {
      if (bal[t.accountId] === undefined) bal[t.accountId] = 0;
      bal[t.accountId] += (t.type === 'income' ? t.amount : -t.amount);
    });
    return bal;
  };

  /* ═══════════ CATEGORIAS E GRUPOS ═══════════ */

  /* Gastos por categoria num conjunto de transações, do maior
     para o menor. `kind` filtra receita ou despesa.            */
  F.byCategory = function (data, txs, kind) {
    kind = kind || 'expense';
    var idx = F.catIndex(data), acc = {};
    (txs || []).forEach(function (t) {
      if (t.type !== kind) return;
      if (!acc[t.categoryId]) acc[t.categoryId] = { id: t.categoryId, total: 0, count: 0 };
      acc[t.categoryId].total += t.amount;
      acc[t.categoryId].count++;
    });
    var total = 0;
    var rows = Object.keys(acc).map(function (id) {
      var c = idx[id] || { name: 'Sem categoria', emoji: '📦', color: '#6b7280', group: 'estilo' };
      total += acc[id].total;
      return {
        id: id, name: c.name, emoji: c.emoji, color: c.color, group: c.group,
        total: acc[id].total, count: acc[id].count
      };
    });
    rows.sort(function (a, b) { return b.total - a.total; });
    rows.forEach(function (r) { r.share = total ? roundTo(r.total / total * 100, 1) : 0; });
    return { rows: rows, total: total };
  };

  /* Agrupa em no máximo `max` fatias + "Outras" — é o que mantém
     o gráfico dentro das cores validadas e a legenda legível.  */
  F.foldCategories = function (rows, max) {
    max = max || 6;
    if (rows.length <= max) return rows.slice();
    var head = rows.slice(0, max - 1);
    var tail = rows.slice(max - 1);
    var sum = tail.reduce(function (s, r) { return s + r.total; }, 0);
    var share = tail.reduce(function (s, r) { return s + r.share; }, 0);
    head.push({
      id: '__other__', name: 'Outras (' + tail.length + ')', emoji: '➕',
      color: '#6b7280', group: 'estilo', total: sum, count: tail.length,
      share: roundTo(share, 1), folded: tail
    });
    return head;
  };

  F.byGroup = function (data, txs) {
    var idx = F.catIndex(data);
    var g = { essencial: 0, estilo: 0, futuro: 0 };
    (txs || []).forEach(function (t) {
      if (t.type !== 'expense') return;
      var c = idx[t.categoryId];
      var grp = (c && g[c.group] !== undefined) ? c.group : 'estilo';
      g[grp] += t.amount;
    });
    return g;
  };

  /* ═══════════ ORÇAMENTO ═══════════ */

  /* Orçamento de uma categoria: o do plano tem prioridade sobre
     o campo antigo gravado na própria categoria.               */
  F.budgetOf = function (data, catId) {
    var p = (data.plan && data.plan.budgets) || {};
    if (p[catId] != null && p[catId] > 0) return p[catId];
    var c = F.catIndex(data)[catId];
    return (c && c.budget) || 0;
  };

  F.budgetReport = function (data, monthKey) {
    monthKey = monthKey || D.monthKey(D.today());
    var txs = F.inMonth(data.transactions, monthKey);
    var spent = {};
    txs.forEach(function (t) {
      if (t.type !== 'expense') return;
      spent[t.categoryId] = (spent[t.categoryId] || 0) + t.amount;
    });

    var today = D.today();
    var isCurrent = monthKey === D.monthKey(today);
    var daysTotal = D.daysInMonthKey(monthKey);
    var dayNow = isCurrent ? D.parse(today).getDate() : daysTotal;
    var elapsed = clamp(dayNow / daysTotal, 0.01, 1);

    var rows = [];
    (data.categories || []).forEach(function (c) {
      if (c.kind !== 'expense' || c.archived) return;
      var budget = F.budgetOf(data, c.id);
      var used = spent[c.id] || 0;
      if (!budget && !used) return;
      /* o ritmo compara o gasto com a fatia do mês já decorrida:
         50% do orçamento no dia 10 é um alerta, no dia 25 não é */
      var expected = roundHalfUp(budget * elapsed);
      rows.push({
        id: c.id, name: c.name, emoji: c.emoji, color: c.color, group: c.group,
        budget: budget, used: used,
        left: budget - used,
        pct: budget ? roundTo(used / budget * 100, 1) : null,
        expected: expected,
        pace: budget ? roundTo(used / Math.max(expected, 1) * 100, 0) : null,
        over: budget > 0 && used > budget,
        atRisk: budget > 0 && used <= budget && used > expected * 1.15
      });
    });
    rows.sort(function (a, b) {
      var ao = a.over ? 0 : (a.atRisk ? 1 : 2), bo = b.over ? 0 : (b.atRisk ? 1 : 2);
      return ao !== bo ? ao - bo : b.used - a.used;
    });

    var totalBudget = rows.reduce(function (s, r) { return s + r.budget; }, 0);
    var totalUsed = rows.reduce(function (s, r) { return s + r.used; }, 0);
    return {
      monthKey: monthKey, rows: rows,
      totalBudget: totalBudget, totalUsed: totalUsed,
      elapsed: elapsed, daysLeft: Math.max(0, daysTotal - dayNow),
      pct: totalBudget ? roundTo(totalUsed / totalBudget * 100, 1) : null
    };
  };

  /* Sugere orçamentos a partir da renda e do método escolhido,
     distribuindo cada fatia do grupo pelo peso histórico de
     gasto de cada categoria (ou igualmente, se não há histórico) */
  F.suggestBudgets = function (data, income, groupTargets) {
    income = income || (data.plan && data.plan.monthlyIncome) || 0;
    groupTargets = groupTargets || (data.plan && data.plan.groupTargets) || { essencial: 50, estilo: 30, futuro: 20 };
    if (!income) return {};

    var hist = F.byCategory(data, F.between(data.transactions,
      D.firstOfMonth(D.addMonthKey(D.monthKey(D.today()), -3)), D.today()), 'expense');
    var weight = {};
    hist.rows.forEach(function (r) { weight[r.id] = r.total; });

    var out = {};
    ['essencial', 'estilo'].forEach(function (grp) {
      var pool = roundHalfUp(income * (groupTargets[grp] || 0) / 100);
      var cats = (data.categories || []).filter(function (c) {
        return c.kind === 'expense' && !c.archived && c.group === grp;
      });
      if (!cats.length || pool <= 0) return;
      var totW = cats.reduce(function (s, c) { return s + (weight[c.id] || 0); }, 0);
      if (totW > 0) {
        var parts = cats.map(function (c) { return weight[c.id] || 0; });
        var assigned = 0;
        cats.forEach(function (c, i) {
          var v = i === cats.length - 1 ? pool - assigned : roundHalfUp(pool * parts[i] / totW);
          assigned += v;
          if (v > 0) out[c.id] = v;
        });
      } else {
        var each = Money.split(pool, cats.length);
        cats.forEach(function (c, i) { out[c.id] = each[i]; });
      }
    });
    return out;
  };

  /* ═══════════ TAXA DE POUPANÇA ═══════════ */

  F.savingsRate = function (data, monthKey) {
    var t = F.totals(F.inMonth(data.transactions, monthKey || D.monthKey(D.today())));
    return {
      income: t.income, expense: t.expense, net: t.net,
      rate: t.income > 0 ? roundTo(t.net / t.income * 100, 1) : null
    };
  };

  /* Média dos últimos n meses fechados (ignora o mês em curso,
     que sempre parece melhor por estar incompleto) */
  F.avgMonthly = function (data, n) {
    n = n || 3;
    var cur = D.monthKey(D.today()), inc = 0, exp = 0, used = 0;
    for (var i = 1; i <= n; i++) {
      var k = D.addMonthKey(cur, -i);
      var t = F.totals(F.inMonth(data.transactions, k));
      if (t.count === 0) continue;
      inc += t.income; exp += t.expense; used++;
    }
    if (!used) {
      var c = F.totals(F.inMonth(data.transactions, cur));
      return { income: c.income, expense: c.expense, months: c.count ? 1 : 0, net: c.net };
    }
    return {
      income: roundHalfUp(inc / used), expense: roundHalfUp(exp / used),
      net: roundHalfUp((inc - exp) / used), months: used
    };
  };

  /* Média mensal só do que é essencial — base da reserva */
  F.avgEssential = function (data, n) {
    n = n || 3;
    var cur = D.monthKey(D.today()), sum = 0, used = 0;
    for (var i = 1; i <= n; i++) {
      var k = D.addMonthKey(cur, -i);
      var txs = F.inMonth(data.transactions, k);
      if (!txs.length) continue;
      sum += F.byGroup(data, txs).essencial;
      used++;
    }
    if (!used) return F.byGroup(data, F.inMonth(data.transactions, cur)).essencial;
    return roundHalfUp(sum / used);
  };

  /* ═══════════ RESERVA DE EMERGÊNCIA ═══════════ */

  F.emergency = function (data) {
    var months = (data.plan && data.plan.emergencyMonths) || 6;
    var monthly = F.avgEssential(data, 3);
    if (!monthly) monthly = roundHalfUp(((data.plan && data.plan.monthlyIncome) || 0) * 0.5);
    var target = monthly * months;

    /* conta como reserva: metas do tipo reserva + contas de poupança */
    var fromGoals = (data.goals || []).reduce(function (s, g) {
      return s + (g.kind === 'reserva' && !g.archived ? g.saved : 0);
    }, 0);
    var bal = F.accountBalances(data);
    var fromSavings = (data.accounts || []).reduce(function (s, a) {
      return s + (a.kind === 'savings' && !a.archived ? Math.max(0, bal[a.id] || 0) : 0);
    }, 0);
    var current = fromGoals + fromSavings;

    return {
      months: months, monthly: monthly, target: target, current: current,
      pct: target ? roundTo(current / target * 100, 1) : 0,
      missing: Math.max(0, target - current),
      coveredMonths: monthly ? roundTo(current / monthly, 1) : 0
    };
  };

  /* ═══════════ METAS ═══════════ */

  F.goalStatus = function (data, goal) {
    var saved = goal.saved || 0;
    var missing = Math.max(0, goal.target - saved);
    var pct = goal.target ? clamp(roundTo(saved / goal.target * 100, 1), 0, 100) : 0;
    var today = D.today();

    var monthsLeft = null, neededMonthly = null, onTrack = null, projectedDate = null;
    if (goal.deadline) {
      monthsLeft = Math.max(0, D.diffMonths(goal.deadline, today) + (D.parse(goal.deadline).getDate() >= D.parse(today).getDate() ? 1 : 0));
      neededMonthly = monthsLeft > 0 ? Math.ceil(missing / monthsLeft) : missing;
    }

    /* ritmo real: média aportada por mês desde a primeira
       contribuição (mínimo 1 mês para não inflar o número) */
    var contribs = goal.contributions || [];
    var pace = 0;
    if (contribs.length) {
      var first = contribs.reduce(function (m, c) { return c.date < m ? c.date : m; }, contribs[0].date);
      var span = Math.max(1, D.diffMonths(today, first) + 1);
      pace = roundHalfUp(saved / span);
    }
    var effective = goal.monthlyPlan || pace;
    if (missing > 0 && effective > 0) {
      var m = Math.ceil(missing / effective);
      projectedDate = D.addMonths(today, m);
    } else if (missing === 0) {
      projectedDate = today;
    }
    if (goal.deadline && projectedDate) onTrack = projectedDate <= goal.deadline;
    else if (goal.deadline && neededMonthly != null) onTrack = effective >= neededMonthly;

    return {
      saved: saved, missing: missing, pct: pct, done: missing === 0 && goal.target > 0,
      monthsLeft: monthsLeft, neededMonthly: neededMonthly,
      pace: pace, planned: goal.monthlyPlan || 0, effective: effective,
      projectedDate: projectedDate, onTrack: onTrack,
      late: !!(goal.deadline && goal.deadline < today && missing > 0)
    };
  };

  F.goalsSummary = function (data) {
    var active = (data.goals || []).filter(function (g) { return !g.archived; });
    var target = 0, saved = 0, planned = 0, late = 0, done = 0;
    active.forEach(function (g) {
      var s = F.goalStatus(data, g);
      target += g.target; saved += s.saved; planned += s.planned;
      if (s.late) late++;
      if (s.done) done++;
    });
    return {
      count: active.length, target: target, saved: saved, planned: planned,
      late: late, done: done,
      pct: target ? roundTo(saved / target * 100, 1) : 0
    };
  };

  /* ═══════════ INVESTIMENTOS ═══════════ */

  /* Preço médio pelo custo médio ponderado (convenção brasileira):
     a venda reduz a posição e o custo proporcionalmente, sem
     alterar o preço médio das cotas que ficaram.               */
  F.position = function (inv) {
    if (inv.type === 'rf') {
      var principal = inv.principal || 0;
      var y = inv.yieldValue || 0;
      return {
        qty: 1, cost: principal, market: principal + y,
        avgPrice: principal, unrealized: y, realized: 0,
        pct: principal ? roundTo(y / principal * 100, 2) : 0,
        hasPrice: true, dividends: F.dividendTotal(inv)
      };
    }
    var qty = 0, cost = 0, realized = 0;
    (inv.lots || []).forEach(function (l) {
      if (l.kind === 'buy') {
        cost += l.qty * l.price + l.fees;
        qty = roundTo(qty + l.qty, 8);
      } else {
        var avg = qty > 0 ? cost / qty : 0;
        var q = Math.min(l.qty, qty);
        realized += q * l.price - l.fees - avg * q;
        cost -= avg * q;
        qty = roundTo(qty - q, 8);
      }
    });
    if (qty <= 0) { qty = 0; cost = 0; }
    var costC = roundHalfUp(cost);
    var hasPrice = inv.currentPrice != null && inv.currentPrice > 0;
    var market = hasPrice ? roundHalfUp(inv.currentPrice * qty) : costC;
    return {
      qty: roundTo(qty, 8),
      cost: costC,
      market: market,
      avgPrice: qty > 0 ? roundHalfUp(cost / qty) : 0,
      unrealized: hasPrice ? market - costC : 0,
      realized: roundHalfUp(realized),
      pct: costC ? roundTo((market - costC) / costC * 100, 2) : 0,
      hasPrice: hasPrice,
      dividends: F.dividendTotal(inv)
    };
  };

  F.dividendTotal = function (inv) {
    return (inv.dividends || []).reduce(function (s, d) { return s + d.amount; }, 0);
  };

  F.portfolio = function (data) {
    var invested = 0, market = 0, dividends = 0, realized = 0;
    var byType = { acao: 0, fii: 0, rf: 0 };
    var countType = { acao: 0, fii: 0, rf: 0 };
    var rows = [];
    (data.investments || []).forEach(function (inv) {
      var p = F.position(inv);
      invested += p.cost; market += p.market;
      dividends += p.dividends; realized += p.realized;
      byType[inv.type] = (byType[inv.type] || 0) + p.market;
      countType[inv.type] = (countType[inv.type] || 0) + 1;
      rows.push({ inv: inv, pos: p });
    });
    var yieldOnCost = invested ? roundTo(dividends / invested * 100, 2) : 0;
    /* concentração pelo índice de Herfindahl normalizado: 0 =
       pulverizado, 100 = tudo num único ativo                    */
    var hhi = 0;
    if (market > 0) rows.forEach(function (r) { var w = r.pos.market / market; hhi += w * w; });
    return {
      rows: rows, invested: invested, market: market, dividends: dividends,
      realized: realized, unrealized: market - invested,
      pct: invested ? roundTo((market - invested) / invested * 100, 2) : 0,
      byType: byType, countType: countType, count: rows.length,
      yieldOnCost: yieldOnCost,
      concentration: roundTo(hhi * 100, 1),
      topShare: market ? roundTo(Math.max.apply(null, [0].concat(rows.map(function (r) { return r.pos.market / market * 100; }))), 1) : 0,
      lastUpdated: (data.investments || []).filter(function (i) { return i.lastUpdated; })
        .map(function (i) { return i.lastUpdated; }).sort().pop() || null
    };
  };

  /* ═══════════ PROJEÇÕES ═══════════ */

  /* Juros compostos mês a mês. `annualPct` nominal; devolve
     também o valor em poder de compra de hoje.                 */
  F.project = function (opts) {
    var start = opts.start || 0;
    var monthly = opts.monthly || 0;
    var months = Math.max(0, Math.round(opts.months || 0));
    var r = Math.pow(1 + (opts.annualPct || 0) / 100, 1 / 12) - 1;
    var infl = Math.pow(1 + (opts.inflationPct || 0) / 100, 1 / 12) - 1;
    var pts = [], bal = start, contributed = 0;
    for (var m = 0; m <= months; m++) {
      if (m > 0) { bal = bal * (1 + r) + monthly; contributed += monthly; }
      pts.push({
        month: m,
        value: roundHalfUp(bal),
        contributed: roundHalfUp(start + contributed),
        real: roundHalfUp(bal / Math.pow(1 + infl, m))
      });
    }
    var last = pts[pts.length - 1];
    return {
      points: pts, final: last.value, finalReal: last.real,
      invested: last.contributed, earnings: last.value - last.contributed,
      monthlyRate: r
    };
  };

  /* Quantos meses para sair de `start` e chegar em `target` */
  F.monthsToTarget = function (start, monthly, target, annualPct) {
    if (start >= target) return 0;
    if (monthly <= 0 && annualPct <= 0) return Infinity;
    var r = Math.pow(1 + (annualPct || 0) / 100, 1 / 12) - 1;
    var bal = start, m = 0;
    while (bal < target && m < 1200) { bal = bal * (1 + r) + monthly; m++; }
    return m >= 1200 ? Infinity : m;
  };

  /* Patrimônio total = saldo em conta + carteira investida */
  F.netWorth = function (data) {
    var pf = F.portfolio(data);
    var cash = F.balance(data);
    return { cash: cash, invested: pf.market, total: cash + pf.market, portfolio: pf };
  };

  /* ═══════════ RECORRÊNCIAS ═══════════ */

  /* Datas que uma recorrência deveria ter gerado até hoje e que
     ainda não foram lançadas.                                   */
  F.pendingRecurrences = function (data) {
    var today = D.today();
    var out = [];
    (data.recurrences || []).forEach(function (r) {
      if (!r.active) return;
      var cursor = r.lastRun ? nextAfter(r, r.lastRun) : firstDue(r);
      var guard = 0;
      while (cursor && cursor <= today && guard++ < 400) {
        if (r.endDate && cursor > r.endDate) break;
        out.push({ rec: r, date: cursor });
        cursor = nextAfter(r, cursor);
      }
    });
    return out;

    function firstDue(rec) {
      if (rec.frequency === 'monthly') {
        var k = D.monthKey(rec.startDate);
        var day = Math.min(rec.dayOfMonth, D.daysInMonthKey(k));
        var cand = k + '-' + (day < 10 ? '0' : '') + day;
        return cand >= rec.startDate ? cand : nextAfter(rec, cand);
      }
      return rec.startDate;
    }
    function nextAfter(rec, from) {
      if (rec.frequency === 'weekly') return D.addDays(from, 7);
      if (rec.frequency === 'yearly') return D.addMonths(from, 12);
      var k = D.addMonthKey(D.monthKey(from), 1);
      var day = Math.min(rec.dayOfMonth, D.daysInMonthKey(k));
      return k + '-' + (day < 10 ? '0' : '') + day;
    }
  };

  /* Lança os pendentes de verdade no extrato. Idempotente: uma
     segunda chamada no mesmo dia não duplica nada.             */
  F.runRecurrences = function (data) {
    var pend = F.pendingRecurrences(data);
    if (!pend.length) return { created: 0 };
    var existing = {};
    (data.transactions || []).forEach(function (t) {
      if (t.recurrenceId) existing[t.recurrenceId + '|' + t.date] = true;
    });
    var created = 0;
    pend.forEach(function (p) {
      var key = p.rec.id + '|' + p.date;
      if (existing[key]) return;
      existing[key] = true;
      data.transactions.unshift({
        id: Dm.uid('tx'), desc: p.rec.desc, amount: p.rec.amount, type: p.rec.type,
        categoryId: p.rec.categoryId, accountId: p.rec.accountId, date: p.date,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        note: 'Lançamento automático (recorrência)', tags: [],
        recurrenceId: p.rec.id, installment: null, goalId: null
      });
      created++;
      if (!p.rec.lastRun || p.date > p.rec.lastRun) p.rec.lastRun = p.date;
    });
    if (created) {
      data.transactions.sort(function (a, b) {
        return a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt))
          : b.date.localeCompare(a.date);
      });
      data.meta.lastRecurrenceRun = D.today();
    }
    return { created: created };
  };

  /* ═══════════ DETECÇÃO DE ASSINATURAS ═══════════
     Mesmo valor, mesma descrição, em 3+ meses distintos →
     provavelmente é uma cobrança recorrente que o usuário não
     cadastrou como recorrência.                                */
  F.detectSubscriptions = function (data) {
    var groups = {};
    (data.transactions || []).forEach(function (t) {
      if (t.type !== 'expense' || t.recurrenceId) return;
      var key = t.desc.toLowerCase().replace(/\s+/g, ' ').trim() + '|' + t.amount;
      (groups[key] = groups[key] || []).push(t);
    });
    var out = [];
    Object.keys(groups).forEach(function (k) {
      var list = groups[k];
      var months = {};
      list.forEach(function (t) { months[D.monthKey(t.date)] = true; });
      var nm = Object.keys(months).length;
      if (nm >= 3) {
        out.push({
          desc: list[0].desc, amount: list[0].amount, categoryId: list[0].categoryId,
          accountId: list[0].accountId, months: nm,
          yearly: list[0].amount * 12,
          lastDate: list.map(function (t) { return t.date; }).sort().pop(),
          dayOfMonth: D.parse(list[0].date).getDate()
        });
      }
    });
    out.sort(function (a, b) { return b.amount - a.amount; });
    return out;
  };

  /* ═══════════ GASTO POR DIA DO MÊS (mapa de calor) ═══════════ */
  F.dailySpend = function (data, monthKey) {
    monthKey = monthKey || D.monthKey(D.today());
    var days = D.daysInMonthKey(monthKey);
    var arr = [];
    for (var i = 1; i <= days; i++) arr.push({ day: i, total: 0, count: 0 });
    F.inMonth(data.transactions, monthKey).forEach(function (t) {
      if (t.type !== 'expense') return;
      var d = D.parse(t.date).getDate();
      if (arr[d - 1]) { arr[d - 1].total += t.amount; arr[d - 1].count++; }
    });
    return { monthKey: monthKey, days: arr, max: Math.max.apply(null, [0].concat(arr.map(function (a) { return a.total; }))) };
  };

  Dm.F = F;
})(typeof window !== 'undefined' ? window : globalThis);
