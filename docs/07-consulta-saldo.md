# 07 - Consulta de saldo e saldo devedor

## Objetivo

- **Saldo**: mostrar ao operador os dados do cartão (usuário, situação, limite, compras, saldo disponível) e a última fatura.
- **Saldo devedor**: quanto o portador deve no total. É usado no [recebimento antecipado](10-recebimento-antecipado.md).

Consultas não têm confirmação. Cada consulta usa um **NST novo**.

## Endpoints

| Consulta | Método | Endpoint | Corpo | Resposta |
| --- | --- | --- | --- | --- |
| Saldo | POST | `/consulta/saldo` | `ConsultaSaldoModel` | `SaldoModel` |
| Saldo devedor | POST | `/consulta/saldo-devedor` | `ConsultaSaldoModel` | `SaldoDevedorModel` |

## Requisição (as duas consultas)

**ConsultaSaldoModel**

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
| --- | --- | --- | --- | --- |
| `nst` | integer (int64) | sim | Número sequencial da transação Este número deve permanecer o mesmo durante todo o processamento da operação em tratamento, mesmo que envolva mais de um fluxo de mensagens (fluxos com continuação). (mín. 1, máx. 9999999999) | `1239` |
| `nomeSoftware` | string | sim | Nome do Software | `Card Aut App` |
| `versaoSoftware` | string | sim | Versão Software | `1.205.790` |
| `identificadorLoja` | string | sim | Identificação da loja | `01c760b2-a9db-429c-ad60-d926f49878cd` |
| `cartao` | string | sim | Número do cartão ou Token | `1111111111111111111 ou 0a2e7a26-37ab-444c-a9d2-e9e44af0b789` |

```json
{
  "nst": 1400,
  "nomeSoftware": "PDV Convcard Exemplo",
  "versaoSoftware": "1.0.0",
  "identificadorLoja": "01c760b2-a9db-429c-ad60-d926f49878cd",
  "cartao": "1111111111111111111"
}
```

`cartao` aceita o número do cartão ou um [token](12-token.md).

## Resposta de /consulta/saldo

**SaldoModel**

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
| --- | --- | --- | --- | --- |
| `cartao` | string | não | Número do cartão mascarado | `11XXXXXXXXXXXX11111` |
| `usuario` | string | não | Nome do usuário | `USUARIO TESTE` |
| `situacao` | string | não | Situação do cartão | `000 - APROVADO` |
| `saldo` | number | não | Saldo do usuário | `459.55` |
| `limite` | number | não | Limite do usuário | `1000` |
| `compras` | number | não | Compras do usuário | `200` |
| `comprovante` | string | não | Comprovante a ser impresso, separado por '@' O retorno desta informação deve ser solicitado a Convcard | `EXEMPLO COMPROVANTE         @CREDENCIADA EXEMPLO  @Cartao Nu...` |
| `fatura` | FaturaModel | não | Fatura |  |

**FaturaModel**

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
| --- | --- | --- | --- | --- |
| `numero` | integer (int64) | não | Número da fatura | `123` |
| `valor` | number | não | Valor da fatura | `21.5` |
| `valorMinimo` | number | não | Valor mínimo da fatura | `1.5` |
| `vencimento` | string (date-time) | não | Data e Hora do vencimento da Fatura | `1988-04-02T23:59:59.999999999-03:00` |
| `nsu` | integer (int64) | não | Numero Sequencial Único da Fatura | `12345678` |
| `status` | string [PAGO, ABERTO] | não | Status da Fatura | `PAGO` |

```json
{
  "cartao": "11XXXXXXXXXXXX11111",
  "usuario": "USUARIO TESTE",
  "situacao": "000 - APROVADO",
  "saldo": 459.55,
  "limite": 1000,
  "compras": 540.45,
  "fatura": {
    "numero": 123,
    "valor": 210.5,
    "valorMinimo": 21.05,
    "vencimento": "2026-11-10T23:59:59-03:00",
    "nsu": 12345678,
    "status": "ABERTO"
  }
}
```

### Como exibir (como o exemplo faz)

| Campo na tela | Origem |
| --- | --- |
| Usuário do cartão | `usuario` |
| Situação do cartão | `situacao` |
| Limite de crédito total | `limite` |
| Saldo utilizado | `compras` |
| Saldo disponível | `saldo` |
| Vencimento / número / NSU / valor mínimo / valor total da fatura | `fatura.*` |
| Selo da fatura | `FATURA QUITADA` se `fatura.status = PAGO`; `FATURA EM ABERTO` se houver `fatura.nsu`; vazio se não houver fatura |

O `comprovante` da consulta, quando a Convcard o envia, pode ser impresso.

## Resposta de /consulta/saldo-devedor

**SaldoDevedorModel**

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
| --- | --- | --- | --- | --- |
| `saldo` | number | não | Saldo Devedor | `159.15` |

```json
{ "saldo": 159.15 }
```

## Integração com o recebimento

Na tela de consulta do exemplo, **Recebimentos [F6]** abre o recebimento já
preenchido com o cartão consultado:

- fatura em aberto (`fatura.nsu` preenchido e `status` diferente de `PAGO`): abre o **recebimento da fatura** com número, NSU, vencimento e valor;
- fatura quitada ou sem fatura: abre o **recebimento antecipado** e consulta o saldo devedor.

Depois de um recebimento concluído, a consulta é refeita para atualizar os dados.

## Exceções

| Situação | O que fazer |
| --- | --- |
| Cartão não informado | Validação local: "Cartão: Campo obrigatório" |
| Cartão inválido/bloqueado | HTTP 4xx com `message`: mostre ao operador e limpe os dados exibidos |
| Erro de rede | Mostre a mensagem; o operador pode consultar de novo (cada tentativa usa NST novo) |

## No exemplo

| O quê | Onde |
| --- | --- |
| Tela "Consulta" (Funções → F5; Enter pesquisa, F5 limpa, F6 recebimentos) | `src/angular/app/telas/consulta-saldo/` |
| Chamadas | `consultarSaldo()` e `consultarSaldoDevedor()` em `src/electron/convcard/servico.ts` |
