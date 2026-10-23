/**
 * Tela "Cadastro de token".
 *
 * POST /token/cadastrar: troca cartão + CVV por um token (UUID). Depois o
 * token pode ser enviado no campo "cartao" da compra, consulta de saldo etc.,
 * sem precisar de CVV nem senha. Útil para o PDV guardar o cartão do cliente
 * sem armazenar o número real.
 * Funcionalidade não disponível para todos os integradores (consulte a Convcard).
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TokenModel } from '../../../../shared/modelos';
import { IconeComponent } from '../../componentes/icone.component';
import { MascaraDirective } from '../../componentes/mascara.directive';
import { TelaTefComponent } from '../../componentes/tela-tef.component';
import { CONVCARD_API } from '../../core/convcard-api';
import { DialogosService } from '../../core/dialogos.service';
import { TelaBase } from '../../core/tela-base';
import { Validacao, mensagemErro } from '../../core/util';

@Component({
  selector: 'app-token',
  imports: [FormsModule, TelaTefComponent, IconeComponent, MascaraDirective],
  templateUrl: './token.component.html',
})
export class TokenComponent extends TelaBase {
  static readonly largura = '460px';

  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);

  protected readonly cartao = signal('');
  protected readonly cvv = signal('');
  protected readonly token = signal<TokenModel | undefined>(undefined);

  protected override readonly teclas = { F2: () => void this.enviar() };

  protected async enviar(): Promise<void> {
    const validacao = new Validacao().requerido('Cartão', this.cartao()).requerido('CVV', this.cvv());
    if (!(await this.dialogos.validar(validacao))) return;
    try {
      this.token.set(await this.dialogos.comProgresso('Cadastrando token...', () => this.api.cadastrarToken(this.cartao(), this.cvv())));
    } catch (e) {
      await this.dialogos.atencao(mensagemErro(e));
    }
  }
}
