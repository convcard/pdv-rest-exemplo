/**
 * Tela "TEF Convcard - Recebimento".
 *
 * A loja recebe do portador do cartão o pagamento da fatura e repassa para a
 * Convcard. Dois modos:
 *
 * Recebimento [F3] (fatura fechada):
 *  1. pesquisa a fatura por Cartão, CPF, Número ou NSU da fatura
 *     -> POST /consulta/fatura (preenche número, NSU, vencimento e valor);
 *  2. Finalizar -> POST /pagamento/solicitacao-pagamento (NSU da fatura + valor);
 *  3. imprime o comprovante -> PUT /pagamento/confirmacao-pagamento.
 *
 * Recebimento Antecipado [F4] (antes do fechamento da fatura):
 *  1. pesquisa pelo cartão -> POST /consulta/saldo-devedor ("Valor receber");
 *  2. Finalizar -> POST /pagamento/solicitacao-pagamento-antecipado (cartão + valor);
 *  3. se pedido, atualização de endereço;
 *  4. imprime o comprovante -> PUT /pagamento/confirmacao-pagamento-antecipado.
 *
 * A API não tem desfazimento de pagamento: se algo falhar antes da
 * confirmação, basta não confirmar.
 *
 * Num PDV real, entre a solicitação e a confirmação também entram a escolha
 * do caixa, o lançamento do recebimento e das formas de pagamento (dinheiro,
 * cartão...). Isso é regra de cada PDV e foi omitido neste exemplo.
 */
import type { FaturaModel } from '../convcard/modelos';
import { Tela, Validacao } from './base';
import { atencao, comProgresso, mensagemOperador, mostrarAprovado, validar } from './comum';
import { finalizarTransacao } from './dialogo-comprovante';
import { lerValor, mascaraCartao, mascaraCpf, mascaraNumero, mascaraValor } from './mascaras';
import { api, formatarData, formatarValor, mensagemErro, somenteDigitos } from './util';
import type { FiltroFatura } from '../shared/ipc';

type Modo = 'RECEBIMENTO' | 'RECEBIMENTO_ANTECIPADO';
type TipoConsulta = 'Cartão' | 'CPF' | 'Número Fatura' | 'NSU Fatura';
const TIPOS: TipoConsulta[] = ['Cartão', 'CPF', 'Número Fatura', 'NSU Fatura'];

/** Dados vindos da consulta de saldo (F6 na consulta) */
export interface DadosFatura {
  cartao: string;
  fatura?: FaturaModel;
}

