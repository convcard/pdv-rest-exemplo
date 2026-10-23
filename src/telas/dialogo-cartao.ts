/**
 * Tela "TEF Convcard - Venda".
 *
 * Aberta na finalização da venda quando a forma de pagamento é Convcard.
 *
 *  - Enviar [F2]: compra com cartão digitado -> POST /compra/solicitacao
 *  - QrCode [F3]: compra por QR Code no modelo "QRCode PDV" (dialogo-qrcode.ts)
 *  - Cancelar [ESC]: "Cancelado pelo operador."
 *
 * Regras dos campos:
 *  - CVV habilitado assim que o cartão tiver algum dígito;
 *  - Senha habilitada só para cartões de 19 dígitos cujo 7º dígito é "1";
 *  - QR Code só habilitado com o campo cartão vazio;
 *  - Campos de receita só aparecem com a configuração "Enviar dados receita".
 *
 * Após a aprovação a compra fica PENDENTE; quem chamou (venda.ts) imprime o
 * comprovante e confirma ou desfaz.
 */
import type { DadosCompra, RetornoMovimentoModel } from '../convcard/modelos';
import { escreverVisor, Tela, Validacao } from './base';
import { validar } from './comum';
import { abrirQrCode } from './dialogo-qrcode';
import { mascaraCartao, mascaraNumero, maiusculas } from './mascaras';
import { aguardar, api, config, ErroTela, formatarValor, mensagemErro, opcoesUf, somenteDigitos } from './util';

/** Por qual meio a compra foi aprovada. Necessário depois para cancelar a venda. */
export type MeioPagamento =
  | { tipo: 'cartao'; cartao: string; cvv?: string }
  | { tipo: 'qrcode'; qrcode: string };

export interface CompraAprovada {
  retorno: RetornoMovimentoModel;
  meio: MeioPagamento;
}

