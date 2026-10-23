# 14 - Tratamento de erros

## Erro devolvido pelo autorizador

Quando o status HTTP não é 200 (400, 401, 500...), o corpo vem no formato
`Error`:

**Error**

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
| --- | --- | --- | --- | --- |
| `timestamp` | string (date-time) | não | Indica o momento em que o erro ocorreu | `2023-12-29T09:27:48.50657021-03:00` |
| `status` | integer (int32) | não | Representa o código de status HTTP que indica o tipo de erro | `404` |
| `error` | string | não | É uma descrição curta do erro, correspondendo ao texto do status HTTP | `Not Found` |
| `message` | string | não | Uma mensagem descritiva mais detalhada do erro que aconteceu. | `O recurso solicitado não foi encontrado.` |
| `path` | string | não | É o caminho da URL que foi solicitada e causou o erro. | `/api/recurso` |
| `code` | string | não | Indica o código do erro. | `H500` |
| `nsu` | integer (int64) | não | Indica a NSU do erro. | `12345678` |

```json
{
  "timestamp": "2026-10-23T14:41:34-03:00",
  "status": 400,
  "error": "Bad Request",
  "message": "Saldo insuficiente.",
  "path": "/autorizador/compra/solicitacao",
  "code": "H500",
  "nsu": 12345678
}
```

> O texto de `message` acima é ilustrativo. As mensagens reais vêm do autorizador.

### Como tratar

| Campo | Uso |
| --- | --- |
| `message` | Mensagem para o operador. É o principal campo a exibir |
| `code` | Código do erro na Convcard. Mostre junto da mensagem e registre em log, para o suporte |
| `nsu` | NSU da transação negada, quando houver. Mostre e registre (ajuda o suporte a localizar) |
| `error` | Texto padrão do status HTTP. Use só se `message` vier vazio |

O exemplo exibe: `mensagem (código X, NSU Y)`.

## Status HTTP

| Status | Significado prático | O que fazer |
| --- | --- | --- |
| 200 | Sucesso (pode vir sem corpo em confirmação/desfazimento) | Seguir o fluxo |
| 400 | Requisição recusada: validação de campos ou regra de negócio | Mostrar `message` |
| 401 | Falha de autenticação | "Falha de autenticação com a Convcard. Verifique o certificado configurado." |
| 500 | Erro no autorizador | Mostrar `message`; registrar `code`/`nsu` |

### Certificado recusado na camada TLS

Quando o certificado de cliente é recusado (de outro ambiente, expirado ou
inválido), o servidor pode responder **HTTP 400 com uma página HTML**
("400 Bad Request — The SSL certificate error"), e não com JSON. Trate
respostas que não são JSON:

- se o texto contém "SSL certificate" → falha de autenticação/certificado;
- senão → "Erro HTTP {status} na comunicação com a Convcard."

## Erros antes de chegar ao autorizador

| Erro (Node.js) | Causa | Mensagem sugerida |
| --- | --- | --- |
| Arquivo `.crt` ou `.key` não encontrado | Caminho errado / arquivo removido | "Não foi possível ler o certificado (.crt): ..." / "Não foi possível ler a chave (.key): ..." |
| `key values mismatch` | A chave não é a do certificado | "A chave (.key) não corresponde ao certificado (.crt)." |
| `bad decrypt` / `interrupted or cancelled` | Chave protegida por senha (arquivo diferente do entregue pela Convcard) | "A chave (.key) está protegida por senha. Use a chave sem senha fornecida pela Convcard." |
| `no start line` / erro de decodificação PEM | Arquivo não é PEM válido | "Certificado (.crt) ou chave (.key) inválidos. Use os arquivos PEM fornecidos pela Convcard." |
| `ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET` | Sem internet, DNS, firewall/proxy | "Erro de conectividade: sem acesso à Convcard. Verifique a conexão de rede." |
| Timeout | Sem resposta no tempo limite | "Tempo de resposta da Convcard esgotado." |

### Timeout

O exemplo usa **60 segundos**. Não use timeout curto: o pooling do QR Code
(`/qrcode-pdv/solicitacao-compra-qrcode`) é um *long pooling*, em que o
servidor segura a requisição alguns segundos.

## Impacto do erro no fluxo da transação

