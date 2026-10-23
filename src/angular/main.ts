/**
 * Ponto de entrada das telas (processo renderer do Electron).
 *
 * As telas são uma aplicação Angular. A integração com a Convcard em si roda
 * no processo main (src/electron) e chega aqui pelo preload como
 * window.convcard (ver app/core/convcard-api.ts).
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch((e) => console.error(e));
