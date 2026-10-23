/**
 * Base dos controladores de tela abertos como modal (CDK Dialog).
 *
 * - "teclas": atalhos da tela (ex.: { F2: () => this.enviar() }). O
 *   DialogosService repassa para cá as teclas pressionadas na modal do topo.
 * - "aoEsc": o que o Esc faz (padrão: fecha a tela sem resultado).
 * - "fechar(resultado)": fecha devolvendo o resultado para quem abriu.
 */
import { DialogRef } from '@angular/cdk/dialog';
import { inject } from '@angular/core';

export abstract class TelaBase<R = void> {
  protected readonly ref = inject<DialogRef<R>>(DialogRef);
  protected readonly teclas: Record<string, () => void> = {};

  /** Chamado pelo DialogosService a cada tecla pressionada nesta modal. */
  tratarTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      this.aoEsc();
      return;
    }
    const acao = this.teclas[(evento.ctrlKey ? 'Ctrl+' : '') + evento.key];
    if (acao) {
      evento.preventDefault();
      acao();
    }
  }

  protected aoEsc(): void {
    this.ref.close();
  }

  protected fechar(resultado?: R): void {
    this.ref.close(resultado);
  }
}
