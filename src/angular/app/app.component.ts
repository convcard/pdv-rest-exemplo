/**
 * Tela principal do PDV: topo com a marca e as ações, venda e log da integração.
 *
 * Atalhos (só quando nenhuma modal está aberta):
 *  - F5      Finalizar venda
 *  - Ctrl+U  Funções Convcard
 */
import { Component, afterNextRender, inject, viewChild } from '@angular/core';
import { IconeComponent } from './componentes/icone.component';
import { ConfiguracaoService } from './core/configuracao.service';
import { DialogosService } from './core/dialogos.service';
import { LogIntegracaoComponent } from './pdv/log-integracao.component';
import { VendaComponent } from './pdv/venda.component';
import { ConfiguracaoComponent } from './telas/configuracao/configuracao.component';
import { FuncoesComponent } from './telas/funcoes/funcoes.component';

@Component({
  selector: 'app-root',
  imports: [IconeComponent, VendaComponent, LogIntegracaoComponent],
  templateUrl: './app.component.html',
  host: { '(document:keydown)': 'aoTeclar($event)' },
})
export class AppComponent {
  private readonly dialogos = inject(DialogosService);
  private readonly venda = viewChild.required(VendaComponent);

  constructor() {
    // Primeira execução: abre a configuração para informar certificado e token da loja
    const configuracao = inject(ConfiguracaoService);
    afterNextRender(() => {
      if (!configuracao.valor.caminhoCertificado) void this.abrirConfiguracao();
    });
  }

  protected abrirFuncoes(): void {
    void this.dialogos.abrir(FuncoesComponent);
  }

  protected abrirConfiguracao(): Promise<void | undefined> {
    return this.dialogos.abrir(ConfiguracaoComponent);
  }

  protected aoTeclar(evento: KeyboardEvent): void {
    if (this.dialogos.algumaAberta) return;
    if (evento.key === 'F5') {
      evento.preventDefault();
      void this.venda().finalizarVenda();
    } else if (evento.ctrlKey && evento.key.toLowerCase() === 'u') {
      evento.preventDefault();
      this.abrirFuncoes();
    }
  }
}
