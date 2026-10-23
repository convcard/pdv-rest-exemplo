/**
 * Tela "TEF Convcard - Reimpressão".
 *
 * Reimprime o comprovante da última venda, cancelamento ou recebimento
 * confirmado. Não chama a API: o PDV guarda o comprovante recebido na
 * transação (num PDV real, no banco de dados; aqui no ultimas.json do main).
 */
import type { TipoReimpressao } from '../shared/ipc';
import { Tela, Validacao } from './base';
import { atencao, confirmar, imprimirComprovante, mostrarAprovado, validar } from './comum';
import { rotulo } from './icones';
import { api, mensagemErro } from './util';

const OPCOES: { tipo: TipoReimpressao; rotulo: string; pergunta: string; progresso: string }[] = [
  { tipo: 'VENDA', rotulo: 'Última venda', pergunta: 'Deseja reimprimir a última venda?', progresso: 'Imprimindo última venda...' },
  { tipo: 'CANCELAMENTO', rotulo: 'Último cancelamento', pergunta: 'Deseja reimprimir o último cancelamento?', progresso: 'Imprimindo último cancelamento...' },
  { tipo: 'RECEBIMENTO', rotulo: 'Último recebimento', pergunta: 'Deseja reimprimir o último recebimento?', progresso: 'Imprimindo último recebimento...' },
];

export function abrirReimpressao(): Promise<void> {
  const tela = new Tela(
    { titulo: 'TEF Convcard - Reimpressão', largura: 350 },
    `<fieldset class="selecao">
       <legend>Seleção:</legend>
       ${OPCOES
         .map((o, i) => `<label class="checkbox"><input type="radio" name="reimpressao" value="${o.tipo}" ${i === 0 ? 'checked' : ''} />${o.rotulo}</label>`)
         .join('')}
     </fieldset>
     <div class="botoes centro">
       <button data-id="enviar" class="primario">${rotulo('imprimir', 'Reimprimir', 'F2')}</button>
       <button data-id="cancelar">${rotulo('cancelar', 'Cancelar', 'Esc')}</button>
     </div>`,
  );

  async function enviar(): Promise<void> {
    const selecionado = tela.dlg.querySelector<HTMLInputElement>('input[name="reimpressao"]:checked')?.value;
    if (!(await validar(new Validacao().requerido('Seleção', selecionado)))) return;
    const opcao = OPCOES.find((o) => o.tipo === selecionado)!;
    if (!(await confirmar(opcao.pergunta))) return;

    try {
      const ultima = await api().obterUltimaTransacao(opcao.tipo);
      if (!ultima) {
        await atencao('Nenhuma transação disponível para reimpressão.');
        return;
      }
      if (!ultima.comprovante) {
        await atencao('Última transação não possui comprovante para reimpressão.');
        return;
      }
      await imprimirComprovante(ultima.comprovante, opcao.rotulo);
      await mostrarAprovado();
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
    tela.botao('cancelar', undefined, fechar);
    tela.aoEsc = fechar;
    tela.abrir();
  });
}
