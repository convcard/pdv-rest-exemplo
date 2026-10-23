/**
 * Configuração da integração (token da loja, certificado, receita, nota...).
 * Carregada uma vez ao iniciar o app (ver app.config.ts).
 */
import { Injectable, inject, signal } from '@angular/core';
import type { Configuracao } from '../../../shared/ipc';
import { CONVCARD_API } from './convcard-api';

@Injectable({ providedIn: 'root' })
export class ConfiguracaoService {
  private readonly api = inject(CONVCARD_API);
  private readonly configuracao = signal<Configuracao | undefined>(undefined);

  /** Configuração atual (sinal: as telas atualizam sozinhas quando ela muda). */
  readonly atual = this.configuracao.asReadonly();

  async carregar(): Promise<void> {
    this.configuracao.set(await this.api.obterConfiguracao());
  }

  async salvar(config: Configuracao): Promise<void> {
    await this.api.salvarConfiguracao(config);
    this.configuracao.set(config);
  }

  /** Atalho para ler a configuração em código (já carregada no início). */
  get valor(): Configuracao {
    const config = this.configuracao();
    if (!config) throw new Error('Configuração ainda não carregada');
    return config;
  }
}
