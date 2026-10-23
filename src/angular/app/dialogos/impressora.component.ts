/**
 * Impressora simulada. O operador escolhe se a impressão deu certo ou falhou,
 * para demonstrar os dois caminhos:
 *  - Impresso (true): o fluxo segue para a CONFIRMAÇÃO da transação;
 *  - Falha (false):   o fluxo DESFAZ a transação.
 * Um PDV real imprime no ECF ou em impressora não fiscal.
 */
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { IconeComponent } from '../componentes/icone.component';
import { TelaTefComponent } from '../componentes/tela-tef.component';
import { TelaBase } from '../core/tela-base';
import { linhasComprovante } from '../core/util';

export interface DadosImpressora {
  comprovante?: string;
  titulo: string;
}

@Component({
  selector: 'app-impressora',
  imports: [TelaTefComponent, IconeComponent],
  templateUrl: './impressora.component.html',
})
export class ImpressoraComponent extends TelaBase<boolean> {
  static readonly largura = '440px';

  private readonly dados: DadosImpressora = inject(DIALOG_DATA);
  protected readonly titulo = this.dados.titulo;
  protected readonly texto = linhasComprovante(this.dados.comprovante) || '(transação sem comprovante)';

  protected override readonly teclas = {
    F2: () => this.fechar(true),
    F3: () => this.fechar(false),
  };

  /** A transação precisa ser confirmada ou desfeita: Esc não fecha. */
  protected override aoEsc(): void {}
}
