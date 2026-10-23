# 08 - Consulta de fatura e emissão do PDF

## Objetivo

- **Consulta de fatura**: obter os dados da fatura (número, valor, valor mínimo, vencimento, **NSU** e status). A NSU da fatura é o que identifica a fatura no [recebimento](09-recebimento-fatura.md).
- **Fatura em PDF**: baixar o PDF da fatura para imprimir ou entregar ao cliente.

Consultas não têm confirmação; cada uma usa um **NST novo**.

## Endpoints

| Consulta | Método | Endpoint | Corpo | Resposta |
| --- | --- | --- | --- | --- |
| Fatura | POST | `/consulta/fatura` | `ConsultaFaturaModel` | `FaturaModel` (JSON) |
| Fatura PDF | POST | `/consulta/fatura-pdf` | `ConsultaFaturaModel` | arquivo `application/pdf` |

> `/consulta/fatura-pdf` precisa ter o acesso liberado pelo suporte Convcard.

## Requisição (as duas consultas)

Informe **um** dos filtros: cartão, CPF, número da fatura ou NSU da fatura.

**ConsultaFaturaModel**

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
| --- | --- | --- | --- | --- |
| `nst` | integer (int64) | sim | Número sequencial da transação Este número deve permanecer o mesmo durante todo o processamento da operação em tratamento, mesmo que envolva mais de um fluxo de mensagens (fluxos com continuação). (mín. 1, máx. 9999999999) | `1239` |
| `nomeSoftware` | string | sim | Nome do Software | `Card Aut App` |
| `versaoSoftware` | string | sim | Versão Software | `1.205.790` |
| `identificadorLoja` | string | sim | Identificação da loja | `01c760b2-a9db-429c-ad60-d926f49878cd` |
| `cartao` | string | não | Número do cartão Obrigatório caso cpf, numeroFatura e nsuFatura estejam vazios | `1111111111111111111` |
| `cpf` | string | não | Número do CPF Obrigatório caso cartao, numeroFatura e nsuFatura estejam vazios | `00000000000` |
| `numeroFatura` | integer (int64) | não | Número da fatura Obrigatório caso cartao, cpf e nsuFatura estejam vazios | `123` |
| `nsuFatura` | integer (int64) | não | NSU da fatura Obrigatório caso cartao, cpf e numeroFatura estejam vazios | `123` |

Exemplos:

```json
{ "nst": 1500, "nomeSoftware": "PDV Convcard Exemplo", "versaoSoftware": "1.0.0",
  "identificadorLoja": "01c760b2-a9db-429c-ad60-d926f49878cd", "cpf": "12345678901" }
```

```json
{ "nst": 1501, "nomeSoftware": "PDV Convcard Exemplo", "versaoSoftware": "1.0.0",
  "identificadorLoja": "01c760b2-a9db-429c-ad60-d926f49878cd", "nsuFatura": 12345678 }
```

| Filtro na tela | Campo | Máscara no exemplo |
| --- | --- | --- |
| Cartão | `cartao` | `000 0000 0000 0000 0000`, envia só dígitos |
| CPF | `cpf` | `000.000.000-00`, envia só dígitos |
| Número Fatura | `numeroFatura` | até 20 dígitos |
| NSU Fatura | `nsuFatura` | até 18 dígitos |

## Resposta de /consulta/fatura

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
  "numero": 123,
  "valor": 210.5,
  "valorMinimo": 21.05,
  "vencimento": "2026-11-10T23:59:59-03:00",
  "nsu": 12345678,
  "status": "ABERTO"
}
```

## Resposta de /consulta/fatura-pdf

Segundo o swagger:

- o retorno é um arquivo **PDF** (`Content-Type: application/pdf`);
- o header `Content-Disposition` vem como `attachment` e traz o nome do arquivo.

O cliente HTTP precisa ler a resposta como **bytes** (não como texto/JSON) e
extrair o nome do arquivo do `Content-Disposition`
(`attachment; filename="fatura-123.pdf"`). Em caso de erro, a resposta volta
em JSON (`Error`), como nos demais endpoints.

O exemplo salva o PDF na pasta **Downloads** do usuário e abre no
visualizador padrão do sistema:

```ts
const arquivo = await requisitarArquivo(config, 'POST', '/consulta/fatura-pdf', corpo); // { bytes, nome, contentType }
const caminho = path.join(app.getPath('downloads'), arquivo.nome);
fs.writeFileSync(caminho, arquivo.bytes);
await shell.openPath(caminho);
```

## Exceções

| Situação | O que fazer |
| --- | --- |
| Nenhum filtro informado | Validação local: o filtro escolhido é obrigatório |
| Fatura não encontrada | HTTP 4xx com `message`: mostre ao operador |
| Loja sem acesso ao PDF | HTTP 4xx: peça a liberação ao suporte Convcard |
| Erro ao salvar o arquivo | "Erro ao salvar a fatura no disco" |
| Arquivo salvo, mas sem visualizador de PDF | Informe o caminho onde o arquivo foi salvo |

## No exemplo

| O quê | Onde |
| --- | --- |
| Tela "Emissão de fatura" (Funções → F6) | `src/angular/app/telas/emissao-fatura/` |
| Filtros (tipos, máscaras, montagem do corpo) | `src/angular/app/core/filtro-fatura.ts` |
| Consulta de fatura (usada no recebimento) | `consultarFatura()` em `src/electron/convcard/servico.ts` |
| Download, gravação e abertura do PDF | `baixarFaturaPdf()` (serviço) e `emitirFatura()` em `src/electron/main.ts` |
| Leitura de resposta binária | `requisitarArquivo()` em `src/electron/convcard/cliente.ts` |
