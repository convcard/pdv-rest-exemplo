/**
 * Tela "TEF Convcard - Consulta".
 *
 * Enter no cartão: POST /consulta/saldo (NST novo a cada consulta).
 * Mostra os dados do cartão, os dados da última fatura e o botão
 * "Recebimentos [F6]", que abre o
 * recebimento já preenchido com a fatura (ou o recebimento antecipado, se a
 * fatura estiver quitada).
 */
import type { SaldoModel } from '../convcard/modelos';
import { Tela, Validacao } from './base';
import { atencao, comProgresso, validar } from './comum';
import { rotulo } from './icones';
import { mascaraCartao } from './mascaras';
import { abrirRecebimento } from './recebimento';
import { api, formatarData, formatarValor, mensagemErro, somenteDigitos } from './util';

export function abrirConsultaSaldo(): Promise<void> {
  const campo = (rotulo: string, id: string, classe = 'num') =>
    `<label>${rotulo}</label><input data-id="${id}" class="${classe}" readonly tabindex="-1" />`;

  const tela = new Tela(
    { titulo: 'TEF Convcard - Consulta', largura: 820 },
    `<div class="cabecalho-consulta">
       <div>
         <div class="linha"><label>Cartão:</label><input data-id="cartao" class="campo-grande" placeholder="Informe aqui o número do cartão" autocomplete="off" /></div>
         <div class="dica-enter">Pressione ENTER para pesquisar</div>
       </div>
     </div>
     <div class="consulta-colunas">
       <div class="grade-campos" style="grid-template-columns: 150px 1fr">
         <div class="secao">Dados do cartão</div>
         <label>Usuário do cartão:</label><input data-id="usuario" readonly tabindex="-1" />
         <label>Situação do cartão:</label><input data-id="situacao" readonly tabindex="-1" />
         ${campo('Limite de crédito total:', 'limite')}
         ${campo('Saldo utilizado:', 'utilizado')}
         ${campo('Saldo disponível:', 'disponivel')}
       </div>
       <div class="grade-campos" style="grid-template-columns: 130px 1fr">
         <div class="secao">Dados da última fatura <span data-id="status-fatura" class="status-fatura"></span></div>
         ${campo('Vencimento:', 'vencimento')}
         ${campo('Número da fatura:', 'numero-fatura')}
         ${campo('NSU da fatura:', 'nsu-fatura')}
         ${campo('Valor mínimo:', 'valor-minimo')}
         ${campo('Valor total:', 'valor-total')}
       </div>
     </div>
     <div class="botoes direita">
       <button data-id="limpar">${rotulo('limpar', 'Limpar', 'F5')}</button>
       <button data-id="recebimentos" class="primario">${rotulo('recebimentos', 'Recebimentos', 'F6')}</button>
       <button data-id="sair">${rotulo('sair', 'Sair', 'Esc')}</button>
     </div>`,
  );

  const cartao = tela.el('cartao');
  mascaraCartao(cartao);
  let consulta: { cartao: string; saldo: SaldoModel } | undefined;

  function preencher(saldo?: SaldoModel): void {
    tela.el('usuario').value = saldo?.usuario ?? '';
    tela.el('situacao').value = saldo?.situacao ?? '';
    tela.el('limite').value = formatarValor(saldo?.limite);
    tela.el('utilizado').value = formatarValor(saldo?.compras);
    tela.el('disponivel').value = formatarValor(saldo?.saldo);

    const fatura = saldo?.fatura;
    tela.el('vencimento').value = formatarData(fatura?.vencimento);
    tela.el('numero-fatura').value = fatura?.numero?.toString() ?? '';
    tela.el('nsu-fatura').value = fatura?.nsu?.toString() ?? '';
    tela.el('valor-minimo').value = formatarValor(fatura?.valorMinimo);
    tela.el('valor-total').value = formatarValor(fatura?.valor);
    tela.el('status-fatura').textContent =
      fatura?.status === 'PAGO' ? 'FATURA QUITADA' : fatura?.nsu ? 'FATURA EM ABERTO' : '';
  }

  async function pesquisar(): Promise<void> {
    const numero = somenteDigitos(cartao.value);
    if (!(await validar(new Validacao().requerido('Cartão', numero)))) return;
    try {
      const saldo = await comProgresso('Consultando o saldo...', () => api().consultarSaldo(numero));
      consulta = { cartao: numero, saldo };
      preencher(saldo);
    } catch (e) {
      consulta = undefined;
      preencher();
      await atencao(mensagemErro(e));
    }
  }

  function limpar(): void {
    consulta = undefined;
    cartao.value = '';
    preencher();
    cartao.focus();
  }

  async function recebimentos(): Promise<void> {
    if (!consulta) {
      await abrirRecebimento();
      return;
    }
    const recebido = await abrirRecebimento({ cartao: consulta.cartao, fatura: consulta.saldo.fatura });
    if (recebido) await pesquisar();
  }

  return new Promise((resolve) => {
    const fechar = () => {
      tela.fechar();
      resolve();
    };
    cartao.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void pesquisar();
    });
    tela.botao('limpar', 'F5', limpar);
    tela.botao('recebimentos', 'F6', () => void recebimentos());
    tela.botao('sair', undefined, fechar);
    tela.aoEsc = fechar;
    tela.abrir();
    cartao.focus();
  });
}
