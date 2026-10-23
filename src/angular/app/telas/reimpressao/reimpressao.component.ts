/**
 * Tela "Reimpressão": reimprime o comprovante da última venda, cancelamento
 * ou recebimento confirmado. Não chama o autorizador: o comprovante recebido
 * na transação fica guardado no SQLite (tabela ultima_transacao).
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TipoReimpressao } from '../../../../shared/ipc';
import { IconeComponent } from '../../componentes/icone.component';
import { TelaTefComponent } from '../../componentes/tela-tef.component';
import { CONVCARD_API } from '../../core/convcard-api';
import { DialogosService } from '../../core/dialogos.service';
import { TelaBase } from '../../core/tela-base';
import { mensagemErro } from '../../core/util';

interface OpcaoReimpressao {
  tipo: TipoReimpressao;
  rotulo: string;
  pergunta: string;
}

@Component({
  selector: 'app-reimpressao',
  imports: [FormsModule, TelaTefComponent, IconeComponent],
  templateUrl: './reimpressao.component.html',
})
export class ReimpressaoComponent extends TelaBase {
  static readonly largura = '400px';

  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);

  protected readonly opcoes: OpcaoReimpressao[] = [
    { tipo: 'VENDA', rotulo: 'Última venda', pergunta: 'Deseja reimprimir a última venda?' },
    { tipo: 'CANCELAMENTO', rotulo: 'Último cancelamento', pergunta: 'Deseja reimprimir o último cancelamento?' },
    { tipo: 'RECEBIMENTO', rotulo: 'Último recebimento', pergunta: 'Deseja reimprimir o último recebimento?' },
  ];
  protected readonly selecionado = signal<TipoReimpressao>('VENDA');

  protected override readonly teclas = { F2: () => void this.reimprimir() };

  protected async reimprimir(): Promise<void> {
    const opcao = this.opcoes.find((o) => o.tipo === this.selecionado())!;
    if (!(await this.dialogos.confirmar(opcao.pergunta))) return;

    try {
      const ultima = await this.api.obterUltimaTransacao(opcao.tipo);
      if (!ultima) {
        await this.dialogos.atencao('Nenhuma transação disponível para reimpressão.');
      } else if (!ultima.comprovante) {
        await this.dialogos.atencao('Última transação não possui comprovante para reimpressão.');
      } else {
        await this.dialogos.imprimirComprovante(ultima.comprovante, opcao.rotulo);
        await this.dialogos.aprovado();
      }
    } catch (e) {
      await this.dialogos.atencao(mensagemErro(e));
    }
  }
}
