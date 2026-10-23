/**
 * Finalização de uma transação aprovada (venda, cancelamento ou recebimento).
 *
 * Sequência executada depois que o autorizador aprova:
 *
 *  1. Se o retorno vier com endereco.atualizaEndereco = true, abre a tela de
 *     atualização de endereço. Se o operador não confirmar, a
 *     transação é desfeita ("Atualização de endereço cancelada").
 *  2. Se vier "mensagemLoja", mostra ao operador (Mensagem Operador).
 *  3. Imprime o comprovante. Se a impressão falhar, DESFAZ a transação.
 *  4. Envia a CONFIRMAÇÃO.
 *
 * Se qualquer passo falhar antes da confirmação, a transação é desfeita.
 */
import type { EnderecoModel } from '../convcard/modelos';
import { comProgresso, imprimirComprovante, mensagemOperador } from './comum';
import { abrirAtualizacaoEndereco } from './endereco';
import { api, ErroTela } from './util';

export interface DadosFinalizacao {
  /** Usado no título da impressora simulada (ex.: "Venda") */
  titulo: string;
  comprovante?: string;
  mensagemLoja?: string;
  endereco?: EnderecoModel;
  /** Cartão do portador; necessário para atualizar o endereço */
  cartao?: string;
}

/**
 * Desfaz a transação pendente sem interromper o fluxo em caso de falha:
 * a pendência continua salva no main e será desfeita antes da próxima
 * transação ou ao reabrir o PDV.
 */
export async function desfazerComSeguranca(): Promise<void> {
  try {
    await comProgresso('Desfazendo transação...', () => api().desfazerPendente());
  } catch (e) {
    console.error('Falha ao desfazer; será desfeita na próxima transação.', e);
  }
}

export async function finalizarTransacao(dados: DadosFinalizacao): Promise<void> {
  try {
    // 1. Atualização de endereço solicitada pela Convcard
    if (dados.endereco?.atualizaEndereco && dados.cartao) {
      const atualizado = await abrirAtualizacaoEndereco(dados.cartao, dados.endereco);
      if (!atualizado) {
        throw new ErroTela('Atualização de endereço cancelada');
      }
    }

    // 2. Mensagem para o operador
    if (dados.mensagemLoja?.trim()) {
      await mensagemOperador(dados.mensagemLoja);
    }

    // 3. Impressão do comprovante
    const impresso = await imprimirComprovante(dados.comprovante, dados.titulo);
    if (!impresso) {
      throw new ErroTela('Não foi possível imprimir o comprovante.\nA transação foi desfeita.');
    }
  } catch (e) {
    await desfazerComSeguranca();
    throw e;
  }

  // 4. Confirmação (mesmo NST da solicitação; ver servico.ts)
  await comProgresso('Enviando confirmação...', () => api().confirmarPendente());
}
