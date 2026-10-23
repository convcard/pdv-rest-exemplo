/** Visor de mensagens das telas TEF: azul = informação, verde = sucesso, vermelho = erro. */
import { Component, input } from '@angular/core';
import type { Visor } from '../core/util';

@Component({
  selector: 'app-visor',
  template: `<div class="visor" [class]="estado().tipo">{{ estado().texto }}</div>`,
})
export class VisorComponent {
  readonly estado = input.required<Visor>();
}
