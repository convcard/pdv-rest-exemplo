/**
 * Acesso à integração Convcard a partir das telas.
 *
 * A integração roda no processo main (src/electron/convcard) e chega à tela pelo
 * preload como window.convcard. Aqui ela vira um token de injeção do Angular:
 *
 *   private readonly api = inject(CONVCARD_API);
 *   const saldo = await this.api.consultarSaldo(cartao);
 *
 * Cada função corresponde a uma função de src/electron/convcard/servico.ts (lá estão
 * documentados o endpoint e as regras de cada chamada). Em caso de erro a
 * Promise é rejeitada com um ErroConvcard (mensagem, código e NSU).
 *
 * Por ser um token, pode ser trocado por um mock em testes:
 *   providers: [{ provide: CONVCARD_API, useValue: mockApi }]
 */
import { InjectionToken } from '@angular/core';
import type { ConvcardApi } from '../../../shared/ipc';

declare global {
  interface Window {
    /** API exposta pelo preload.ts */
    convcard: ConvcardApi;
  }
}

export const CONVCARD_API = new InjectionToken<ConvcardApi>('CONVCARD_API', {
  providedIn: 'root',
  factory: () => window.convcard,
});