/** Resolve com a compra aprovada ou rejeita com o erro (inclusive "Cancelado pelo operador."). */
export function abrirVendaConvcard(dados: DadosCompra): Promise<CompraAprovada> {
  const usaReceita = config().usaReceita;
  const tela = new Tela(
    { titulo: 'TEF Convcard - Venda', largura: 435 },
    `<div class="faixa-titulo esquerda">CARTÃO: CONVCARD</div>
     <div class="valor-parcelas">
       <div><label>Valor:</label><input class="valor-grande" readonly tabindex="-1" value="${formatarValor(dados.valor)}" /></div>
       <div><label>Parcelas:</label><input class="valor-grande" readonly tabindex="-1" value="${dados.qtdParcelas}" /></div>
     </div>
     <div class="grade-campos" style="grid-template-columns: 117px 1fr 60px">
       <label>Número do cartão:</label><input data-id="cartao" class="campo-grande" autocomplete="off" />
       <input data-id="cvv" class="campo-grande" placeholder="CVV" maxlength="3" disabled autocomplete="off" />
       <label>Senha:</label><input data-id="senha" type="password" class="campo-grande" disabled autocomplete="off" /><span></span>
     </div>
     ${
       usaReceita
         ? `<div class="grade-campos" style="grid-template-columns: 117px 1fr 40px 70px">
              <label class="checkbox"><input data-id="com-receita" type="checkbox" />Com receita?</label>
              <span class="linha"><label>Data receita:</label><input data-id="data-receita" type="date" disabled /></span><span></span><span></span>
              <label>CRM:</label><input data-id="crm" disabled />
              <label>UF:</label><select data-id="uf" disabled>${opcoesUf()}</select>
            </div>`
         : ''
     }
     <div data-id="visor" class="visor info"></div>
     <div class="botoes centro">
       <button data-id="enviar"><img src="imagens/Btn_Finalizar.gif" alt="" />Enviar [F2]</button>
       <button data-id="qrcode" tabindex="-1"><img src="imagens/Btn_Consulta.gif" alt="" />QrCode [F3]</button>
       <button data-id="cancelar" tabindex="-1"><img src="imagens/Btn_Cancelar.gif" alt="" />Cancelar [ESC]</button>
     </div>`,
  );

  const cartao = tela.el('cartao');
  const cvv = tela.el('cvv');
  const senha = tela.el('senha');
  const visor = tela.el<HTMLDivElement>('visor');
  const cartaoDigitos = () => somenteDigitos(cartao.value);

  mascaraCartao(cartao);
  mascaraNumero(cvv, 3);
  mascaraNumero(senha, 8);

  /** Executado a cada digitação no cartão: habilita CVV, senha e QR Code. */
  function controlarNumeroCartao(): void {
    const digitos = cartaoDigitos();
    cvv.disabled = digitos.length === 0;
    if (cvv.disabled) cvv.value = '';

    senha.disabled = !(digitos.length === 19 && digitos[6] === '1');
    if (senha.disabled) senha.value = '';

    tela.el<HTMLButtonElement>('qrcode').disabled = digitos.length > 0;
  }
  cartao.addEventListener('input', controlarNumeroCartao);

  function controlarReceita(): void {
    if (!usaReceita) return;
    const comReceita = tela.el('com-receita').checked;
    for (const id of ['data-receita', 'crm', 'uf']) {
      tela.el(id).disabled = !comReceita;
      if (!comReceita) tela.el(id).value = '';
    }
  }
  if (usaReceita) {
    maiusculas(tela.el('crm'), 10);
    tela.el('com-receita').addEventListener('change', controlarReceita);
  }

  function dadosReceita(): Partial<DadosCompra> {
    if (!usaReceita || !tela.el('com-receita').checked) return { receita: false };
    const data = tela.el('data-receita').value; // yyyy-mm-dd
    return {
      receita: true,
      // A API espera date-time ISO 8601: enviamos o início do dia no fuso local
      dataReceita: data ? new Date(`${data}T00:00:00`).toISOString() : undefined,
      numeroCrm: tela.el('crm').value.trim(),
      ufMedico: tela.el<HTMLSelectElement>('uf').value,
    };
  }

  function validarReceita(validacao: Validacao): void {
    const r = dadosReceita();
    if (r.receita) {
      validacao.requerido('Data receita', r.dataReceita).requerido('CRM', r.numeroCrm).requerido('UF', r.ufMedico);
    }
  }

  return new Promise((resolve, reject) => {
    let finalizado = false;

    /** Mostra o resultado no visor com contagem regressiva e fecha a tela. */
    async function finalizar(resultado: CompraAprovada | Error): Promise<void> {
      finalizado = true;
      tela.habilitar(false);
      const sucesso = !(resultado instanceof Error);
      const texto = sucesso ? 'Aprovado' : resultado.message;
      for (let segundos = 2; segundos >= 0; segundos--) {
        escreverVisor(visor, `${texto} (${segundos})`, sucesso ? 'sucesso' : 'erro');
        await aguardar(1000);
      }
      tela.fechar();
      if (sucesso) resolve(resultado);
      else reject(resultado);
    }

    async function enviar(): Promise<void> {
      const validacao = new Validacao().requerido('Cartão', cartaoDigitos());
      if (!cvv.disabled && !cvv.value && cartaoDigitos().length === 19) validacao.requerido('CVV', '');
      if (!senha.disabled && !senha.value) validacao.requerido('Senha', '');
      validarReceita(validacao);
      if (!(await validar(validacao))) {
        cartao.focus();
        return;
      }

      tela.habilitar(false);
      escreverVisor(visor, 'Processando pagamento...');
      try {
        const meio = { tipo: 'cartao' as const, cartao: cartaoDigitos(), cvv: cvv.value || undefined };
        const retorno = await api().solicitarCompra({
          ...dados,
          ...dadosReceita(),
          cartao: meio.cartao,
          cvv: meio.cvv,
          senha: senha.value || undefined,
        });
        await finalizar({ retorno, meio });
      } catch (e) {
        await finalizar(new ErroTela(mensagemErro(e)));
      }
    }

    async function pagarComQrCode(): Promise<void> {
      // No QR Code o cliente se identifica pelo APP: cartão, CVV e senha devem estar vazios
      const validacao = new Validacao();
      if (cartaoDigitos()) validacao.adicionar('Cartão', 'Campo deve estar vazio');
      if (!cvv.disabled && cvv.value) validacao.adicionar('CVV', 'Campo deve estar vazio');
      if (!senha.disabled && senha.value) validacao.adicionar('Senha', 'Campo deve estar vazio');
      validarReceita(validacao);
      if (!(await validar(validacao))) return;

      tela.habilitar(false);
      escreverVisor(visor, 'Processando QR Code...');
      try {
        const resultado = await abrirQrCode({ ...dados, ...dadosReceita() });
        const meio = { tipo: 'qrcode' as const, qrcode: resultado.qrcode };
        await finalizar({ retorno: resultado.retorno, meio });
      } catch (e) {
        await finalizar(new ErroTela(mensagemErro(e)));
      }
    }

    const cancelar = () => {
      if (!finalizado) void finalizar(new ErroTela('Cancelado pelo operador.'));
    };

    tela.botao('enviar', 'F2', () => void enviar());
    tela.botao('qrcode', 'F3', () => void pagarComQrCode());
    tela.botao('cancelar', undefined, cancelar);
    tela.aoEsc = cancelar;
    cartao.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void enviar();
    });

    controlarNumeroCartao();
    controlarReceita();
    tela.abrir();
    cartao.focus();
  });
}
