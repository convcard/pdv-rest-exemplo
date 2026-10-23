/** Popup "Aguarde" (DialogosService.comProgresso). Não fecha pelo Esc. */
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, inject, type Signal } from '@angular/core';
import { TelaTefComponent } from '../componentes/tela-tef.component';

@Component({
  selector: 'app-progresso',
  imports: [TelaTefComponent],
  templateUrl: './progresso.component.html',
})
export class ProgressoComponent {
  static readonly largura = '380px';

  /** Mensagem atual (pode mudar durante o processo) */
  protected readonly mensagem: Signal<string> = inject(DIALOG_DATA);
}