/** Resolve com true se algum recebimento foi concluído. */
export function abrirRecebimento(dadosFatura?: DadosFatura): Promise<boolean> {
  const tela = new Tela(
    { titulo: 'TEF Convcard - Recebimento', largura: 585, logo: false },
    `<div class="cabecalho-recebimento">
       <div class="modos">
         <button data-id="modo-recebimento" tabindex="-1"><img src="imagens/recebto.png" alt="" />Recebimento [F3]</button>
         <button data-id="modo-antecipado" tabindex="-1"><img src="imagens/recebto.png" alt="" />Recebimento Antecipado [F4]</button>
       </div>
       <img src="imagens/convcard.png" alt="Convcard" class="logo-lateral" />
     </div>
     <div class="grade-campos" style="grid-template-columns: 150px 1fr 150px">
       <div class="linha-grade" data-id="linha-tipo">
         <label>Consultar por:</label>
         <select data-id="tipo">${TIPOS.map((t) => `<option>${t}</option>`).join('')}</select><span></span>
       </div>
       <label data-id="rotulo-filtro">CPF:</label>
       <input data-id="filtro" class="num" placeholder="Informe o número" autocomplete="off" />
       <span class="dica-enter">Pressione ENTER para pesquisar</span>
       <div class="linha-grade" data-id="linha-fatura">
         <label>Número fatura:</label><input data-id="numero" class="num" disabled /><span></span>
         <label>NSU fatura:</label><input data-id="nsu" class="num" disabled /><span></span>
         <label>Vencimento fatura:</label><input data-id="vencimento" class="num" disabled /><span></span>
       </div>
       <label>Valor recebido:</label><input data-id="valor" class="num" /><span></span>
       <div class="linha-grade" data-id="linha-receber">
         <label>Valor receber:</label><input data-id="receber" class="num" disabled /><span></span>
       </div>
     </div>
     <div class="botoes direita">
       <button data-id="finalizar"><img src="imagens/Btn_Finalizar.gif" alt="" />Finalizar [F2]</button>
       <button data-id="limpar"><img src="imagens/Btn_Limpar.gif" alt="" />Limpar [F5]</button>
       <button data-id="sair"><img src="imagens/Btn_Cancelar.gif" alt="" />Sair [Esc]</button>
     </div>`,
  );

  let modo: Modo = 'RECEBIMENTO';
  /** Filtro usado na última pesquisa; se o filtro mudar, os resultados são limpos. */
  let filtroPesquisado = '';
  let concluiu = false;
  mascaraValor(tela.el('valor'));

  const tipo = () => tela.el<HTMLSelectElement>('tipo').value as TipoConsulta;
  const filtro = () => tela.el('filtro');
  const mostrar = (ids: string[], visivel: boolean) =>
    ids.forEach((id) => (tela.el(id).hidden = !visivel));

  /** Recria o campo de filtro com a máscara do tipo selecionado. */
  function configurarFiltro(): void {
    const antigo = filtro();
    const novo = antigo.cloneNode() as HTMLInputElement;
    novo.value = '';
    antigo.replaceWith(novo);
    tela.el('rotulo-filtro').textContent = `${tipo()}:`;
    if (tipo() === 'CPF') mascaraCpf(novo);
    else if (tipo() === 'Cartão') mascaraCartao(novo);
    else if (tipo() === 'Número Fatura') mascaraNumero(novo, 20);
    else mascaraNumero(novo, 18);

    novo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void pesquisar();
    });
    novo.addEventListener('input', () => {
      if (filtroPesquisado && somenteDigitos(novo.value) !== filtroPesquisado) limparResultados();
    });
  }

  function limparResultados(): void {
    filtroPesquisado = '';
    for (const id of ['numero', 'nsu', 'vencimento', 'valor', 'receber']) tela.el(id).value = '';
  }

  function definirModo(novoModo: Modo): void {
    modo = novoModo;
    const antecipado = modo === 'RECEBIMENTO_ANTECIPADO';
    // O antecipado é sempre pelo cartão
    tela.el<HTMLSelectElement>('tipo').value = antecipado ? 'Cartão' : 'CPF';
    mostrar(['linha-tipo', 'linha-fatura'], !antecipado);
    mostrar(['linha-receber'], antecipado);
    // Modo ativo com borda azul
    tela.el('modo-recebimento').classList.toggle('ativo', !antecipado);
    tela.el('modo-antecipado').classList.toggle('ativo', antecipado);
    configurarFiltro();
    limparResultados();
    filtro().focus();
  }

  function montarFiltro(): FiltroFatura {
    const valor = somenteDigitos(filtro().value);
    switch (tipo()) {
      case 'Cartão':
        return { cartao: valor };
      case 'CPF':
        return { cpf: valor };
      case 'Número Fatura':
        return { numeroFatura: Number(valor) };
      default:
        return { nsuFatura: Number(valor) };
    }
  }

  function preencherFatura(fatura: FaturaModel): void {
    tela.el('numero').value = fatura.numero?.toString() ?? '';
    tela.el('nsu').value = fatura.nsu?.toString() ?? '';
    tela.el('vencimento').value = formatarData(fatura.vencimento);
    tela.el('valor').value = formatarValor(fatura.valor);
  }

  async function pesquisar(): Promise<void> {
    const valorFiltro = somenteDigitos(filtro().value);
    if (!valorFiltro) return;
    try {
      if (modo === 'RECEBIMENTO') {
        const fatura = await comProgresso('Consultando os dados da fatura...', () => api().consultarFatura(montarFiltro()));
        preencherFatura(fatura);
      } else {
        const devedor = await comProgresso('Consultando o saldo devedor...', () => api().consultarSaldoDevedor(valorFiltro));
        tela.el('valor').value = formatarValor(0);
        tela.el('receber').value = formatarValor(devedor.saldo);
      }
      filtroPesquisado = valorFiltro;
    } catch (e) {
      limparResultados();
      await atencao(mensagemErro(e));
    }
  }

  async function finalizar(): Promise<void> {
    const validacao = new Validacao().requerido(tipo(), somenteDigitos(filtro().value));
    if (validacao.mensagem) {
      await validar(validacao);
      return;
    }
    if (modo === 'RECEBIMENTO' && !tela.el('nsu').value) {
      await pesquisar();
      validacao.requerido('NSU fatura', tela.el('nsu').value);
    }
    const valor = lerValor(tela.el('valor'));
    validacao.requerido('Valor recebido', valor);
    if (valor < 0) validacao.adicionar('Valor recebido', 'Inválido');
    if (!(await validar(validacao))) return;

    try {
      const cartao = somenteDigitos(filtro().value);
      const retorno = await comProgresso('Processando recebimento...', (p) => {
        p.atualizar('Enviando solicitação...');
        return modo === 'RECEBIMENTO'
          ? api().solicitarRecebimento(Number(tela.el('nsu').value), valor)
          : api().solicitarRecebimentoAntecipado(cartao, valor);
      });

      await finalizarTransacao({
        titulo: 'Recebimento',
        comprovante: retorno.comprovante,
        endereco: retorno.endereco,
        // Só o antecipado identifica o cartão (e portanto permite atualizar o endereço)
        cartao: modo === 'RECEBIMENTO_ANTECIPADO' ? cartao : undefined,
      });
      await mostrarAprovado();
      concluiu = true;

      if (dadosFatura) {
        fechar();
      } else {
        definirModo('RECEBIMENTO');
      }
    } catch (e) {
      await mensagemOperador(mensagemErro(e));
    }
  }

  let resolver: (concluiu: boolean) => void = () => undefined;
  function fechar(): void {
    tela.fechar();
    resolver(concluiu);
  }

  tela.el('tipo').addEventListener('change', () => {
    configurarFiltro();
    limparResultados();
    filtro().focus();
  });
  tela.botao('modo-recebimento', 'F3', () => definirModo('RECEBIMENTO'));
  tela.botao('modo-antecipado', 'F4', () => definirModo('RECEBIMENTO_ANTECIPADO'));
  tela.botao('finalizar', 'F2', () => void finalizar());
  tela.botao('limpar', 'F5', () => definirModo('RECEBIMENTO'));
  tela.botao('sair', undefined, fechar);
  tela.aoEsc = fechar;

  tela.abrir();
  definirModo('RECEBIMENTO');

  // Aberto pela consulta de saldo: já vem com cartão/fatura e não permite trocar
  if (dadosFatura) {
    const quitada = !dadosFatura.fatura?.nsu || dadosFatura.fatura.status === 'PAGO';
    definirModo(quitada ? 'RECEBIMENTO_ANTECIPADO' : 'RECEBIMENTO');
    tela.el<HTMLSelectElement>('tipo').value = 'Cartão';
    configurarFiltro();
    filtro().value = dadosFatura.cartao;
    filtro().dispatchEvent(new Event('input'));
    filtroPesquisado = dadosFatura.cartao;
    if (quitada) void pesquisar();
    else if (dadosFatura.fatura) preencherFatura(dadosFatura.fatura);

    for (const id of ['tipo', 'filtro', 'modo-recebimento', 'modo-antecipado']) tela.el(id).disabled = true;
    tela.el('limpar').hidden = true;
    tela.el('valor').focus();
  }

  return new Promise((resolve) => (resolver = resolve));
}
