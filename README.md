# PDV Convcard - Exemplo de integração

PDV de exemplo em **Electron + Angular + TypeScript + Vite** (Electron Forge) que demonstra a
integração com o **Autorizador Convcard** no fluxo de PDV. O código está bem
comentado e funciona como uma segunda documentação.

O exemplo usa somente o **ambiente de homologação**
(`https://aut-h.convcard.com.br/autorizador`, fixo em `src/electron/convcard/cliente.ts`).
A credencial de produção é enviada pela Convcard após a homologação ser aprovada.

**Documentação da integração (um arquivo por processo):** [`docs/`](docs/README.md)

Documentação oficial da API (swagger):
https://aut-h.convcard.com.br/autorizador/swagger-ui/index.html

## Como rodar

```bash
npm install
npm start          # modo desenvolvimento
npm run typecheck  # checa Electron (tsc) e Angular, incluindo os templates (ngc)
npm run package    # gera o executável em out/
```

Na primeira execução abre a tela de configuração. Informe:

| Campo                          | Descrição                                                              |
| ------------------------------ | ---------------------------------------------------------------------- |
| Token da loja                  | Token (UUID) fornecido pela Convcard, enviado como `identificadorLoja` |
| Enviar dados receita           | Exibe os campos de receita médica na venda                             |
| Enviar número nota             | Envia o número do cupom/nota na venda                                  |
| Certificado (.p12) + senha     | Fornecidos pela Convcard para cada ambiente                            |
| Nome / versão do software      | Identificação do seu PDV                                               |

Use **Validar configuração [F3]** para testar.

## Arquitetura

```
src/
  electron/                 Processo main (Node.js): integração com a Convcard
    main.ts                 janela + handlers IPC + PDF da fatura
    preload.ts              expõe window.convcard para as telas
    armazenamento.ts        SQLite (node:sqlite): config, NST, pendência, últimos comprovantes
    convcard/
      cliente.ts            HTTP com certificado de cliente (mTLS) e tratamento de erros
      servico.ts            uma função por endpoint + NST, confirmação/desfazimento e pendências

  shared/                   Usado pelos dois lados
    ipc.ts                  contrato entre telas e main (ConvcardApi)
    modelos.ts              payloads JSON da API (mesmos nomes do swagger)

  angular/                  Telas (Angular 22 + @angular/cdk), compiladas pelo Vite (Analog)
    index.html, main.ts, styles.css
    public/imagens          logos da marca
    assets/fontes           fonte Funnel Display
    app/
      core/                 serviços e regras sem tela
        convcard-api.ts     token CONVCARD_API (window.convcard)
        dialogos.service.ts abre as modais (CDK Dialog) e diálogos gerais
        transacao.service.ts fluxo pós-aprovação (endereço, mensagem, impressão, confirmação)
        tela-base.ts        base das modais (atalhos de teclado e Esc)
      componentes/          moldura das telas, ícones (Lucide), visor, máscaras
      dialogos/             Mensagem Operador, Atenção, Confirmação, Aguarde, Impressora
      telas/                uma pasta por tela (controlador .ts + view .html)
      pdv/                  tela principal: venda e log da integração
```

**Chamando a API nas telas:**

```ts
private readonly api = inject(CONVCARD_API);
const saldo = await this.api.consultarSaldo(cartao);
```

**Abrindo uma tela modal e recebendo o resultado:**

```ts
const resultado = await this.dialogos.abrir(VendaCartaoComponent, dadosCompra);
```

O banco SQLite fica em `pdv-convcard.db`, na pasta de dados do app
(no Windows: `%APPDATA%\PDV Convcard Exemplo`).

Identidade visual (logos, fonte Funnel Display e paleta) em `src/angular/public`,
`src/angular/assets` e no início de `src/angular/styles.css`.

## Telas

