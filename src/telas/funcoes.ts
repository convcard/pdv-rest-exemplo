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
import { type NomeIcone, rotulo } from './icones';
import { abrirCadastroToken } from './token';
import { mensagemErro } from './util';

interface OpcaoMenu {
  id: string;
  rotulo: string;
  tecla: string;
  icone: NomeIcone;
  acao: () => Promise<unknown>;
}

export function abrirFuncoesConvcard(): void {
  const opcoes: OpcaoMenu[] = [
    { id: 'cancelamento', rotulo: 'Cancelamento de venda', tecla: 'F2', icone: 'cancelamento', acao: abrirCancelamento },
    { id: 'recebimentos', rotulo: 'Recebimentos', tecla: 'F3', icone: 'recebimentos', acao: () => abrirRecebimento() },
    { id: 'reimpressao', rotulo: 'Reimpressão do último movimento', tecla: 'F4', icone: 'imprimir', acao: abrirReimpressao },
    { id: 'saldo', rotulo: 'Consulta saldo', tecla: 'F5', icone: 'pesquisar', acao: abrirConsultaSaldo },
    { id: 'fatura', rotulo: 'Emissão de fatura', tecla: 'F6', icone: 'fatura', acao: abrirEmissaoFatura },
    { id: 'token', rotulo: 'Cadastro de token', tecla: 'F7', icone: 'token', acao: abrirCadastroToken },
    { id: 'configuracoes', rotulo: 'Configurações', tecla: 'F12', icone: 'configuracoes', acao: abrirConfiguracao },
  ];

  const tela = new Tela(
    { titulo: 'TEF Convcard - Funções administrativas', largura: 460 },
    `<div class="menu">
       ${opcoes.map((o) => `<button data-id="${o.id}">${rotulo(o.icone, o.rotulo, o.tecla)}</button>`).join('')}
       <button data-id="sair">${rotulo('sair', 'Sair', 'Esc')}</button>
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
