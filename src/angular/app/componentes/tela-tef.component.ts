/**
 * Moldura padrão das telas modais: cabeçalho com a marca Convcard e título,
 * corpo (conteúdo da tela) e rodapé com a loja e o selo "Homologação".
 *
 * <app-tela-tef titulo="Venda">
 *   ...campos...
 *   <div class="botoes">...</div>
 * </app-tela-tef>
 */
import { Component, computed, inject, input } from '@angular/core';
import { ConfiguracaoService } from '../core/configuracao.service';
import { IconeComponent } from './icone.component';

@Component({
  selector: 'app-tela-tef',
  imports: [IconeComponent],
  template: `
    <header class="tela-cabecalho">
      @if (logo()) {
        <img class="tela-logo" src="imagens/convcard-logo.svg" alt="Convcard" />
      } @else {
        <img class="tela-simbolo" src="imagens/convcard-icone.svg" alt="Convcard" />
      }
      <div class="tela-titulos">
        @if (sobretitulo()) {
          <small>{{ sobretitulo() }}</small>
        }
        <h2>{{ titulo() }}</h2>
      </div>
    </header>
    <div class="tela-corpo"><ng-content /></div>
    @if (rodape()) {
      <footer class="tela-rodape">
        <span class="rodape-loja"><app-icone nome="loja" />{{ nomeLoja() }}</span>
        <span class="selo-homologacao"><app-icone nome="homologacao" />Homologação</span>
      </footer>
    }
  `,
})
export class TelaTefComponent {
  readonly titulo = input.required<string>();
  readonly sobretitulo = input('TEF Convcard');
  /** true = logo completo; false = só o símbolo (diálogos genéricos) */
  readonly logo = input(true);
  readonly rodape = input(true);

  private readonly configuracao = inject(ConfiguracaoService);
  protected readonly nomeLoja = computed(() => this.configuracao.atual()?.nomeLoja ?? '');
}
