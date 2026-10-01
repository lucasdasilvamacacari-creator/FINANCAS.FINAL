# Dominus Finance v3

Controle financeiro pessoal que roda no navegador, instala como aplicativo e
funciona sem internet. **Nenhum dado sai do seu aparelho**: não existe servidor,
conta na nuvem nem rastreamento. A única chamada externa é a cotação de ativos,
e só quando você pede.

---

## O que mudou da v2 para a v3

A estrutura e a identidade visual são as mesmas — painel, extrato, carteira,
configurações, navegação inferior, o vermelho da marca. O que mudou é o que está
por baixo.

### 1. Conta com login e criptografia de verdade

Entrada com **nome de usuário e senha**. A proteção usa *envelope encryption*:

```
senha ──PBKDF2-SHA256 (310.000 iterações)──► chave-de-chave (KEK)
                                               │
                     ┌─────────────────────────┴──────────────────┐
                     ▼                                            ▼
          AES-GCM(KEK, DEK)                          AES-GCM(KEK_recuperação, DEK)
                     │                                            │
                     └──────────────► DEK ◄───────────────────────┘
                                       │
                            AES-256-GCM(DEK, cofre)
```

A senha **não** abre os dados — ela abre a *chave* que abre os dados. Daí três
consequências práticas:

- **Trocar a senha é instantâneo**, mesmo com anos de histórico: a chave dos
  dados não muda, só é reembrulhada.
- O **código de recuperação** (24 caracteres, mostrado uma única vez no cadastro)
  abre o mesmo cofre sem que a sua senha esteja guardada em lugar nenhum.
- Se você perder a senha **e** o código, ninguém recupera os dados — nem o app.
  Isso é o preço de não haver servidor.

Também há: limite de tentativas com espera crescente (1, 2, 4… até 30 min),
tranca automática por inatividade (configurável, 0 = nunca), comparação de
verificador em tempo constante e múltiplas contas no mesmo aparelho.

> Em contexto não seguro (sem `https://` nem `localhost`) o navegador não expõe
> `crypto.subtle`. O app detecta, **avisa sem rodeios** e opera com o cofre em
> texto claro, ainda verificando a senha com PBKDF2-SHA256 implementado em JS
> puro. A tela de Segurança diz exatamente em qual dos dois modos você está.

### 2. Nada de dado antigo é perdido numa atualização

- **Cadeia de migrações versionada** (`schema` 1 → 5). Cada passo converte o
  formato antigo no novo sem apagar o campo original (a meta única da v2, por
  exemplo, continua gravada em `legacyGoal` depois de virar a primeira meta da
  lista).
- **Ponto de restauração antes de qualquer mexida**: antes de migrar, antes de
  importar um backup, antes de restaurar outro ponto, antes de apagar tudo e
  sempre que a versão do app muda.
- **Backup automático** a cada 30 minutos de uso, com um anel de até 100 pontos.
  A poda só descarta pontos automáticos — manuais, de migração, de atualização e
  de importação ficam.
- **Histórico navegável** em Configurações: cada ponto mostra data, motivo,
  contagem de itens e tamanho, e restaura com um toque. Restaurar também é
  reversível, porque o estado atual é guardado antes.
- Os dados da v2 (`dominus_data_v2`) **não são apagados** depois de importados:
  ficam onde estavam, como rede de segurança.
- Se o armazenamento do navegador encher, a gravação poda pontos antigos e tenta
  de novo; se ainda falhar, o app avisa em vez de perder a edição em silêncio.

### 3. Precisão

- **Todo valor monetário é um inteiro de centavos.** Nenhuma soma de dinheiro
  passa por ponto flutuante, então `0,10 + 0,20` nunca vira
  `0,30000000000000004` num extrato.
- **Parcelamento sem centavo perdido**: R$ 100 em 3× sai `34 + 33 + 33`, e a
  soma fecha exatamente no total.
- **Datas locais `YYYY-MM-DD`**, nunca `new Date('2026-03-01')` — que é meia-noite
  UTC e volta um dia em fuso negativo. Somar meses preserva fim de mês
  (31/jan + 1 mês = 28/fev) e a diferença em dias é imune a horário de verão.
- **Preço médio calculado a partir dos lotes** pelo custo médio ponderado (a
  convenção brasileira), não de um número digitado à mão. A venda reduz posição e
  custo proporcionalmente, manda o resultado para "realizado" e não altera o
  preço médio das cotas que ficaram.
- **Arredondamento** `half away from zero` (`Math.round(-0.5)` devolve `-0`, o
  que enviesa negativos) com correção do erro de representação binária antes de
  arredondar.
- O campo de valor aceita o que você digitar: `1.234,56`, `1234.56`, `R$ 1.234,56`,
  `1,5k`, `(30,50)` para negativo — e mostra embaixo o que entendeu.

