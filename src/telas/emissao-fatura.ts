/**
 * Tela "TEF Convcard - Emissão de fatura".
 *
 * Confirmar [F2]: POST /consulta/fatura-pdf. O main salva o PDF na pasta
 * Downloads do usuário e abre no visualizador padrão.
 * O acesso a este endpoint precisa ser liberado pelo suporte Convcard.
 */
import { Tela, Validacao } from './base';
import { atencao, comProgresso, validar } from './comum';
import { rotulo } from './icones';
import { mascaraCartao, mascaraCpf, mascaraNumero } from './mascaras';
import { api, mensagemErro, somenteDigitos } from './util';
import type { FiltroFatura } from '../shared/ipc';

type TipoConsulta = 'Cartão' | 'CPF' | 'Número Fatura' | 'NSU Fatura';
const TIPOS: TipoConsulta[] = ['Cartão', 'CPF', 'Número Fatura', 'NSU Fatura'];

export function abrirEmissaoFatura(): Promise<void> {
  const tela = new Tela(
    { titulo: 'TEF Convcard - Emissão de fatura', largura: 375 },
    `<div class="grade-campos" style="grid-template-columns: 110px 1fr">
       <label>Consultar por:</label>
       <select data-id="tipo">${TIPOS.map((t) => `<option ${t === 'CPF' ? 'selected' : ''}>${t}</option>`).join('')}</select>
       <label data-id="rotulo-filtro">CPF:</label>
       <input data-id="filtro" class="num" placeholder="Informe o número" autocomplete="off" />
     </div>
     <div class="botoes centro">
       <button data-id="confirmar" class="primario">${rotulo('fatura', 'Emitir', 'F2')}</button>
       <button data-id="sair">${rotulo('sair', 'Sair', 'Esc')}</button>
     </div>`,
  );

  const tipo = () => tela.el<HTMLSelectElement>('tipo').value as TipoConsulta;

  /** Recria o campo com a máscara do tipo selecionado (mesmas do recebimento). */
  function configurarFiltro(): void {
    const antigo = tela.el('filtro');
    const novo = antigo.cloneNode() as HTMLInputElement;
    novo.value = '';
    antigo.replaceWith(novo);
    tela.el('rotulo-filtro').textContent = `${tipo()}:`;
    if (tipo() === 'CPF') mascaraCpf(novo);
    else if (tipo() === 'Cartão') mascaraCartao(novo);
    else if (tipo() === 'Número Fatura') mascaraNumero(novo, 20);
    else mascaraNumero(novo, 18);
    novo.focus();
  }

  function montarFiltro(valor: string): FiltroFatura {
    if (tipo() === 'Cartão') return { cartao: valor };
    if (tipo() === 'CPF') return { cpf: valor };
    if (tipo() === 'Número Fatura') return { numeroFatura: Number(valor) };
    return { nsuFatura: Number(valor) };
  }

  return new Promise((resolve) => {
    const fechar = () => {
      tela.fechar();
      resolve();
    };

    async function confirmarEmissao(): Promise<void> {
      const valor = somenteDigitos(tela.el('filtro').value);
      if (!(await validar(new Validacao().requerido(tipo(), valor)))) return;
      try {
        const caminho = await comProgresso('Buscando fatura...', () => api().emitirFatura(montarFiltro(valor)));
        await atencao(`Fatura emitida com sucesso\r\nSalva em: ${caminho}`);
        fechar();
      } catch (e) {
        await atencao(mensagemErro(e));
      }
    }

    tela.el('tipo').addEventListener('change', configurarFiltro);
    tela.botao('confirmar', 'F2', () => void confirmarEmissao());
    tela.botao('sair', undefined, fechar);
    tela.aoEsc = fechar;
    tela.abrir();
    configurarFiltro();
  });
}
