/**
 * Tela "Emissão de fatura".
 *
 * Emitir [F2]: POST /consulta/fatura-pdf. O processo main salva o PDF na
 * pasta Downloads do usuário e abre no visualizador padrão.
 * O acesso a este endpoint precisa ser liberado pelo suporte Convcard.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconeComponent } from '../../componentes/icone.component';
import { MascaraDirective } from '../../componentes/mascara.directive';
import { TelaTefComponent } from '../../componentes/tela-tef.component';
import { CONVCARD_API } from '../../core/convcard-api';
import { DialogosService } from '../../core/dialogos.service';
import { FILTROS_FATURA, montarFiltroFatura, type TipoFiltroFatura } from '../../core/filtro-fatura';
import { TelaBase } from '../../core/tela-base';
import { Validacao, mensagemErro } from '../../core/util';

@Component({
  selector: 'app-emissao-fatura',
  imports: [FormsModule, TelaTefComponent, IconeComponent, MascaraDirective],
  templateUrl: './emissao-fatura.component.html',
})
export class EmissaoFaturaComponent extends TelaBase {
  static readonly largura = '420px';

  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);

  protected readonly filtros = FILTROS_FATURA;
  protected readonly tipo = signal<TipoFiltroFatura>('CPF');
  protected readonly filtro = signal('');

  protected override readonly teclas = { F2: () => void this.emitir() };

  protected trocarTipo(tipo: TipoFiltroFatura): void {
    this.tipo.set(tipo);
    this.filtro.set('');
  }

  protected async emitir(): Promise<void> {
    if (!(await this.dialogos.validar(new Validacao().requerido(this.tipo(), this.filtro())))) return;
    try {
      const caminho = await this.dialogos.comProgresso('Buscando fatura...', () =>
        this.api.emitirFatura(montarFiltroFatura(this.tipo(), this.filtro())),
      );
      await this.dialogos.atencao(`Fatura emitida com sucesso\r\nSalva em: ${caminho}`);
      this.fechar();
    } catch (e) {
      await this.dialogos.atencao(mensagemErro(e));
    }
  }
}
