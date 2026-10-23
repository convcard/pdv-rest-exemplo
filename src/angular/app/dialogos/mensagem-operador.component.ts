/** "Mensagem Operador": mensagens da Convcard e "000 - APROVADO". Fecha sozinha. */
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { TelaTefComponent } from '../componentes/tela-tef.component';
import { TelaBase } from '../core/tela-base';

export interface DadosMensagemOperador {
  mensagem: string;
  segundos: number;
}

@Component({
  selector: 'app-mensagem-operador',
  imports: [TelaTefComponent],
  templateUrl: './mensagem-operador.component.html',
})
export class MensagemOperadorComponent extends TelaBase {
  static readonly largura = '560px';

  protected readonly dados: DadosMensagemOperador = inject(DIALOG_DATA);
  protected readonly restantes = signal(this.dados.segundos);
  protected override readonly teclas = { Enter: () => this.fechar() };

  constructor() {
    super();
    const contador = setInterval(() => {
      this.restantes.update((s) => s - 1);
      if (this.restantes() <= 0) this.fechar();
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(contador));
  }
}