| Onde o erro ocorreu | Consequência |
| --- | --- |
| Solicitação (compra, cancelamento, recebimento) | Não houve aprovação; nada a confirmar nem desfazer. Em **timeout**, o PDV não sabe o resultado e não tem `autorizacao`; combine o procedimento com a Convcard |
| Depois da aprovação, no PDV (impressão, cupom, endereço) | **Desfazer** (compra/cancelamento) ou **não confirmar** (recebimento) |
| Confirmação | Manter a pendência e tentar de novo |
| Desfazimento | Manter a pendência; ela é desfeita ao reabrir o PDV ou antes da próxima transação |

Detalhes em [05 - Confirmação, desfazimento e pendências](05-confirmacao-desfazimento-e-pendencias.md).

## Log da integração

Registre cada requisição e resposta para diagnosticar problemas (e para o
suporte Convcard), **mascarando dados sensíveis**:

| Dado | Como o exemplo mascara |
| --- | --- |
| `cartao`, `token` | 4 primeiros + `*` + 4 últimos |
| `cvv`, `senha`, `qrcode` | `***` |

A máscara (`src/electron/mascara.ts`) percorre o objeto inteiro, inclusive
listas e objetos aninhados.

O exemplo mostra esse log no painel "Log da integração" (método, caminho,
status, duração, corpo da requisição e da resposta) e também o grava no
arquivo de log.

## Log em arquivo

`src/electron/log.ts` grava um arquivo por dia em `<userData>/logs`
(Windows: `%APPDATA%\PDV Convcard Exemplo\logs`; Linux:
`~/.config/PDV Convcard Exemplo/logs`), com retenção de 30 dias:

```
2026-10-23 15:04:05.123 [INFO ] [main] [IPC] solicitarCompra iniciado [{"valor":38.15,"cartao":"6060***********4567","cvv":"***",...}]
2026-10-23 15:04:05.130 [DEBUG] [main] [BANCO] NST gerado: 1301
2026-10-23 15:04:05.812 [INFO ] [main] [HTTP] POST https://aut-h.convcard.com.br/autorizador/compra/solicitacao -> HTTP 200 (682 ms)
2026-10-23 15:04:05.815 [INFO ] [main] [BANCO] Transação pendente gravada (criptografada): COMPRA
2026-10-23 15:04:06.020 [INFO ] [renderer] [TELA] Aberta: app-impressora (main.js:1)
```

| O que vai para o log | Onde é gerado |
| --- | --- |
| Início/fim do app, versão, sistema | `iniciarLog()` em `log.ts`, `main.ts` |
| Cada operação IPC: parâmetros (mascarados), duração, sucesso/erro | `registrarHandlers()` em `main.ts` |
| Cada requisição ao autorizador: método, URL, status, duração; corpos em DEBUG (mascarados) | `aoRegistrarLog` em `main.ts` |
| Banco: abertura/fechamento, configuração salva, NST, pendência gravada/removida, comprovante | `armazenamento.ts` |
| Confirmação/desfazimento e pendências | `servico.ts` |
| Tudo que a tela escreve no console (telas abertas/fechadas, mensagens ao operador, confirmações, impressão, erros do Angular) | `capturarConsoleDoRenderer()` em `log.ts` + `dialogos.service.ts` |
| Travamento/queda da tela, falha de carga, erro no preload, exceções não tratadas do main | `log.ts` |

Como o console do main e o do renderer são redirecionados para o arquivo,
qualquer `console.info/warn/error` novo já aparece no log.

## No exemplo

| O quê | Onde |
| --- | --- |
| Montagem do erro, erros de rede/certificado, timeout | `src/electron/convcard/cliente.ts` (`montarErro`, `traduzirErroDeRede`) |
| Máscara de dados sensíveis | `src/electron/mascara.ts` |
| Log em arquivo | `src/electron/log.ts` |
| Envelope do erro até a tela (`{ ok: false, erro: { mensagem, codigo, nsu, status } }`) | `registrarHandlers()` em `src/electron/main.ts` e `chamar()` em `src/electron/preload.ts` |
| Texto exibido ao operador | `mensagemErro()` em `src/angular/app/core/util.ts` |
| Painel de log | `src/angular/app/pdv/log-integracao.component.*` |
