/**
 * Tela "Cancelamento" de uma venda Convcard.
 *
 * O cancelamento é SEMPRE pelo número do cartão, inclusive para vendas pagas
 * com QR Code. Usada de dois jeitos:
 *  - Funções Convcard > Cancelamento de venda: o operador informa cartão,
 *    valor e autorização;
 *  - Excluir venda no PDV: valor e autorização vêm da venda e o operador
 *    informa só o cartão. O PDV NÃO guarda o número do cartão: ele é pedido
 *    de novo no cancelamento.
 *
 *  1. DELETE /cancelamento/solicitacao
 *  2. imprime o comprovante (falhou -> DELETE /cancelamento/desfazimento)
 *  3. DELETE /cancelamento/confirmacao
 *
 * Devolve true quando o cancelamento foi concluído.
 */
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconeComponent } from '../../componentes/icone.component';
import { MascaraDirective } from '../../componentes/mascara.directive';
import { TelaTefComponent } from '../../componentes/tela-tef.component';
import { CONVCARD_API } from '../../core/convcard-api';
import { DialogosService } from '../../core/dialogos.service';
import { TelaBase } from '../../core/tela-base';
import { TransacaoService } from '../../core/transacao.service';
import { Validacao, mensagemErro } from '../../core/util';

/** Dados da venda a cancelar (quando aberta pelo "Excluir venda"). */
export interface VendaACancelar {
  valor: number;
  autorizacao: number;
}

@Component({
  selector: 'app-cancelamento',
  imports: [FormsModule, TelaTefComponent, IconeComponent, MascaraDirective],
  templateUrl: './cancelamento.component.html',
})
export class CancelamentoComponent extends TelaBase<boolean> {
  static readonly largura = '520px';

  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);
  private readonly transacao = inject(TransacaoService);
  protected readonly venda = inject<VendaACancelar | undefined>(DIALOG_DATA, { optional: true }) ?? undefined;

  protected readonly cartao = signal('');
  protected readonly cvv = signal('');
  protected readonly valor = signal<number | null>(this.venda?.valor ?? null);
  protected readonly autorizacao = signal(this.venda ? String(this.venda.autorizacao) : '');

  /** CVV só habilitado com cartão preenchido */
  protected readonly cvvHabilitado = computed(() => this.cartao().length > 0);

  protected override readonly teclas = { F2: () => void this.enviar() };

  constructor() {
    super();
    effect(() => {
      if (!this.cvvHabilitado()) this.cvv.set('');
    });
  }

  protected async enviar(): Promise<void> {
    const validacao = new Validacao()
      .requerido('Cartão', this.cartao())
      .requerido('Valor', this.valor())
      .requerido('Autorização', this.autorizacao());
    if (this.cvvHabilitado() && !this.cvv() && this.cartao().length === 19) validacao.requerido('CVV', '');
    if (!(await this.dialogos.validar(validacao))) return;

    try {
      const retorno = await this.dialogos.comProgresso('Enviando solicitação...', () =>
        this.api.solicitarCancelamento({
          cartao: this.cartao(),
          cvv: this.cvv() || undefined,
          valor: this.valor()!,
          autorizacao: Number(this.autorizacao()),
        }),
      );
      await this.transacao.finalizar({ titulo: 'Cancelamento', comprovante: retorno.comprovante, mensagemLoja: retorno.mensagemLoja });
      await this.dialogos.aprovado();
      this.fechar(true);
    } catch (e) {
      await this.dialogos.mensagemOperador(mensagemErro(e));
    }
  }
}
