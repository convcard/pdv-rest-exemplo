# 02 - Configuração e validação

## Objetivo

Preparar o PDV para falar com o autorizador: instalar o certificado, cadastrar
o token da loja e testar a comunicação.

## O que a Convcard fornece

| Item | Descrição |
| --- | --- |
| Certificado `.p12` + senha | Certificado de cliente (PKCS#12) usado na conexão TLS. Um para homologação; o de produção vem depois da homologação aprovada |
| Token da loja | UUID enviado em `identificadorLoja` em todas as requisições |

## O que o PDV precisa guardar

| Configuração | Uso | No exemplo |
| --- | --- | --- |
| Caminho do certificado `.p12` | Conexão TLS | `caminhoCertificado` |
| Senha do certificado | Abrir o `.p12` | `senhaCertificado` |
| Token da loja | `identificadorLoja` | `identificadorLoja` |
| Nome e versão do software | `nomeSoftware` / `versaoSoftware` | `nomeSoftware` / `versaoSoftware` |
| Enviar dados de receita | Se a tela de venda pede os dados da receita médica | `usaReceita` |
| Enviar número da nota | Se a compra leva `numeroNota` | `usaNumNota` |

> **Segurança:** a senha do certificado é sensível. O exemplo a guarda em
> texto puro por simplicidade; em produção, proteja-a (por exemplo, com
> `safeStorage` do Electron ou o cofre de credenciais do sistema operacional).

No exemplo, a configuração fica na tabela SQLite `configuracao`
(`src/electron/armazenamento.ts`) e é editada na tela
`src/angular/app/telas/configuracao`.

## Comunicação com certificado de cliente (mTLS)

O certificado é apresentado no handshake TLS. Não há header de token.

### Node.js (como no exemplo)

```ts
import https from 'node:https';
import fs from 'node:fs';

const req = https.request('https://aut-h.convcard.com.br/autorizador/validacao/validar-configuracao', {
  method: 'POST',
  pfx: fs.readFileSync(caminhoCertificado), // arquivo .p12
  passphrase: senhaCertificado,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Content-Length': Buffer.byteLength(json),
  },
  timeout: 60_000,
}, (res) => { /* lê o corpo e trata status */ });
req.end(json);
```

Implementação completa em `src/electron/convcard/cliente.ts`
(função `requisitar`), incluindo leitura do corpo, tratamento de erro,
timeout e máscara de dados sensíveis no log.

### Outras linguagens

| Plataforma | Como carregar o `.p12` |
| --- | --- |
| Java | `KeyStore.getInstance("PKCS12")` + `KeyManagerFactory` num `SSLContext`, ou o suporte a certificado de cliente do seu cliente HTTP |
| .NET | `new X509Certificate2(caminho, senha)` adicionado em `HttpClientHandler.ClientCertificates` |
| Delphi | Componente HTTP com suporte a certificado de cliente (ex.: `THTTPClient` + certificado instalado/arquivo PFX) |

Não importa a linguagem: o certificado precisa ir na conexão TLS e o corpo é JSON.

## Validar a configuração

**`POST /validacao/validar-configuracao`**

Confere se certificado, ambiente e token da loja estão corretos. Use ao
configurar o PDV ou ao ativar a integração.

### Requisição

**ValidarConfiguracaoModel**

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
| --- | --- | --- | --- | --- |
| `nst` | integer (int64) | sim | Número sequencial da transação Este número deve permanecer o mesmo durante todo o processamento da operação em tratamento, mesmo que envolva mais de um fluxo de mensagens (fluxos com continuação). (mín. 1, máx. 9999999999) | `1239` |
| `nomeSoftware` | string | sim | Nome do Software | `Card Aut App` |
| `versaoSoftware` | string | sim | Versão Software | `1.205.790` |
| `identificadorLoja` | string | sim | Identificação da loja | `01c760b2-a9db-429c-ad60-d926f49878cd` |

```json
{
  "nst": 1,
  "nomeSoftware": "PDV Convcard Exemplo",
  "versaoSoftware": "1.0.0",
  "identificadorLoja": "01c760b2-a9db-429c-ad60-d926f49878cd"
}
```

### Resposta (HTTP 200)

**ValidarConfiguracaoOutputModel**

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
| --- | --- | --- | --- | --- |
| `mensagem` | string | não |  |  |

Mostre `mensagem` ao operador.

## Exceções

| Situação | Sintoma | O que fazer |
| --- | --- | --- |
| Arquivo `.p12` não encontrado | Erro ao ler o arquivo (antes da requisição) | Peça para selecionar o certificado de novo |
| Senha do `.p12` errada | Erro ao abrir o certificado (`mac verify failure` no Node) | Peça a senha correta |
| Certificado recusado (de outro ambiente, expirado ou inválido) | HTTP 400 com página HTML do servidor ("SSL certificate error") ou HTTP 401 | "Falha de autenticação. Verifique o certificado configurado." |
| Token da loja inválido | HTTP 4xx com `message` no corpo | Mostre `message`; confira o token |
| Sem rede / DNS | Erro de conexão (`ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET`) | "Sem acesso à Convcard. Verifique a conexão de rede." |

Veja o tratamento geral em [14 - Tratamento de erros](14-tratamento-de-erros.md).

## No exemplo

| O quê | Onde |
| --- | --- |
| Tela de configuração (F12 nas funções; abre sozinha na primeira execução) | `src/angular/app/telas/configuracao/` |
| Validação | `validarConfiguracao()` em `src/electron/convcard/servico.ts` |
| Persistência | `obterConfiguracao()` / `salvarConfiguracao()` em `src/electron/armazenamento.ts` |
