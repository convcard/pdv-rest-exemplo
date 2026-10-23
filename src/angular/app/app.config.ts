import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  type ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ConfiguracaoService } from './core/configuracao.service';

// Formatação de moeda, número e data em pt-BR (pipes currency, number, date)
registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Sem zone.js: a tela é atualizada pelos sinais (signal/computed)
    provideZonelessChangeDetection(),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    // Carrega a configuração antes de exibir as telas
    provideAppInitializer(() => inject(ConfiguracaoService).carregar()),
  ],
};
