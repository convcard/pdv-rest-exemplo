/**
 * Tela "TEF Convcard - Cancelamento".
 *
 * Cancelamento manual de uma venda feita com cartão, identificada por
 * cartão + valor + autorização.
 *
 *  1. DELETE /cancelamento/solicitacao
 *  2. imprime o comprovante (falhou -> DELETE /cancelamento/desfazimento)
 *  3. DELETE /cancelamento/confirmacao
 *
 * Vendas por QR Code são canceladas pela exclusão da venda na tela principal
 * (DELETE /qrcode-pdv/solicitacao-cancelamento-compra-qrcode).
 */
import { Tela, Validacao } from './base';
import { comProgresso, mensagemOperador, mostrarAprovado, validar } from './comum';
import { finalizarTransacao } from './dialogo-comprovante';
import { rotulo } from './icones';
import { lerValor, mascaraCartao, mascaraNumero, mascaraValor } from './mascaras';
import { api, mensagemErro, somenteDigitos } from './util';

export function abrirCancelamento(): Promise<void> {
  const tela = new Tela(
    { titulo: 'TEF Convcard - Cancelamento', largura: 435 },
    `<div class="faixa-titulo esquerda">Cancelamento de venda</div>
     <div class="grade-campos" style="grid-template-columns: 117px 1fr 60px">
       <label>Número do cartão:</label><input data-id="cartao" class="campo-grande" autocomplete="off" />
       <input data-id="cvv" class="campo-grande" placeholder="CVV" disabled autocomplete="off" />
       <label>Valor:</label><input data-id="valor" class="campo-grande" /><span></span>
       <label>Autorização:</label><input data-id="autorizacao" class="campo-grande" /><span></span>
     </div>
     <div class="botoes centro">
       <button data-id="enviar" class="primario">${rotulo('enviar', 'Enviar', 'F2')}</button>
       <button data-id="cancelar" tabindex="-1">${rotulo('cancelar', 'Cancelar', 'Esc')}</button>
     </div>`,
  );

  const cartao = tela.el('cartao');
  const cvv = tela.el('cvv');
  mascaraCartao(cartao);
  mascaraNumero(cvv, 3);
  mascaraValor(tela.el('valor'));
  mascaraNumero(tela.el('autorizacao'), 5);

  // CVV só habilitado com cartão preenchido
  cartao.addEventListener('input', () => {
    cvv.disabled = !somenteDigitos(cartao.value);
    if (cvv.disabled) cvv.value = '';
  });

  return new Promise((resolve) => {
    const fechar = () => {
      tela.fechar();
      resolve();
    };

    async function enviar(): Promise<void> {
      const numeroCartao = somenteDigitos(cartao.value);
      const valor = lerValor(tela.el('valor'));
      const autorizacao = Number(tela.el('autorizacao').value);

      const validacao = new Validacao()
        .requerido('Cartão', numeroCartao)
        .requerido('Valor', valor)
        .requerido('Autorização', autorizacao || undefined);
      if (!cvv.disabled && !cvv.value && numeroCartao.length === 19) validacao.requerido('CVV', '');
      if (!(await validar(validacao))) return;

      try {
        const retorno = await comProgresso('Processando cancelamento...', (p) => {
          p.atualizar('Enviando solicitação...');
          return api().solicitarCancelamento({ cartao: numeroCartao, cvv: cvv.value || undefined, valor, autorizacao });
        });
        await finalizarTransacao({ titulo: 'Cancelamento', comprovante: retorno.comprovante, mensagemLoja: retorno.mensagemLoja });
        await mostrarAprovado();
        fechar();
      } catch (e) {
        await mensagemOperador(mensagemErro(e));
      }
    }

    tela.botao('enviar', 'F2', () => void enviar());
    tela.botao('cancelar', undefined, fechar);
    tela.aoEsc = fechar;
    tela.abrir();
    cartao.focus();
  });
}
