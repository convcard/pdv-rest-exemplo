# PDV Convcard - Exemplo de integração

PDV de exemplo em **Electron + TypeScript + Vite** (Electron Forge) que demonstra a
integração com o **Autorizador Convcard** no fluxo de PDV. O código está bem
comentado e funciona como uma segunda documentação.

O exemplo usa somente o **ambiente de homologação**
(`https://aut-h.convcard.com.br/autorizador`, fixo em `src/convcard/cliente.ts`).
A credencial de produção é enviada pela Convcard após a homologação ser aprovada.

Documentação oficial da API (swagger):
https://aut-h.convcard.com.br/autorizador/swagger-ui/index.html

## Como rodar

```bash
npm install
npm start
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

## Onde está cada coisa

```
src/
  convcard/
    modelos.ts     -> payloads JSON da API (mesmos nomes do swagger)
    cliente.ts     -> HTTP com certificado de cliente (mTLS) e tratamento de erros
    servico.ts     -> uma função por endpoint + NST, confirmação/desfazimento e pendências
  armazenamento.ts -> config, NST, transação pendente e últimos comprovantes (JSON)
  main.ts          -> processo principal do Electron + handlers IPC + PDF da fatura
  preload.ts       -> expõe window.convcard para as telas
  shared/ipc.ts    -> contrato entre telas e main
  telas/           -> uma tela por arquivo (veja a tabela abaixo)
  telas/icones.ts  -> ícones (biblioteca Lucide, empacotada no app)
```

## Telas

| Arquivo                     | Tela                                                             | Como abrir      |
| --------------------------- | ---------------------------------------------------------------- | --------------- |
| `venda.ts`                  | PDV (carrinho, vendas finalizadas)                               | -               |
| `dialogo-cartao.ts`         | TEF Convcard - Venda                                             | F5 no PDV       |
| `dialogo-qrcode.ts`         | TEF Convcard - QRCode                                            | F3 na venda     |
| `endereco.ts`               | TEF Convcard - Atualização de endereço                           | automático      |
| `funcoes.ts`                | TEF Convcard - Funções administrativas                           | Ctrl+U no PDV   |
| `cancelamento.ts`           | TEF Convcard - Cancelamento                                      | F2 nas funções  |
| `recebimento.ts`            | TEF Convcard - Recebimento (e antecipado)                        | F3 nas funções  |
| `reimpressao.ts`            | TEF Convcard - Reimpressão                                       | F4 nas funções  |
| `saldo.ts`                  | TEF Convcard - Consulta                                          | F5 nas funções  |
| `emissao-fatura.ts`         | TEF Convcard - Emissão de fatura                                 | F6 nas funções  |
| `token.ts`                  | TEF Convcard - Cadastro de token                                 | F7 nas funções  |
| `configuracao.ts`           | TEF Convcard - Configurações                                     | F12 nas funções |
| `dialogo-comprovante.ts`    | Fluxo pós-aprovação (endereço, mensagem, impressão, confirmação) | -               |

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
- **Pendências:** a transação aprovada é salva em disco antes de voltar para a
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
