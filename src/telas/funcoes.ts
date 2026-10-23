/**
 * Tela "TEF Convcard - Funções administrativas".
 *
 * Menu com as funções Convcard fora da venda (Ctrl+U na tela de venda).
 */
import { Tela } from './base';
import { atencao } from './comum';
import { abrirCancelamento } from './cancelamento';
import { abrirConfiguracao } from './configuracao';
import { abrirEmissaoFatura } from './emissao-fatura';
import { abrirRecebimento } from './recebimento';
import { abrirReimpressao } from './reimpressao';
import { abrirConsultaSaldo } from './saldo';
import { abrirCadastroToken } from './token';
import { mensagemErro } from './util';

interface OpcaoMenu {
  id: string;
  rotulo: string;
  tecla: string;
  icone: string;
  acao: () => Promise<unknown>;
}

export function abrirFuncoesConvcard(): void {
  const opcoes: OpcaoMenu[] = [
    { id: 'cancelamento', rotulo: 'Cancelamento de venda [F2]', tecla: 'F2', icone: 'card_cancel.png', acao: abrirCancelamento },
    { id: 'recebimentos', rotulo: 'Recebimentos [F3]', tecla: 'F3', icone: 'card_receipt.png', acao: () => abrirRecebimento() },
    { id: 'reimpressao', rotulo: 'Reimpressão do último movimento [F4]', tecla: 'F4', icone: 'card_print.png', acao: abrirReimpressao },
    { id: 'saldo', rotulo: 'Consulta saldo [F5]', tecla: 'F5', icone: 'card_search.png', acao: abrirConsultaSaldo },
    { id: 'fatura', rotulo: 'Emissão de fatura [F6]', tecla: 'F6', icone: 'card_invoice.png', acao: abrirEmissaoFatura },
    { id: 'token', rotulo: 'Cadastro de token [F7]', tecla: 'F7', icone: 'card_setting.png', acao: abrirCadastroToken },
    { id: 'configuracoes', rotulo: 'Configurações [F12]', tecla: 'F12', icone: 'card_setting.png', acao: abrirConfiguracao },
  ];

  const tela = new Tela(
    { titulo: 'TEF Convcard - Funções administrativas', largura: 350 },
    `<div class="menu">
       ${opcoes.map((o) => `<button data-id="${o.id}"><img src="imagens/${o.icone}" alt="" />${o.rotulo}</button>`).join('')}
       <button data-id="sair"><img src="imagens/card_cancel.png" alt="" />Sair [Esc]</button>
     </div>`,
  );

  for (const opcao of opcoes) {
    tela.botao(opcao.id, opcao.tecla, () => {
      opcao.acao().catch((e) => atencao(mensagemErro(e)));
    });
  }
  tela.botao('sair', undefined, () => tela.fechar());

  // Setas para cima/baixo movem o foco entre os botões
  const botoes = [...tela.dlg.querySelectorAll<HTMLButtonElement>('.menu button')];
  tela.atalho('ArrowDown', () => botoes[(botoes.indexOf(document.activeElement as HTMLButtonElement) + 1) % botoes.length].focus());
  tela.atalho('ArrowUp', () => botoes[(botoes.indexOf(document.activeElement as HTMLButtonElement) - 1 + botoes.length) % botoes.length].focus());

  tela.abrir();
  botoes[0].focus();
}
