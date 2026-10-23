/** Painel "Log da integração": cada requisição ao autorizador e a resposta. */
import { Component, inject } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import type { LogIntegracao } from '../../../shared/ipc';
import { IconeComponent } from '../componentes/icone.component';
import { LogIntegracaoService } from '../core/log-integracao.service';

@Component({
  selector: 'app-log-integracao',
  imports: [IconeComponent, DatePipe, JsonPipe],
  templateUrl: './log-integracao.component.html',
})
export class LogIntegracaoComponent {
  protected readonly log = inject(LogIntegracaoService);

  protected sucesso(item: LogIntegracao): boolean {
    return item.status !== undefined && item.status >= 200 && item.status < 300;
  }

  protected caminho(item: LogIntegracao): string {
    return new URL(item.url).pathname.replace('/autorizador', '');
  }
}
