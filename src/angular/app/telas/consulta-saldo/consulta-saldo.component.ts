/**
 * Tela "Consulta".
 *
 * Enter no cartão: POST /consulta/saldo (NST novo a cada consulta).
 * Mostra os dados do cartão, os dados da última fatura e o botão
 * "Recebimentos [F6]", que abre o recebimento já preenchido com a fatura (ou
 * o recebimento antecipado, se a fatura estiver quitada).
 */
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { SaldoModel } from '../../../../shared/modelos';
import { IconeComponent } from '../../componentes/icone.component';
import { MascaraDirective } from '../../componentes/mascara.directive';
import { TelaTefComponent } from '../../componentes/tela-tef.component';
import { CONVCARD_API } from '../../core/convcard-api';
import { DialogosService } from '../../core/dialogos.service';
import { TelaBase } from '../../core/tela-base';
import { Validacao, mensagemErro } from '../../core/util';
import { RecebimentoComponent } from '../recebimento/recebimento.component';

@Component({
  selector: 'app-consulta-saldo',
  imports: [FormsModule, DatePipe, DecimalPipe, TelaTefComponent, IconeComponent, MascaraDirective],
  templateUrl: './consulta-saldo.component.html',
})
export class ConsultaSaldoComponent extends TelaBase {
  static readonly largura = '820px';

  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);

  protected readonly cartao = signal('');
  protected readonly saldo = signal<SaldoModel | undefined>(undefined);
  /** Cartão da última consulta com sucesso (usado no recebimento) */
  private cartaoConsultado = '';

  protected readonly statusFatura = computed(() => {
    const fatura = this.saldo()?.fatura;
    if (fatura?.status === 'PAGO') return 'FATURA QUITADA';
    return fatura?.nsu ? 'FATURA EM ABERTO' : '';
  });

  protected override readonly teclas = {
    F5: () => this.limpar(),
    F6: () => void this.recebimentos(),
  };

  protected async pesquisar(): Promise<void> {
    if (!(await this.dialogos.validar(new Validacao().requerido('Cartão', this.cartao())))) return;
    try {
      const cartao = this.cartao();
      this.saldo.set(await this.dialogos.comProgresso('Consultando o saldo...', () => this.api.consultarSaldo(cartao)));
      this.cartaoConsultado = cartao;
    } catch (e) {
      this.saldo.set(undefined);
      await this.dialogos.atencao(mensagemErro(e));
    }
  }

  protected limpar(): void {
    this.cartao.set('');
    this.saldo.set(undefined);
    this.cartaoConsultado = '';
  }

  protected async recebimentos(): Promise<void> {
    const saldo = this.saldo();
    if (!saldo) {
      await this.dialogos.abrir(RecebimentoComponent);
      return;
    }
    const recebido = await this.dialogos.abrir(RecebimentoComponent, { cartao: this.cartaoConsultado, fatura: saldo.fatura });
    if (recebido) await this.pesquisar();
  }
}
