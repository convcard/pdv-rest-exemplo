# 16 - Checklist de homologação

Cenários sugeridos para testar no ambiente de homologação antes de pedir a
homologação à Convcard. O roteiro oficial é definido pela equipe Convcard;
use esta lista como preparação.

## Configuração

- [ ] `POST /validacao/validar-configuracao` responde com sucesso e a `mensagem` é exibida.
- [ ] `.crt`/`.key` inexistentes, chave que não corresponde ao certificado e certificado de outro ambiente geram mensagens claras.
- [ ] Sem rede: mensagem de conectividade (sem travar o PDV).
- [ ] `nomeSoftware` e `versaoSoftware` corretos em todas as requisições.

## NST

- [ ] Cada nova operação usa um NST novo.
- [ ] Confirmação/desfazimento usam o NST da solicitação.
- [ ] Gerar QR Code, pooling e confirmação usam o mesmo NST.
- [ ] O contador sobrevive a reinício do PDV e volta para 1 depois de 9999999999.

## Compra com cartão

- [ ] Compra aprovada → comprovante impresso → confirmação.
- [ ] Compra aprovada → falha na impressão → desfazimento.
- [ ] Compra recusada → mensagem exibida, nada confirmado.
- [ ] Compra parcelada (`qtdParcelas` > 1).
- [ ] Compra com receita (`receita`, `dataReceita`, `numeroCrm`, `ufMedico`), se o estabelecimento vende com receita.
- [ ] Compra com `numeroNota`.
- [ ] Lista de produtos com o tipo correto (`O` para itens comuns) e descontos.
- [ ] Retorno com `mensagemLoja` exibido ao operador.
- [ ] Retorno com `atualizaEndereco = true`: atualização concluída e cancelada (deve desfazer).

## Compra com QR Code

- [ ] QR Code exibido; cliente aprova no APP; pooling respeitando `sleepMs`; confirmação.
- [ ] Falha na impressão depois da aprovação → desfazimento.
- [ ] Cancelamento pelo operador durante o pooling.
- [ ] QR Code expirado.

## Pendências

- [ ] Fechar o PDV entre a aprovação e a confirmação → ao reabrir, a transação é desfeita.
- [ ] Iniciar nova transação com pendência anterior → a anterior é desfeita antes.
- [ ] Confirmação com erro de rede → pendência mantida e reenviada.

## Cancelamento

- [ ] Cancelamento de compra com cartão → confirmação.
- [ ] Cancelamento com falha de impressão → desfazimento do cancelamento.
- [ ] Cancelamento de compra feita por QR Code, informando o número do cartão.
- [ ] Cancelamento recusado (autorização/valor inválidos).

## Consultas

- [ ] Consulta de saldo com fatura em aberto, quitada e sem fatura.
- [ ] Saldo devedor.
- [ ] Consulta de fatura por cartão, CPF, número e NSU.
- [ ] Fatura em PDF (se liberado): download, gravação e abertura.
- [ ] Consulta de CEP.

## Recebimentos

- [ ] Recebimento de fatura → comprovante → confirmação.
- [ ] Recebimento antecipado → comprovante → confirmação.
- [ ] Recebimento com falha antes da confirmação (não confirma).

## Token (se liberado)

- [ ] Cadastro de token.
- [ ] Compra e consulta usando o token no campo `cartao` (sem CVV/senha).

## Comprovantes

- [ ] Comprovante impresso com as linhas separadas corretamente (`@`).
- [ ] Reimpressão da última venda, do último cancelamento e do último recebimento.
