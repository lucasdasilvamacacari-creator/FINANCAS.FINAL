/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — DIAGNÓSTICO E RECOMENDAÇÕES
   Motor de regras que lê o seu histórico e devolve conselhos
   específicos, com número e com ação. Nada aqui é genérico: toda
   recomendação cita o seu próprio dado e abre a tela onde ela se
   resolve.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Dm = global.Dominus;
  var Money = Dm.Money, D = Dm.D, F = Dm.F, roundTo = Dm.roundTo, clamp = Dm.clamp;

  var I = {};

  /* severidade → peso de ordenação */
  var SEV_RANK = { critical: 0, warn: 1, opportunity: 2, info: 3, good: 4 };

  function mk(o) {
    o.severity = o.severity || 'info';
    o.rank = SEV_RANK[o.severity];
    return o;
  }

  /* ═══════════════════════════════════════════
     NOTA DE SAÚDE FINANCEIRA (0–100)
     Seis pilares com peso explícito. A tela mostra a conta
     inteira — uma nota que você não consegue auditar não serve
     para decidir nada.
  ═══════════════════════════════════════════ */
  I.score = function (data) {
    var plan = data.plan || {};
    var avg = F.avgMonthly(data, 3);
    var sr = F.savingsRate(data);
    var em = F.emergency(data);
    var budget = F.budgetReport(data);
    var goals = F.goalsSummary(data);
    var pf = F.portfolio(data);
    var pillars = [];

    /* 1. Taxa de poupança — 30 pts */
    var target = plan.savingsTargetPct || 20;
    var rate = sr.rate != null ? sr.rate : (avg.income ? roundTo(avg.net / avg.income * 100, 1) : null);
    var p1 = rate == null ? null : clamp(rate / target, 0, 1.2) / 1.2 * 30;
    pillars.push({
      key: 'poupanca', label: 'Taxa de poupança', weight: 30, points: p1,
      detail: rate == null ? 'Sem receitas lançadas ainda'
        : rate + '% da renda sobra (meta ' + target + '%)'
    });

    /* 2. Reserva de emergência — 25 pts */
    var p2 = em.target ? clamp(em.current / em.target, 0, 1) * 25 : null;
    pillars.push({
      key: 'reserva', label: 'Reserva de emergência', weight: 25, points: p2,
      detail: em.target ? em.coveredMonths + ' de ' + em.months + ' meses cobertos'
        : 'Defina quantos meses quer cobrir'
    });

    /* 3. Disciplina de orçamento — 15 pts */
    var p3 = null;
    if (budget.totalBudget > 0) {
      var over = budget.rows.filter(function (r) { return r.over; }).length;
      var withBudget = budget.rows.filter(function (r) { return r.budget > 0; }).length;
      p3 = clamp(1 - over / Math.max(withBudget, 1), 0, 1) * 15;
    }
    pillars.push({
      key: 'orcamento', label: 'Disciplina de orçamento', weight: 15, points: p3,
      detail: budget.totalBudget > 0
        ? budget.rows.filter(function (r) { return r.over; }).length + ' categoria(s) acima do teto'
        : 'Nenhum teto definido'
    });

    /* 4. Peso dos gastos essenciais — 10 pts
       Quanto menor a fatia travada em contas fixas, maior a sua
       liberdade de manobra. Abaixo de 50% = pontuação cheia. */
    var p4 = null;
    if (avg.income > 0) {
      var ess = F.avgEssential(data, 3);
      var essShare = ess / avg.income;
      p4 = clamp((0.75 - essShare) / 0.25, 0, 1) * 10;
      pillars.push({
        key: 'fixos', label: 'Folga nos gastos fixos', weight: 10, points: p4,
        detail: roundTo(essShare * 100, 0) + '% da renda vai para o essencial'
      });
    } else {
      pillars.push({ key: 'fixos', label: 'Folga nos gastos fixos', weight: 10, points: null, detail: 'Sem renda registrada' });
    }

    /* 5. Patrimônio investido — 10 pts (meta: 6 meses de renda) */
    var p5 = null;
    if (avg.income > 0) {
      p5 = clamp(pf.market / (avg.income * 6), 0, 1) * 10;
    } else if (pf.market > 0) { p5 = 10; }
    pillars.push({
      key: 'investido', label: 'Patrimônio investido', weight: 10, points: p5,
      detail: pf.market ? Money.fmt(pf.market) + ' em ' + pf.count + ' ativo(s)' : 'Nenhum investimento cadastrado'
    });

    /* 6. Progresso das metas — 10 pts */
    var p6 = goals.count ? clamp(goals.pct / 100, 0, 1) * 10 : null;
    pillars.push({
      key: 'metas', label: 'Progresso das metas', weight: 10, points: p6,
      detail: goals.count ? goals.pct + '% do total das metas conquistado' : 'Nenhuma meta definida'
    });

    /* Pilares sem dado não penalizam: a nota é normalizada pelo
       peso do que foi possível medir, e a UI diz o que falta. */
    var gotWeight = 0, gotPoints = 0;
    pillars.forEach(function (p) {
      if (p.points != null) { gotWeight += p.weight; gotPoints += p.points; }
    });
    var value = gotWeight > 0 ? Math.round(gotPoints / gotWeight * 100) : 0;

    var label, color, msg;
    if (gotWeight < 30) { label = 'Incompleto'; color = '#898781'; msg = 'Ainda falta dado para calcular sua nota com honestidade.'; }
    else if (value >= 85) { label = 'Excelente'; color = '#0CA30C'; msg = 'Sua base financeira está sólida. Hora de pensar em crescimento.'; }
    else if (value >= 70) { label = 'Boa'; color = '#199E70'; msg = 'No caminho certo. Alguns ajustes e você chega ao topo.'; }
    else if (value >= 50) { label = 'Razoável'; color = '#FAB219'; msg = 'A estrutura existe, mas há pontos que pedem atenção agora.'; }
    else if (value >= 30) { label = 'Frágil'; color = '#EC835A'; msg = 'Vamos focar no essencial: reserva e controle de gastos.'; }
    else { label = 'Em risco'; color = '#D03B3B'; msg = 'Priorize cortar gastos e montar a primeira reserva.'; }

    return {
      value: value, label: label, color: color, message: msg,
      pillars: pillars, coverage: Math.round(gotWeight / 100 * 100),
      measurable: gotWeight
    };
  };

  /* ═══════════════════════════════════════════
     RECOMENDAÇÕES
  ═══════════════════════════════════════════ */
  I.build = function (data) {
    var out = [];
    var plan = data.plan || {};
    var txs = data.transactions || [];
    var cur = D.monthKey(D.today());
    var sr = F.savingsRate(data, cur);
    var avg = F.avgMonthly(data, 3);
    var em = F.emergency(data);
    var budget = F.budgetReport(data, cur);
    var pf = F.portfolio(data);
    var goals = (data.goals || []).filter(function (g) { return !g.archived; });
    var today = D.today();
    var dayNow = D.parse(today).getDate();
    var daysInMonth = D.daysInMonthKey(cur);

    /* ── primeiros passos ── */
    if (!txs.length) {
      out.push(mk({
        id: 'first-tx', severity: 'opportunity', icon: '🚀',
        title: 'Comece pelo primeiro lançamento',
        text: 'Registre sua renda do mês e dois ou três gastos. Com isso o app já consegue calcular sua taxa de poupança e montar seu orçamento.',
        action: { label: 'Lançar agora', kind: 'add-tx' }
      }));
      if (!plan.monthlyIncome) {
        out.push(mk({
          id: 'no-plan', severity: 'opportunity', icon: '🧭',
          title: 'Monte seu plano em 1 minuto',
          text: 'O assistente pergunta sua renda, seus objetivos e o prazo, e devolve orçamento por categoria e metas com valor mensal calculado.',
          action: { label: 'Abrir assistente', kind: 'wizard' }
        }));
      }
      return out;
    }

    /* ── 1. gastando mais do que ganha ── */
    if (sr.income > 0 && sr.net < 0) {
      out.push(mk({
        id: 'negative-month', severity: 'critical', icon: '🔴',
        title: 'Este mês está no vermelho',
        text: 'Você gastou ' + Money.fmt(Math.abs(sr.net)) + ' mais do que recebeu em ' +
          D.monthLabel(cur, true) + '. Comece olhando as duas maiores categorias do mês — é onde o corte dói menos e rende mais.',
        action: { label: 'Ver despesas do mês', kind: 'page', page: 'transactions' }
      }));
    } else if (sr.income > 0 && sr.rate != null) {
      var tgt = plan.savingsTargetPct || 20;
      if (sr.rate < tgt) {
        var falta = Math.round(sr.income * (tgt - sr.rate) / 100);
        out.push(mk({
          id: 'savings-below', severity: sr.rate < tgt / 2 ? 'warn' : 'info', icon: '🪙',
          title: 'Poupança em ' + sr.rate + '%, meta de ' + tgt + '%',
          text: 'Para bater sua meta neste mês faltam ' + Money.fmt(falta) +
            '. Em um ano, essa diferença soma ' + Money.fmt(falta * 12) + '.',
          action: { label: 'Rever plano', kind: 'page', page: 'plan' }
        }));
      } else {
        out.push(mk({
          id: 'savings-ok', severity: 'good', icon: '✅',
          title: 'Meta de poupança batida: ' + sr.rate + '%',
          text: 'Você guardou ' + Money.fmt(sr.net) + ' em ' + D.monthLabel(cur, true) +
            '. Mantendo esse ritmo, são ' + Money.fmt(sr.net * 12) + ' em doze meses.',
          action: goals.length ? { label: 'Direcionar para uma meta', kind: 'page', page: 'goals' } : null
        }));
      }
    }

    /* ── 2. projeção de fechamento do mês ── */
    if (dayNow >= 5 && dayNow < daysInMonth - 2) {
      var monthTx = F.inMonth(txs, cur);
      var t = F.totals(monthTx);
      if (t.expense > 0) {
        var projExpense = Math.round(t.expense / dayNow * daysInMonth);
        var refIncome = t.income || plan.monthlyIncome || avg.income;
        if (refIncome > 0) {
          var projNet = refIncome - projExpense;
          out.push(mk({
            id: 'month-pace', severity: projNet < 0 ? 'warn' : 'info', icon: '⏱️',
            title: 'No ritmo atual, o mês fecha em ' + Money.fmt(projNet, { sign: true }),
            text: 'Você já gastou ' + Money.fmt(t.expense) + ' em ' + dayNow + ' dias — uma média de ' +
              Money.fmt(Math.round(t.expense / dayNow)) + ' por dia. Projetando até o dia ' + daysInMonth +
              ', a despesa chega a ' + Money.fmt(projExpense) + '.' +
              (projNet < 0 ? ' Para fechar no azul, o limite diário cai para ' +
                Money.fmt(Math.max(0, Math.round((refIncome - t.expense) / Math.max(1, daysInMonth - dayNow)))) + '.' : ''),
            action: { label: 'Ver extrato', kind: 'page', page: 'transactions' }
          }));
        }
      }
    }

    /* ── 3. reserva de emergência ── */
    if (em.target > 0) {
      if (em.coveredMonths < 1) {
        out.push(mk({
          id: 'emergency-none', severity: 'critical', icon: '🛡️',
          title: 'Sua reserva cobre menos de um mês',
          text: 'Com ' + Money.fmt(em.monthly) + ' de gastos essenciais por mês, uma reserva de ' +
            em.months + ' meses pede ' + Money.fmt(em.target) + '. Você tem ' + Money.fmt(em.current) +
            '. Esta é a prioridade número um — antes de qualquer investimento de risco.',
          action: { label: 'Criar meta de reserva', kind: 'new-goal', preset: 'reserva' }
        }));
      } else if (em.pct < 100) {
        var mesesFalta = em.monthly ? Math.ceil(em.missing / Math.max(em.monthly * 0.2, 1)) : null;
        out.push(mk({
          id: 'emergency-partial', severity: 'warn', icon: '🛡️',
          title: 'Reserva em ' + em.pct + '% — ' + em.coveredMonths + ' meses cobertos',
          text: 'Faltam ' + Money.fmt(em.missing) + ' para completar ' + em.months + ' meses de tranquilidade.' +
            (mesesFalta && mesesFalta < 120 ? ' Guardando 20% dos seus gastos essenciais por mês, você chega lá em cerca de ' + mesesFalta + ' meses.' : ''),
          action: { label: 'Ver metas', kind: 'page', page: 'goals' }
        }));
      } else {
        out.push(mk({
          id: 'emergency-done', severity: 'good', icon: '🛡️',
          title: 'Reserva de emergência completa',
          text: 'Você cobre ' + em.coveredMonths + ' meses de gastos essenciais. Com a base garantida, o excedente pode ir para objetivos de prazo mais longo.',
          action: { label: 'Ver carteira', kind: 'page', page: 'investments' }
        }));
      }
    }

    /* ── 4. estouro de orçamento ── */
    var over = budget.rows.filter(function (r) { return r.over; });
    var risk = budget.rows.filter(function (r) { return r.atRisk; });
    if (over.length) {
      var worst = over[0];
      out.push(mk({
        id: 'budget-over', severity: 'warn', icon: '⚠️',
        title: worst.emoji + ' ' + worst.name + ' passou do teto',
        text: 'Gasto de ' + Money.fmt(worst.used) + ' contra um teto de ' + Money.fmt(worst.budget) +
          ' — ' + Money.fmt(worst.used - worst.budget) + ' acima' +
          (over.length > 1 ? ', e outras ' + (over.length - 1) + ' categoria(s) também estouraram' : '') +
          '. Faltam ' + budget.daysLeft + ' dias para o mês virar.',
        action: { label: 'Ajustar tetos', kind: 'page', page: 'plan' }
      }));
    } else if (risk.length) {
      var r0 = risk[0];
      out.push(mk({
        id: 'budget-risk', severity: 'info', icon: '⏳',
        title: r0.emoji + ' ' + r0.name + ' acelerando',
        text: 'Já foram ' + Money.fmt(r0.used) + ' de ' + Money.fmt(r0.budget) + ' com ' +
          budget.daysLeft + ' dias de mês pela frente. Para não estourar, o limite diário é ' +
          Money.fmt(Math.max(0, Math.round(r0.left / Math.max(budget.daysLeft, 1)))) + '.',
        action: { label: 'Ver orçamento', kind: 'page', page: 'plan' }
      }));
    } else if (budget.totalBudget === 0) {
      out.push(mk({
        id: 'no-budget', severity: 'opportunity', icon: '🎚️',
        title: 'Defina tetos por categoria',
        text: 'Com teto definido, o app avisa antes de você estourar, não depois. Podemos sugerir os valores a partir dos seus últimos três meses.',
        action: { label: 'Sugerir tetos', kind: 'suggest-budget' }
      }));
    }

    /* ── 5. salto de gasto contra a média ── */
    if (avg.expense > 0 && avg.months >= 2) {
      var monthExp = F.totals(F.inMonth(txs, cur)).expense;
      /* compara o mês em curso com a média projetada até o mesmo
         ponto do mês, senão todo dia 5 pareceria uma economia */
      var expectedSoFar = Math.round(avg.expense * (dayNow / daysInMonth));
      if (monthExp > expectedSoFar * 1.3 && monthExp > 5000) {
        out.push(mk({
          id: 'spike', severity: 'warn', icon: '📈',
          title: 'Gasto ' + Money.growth(monthExp, expectedSoFar) + '% acima do seu normal',
          text: 'Até o dia ' + dayNow + ' você gastou ' + Money.fmt(monthExp) + '. Nos últimos ' +
            avg.months + ' meses, a essa altura, a média era ' + Money.fmt(expectedSoFar) +
            '. Vale conferir se foi uma compra pontual ou um padrão novo.',
          action: { label: 'Investigar', kind: 'page', page: 'transactions' }
        }));
      }
      if (monthExp < expectedSoFar * 0.75 && dayNow > 12) {
        out.push(mk({
          id: 'frugal', severity: 'good', icon: '🎉',
          title: 'Mês ' + Math.abs(Money.growth(monthExp, expectedSoFar)) + '% mais econômico',
          text: 'Você está gastando bem menos que o seu normal para esta altura do mês. Se mantiver, sobram cerca de ' +
            Money.fmt(Math.max(0, avg.expense - Math.round(monthExp / dayNow * daysInMonth))) + ' a mais que de costume.',
          action: goals.length ? { label: 'Aportar numa meta', kind: 'page', page: 'goals' } : null
        }));
      }
    }

    /* ── 6. concentração de gasto numa categoria ── */
    var byCat = F.byCategory(data, F.inMonth(txs, cur), 'expense');
    if (byCat.rows.length >= 3 && byCat.rows[0].share >= 40) {
      var top = byCat.rows[0];
      out.push(mk({
        id: 'cat-concentration', severity: 'info', icon: top.emoji,
        title: top.name + ' leva ' + top.share + '% das suas despesas',
        text: Money.fmt(top.total) + ' em ' + top.count + ' lançamento(s) neste mês. Quando uma categoria passa de 40%, ' +
          'cortar 10% só dela já muda o mês inteiro — seriam ' + Money.fmt(Math.round(top.total * 0.1)) + ' de volta ao bolso.',
        action: { label: 'Ver lançamentos', kind: 'filter-cat', categoryId: top.id }
      }));
    }

    /* ── 7. assinaturas não cadastradas ── */
    var subs = F.detectSubscriptions(data);
    if (subs.length) {
      var yearly = subs.reduce(function (s, x) { return s + x.yearly; }, 0);
      var monthly = subs.reduce(function (s, x) { return s + x.amount; }, 0);
      out.push(mk({
        id: 'subs', severity: 'opportunity', icon: '🔁',
        title: subs.length + ' cobrança(s) recorrente(s) detectada(s)',
        text: 'Encontrei lançamentos com o mesmo valor em 3 meses ou mais: ' +
          subs.slice(0, 3).map(function (s) { return s.desc + ' (' + Money.fmt(s.amount) + ')'; }).join(', ') +
          (subs.length > 3 ? ' e outras' : '') + '. São ' + Money.fmt(monthly) + ' por mês, ' +
          Money.fmt(yearly) + ' por ano. Cadastre como recorrência para o app lançar sozinho — ou cancele o que não usa.',
        action: { label: 'Revisar recorrências', kind: 'page', page: 'plan', anchor: 'recorrencias' }
      }));
    }

    /* ── 8. metas ── */
    goals.forEach(function (g) {
      var st = F.goalStatus(data, g);
      if (st.done) {
        out.push(mk({
          id: 'goal-done-' + g.id, severity: 'good', icon: '🏆',
          title: 'Meta "' + g.name + '" conquistada!',
          text: 'Você chegou a ' + Money.fmt(g.target) + '. Arquive a meta para limpar o painel, ou aumente o alvo e siga em frente.',
          action: { label: 'Abrir meta', kind: 'open-goal', goalId: g.id }
        }));
        return;
      }
      if (st.late) {
        out.push(mk({
          id: 'goal-late-' + g.id, severity: 'warn', icon: '📅',
          title: 'Meta "' + g.name + '" passou do prazo',
          text: 'O prazo era ' + D.fmt(g.deadline) + ' e ainda faltam ' + Money.fmt(st.missing) +
            '. Dá para esticar o prazo ou reduzir o alvo — o importante é o plano voltar a ser realista.',
          action: { label: 'Reajustar meta', kind: 'open-goal', goalId: g.id }
        }));
        return;
      }
      if (st.neededMonthly != null && st.monthsLeft > 0) {
        var behind = st.onTrack === false;
        out.push(mk({
          id: 'goal-pace-' + g.id, severity: behind ? 'warn' : 'info', icon: g.emoji || '🎯',
          title: behind
            ? 'Meta "' + g.name + '" fora do ritmo'
            : 'Meta "' + g.name + '": ' + Money.fmt(st.neededMonthly) + '/mês',
          text: 'Faltam ' + Money.fmt(st.missing) + ' em ' + st.monthsLeft + ' mês(es), o que pede ' +
            Money.fmt(st.neededMonthly) + ' por mês.' +
            (st.pace > 0 ? ' Seu ritmo atual é ' + Money.fmt(st.pace) + '/mês' +
              (behind ? ' — a diferença é de ' + Money.fmt(Math.max(0, st.neededMonthly - st.pace)) + '.' : ', suficiente para chegar na data.') : '') +
            (behind && st.projectedDate ? ' Mantendo o ritmo de hoje, a data real seria ' + D.fmt(st.projectedDate) + '.' : ''),
          action: { label: 'Registrar aporte', kind: 'contribute', goalId: g.id }
        }));
      }
    });

    if (!goals.length) {
      out.push(mk({
        id: 'no-goals', severity: 'opportunity', icon: '🎯',
        title: 'Nenhuma meta definida',
        text: 'Dinheiro sem destino vira gasto. Defina um objetivo com valor e prazo e o app calcula sozinho quanto guardar por mês.',
        action: { label: 'Criar primeira meta', kind: 'new-goal' }
      }));
    }

    /* ── 9. carteira de investimentos ── */
    if (pf.count === 0 && em.pct >= 100) {
      out.push(mk({
        id: 'start-investing', severity: 'opportunity', icon: '📈',
        title: 'Reserva pronta, carteira vazia',
        text: 'Com a reserva completa e ' + Money.fmt(avg.net > 0 ? avg.net : 0) +
          ' sobrando por mês, faz sentido começar a investir. Cadastre seus ativos aqui para acompanhar preço médio, rentabilidade e dividendos.',
        action: { label: 'Adicionar ativo', kind: 'add-inv' }
      }));
    }
    if (pf.count >= 2 && pf.topShare >= 40) {
      out.push(mk({
        id: 'concentration', severity: 'warn', icon: '🧺',
        title: 'Carteira concentrada: ' + pf.topShare + '% num só ativo',
        text: 'Um único ativo responde por ' + pf.topShare + '% do seu patrimônio investido de ' +
          Money.fmt(pf.market) + '. Diluir a concentração reduz o impacto de um tropeço isolado.',
        action: { label: 'Ver carteira', kind: 'page', page: 'investments' }
      }));
    }
    if (pf.count >= 3 && !pf.byType.rf && (data.plan.riskProfile === 'conservador' || data.plan.riskProfile === 'moderado')) {
      out.push(mk({
        id: 'no-rf', severity: 'info', icon: '🏦',
        title: 'Nenhuma renda fixa na carteira',
        text: 'Seu perfil está marcado como ' + data.plan.riskProfile +
          ', mas 100% do investido está em renda variável. Uma parcela em renda fixa segura a volatilidade nos meses ruins.',
        action: { label: 'Cadastrar renda fixa', kind: 'add-inv', type: 'rf' }
      }));
    }
    if (pf.dividends > 0) {
      out.push(mk({
        id: 'dividends', severity: 'good', icon: '💰',
        title: Money.fmt(pf.dividends) + ' já recebidos em proventos',
        text: 'Isso equivale a ' + pf.yieldOnCost + '% do que você investiu (' + Money.fmt(pf.invested) +
          '). É dinheiro que chegou sem você vender nada.',
        action: { label: 'Ver carteira', kind: 'page', page: 'investments' }
      }));
    }
    if (pf.lastUpdated) {
      var ageDays = Math.round((Date.now() - new Date(pf.lastUpdated).getTime()) / 86400000);
      if (ageDays >= 3) {
        out.push(mk({
          id: 'stale-prices', severity: 'info', icon: '🔄',
          title: 'Cotações de ' + ageDays + ' dias atrás',
          text: 'Os valores da carteira estão sendo calculados com o último preço buscado. Atualize para ver a rentabilidade real de hoje.',
          action: { label: 'Atualizar cotações', kind: 'refresh-prices' }
        }));
      }
    }

    /* ── 10. projeção de longo prazo ── */
    var aporte = avg.net > 0 ? avg.net : 0;
    if (aporte > 0 && plan.horizonYears) {
      var proj = F.project({
        start: pf.market, monthly: aporte, months: plan.horizonYears * 12,
        annualPct: plan.expectedReturnPct, inflationPct: plan.inflationPct
      });
      out.push(mk({
        id: 'projection', severity: 'opportunity', icon: '🔮',
        title: 'Em ' + plan.horizonYears + ' anos: ' + Money.fmt(proj.final),
        text: 'Mantendo ' + Money.fmt(aporte) + ' de aporte por mês a ' + plan.expectedReturnPct +
          '% ao ano, seu patrimônio sai de ' + Money.fmt(pf.market) + ' para ' + Money.fmt(proj.final) +
          ' — sendo ' + Money.fmt(proj.earnings) + ' só de juros. Descontando a inflação, o poder de compra equivale a ' +
          Money.fmt(proj.finalReal) + ' de hoje.',
        action: { label: 'Ver projeção', kind: 'page', page: 'plan', anchor: 'projecao' }
      }));
    }

    /* ── 11. recorrências pendentes ── */
    var pend = F.pendingRecurrences(data);
    if (pend.length) {
      out.push(mk({
        id: 'pending-rec', severity: 'info', icon: '📌',
        title: pend.length + ' lançamento(s) recorrente(s) a confirmar',
        text: pend.slice(0, 3).map(function (p) { return p.rec.desc + ' em ' + D.fmt(p.date); }).join(', ') +
          (pend.length > 3 ? ' e outros' : '') + '. Eles entram no extrato assim que você confirmar.',
        action: { label: 'Lançar agora', kind: 'run-recurrences' }
      }));
    }

    /* ── 12. despesa isolada muito grande ── */
    var ref = plan.monthlyIncome || avg.income;
    if (ref > 0) {
      var big = F.inMonth(txs, cur).filter(function (t) {
        return t.type === 'expense' && t.amount >= ref * 0.25;
      }).sort(function (a, b) { return b.amount - a.amount; })[0];
      if (big) {
        out.push(mk({
          id: 'big-expense', severity: 'info', icon: '🐘',
          title: 'Uma despesa levou ' + Money.pctOf(big.amount, ref) + '% da sua renda',
          text: '"' + big.desc + '" de ' + Money.fmt(big.amount) + ' em ' + D.fmt(big.date) +
            '. Se foi algo que vai se repetir, cadastre como recorrência; se foi pontual, vale planejar a reposição do caixa.',
          action: { label: 'Ver lançamento', kind: 'open-tx', txId: big.id }
        }));
      }
    }

    /* ── 13. tendência de três meses ── */
    var ser = F.monthlySeries(data, 4);
    var closed = ser.slice(0, 3).filter(function (m) { return m.count > 0; });
    if (closed.length === 3 &&
      closed[0].expense < closed[1].expense && closed[1].expense < closed[2].expense) {
      out.push(mk({
        id: 'trend-up', severity: 'warn', icon: '📊',
        title: 'Despesas subindo há três meses',
        text: closed.map(function (m) { return D.monthLabelShort(m.key) + ': ' + Money.fmt(m.expense); }).join(' → ') +
          '. A alta acumulada é de ' + Money.growth(closed[2].expense, closed[0].expense) + '%. Uma subida consistente raramente é coincidência.',
        action: { label: 'Comparar meses', kind: 'page', page: 'reports' }
      }));
    }

    /* ── 14. backup ── */
    var hist = Dm.History.list(Dm.DB.userId || '');
    var lastManual = hist.filter(function (h) { return h.reason === 'manual' || h.reason === 'import'; })[0];
    var ageB = lastManual ? Math.round((Date.now() - new Date(lastManual.at).getTime()) / 86400000) : null;
    if (txs.length >= 10 && (ageB === null || ageB > 30)) {
      out.push(mk({
        id: 'backup', severity: 'info', icon: '💾',
        title: ageB === null ? 'Você nunca exportou um backup' : 'Último backup manual há ' + ageB + ' dias',
        text: 'Seus dados ficam só neste aparelho, criptografados. Isso é bom para privacidade e ruim se você perder o telefone. ' +
          'Exportar o arquivo leva dois toques.',
        action: { label: 'Exportar backup', kind: 'export' }
      }));
    }

    out.sort(function (a, b) { return a.rank - b.rank; });
    return out;
  };

  /* Resumo de uma linha para o topo do painel */
  I.headline = function (data) {
    var list = I.build(data);
    var urgent = list.filter(function (i) { return i.severity === 'critical' || i.severity === 'warn'; });
    return {
      total: list.length,
      urgent: urgent.length,
      first: list[0] || null
    };
  };

  Dm.Insights = I;
})(typeof window !== 'undefined' ? window : globalThis);
