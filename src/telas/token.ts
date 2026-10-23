/**
 * Tela "TEF Convcard - Cadastro de token".
 *
 * POST /token/cadastrar: troca cartão + CVV por um token (UUID). Depois o
 * token pode ser enviado no campo "cartao" da compra, consulta de saldo etc.,
 * sem precisar de CVV nem senha. Útil para o PDV guardar o cartão do cliente
 * sem armazenar o número real.
 * Funcionalidade não disponível para todos os integradores (consulte a Convcard).
 */
import { Tela, Validacao } from './base';
import { atencao, comProgresso, validar } from './comum';
import { rotulo } from './icones';
import { mascaraCartao, mascaraNumero } from './mascaras';
import { api, escapar, mensagemErro, somenteDigitos } from './util';

export function abrirCadastroToken(): Promise<void> {
  const tela = new Tela(
    { titulo: 'TEF Convcard - Cadastro de token', largura: 435 },
    `<div class="grade-campos" style="grid-template-columns: 117px 1fr 60px">
       <label>Número do cartão:</label><input data-id="cartao" class="campo-grande" autocomplete="off" />
       <input data-id="cvv" class="campo-grande" placeholder="CVV" autocomplete="off" />
     </div>
     <div data-id="resultado"></div>
     <div class="botoes centro">
       <button data-id="enviar" class="primario">${rotulo('enviar', 'Enviar', 'F2')}</button>
       <button data-id="sair">${rotulo('sair', 'Sair', 'Esc')}</button>
     </div>`,
  );
  mascaraCartao(tela.el('cartao'));
  mascaraNumero(tela.el('cvv'), 3);

  async function enviar(): Promise<void> {
    const cartao = somenteDigitos(tela.el('cartao').value);
    const cvv = tela.el('cvv').value;
    if (!(await validar(new Validacao().requerido('Cartão', cartao).requerido('CVV', cvv)))) return;
    try {
      const token = await comProgresso('Cadastrando token...', () => api().cadastrarToken(cartao, cvv));
      tela.el('resultado').innerHTML = `
        <table class="grade detalhe">
          <tr><th>Cartão</th><td>${escapar(token.cartao)}</td></tr>
          <tr><th>Token</th><td><code>${escapar(token.token)}</code></td></tr>
        </table>`;
    } catch (e) {
      await atencao(mensagemErro(e));
    }
  }

  return new Promise((resolve) => {
    const fechar = () => {
      tela.fechar();
      resolve();
    };
    tela.botao('enviar', 'F2', () => void enviar());
    tela.botao('sair', undefined, fechar);
    tela.aoEsc = fechar;
    tela.abrir();
    tela.el('cartao').focus();
  });
}
