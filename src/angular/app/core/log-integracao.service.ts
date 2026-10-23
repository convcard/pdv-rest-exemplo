/**
 * Registros do painel "Log da integração" (dados sensíveis já chegam
 * mascarados do main).
 *
 * O main grava os registros no banco, com a execução do PDV que os gerou, e
 * avisa cada novo. Ao iniciar, o serviço passa a
 * ouvir os novos e pede a lista ao main, para mostrar também o que aconteceu
 * antes de a tela abrir (ex.: desfazimento de pendência ao iniciar o PDV).
 * O "id" evita duplicar um registro que chegue pelos dois caminhos.
 */
import { Injectable, inject, signal } from '@angular/core';
import type { LogIntegracao } from '../../../shared/ipc';
import { CONVCARD_API } from './convcard-api';

@Injectable({ providedIn: 'root' })
export class LogIntegracaoService {
  private readonly api = inject(CONVCARD_API);
  private readonly registros = signal<LogIntegracao[]>([]);

  /** Mais recentes primeiro */
  readonly itens = this.registros.asReadonly();

  constructor() {
    this.api.aoRegistrarLog((log) => this.mesclar([log]));
    void this.api.obterLogs().then((logs) => this.mesclar(logs));
  }

  private mesclar(novos: LogIntegracao[]): void {
    this.registros.update((atuais) => {
      const ids = new Set(atuais.map((l) => l.id));
      return [...atuais, ...novos.filter((l) => !ids.has(l.id))].sort((a, b) => b.id - a.id);
    });
  }
}
