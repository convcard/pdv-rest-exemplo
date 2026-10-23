/** Diálogo de confirmação Sim/Não. Fecha com true (Sim) ou false (Não/Esc). */
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { TelaTefComponent } from '../componentes/tela-tef.component';
import { TelaBase } from '../core/tela-base';

export interface DadosConfirmacao {
  mensagem: string;
  titulo: string;
}

@Component({
  selector: 'app-confirmacao',
  imports: [TelaTefComponent],
  templateUrl: './confirmacao.component.html',
})
export class ConfirmacaoComponent extends TelaBase<boolean> {
  static readonly largura = '460px';

  protected readonly dados: DadosConfirmacao = inject(DIALOG_DATA);

  protected responder(sim: boolean): void {
    this.fechar(sim);
  }

  protected override aoEsc(): void {
    this.fechar(false);
  }
}
