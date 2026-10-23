/** Diálogo "Atenção" (avisos e erros de validação). */
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { TelaTefComponent } from '../componentes/tela-tef.component';
import { TelaBase } from '../core/tela-base';

@Component({
  selector: 'app-atencao',
  imports: [TelaTefComponent],
  templateUrl: './atencao.component.html',
})
export class AtencaoComponent extends TelaBase {
  static readonly largura = '440px';

  protected readonly mensagem: string = inject(DIALOG_DATA);
}