### 4. Lançar ficou mais rápido

- **Campo livre que interpreta a frase**: `ifood 68,90 ontem` já sai como despesa
  de R$ 68,90, categoria Alimentação, data de ontem. Reconhece ~120 palavras do
  vocabulário real (`uber`, `mercado`, `netflix`, `freela`, `dividendo`…),
  `hoje`/`ontem`/`anteontem`/`12/05`, sufixos `k`/`mi` e sinal `+`/`-`.
  Enter confirma; se errar, os campos abaixo estão ali para corrigir.
- **Atalhos de hábito**: as combinações que você mais repetiu nos últimos 90 dias
  viram botões que preenchem o lançamento inteiro.
- **Categoria em grade de toque único** em vez de `<select>`, datas em atalhos
  (Hoje / Ontem / Anteontem), duplicar para hoje, parcelamento e recorrência.
- **Recorrências** lançam sozinhas quando a data chega (idempotente: rodar duas
  vezes no mesmo dia não duplica nada).
- **Detector de assinaturas**: o mesmo valor na mesma descrição em 3 meses ou
  mais aparece com o total anual e um botão para cadastrar como recorrência.

### 5. Gráficos específicos, escolhidos por você

Doze visualizações, todas em **SVG escrito à mão** — sem biblioteca por CDN, o
que mantém o app funcionando offline:

| | |
|---|---|
| Fluxo de caixa | barras agrupadas de receita × despesa |
| Evolução do saldo | linha e área do acumulado |
| Para onde foi o dinheiro | barras horizontais rotuladas por categoria |
| Composição das despesas | rosca com legenda nomeada |
| Taxa de poupança | linha com linha de referência da sua meta |
| Orçamento do mês | barras-marcador com traço no ritmo esperado |
| Equilíbrio 50/30/20 | real × planejado por grupo |
| Projeção de patrimônio | juros compostos, com e sem inflação |
| Ritmo de gastos | mapa de calor por dia do mês |
| Dias que pesam mais | gasto por dia da semana |
| Alocação da carteira | rosca por classe de ativo |
| Progresso das metas | anéis por objetivo |

**Você escolhe quais aparecem no painel** (Configurações › Escolher gráficos), na
ordem que marcar.

