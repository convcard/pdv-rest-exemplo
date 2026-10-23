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
| Arquivo do certificado não encontrado | Caminho errado / arquivo removido | "Não foi possível ler o certificado: ..." |
| `mac verify failure` / erro PKCS12 | Senha do `.p12` errada ou arquivo corrompido | "Senha do certificado inválida ou arquivo .p12 corrompido." |
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
| `cartao` | 4 primeiros + `*` + 4 últimos |
| `cvv` | `***` |
| `senha` | `****` |

O exemplo mostra esse log no painel "Log da integração" (método, caminho,
status, duração, corpo da requisição e da resposta).

## No exemplo

| O quê | Onde |
| --- | --- |
| Montagem do erro, erros de rede/certificado, timeout, máscara | `src/electron/convcard/cliente.ts` (`montarErro`, `traduzirErroDeRede`, `mascararDadosSensiveis`) |
| Envelope do erro até a tela (`{ ok: false, erro: { mensagem, codigo, nsu, status } }`) | `registrarHandlers()` em `src/electron/main.ts` e `chamar()` em `src/electron/preload.ts` |
| Texto exibido ao operador | `mensagemErro()` em `src/angular/app/core/util.ts` |
| Painel de log | `src/angular/app/pdv/log-integracao.component.*` |
