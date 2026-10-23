# 12 - Token de cartão

## Objetivo

Trocar o número do cartão + CVV por um **token** (UUID). Depois, o PDV pode
enviar o token no campo `cartao` das compras e consultas **sem CVV e sem
senha** e sem guardar o número real do cartão (útil para cliente cadastrado,
venda recorrente, delivery etc.).

> Segundo o swagger, esta funcionalidade **não está disponível para todos os
> integradores**. Consulte o suporte Convcard.

## Endpoint

| Método | Endpoint | Corpo | Resposta |
| --- | --- | --- | --- |
| POST | `/token/cadastrar` | `CadastrarTokenModel` | `TokenModel` |

## Requisição

**CadastrarTokenModel**

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
| --- | --- | --- | --- | --- |
| `nst` | integer (int64) | sim | Número sequencial da transação Este número deve permanecer o mesmo durante todo o processamento da operação em tratamento, mesmo que envolva mais de um fluxo de mensagens (fluxos com continuação). (mín. 1, máx. 9999999999) | `1239` |
| `nomeSoftware` | string | sim | Nome do Software | `Card Aut App` |
| `versaoSoftware` | string | sim | Versão Software | `1.205.790` |
| `identificadorLoja` | string | sim | Identificação da loja | `01c760b2-a9db-429c-ad60-d926f49878cd` |
| `cartao` | string | sim | Número do cartão | `1111111111111111111` |
| `cvv` | string | sim | Número CVV do cartão | `123` |

```json
{
  "nst": 1900,
  "nomeSoftware": "PDV Convcard Exemplo",
  "versaoSoftware": "1.0.0",
  "identificadorLoja": "01c760b2-a9db-429c-ad60-d926f49878cd",
  "cartao": "1111111111111111111",
  "cvv": "123"
}
```

## Resposta

**TokenModel**

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
| --- | --- | --- | --- | --- |
| `cartao` | string | não | Número do Cartão Mascarado | `11XXXXXXXXXXXX11111` |
| `token` | string (uuid) | não | Token do cartão | `0a2e7a26-37ab-444c-a9d2-e9e44af0b789` |

```json
{
  "cartao": "11XXXXXXXXXXXX11111",
  "token": "0a2e7a26-37ab-444c-a9d2-e9e44af0b789"
}
```

## Usando o token

O token entra no campo `cartao` dos endpoints que aceitam "Número do cartão
ou Token", por exemplo:

| Endpoint | Observação |
| --- | --- |
| `POST /compra/solicitacao` | Sem `cvv` e sem `senha` |
| `POST /consulta/saldo`, `POST /consulta/saldo-devedor` | |

```json
{
  "nst": 1901,
  "nomeSoftware": "PDV Convcard Exemplo",
  "versaoSoftware": "1.0.0",
  "identificadorLoja": "01c760b2-a9db-429c-ad60-d926f49878cd",
  "qtdParcelas": 1,
  "valor": 8.9,
  "cartao": "0a2e7a26-37ab-444c-a9d2-e9e44af0b789"
}
```

Guarde o token associado ao cadastro do cliente no seu sistema, junto com o
cartão mascarado (`TokenModel.cartao`) para exibição.

> No exemplo, o campo cartão da tela de venda aceita só dígitos (máscara de
> cartão). Para vender com token, a sua tela ou o seu cadastro de cliente deve
> enviar o token no lugar do número.

## Exceções

| Situação | O que fazer |
| --- | --- |
| Cartão ou CVV não informados | Validação local |
| Integrador sem acesso ao token | HTTP 4xx: peça a liberação ao suporte Convcard |
| Cartão/CVV inválidos | Mostre `message` |

## No exemplo

| O quê | Onde |
| --- | --- |
| Tela "Cadastro de token" (Funções → F7) | `src/angular/app/telas/token/` |
| Chamada | `cadastrarToken()` em `src/electron/convcard/servico.ts` |