Cada gráfico traz legenda, rótulo direto onde cabe, tooltip no toque e no hover,
e um botão **"Ver dados"** que abre a tabela equivalente. A paleta foi validada
por script contra a superfície escura do app (#1A1A1A) em cinco critérios: faixa
de luminosidade, piso de croma, separação sob daltonismo (ΔE ≥ 8 em OKLab),
piso de visão normal e contraste ≥ 3:1.

> Uma decisão vale explicação: o verde de receita é `#199E70`, puxado para o
> azul-esverdeado. O verde puro e o vermelho da marca ficam a **ΔE 4,9** sob
> deuteranopia — indistinguíveis para quem tem a forma mais comum de daltonismo,
> justamente no par mais importante do app. O tom escolhido leva esse par a
> **ΔE 9,5**. Para quem precisa de mais, há um ajuste em Configurações que troca
> o verde por azul.

### 6. Recomendações exclusivas e nota de saúde

**Nota de saúde financeira (0–100)** com seis pilares de peso declarado — e o
cálculo inteiro aberto na tela, porque uma nota que você não consegue auditar não
serve para decidir nada:

| Pilar | Peso |
|---|---|
| Taxa de poupança contra a sua meta | 30 |
| Reserva de emergência | 25 |
| Disciplina de orçamento | 15 |
| Folga nos gastos fixos | 10 |
| Patrimônio investido | 10 |
| Progresso das metas | 10 |

Pilar sem dado **não derruba a nota**: ela é normalizada pelo peso do que dá para
medir, e a tela diz o que falta para medir o resto.

Em cima disso, um motor de ~20 regras que só fala com o seu próprio número e
sempre oferece a ação que resolve:

> ⏱️ **No ritmo atual, o mês fecha em −R$ 310,40** — Você já gastou R$ 2.840,00
> em 11 dias, média de R$ 258,18 por dia. Projetando até o dia 30, a despesa
> chega a R$ 7.745,00. Para fechar no azul, o limite diário cai para R$ 124,21.

Também cobre: mês no vermelho, meta de poupança, reserva de emergência em três
estágios, estouro e aceleração de orçamento, salto de gasto contra a média (já
descontando a parte do mês que passou), concentração numa categoria, assinaturas
não cadastradas, ritmo de cada meta com data real projetada, concentração da
carteira, ausência de renda fixa contra o perfil declarado, proventos, cotação
velha, projeção de longo prazo, despesa isolada grande, três meses de alta
consecutiva e lembrete de backup.

### 7. Assistente de plano na primeira vez

Sete passos que terminam num plano aplicado, não num "parabéns": renda e dia do
recebimento → método de divisão (50/30/20, 70/20/10, 60/20/20, 50/20/30) com o
valor de cada fatia já em reais → até quatro objetivos → valor e prazo de cada um,
com o aporte mensal recalculado a cada tecla e um aviso honesto quando a soma não
cabe na fatia do futuro → perfil de risco, horizonte, retorno e inflação
esperados → resumo com a projeção.

Ao aplicar, as metas são criadas com aporte mensal calculado, os tetos por
categoria são distribuídos pelo peso do seu histórico (ou igualmente, se não há
histórico) e um ponto de restauração é gravado.

### 8. Bloco de notas

Título, texto livre, **lista de tarefas** (Enter cria o próximo item), etiquetas,
seis cores, fixar no topo, arquivar, data de lembrete e busca que varre título,
corpo, etiquetas e itens da lista.

### 9. Configurações que moldam o plano

- **Plano**: renda, dia do recebimento, método de divisão com três controles
  deslizantes que avisam quando não fecham 100%, tetos por categoria (manuais ou
  sugeridos a partir dos últimos 3 meses), meses de reserva.
- **Expectativas**: perfil de risco, horizonte, retorno e inflação esperados —
  rotulados como *premissa sua*, não previsão do app.
- **Categorias**: criar, renomear, ícone, cor, grupo do 50/30/20, teto, ocultar.
  As padrão não se excluem (ocultam), e excluir uma sua move os lançamentos para
  "Outros" em vez de perdê-los.
- **Contas e carteiras**: tipo, saldo inicial, cor, ícone. As de tipo poupança
  entram no cálculo da reserva de emergência.
- **Aparência**: cor de destaque, modo AMOLED, lista compacta, paleta para
  daltonismo, modo privacidade, tela inicial, quais gráficos no painel.
- **Segurança**: trocar senha, novo código de recuperação, tranca por
  inatividade, estado da criptografia.
- **Dados**: ponto de restauração manual, histórico navegável, exportar e
  importar backup (mesclar ou substituir), CSV do período, espaço usado, apagar
  dados (reversível) e excluir conta (não reversível, e a tela diz isso).

### 10. Modo privacidade

Um toque embaça todos os valores da tela — sem removê-los do DOM, então o leitor
de tela continua lendo. Outro toque em cima de um valor revela só aquele.

---

## Estrutura

```
index.html              marcação e carregamento
css/app.css             folha de estilo própria (sem framework por CDN)
js/core.js              dinheiro em centavos, datas locais, SHA-256/PBKDF2 em JS,
                        AES-GCM, armazenamento
js/vault.js             schema, normalização, migrações, histórico, backup
js/finance.js           séries mensais, orçamento, posição da carteira, projeções,
                        ritmo das metas, recorrências
js/charts.js            doze gráficos em SVG + tooltip + tabela equivalente
js/insights.js          nota de saúde e motor de recomendações
js/auth.js              conta, envelope encryption, recuperação, tranca
js/ui.js                folhas, avisos, navegação, máscara, despachante de ações
js/screens-auth.js      login, cadastro, recuperação, tranca, assistente de plano
js/screens-money.js     painel, extrato, lançamento rápido, relatórios
js/screens-plan.js      metas, plano, categorias, contas, recorrências
js/screens-extra.js     carteira, notas, configurações
js/app.js               arranque
serviceworker.js        cache do app shell, fontes imutáveis, cotações sempre da rede
manifest.json           instalação como aplicativo
```

Scripts clássicos, sem módulos ES, de propósito: o app abre direto de `file://`
sem precisar de servidor. Cada arquivo é uma IIFE que pendura o que expõe em
`window.Dominus`.

## Rodando

Basta abrir `index.html`. Para ter criptografia e service worker, sirva por HTTP:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Cotações

Ações e FIIs usam a [BRAPI](https://brapi.dev). O token de demonstração tem
limite baixo — crie um gratuito e cole em Configurações › Cotações. As requisições
são em série para não estourar o limite, e cotação **nunca** é servida do cache:
preço velho apresentado como novo é pior que preço nenhum.

## Limites, ditos sem rodeios

- **Os dados vivem neste navegador.** Limpar os dados do site apaga tudo.
  Exporte backup com alguma regularidade — o app lembra você disso.
- **Sem senha e sem código de recuperação, não há recuperação.** É consequência
  direta de não haver servidor guardando sua chave.
- **O backup exportado é JSON sem criptografia**, para você poder abrir e
  inspecionar. Guarde-o em lugar seguro.
- A projeção é juros compostos sobre premissas que **você** escolheu. Não é
  previsão de mercado nem recomendação de investimento.
- Os valores da carteira dependem da última cotação buscada; o app mostra a idade
  dela e avisa quando está velha.
