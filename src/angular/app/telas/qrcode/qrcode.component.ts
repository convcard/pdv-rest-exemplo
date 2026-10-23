/**
 * Tela "QRCode" (modelo "QRCode PDV").
 *
 *  1. POST /qrcode-pdv/gerar -> conteúdo do QR Code, expiração e "sleepMs";
 *  2. aguarda "sleepMs" e faz o pooling em
 *     POST /qrcode-pdv/solicitacao-compra-qrcode, enviando a solicitação
 *     completa (valor, parcelas, produtos, receita) + o QR Code:
 *       - pendente = true  -> cliente ainda não vinculou no APP: aguarda o
 *                             novo "sleepMs" e chama de novo;
 *       - pendente = false -> "retorno" traz a compra aprovada.
 *  3. A compra fica PENDENTE (imprime comprovante e confirma/desfaz).
 */
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import QRCode from 'qrcode';
import type { DadosCompra, RetornoMovimentoModel } from '../../../../shared/modelos';
import { IconeComponent } from '../../componentes/icone.component';
import { TelaTefComponent } from '../../componentes/tela-tef.component';
import { VisorComponent } from '../../componentes/visor.component';
import { CONVCARD_API } from '../../core/convcard-api';
import { DialogosService } from '../../core/dialogos.service';
import { TelaBase } from '../../core/tela-base';
import { ErroTela, aguardar, mensagemErro, type Visor } from '../../core/util';

export type ResultadoQrCode = { retorno: RetornoMovimentoModel; qrcode: string } | { erro: string };

@Component({
  selector: 'app-qrcode',
  imports: [TelaTefComponent, IconeComponent, VisorComponent],
  templateUrl: './qrcode.component.html',
})
export class QrCodeComponent extends TelaBase<ResultadoQrCode> {
  static readonly largura = '480px';

  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);
  private readonly dados: DadosCompra = inject(DIALOG_DATA);

  protected readonly visor = signal<Visor>({ texto: 'Gerando QRCode...', tipo: 'qrcode' });
  /** Imagem do QR Code (data URL) */
  protected readonly imagem = signal<string | undefined>(undefined);
  protected readonly codigo = signal('');

  /** true quando a tela foi fechada; interrompe o pooling. */
  private encerrada = false;
  private contador?: ReturnType<typeof setInterval>;

  protected override readonly teclas = {
    F2: () => void this.compartilhar(),
    F4: () => void this.imprimir(),
  };

  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => {
      this.encerrada = true;
      clearInterval(this.contador);
    });
    void this.executar();
  }

  /** Códigos de 6 caracteres são exibidos como "ABC-DEF" para facilitar a leitura. */
  protected codigoFormatado(): string {
    const c = this.codigo();
    return c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
  }

  /** Compartilhar: aqui só copiamos o código (um PDV real poderia enviar por WhatsApp, e-mail...). */
  protected async compartilhar(): Promise<void> {
    if (!this.codigo()) return;
    await navigator.clipboard.writeText(this.codigo());
    await this.dialogos.atencao('Código do QR Code copiado para a área de transferência.');
  }

  protected async imprimir(): Promise<void> {
    if (this.codigo()) await this.dialogos.atencao('Impressão do QR Code simulada.');
  }

  protected cancelar(): void {
    this.encerrar({ erro: 'Cancelado pelo operador.' });
  }

  protected override aoEsc(): void {
    this.cancelar();
  }

  private encerrar(resultado: ResultadoQrCode): void {
    if (this.encerrada) return;
    this.encerrada = true;
    this.fechar(resultado);
  }

  private async executar(): Promise<void> {
    try {
      // 1. Gera o QR Code. O NST devolvido deve ser reutilizado no pooling.
      const qr = await this.dialogos.comProgresso('Gerando QRCode...', () =>
        this.api.gerarQrCode(this.dados.valor, this.dados.qtdParcelas),
      );
      if (this.encerrada) return;

      this.codigo.set(qr.qrcode);
      this.imagem.set(await QRCode.toDataURL(qr.qrcode, { width: 300, margin: 1 }));

      // Contagem regressiva até a expiração do QR Code
      const expiracao = new Date(qr.expiracao).getTime();
      const atualizarVisor = () => {
        const segundos = Math.max(0, Math.round((expiracao - Date.now()) / 1000));
        this.visor.set({ texto: `Aguardando pagamento (${segundos})...`, tipo: 'qrcode' });
      };
      atualizarVisor();
      this.contador = setInterval(atualizarVisor, 1000);

      // 2. Pooling
      await aguardar(qr.sleepMs);
      const resultado = await this.pooling(qr.nst, qr.qrcode);
      if (resultado) this.encerrar(resultado);
    } catch (e) {
      if (this.encerrada) return;
      clearInterval(this.contador);
      this.visor.set({ texto: mensagemErro(e), tipo: 'erro' });
      await aguardar(2000);
      this.encerrar({ erro: mensagemErro(e) });
    }
  }

  private async pooling(nst: number, qrcode: string): Promise<ResultadoQrCode | undefined> {
    let resposta = await this.api.solicitarCompraQrCode(nst, qrcode, this.dados);
    while (!this.encerrada && resposta.pendente) {
      await aguardar(resposta.sleepMs);
      if (this.encerrada) break;
      resposta = await this.api.solicitarCompraQrCode(nst, qrcode, this.dados);
    }

    if (!resposta.pendente && resposta.retorno) {
      if (this.encerrada) {
        // O operador fechou a tela enquanto a última chamada estava em
        // andamento e ela voltou aprovada: desfaz para não cobrar o cliente
        // por uma venda que o PDV não vai concluir.
        await this.api.desfazerPendente();
        return undefined;
      }
      return { retorno: resposta.retorno, qrcode };
    }
    if (this.encerrada) return undefined;
    throw new ErroTela('Cancelado pelo operador.');
  }
}
