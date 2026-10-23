# Documentação da integração com o Autorizador Convcard

Guia para integradores de PDV. Cada arquivo descreve um processo de ponta a
ponta: objetivo, fluxo, endpoints, campos, regras, exceções e como
implementar, com referência ao código do PDV de exemplo deste repositório.

> Fonte oficial da API (swagger):
> https://aut-h.convcard.com.br/autorizador/swagger-ui/index.html
>
> As tabelas de campos desta documentação foram geradas a partir desse swagger.

## Por onde começar

1. [Visão geral](01-visao-geral.md): conceitos que valem para todos os processos (ambiente, autenticação, NST, modelo de duas etapas).
2. [Configuração e validação](02-configuracao-e-validacao.md): certificado, token da loja e o primeiro teste de comunicação.
3. [Confirmação, desfazimento e pendências](05-confirmacao-desfazimento-e-pendencias.md): leia antes de implementar qualquer transação financeira.
4. [Tratamento de erros](14-tratamento-de-erros.md)

## Processos

| # | Processo | Endpoints principais |
| --- | --- | --- |
| 03 | [Compra com cartão](03-compra-cartao.md) | `/compra/solicitacao`, `/compra/confirmacao`, `/compra/desfazimento` |
| 04 | [Compra com QR Code (QRCode PDV)](04-compra-qrcode-pdv.md) | `/qrcode-pdv/gerar`, `/qrcode-pdv/solicitacao-compra-qrcode`, confirmação/desfazimento |
| 05 | [Confirmação, desfazimento e pendências](05-confirmacao-desfazimento-e-pendencias.md) | todos os endpoints de confirmação/desfazimento |
| 06 | [Cancelamento de compra](06-cancelamento.md) | `/cancelamento/*`, `/qrcode-pdv/*-cancelamento-compra-qrcode` |
| 07 | [Consulta de saldo e saldo devedor](07-consulta-saldo.md) | `/consulta/saldo`, `/consulta/saldo-devedor` |
| 08 | [Consulta de fatura e emissão do PDF](08-fatura.md) | `/consulta/fatura`, `/consulta/fatura-pdf` |
| 09 | [Recebimento de fatura](09-recebimento-fatura.md) | `/pagamento/solicitacao-pagamento`, `/pagamento/confirmacao-pagamento` |
| 10 | [Recebimento antecipado](10-recebimento-antecipado.md) | `/pagamento/solicitacao-pagamento-antecipado`, `/pagamento/confirmacao-pagamento-antecipado` |
| 11 | [Atualização de endereço e consulta de CEP](11-atualizacao-endereco.md) | `/endereco/atualizacao`, `/consulta/consulta-cep` |
| 12 | [Token de cartão](12-token.md) | `/token/cadastrar` |
| 13 | [Comprovantes e reimpressão](13-comprovantes-e-reimpressao.md) | campo `comprovante` dos retornos |

## Referência

| Documento | Conteúdo |
| --- | --- |
| [14 - Tratamento de erros](14-tratamento-de-erros.md) | Formato de erro, status HTTP, erros de rede e de certificado |
| [15 - PDV de exemplo](15-pdv-exemplo.md) | Arquitetura do código, onde está cada processo, como adaptar |
| [16 - Checklist de homologação](16-checklist-homologacao.md) | Cenários para testar antes de pedir a homologação |
