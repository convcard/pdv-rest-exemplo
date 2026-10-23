# 02 - Configuração e validação

## Objetivo

Preparar o PDV para falar com o autorizador: instalar o certificado, cadastrar
o token da loja e testar a comunicação.

## O que a Convcard fornece

| Item | Descrição |
| --- | --- |
| Certificado `.crt` + chave privada `.key` (formato PEM, chave sem senha) | Certificado de cliente usado na conexão TLS. Um para homologação; o de produção vem depois da homologação aprovada |
| Token da loja | UUID enviado em `identificadorLoja` em todas as requisições |

## O que o PDV precisa guardar

| Configuração | Uso | No exemplo |
| --- | --- | --- |
| Caminho do certificado `.crt` | Conexão TLS | `caminhoCertificado` |
| Caminho da chave privada `.key` | Conexão TLS | `caminhoChave` |
| Token da loja | `identificadorLoja` | `identificadorLoja` |
| Nome e versão do software | `nomeSoftware` / `versaoSoftware` | `nomeSoftware` / `versaoSoftware` |
| Enviar dados de receita | Se a tela de venda pede os dados da receita médica (opcional; só para quem vende com receita) | `usaReceita` |
| Enviar número da nota | Se a compra leva `numeroNota` | `usaNumNota` |

> **Segurança:** a chave privada (`.key`) não tem senha, então quem tiver o
> arquivo consegue se autenticar como a sua integração. Guarde-a em local com
> acesso restrito (permissões de arquivo, pasta protegida) e nunca a coloque no
> repositório de código.

No exemplo, a configuração fica na tabela SQLite `configuracao`
(`src/electron/armazenamento.ts`) e é editada na tela
`src/angular/app/telas/configuracao`.

## Comunicação com certificado de cliente (mTLS)

O certificado e a chave privada são usados no handshake TLS. Não há header de token.

Os dois arquivos estão em formato **PEM** (texto). A chave é RSA no formato
PKCS#1 e **não tem senha**:

```
convcard.crt   -----BEGIN CERTIFICATE-----
               ...
               -----END CERTIFICATE-----

convcard.key   -----BEGIN RSA PRIVATE KEY-----
               ...
               -----END RSA PRIVATE KEY-----
```

### Teste rápido com curl

Antes de programar, dá para testar o certificado direto no terminal:

```bash
curl --cert convcard.crt --key convcard.key \
  -H "Content-Type: application/json" \
  -d '{"nst":1,"nomeSoftware":"TESTE","versaoSoftware":"1.0","identificadorLoja":"SEU-TOKEN-DA-LOJA"}' \
  https://aut-h.convcard.com.br/autorizador/validacao/validar-configuracao
```

### Node.js (como no exemplo)

```ts
import https from 'node:https';
import fs from 'node:fs';

const req = https.request('https://aut-h.convcard.com.br/autorizador/validacao/validar-configuracao', {
  method: 'POST',
  cert: fs.readFileSync(caminhoCertificado), // arquivo .crt
  key: fs.readFileSync(caminhoChave),         // arquivo .key (BEGIN RSA PRIVATE KEY)
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

| Plataforma | Como usar o `.crt` + `.key` |
| --- | --- |
| Java | Converta para PKCS#12 (comando abaixo) e carregue com `KeyStore.getInstance("PKCS12")` + `KeyManagerFactory` num `SSLContext`. O Java não lê chave PKCS#1 (`BEGIN RSA PRIVATE KEY`) nativamente; sem converter, use uma biblioteca como Bouncy Castle |
| .NET 5+ | `X509Certificate2.CreateFromPemFile(crt, key)` em `HttpClientHandler.ClientCertificates`. No Windows, reexporte como PFX para o SChannel aceitar a chave: `new X509Certificate2(cert.Export(X509ContentType.Pfx))` |
| Delphi | Indy (`TIdSSLIOHandlerSocketOpenSSL`) aceita `CertFile` e `KeyFile` em PEM. Componentes que usam o repositório do Windows (ex.: `THTTPClient`) precisam do certificado convertido para PFX |

Quando a plataforma só aceita PKCS#12 (`.pfx`/`.p12`), converta com o OpenSSL:

```bash
openssl pkcs12 -export -in convcard.crt -inkey convcard.key -out convcard.pfx
```

(O OpenSSL pede uma senha para o `.pfx` gerado; use-a ao carregar o arquivo na sua plataforma.)

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
| `.crt` ou `.key` não encontrado | Erro ao ler o arquivo (antes da requisição) | Peça para selecionar o arquivo de novo |
| Chave não corresponde ao certificado | `key values mismatch` (OpenSSL) | "A chave (.key) não corresponde ao certificado (.crt)." Confira se são o par entregue pela Convcard |
| Chave protegida por senha (arquivo diferente do entregue) | `bad decrypt` / `interrupted or cancelled` (OpenSSL) | "A chave (.key) está protegida por senha. Use a chave sem senha fornecida pela Convcard." |
| Arquivo não é PEM válido | `no start line` / erro de decodificação (OpenSSL) | "Certificado (.crt) ou chave (.key) inválidos." |
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