| Pasta (`src/angular/app/`)  | Tela                                                             | Como abrir      |
| --------------------------- | ---------------------------------------------------------------- | --------------- |
| `pdv/venda`                 | PDV (carrinho, vendas finalizadas)                               | -               |
| `telas/venda-cartao`        | TEF Convcard - Venda                                             | F5 no PDV       |
| `telas/qrcode`              | TEF Convcard - QRCode                                            | F3 na venda     |
| `telas/endereco`            | TEF Convcard - Atualização de endereço                           | automático      |
| `telas/funcoes`             | TEF Convcard - Funções administrativas                           | Ctrl+U no PDV   |
| `telas/cancelamento`        | TEF Convcard - Cancelamento                                      | F2 nas funções  |
| `telas/recebimento`         | TEF Convcard - Recebimento (e antecipado)                        | F3 nas funções  |
| `telas/reimpressao`         | TEF Convcard - Reimpressão                                       | F4 nas funções  |
| `telas/consulta-saldo`      | TEF Convcard - Consulta                                          | F5 nas funções  |
| `telas/emissao-fatura`      | TEF Convcard - Emissão de fatura                                 | F6 nas funções  |
| `telas/token`               | TEF Convcard - Cadastro de token                                 | F7 nas funções  |
| `telas/configuracao`        | TEF Convcard - Configurações                                     | F12 nas funções |

A impressão do comprovante é simulada: o operador escolhe "Impresso" (a
transação é confirmada) ou "Falha na impressão" (a transação é desfeita).

## Conceitos principais

- **Autenticação:** certificado de cliente `.p12` no handshake TLS (mTLS) + token da loja no campo `identificadorLoja`.
- **Campos base:** toda requisição leva `nst`, `nomeSoftware`, `versaoSoftware` e `identificadorLoja`.
- **NST:** sequencial gerado pelo PDV (1 a 9999999999). O mesmo NST é usado em
  todas as etapas de uma operação (solicitação → confirmação/desfazimento; gerar QR → pooling → confirmação).
- **Duas etapas (modelo TEF):** compras, cancelamentos e recebimentos aprovados
  precisam ser **confirmados** (deu tudo certo) ou **desfeitos** (algo falhou).
  Recebimentos não têm desfazimento: basta não confirmar.
- **Pendências:** a transação aprovada é salva no SQLite antes de voltar para a
  tela. Se o PDV fechar antes de confirmar, ela é desfeita ao abrir de novo
  ou antes da próxima transação.
- **Atualização de endereço:** quando o retorno traz `endereco.atualizaEndereco = true`,
  o PDV pede o endereço ao portador; se não for confirmado, a transação é desfeita.

## Endpoints

| Operação                    | Endpoint                                                         | Onde                          |
| --------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| Validar configuração        | `POST /validacao/validar-configuracao`                           | Configurações                 |
| Consulta saldo              | `POST /consulta/saldo`                                           | Consulta                      |
| Saldo devedor               | `POST /consulta/saldo-devedor`                                   | Recebimento antecipado        |
| Fatura                      | `POST /consulta/fatura`                                          | Recebimento                   |
| Fatura PDF                  | `POST /consulta/fatura-pdf`                                      | Emissão de fatura             |
| CEP                         | `POST /consulta/consulta-cep`                                    | Atualização de endereço       |
| Compra cartão               | `POST /compra/solicitacao`, `PUT /compra/confirmacao`, `DELETE /compra/desfazimento` | Venda |
| Compra QR Code PDV          | `POST /qrcode-pdv/gerar`, `POST /qrcode-pdv/solicitacao-compra-qrcode`, `PUT /qrcode-pdv/confirmacao-compra-qrcode`, `DELETE /qrcode-pdv/desfazimento-compra-qrcode` | Venda (F3) |
| Cancelamento cartão         | `DELETE /cancelamento/solicitacao`, `/confirmacao`, `/desfazimento` | Cancelamento / excluir venda |
| Cancelamento QR Code        | `DELETE /qrcode-pdv/solicitacao-cancelamento-compra-qrcode`, `/confirmacao-cancelamento-compra-qrcode`, `/desfazimento-cancelamento-compra-qrcode` | Excluir venda |
| Recebimento                 | `POST /pagamento/solicitacao-pagamento`, `PUT /pagamento/confirmacao-pagamento` | Recebimento |
| Recebimento antecipado      | `POST /pagamento/solicitacao-pagamento-antecipado`, `PUT /pagamento/confirmacao-pagamento-antecipado` | Recebimento |
| Atualizar endereço          | `PUT /endereco/atualizacao`                                      | Atualização de endereço       |
| Cadastrar token             | `POST /token/cadastrar`                                          | Cadastro de token             |

Alguns endpoints (fatura PDF, token e cancelamento de QR Code) precisam ser liberados pelo suporte Convcard.
