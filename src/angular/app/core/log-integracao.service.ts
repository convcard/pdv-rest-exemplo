/**
 * Guarda as requisições feitas ao autorizador para o painel "Log da
 * integração" (dados sensíveis já chegam mascarados do main).
 */
import { Injectable, inject, signal } from '@angular/core';
import type { LogIntegracao } from '../../../shared/ipc';
import { CONVCARD_API } from './convcard-api';

@Injectable({ providedIn: 'root' })
export class LogIntegracaoService {
  private readonly registros = signal<LogIntegracao[]>([]);

  /** Mais recentes primeiro */
  readonly itens = this.registros.asReadonly();

  constructor() {
    inject(CONVCARD_API).aoRegistrarLog((log) => this.registros.update((atuais) => [log, ...atuais]));
  }

  limpar(): void {
    this.registros.set([]);
  }
}
