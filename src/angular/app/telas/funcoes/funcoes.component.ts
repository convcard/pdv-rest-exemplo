/** Tela "Funções administrativas": funções Convcard fora da venda (Ctrl+U no PDV). */
import { Component, ElementRef, inject, viewChildren } from '@angular/core';
import { IconeComponent, type NomeIcone } from '../../componentes/icone.component';
import { TelaTefComponent } from '../../componentes/tela-tef.component';
import { DialogosService } from '../../core/dialogos.service';
import { TelaBase } from '../../core/tela-base';
import { mensagemErro } from '../../core/util';
import { CancelamentoComponent } from '../cancelamento/cancelamento.component';
import { ConfiguracaoComponent } from '../configuracao/configuracao.component';
import { ConsultaSaldoComponent } from '../consulta-saldo/consulta-saldo.component';
import { EmissaoFaturaComponent } from '../emissao-fatura/emissao-fatura.component';
import { RecebimentoComponent } from '../recebimento/recebimento.component';
import { ReimpressaoComponent } from '../reimpressao/reimpressao.component';
import { TokenComponent } from '../token/token.component';

interface OpcaoMenu {
  rotulo: string;
  tecla: string;
  icone: NomeIcone;
  acao: () => Promise<unknown>;
}

@Component({
  selector: 'app-funcoes',
  imports: [TelaTefComponent, IconeComponent],
  templateUrl: './funcoes.component.html',
})
export class FuncoesComponent extends TelaBase {
  static readonly largura = '460px';

  private readonly dialogos = inject(DialogosService);
  private readonly botoes = viewChildren<ElementRef<HTMLButtonElement>>('botaoOpcao');

  protected readonly opcoes: OpcaoMenu[] = [
    { rotulo: 'Cancelamento de venda', tecla: 'F2', icone: 'cancelamento', acao: () => this.dialogos.abrir(CancelamentoComponent) },
    { rotulo: 'Recebimentos', tecla: 'F3', icone: 'recebimentos', acao: () => this.dialogos.abrir(RecebimentoComponent) },
    { rotulo: 'Reimpressão do último movimento', tecla: 'F4', icone: 'imprimir', acao: () => this.dialogos.abrir(ReimpressaoComponent) },
    { rotulo: 'Consulta saldo', tecla: 'F5', icone: 'pesquisar', acao: () => this.dialogos.abrir(ConsultaSaldoComponent) },
    { rotulo: 'Emissão de fatura', tecla: 'F6', icone: 'fatura', acao: () => this.dialogos.abrir(EmissaoFaturaComponent) },
    { rotulo: 'Cadastro de token', tecla: 'F7', icone: 'token', acao: () => this.dialogos.abrir(TokenComponent) },
    { rotulo: 'Configurações', tecla: 'F12', icone: 'configuracoes', acao: () => this.dialogos.abrir(ConfiguracaoComponent) },
  ];

  protected override readonly teclas: Record<string, () => void> = {
    ...Object.fromEntries(this.opcoes.map((o) => [o.tecla, () => this.executar(o)])),
    // Setas movem o foco entre as opções
    ArrowDown: () => this.moverFoco(1),
    ArrowUp: () => this.moverFoco(-1),
  };

  protected executar(opcao: OpcaoMenu): void {
    opcao.acao().catch((e) => this.dialogos.atencao(mensagemErro(e)));
  }

  private moverFoco(direcao: number): void {
    const botoes = this.botoes().map((b) => b.nativeElement);
    const atual = botoes.indexOf(document.activeElement as HTMLButtonElement);
    botoes[(atual + direcao + botoes.length) % botoes.length]?.focus();
  }
}
