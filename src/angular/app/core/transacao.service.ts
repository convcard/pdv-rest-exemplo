/**
 * Finalização de uma transação aprovada (venda, cancelamento ou recebimento).
 *
 * Sequência executada depois que o autorizador aprova:
 *  1. Se o retorno vier com endereco.atualizaEndereco = true, abre a tela de
 *     atualização de endereço. Se o operador não confirmar, a transação é
 *     desfeita ("Atualização de endereço cancelada").
 *  2. Se vier "mensagemLoja", mostra ao operador.
 *  3. Imprime o comprovante. Se a impressão falhar, DESFAZ a transação.
 *  4. Envia a CONFIRMAÇÃO (mesmo NST da solicitação; ver servico.ts).
 *
 * Se qualquer passo falhar antes da confirmação, a transação é desfeita.
 */
import { Injectable, inject } from '@angular/core';
import type { EnderecoModel } from '../../../shared/modelos';
import { EnderecoComponent } from '../telas/endereco/endereco.component';
import { CONVCARD_API } from './convcard-api';
import { DialogosService } from './dialogos.service';
import { ErroTela } from './util';

export interface DadosFinalizacao {
  /** Usado no título da impressora simulada (ex.: "Venda") */
  titulo: string;
  comprovante?: string;
  mensagemLoja?: string;
  endereco?: EnderecoModel;
  /** Cartão do portador; necessário para atualizar o endereço */
  cartao?: string;
}

@Injectable({ providedIn: 'root' })
export class TransacaoService {
  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);

  async finalizar(dados: DadosFinalizacao): Promise<void> {
    try {
      if (dados.endereco?.atualizaEndereco && dados.cartao) {
        const atualizado = await this.dialogos.abrir(EnderecoComponent, { cartao: dados.cartao, endereco: dados.endereco });
        if (!atualizado) throw new ErroTela('Atualização de endereço cancelada');
      }

      if (dados.mensagemLoja?.trim()) {
        await this.dialogos.mensagemOperador(dados.mensagemLoja);
      }

      if (!(await this.dialogos.imprimirComprovante(dados.comprovante, dados.titulo))) {
        throw new ErroTela('Não foi possível imprimir o comprovante.\nA transação foi desfeita.');
      }
    } catch (e) {
      await this.desfazerComSeguranca();
      throw e;
    }

    await this.dialogos.comProgresso('Enviando confirmação...', () => this.api.confirmarPendente());
  }

  /**
   * Desfaz a transação pendente sem interromper o fluxo em caso de falha: a
   * pendência continua salva no main e será desfeita antes da próxima
   * transação ou ao reabrir o PDV.
   */
  async desfazerComSeguranca(): Promise<void> {
    try {
      await this.dialogos.comProgresso('Desfazendo transação...', () => this.api.desfazerPendente());
    } catch (e) {
      console.error('Falha ao desfazer; será desfeita na próxima transação.', e);
    }
  }
}
