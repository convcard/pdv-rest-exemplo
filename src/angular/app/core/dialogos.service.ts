/**
 * Abertura das telas modais (via @angular/cdk/dialog) e diálogos de uso geral.
 *
 *   const aprovada = await this.dialogos.abrir(VendaCartaoComponent, dadosCompra);
 *
 * "abrir" devolve uma Promise com o resultado que a tela passou em fechar()
 * (ou undefined se ela foi fechada sem resultado).
 */
import { Dialog } from '@angular/cdk/dialog';
import { Injectable, inject, signal, type Type } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AtencaoComponent } from '../dialogos/atencao.component';
import { ConfirmacaoComponent } from '../dialogos/confirmacao.component';
import { ImpressoraComponent } from '../dialogos/impressora.component';
import { MensagemOperadorComponent } from '../dialogos/mensagem-operador.component';
import { ProgressoComponent } from '../dialogos/progresso.component';
import type { TelaBase } from './tela-base';
import type { Validacao } from './util';

/** Componente de tela + largura opcional declarada na própria classe (static largura). */
type ComponenteTela<R> = Type<TelaBase<R>> & { largura?: string };

@Injectable({ providedIn: 'root' })
export class DialogosService {
  private readonly dialog = inject(Dialog);

  /** true quando há alguma modal aberta (usado para ignorar atalhos da tela principal). */
  get algumaAberta(): boolean {
    return this.dialog.openDialogs.length > 0;
  }

  /** Abre uma tela modal e aguarda o resultado. */
  abrir<R, D = unknown>(componente: ComponenteTela<R>, dados?: D): Promise<R | undefined> {
    const ref = this.dialog.open<R, D, TelaBase<R>>(componente, {
      data: dados,
      width: componente.largura,
      maxWidth: 'calc(100vw - 32px)',
      panelClass: 'tela',
      backdropClass: 'tela-fundo',
      // Esc e clique fora não fecham sozinhos: cada tela decide (TelaBase.aoEsc)
      disableClose: true,
    });
    // As teclas vão só para a modal do topo (o CDK cuida disso)
    const teclas = ref.keydownEvents.subscribe((evento) => ref.componentInstance?.tratarTecla(evento));
    return firstValueFrom(ref.closed).finally(() => teclas.unsubscribe());
  }

  /** "Mensagem Operador": mensagens da Convcard e avisos; fecha sozinha em 5s. */
  async mensagemOperador(mensagem: string, segundos = 5): Promise<void> {
    await this.abrir(MensagemOperadorComponent, { mensagem, segundos });
  }

  aprovado(): Promise<void> {
    return this.mensagemOperador('000 - APROVADO');
  }

  async atencao(mensagem: string): Promise<void> {
    await this.abrir(AtencaoComponent, mensagem);
  }

  async confirmar(mensagem: string, titulo = 'Confirmação'): Promise<boolean> {
    return (await this.abrir(ConfirmacaoComponent, { mensagem, titulo })) === true;
  }

  /** Mostra os erros da validação. Devolve true se não houver erros. */
  async validar(validacao: Validacao): Promise<boolean> {
    if (!validacao.mensagem) return true;
    await this.atencao(validacao.mensagem);
    return false;
  }

  /**
   * Executa uma ação mostrando o popup "Aguarde". A ação recebe uma função
   * para trocar a mensagem durante o processo.
   */
  async comProgresso<T>(mensagem: string, acao: (atualizar: (texto: string) => void) => Promise<T>): Promise<T> {
    const texto = signal(mensagem);
    const ref = this.dialog.open(ProgressoComponent, {
      data: texto,
      width: ProgressoComponent.largura,
      panelClass: 'tela',
      backdropClass: 'tela-fundo',
      disableClose: true,
    });
    try {
      return await acao((novo) => texto.set(novo));
    } finally {
      ref.close();
    }
  }

  /**
   * Simula a impressão do comprovante. Devolve true se "imprimiu" e false se
   * o operador escolheu "Falha na impressão" (para demonstrar o desfazimento).
   */
  async imprimirComprovante(comprovante: string | undefined, titulo: string): Promise<boolean> {
    return (await this.abrir(ImpressoraComponent, { comprovante, titulo })) === true;
  }
}
