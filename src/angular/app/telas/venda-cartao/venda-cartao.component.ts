/**
 * Tela "Venda" (pagamento com Convcard na finalização da venda).
 *
 *  - Enviar [F2]: compra com cartão digitado -> POST /compra/solicitacao
 *  - QR Code [F3]: compra por QR Code no modelo "QRCode PDV" (QrCodeComponent)
 *  - Cancelar [Esc]: "Cancelado pelo operador."
 *
 * Regras dos campos:
 *  - CVV habilitado assim que o cartão tiver algum dígito;
 *  - Senha habilitada só para cartões de 19 dígitos cujo 7º dígito é "1";
 *  - QR Code só habilitado com o campo cartão vazio;
 *  - Campos de receita (opcionais na API, para vendas com receita médica) só
 *    aparecem com a configuração "Enviar dados receita".
 *
 * Após a aprovação a compra fica PENDENTE; quem abriu a tela (PdvComponent)
 * imprime o comprovante e confirma ou desfaz (TransacaoService).
 */
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DadosCompra, RetornoMovimentoModel } from '../../../../shared/modelos';
import { IconeComponent } from '../../componentes/icone.component';
import { MascaraDirective } from '../../componentes/mascara.directive';
import { TelaTefComponent } from '../../componentes/tela-tef.component';
import { VisorComponent } from '../../componentes/visor.component';
import { ConfiguracaoService } from '../../core/configuracao.service';
import { CONVCARD_API } from '../../core/convcard-api';
import { DialogosService } from '../../core/dialogos.service';
import { TelaBase } from '../../core/tela-base';
import { UFS, Validacao, aguardar, mensagemErro, type Visor } from '../../core/util';
import { QrCodeComponent } from '../qrcode/qrcode.component';

/** Por qual meio a compra foi aprovada. Necessário depois para cancelar a venda. */
export type MeioPagamento = { tipo: 'cartao'; cartao: string; cvv?: string } | { tipo: 'qrcode'; qrcode: string };

export interface CompraAprovada {
  retorno: RetornoMovimentoModel;
  meio: MeioPagamento;
}

/** Resultado da tela: a compra aprovada ou a mensagem de erro (inclusive cancelamento). */
export type ResultadoVenda = { compra: CompraAprovada } | { erro: string };

@Component({
  selector: 'app-venda-cartao',
  imports: [FormsModule, DecimalPipe, TelaTefComponent, IconeComponent, MascaraDirective, VisorComponent],
  templateUrl: './venda-cartao.component.html',
})
export class VendaCartaoComponent extends TelaBase<ResultadoVenda> {
  static readonly largura = '520px';

  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);
  protected readonly dados: DadosCompra = inject(DIALOG_DATA);
  protected readonly usaReceita = inject(ConfiguracaoService).valor.usaReceita;
  protected readonly ufs = UFS;

  protected readonly cartao = signal('');
  protected readonly cvv = signal('');
  protected readonly senha = signal('');
  protected readonly comReceita = signal(false);
  /** yyyy-mm-dd (input type="date") */
  protected readonly dataReceita = signal('');
  protected readonly crm = signal('');
  protected readonly uf = signal('');

  protected readonly visor = signal<Visor>({ texto: '', tipo: 'info' });
  protected readonly processando = signal(false);

  protected readonly cvvHabilitado = computed(() => !this.processando() && this.cartao().length > 0);
  protected readonly senhaHabilitada = computed(
    () => !this.processando() && this.cartao().length === 19 && this.cartao()[6] === '1',
  );
  protected readonly qrCodeHabilitado = computed(() => !this.processando() && this.cartao().length === 0);

  protected override readonly teclas = {
    F2: () => void this.enviar(),
    F3: () => void this.pagarComQrCode(),
  };

  constructor() {
    super();
    // Campo desabilitado é limpo (mesma regra do cartão: some o CVV/senha digitados)
    effect(() => {
      if (!this.cartao()) this.cvv.set('');
      if (!(this.cartao().length === 19 && this.cartao()[6] === '1')) this.senha.set('');
    });
    effect(() => {
      if (!this.comReceita()) {
        this.dataReceita.set('');
        this.crm.set('');
        this.uf.set('');
      }
    });
  }

  /** Campos de receita no formato da API. */
  private dadosReceita(): Partial<DadosCompra> {
    if (!this.usaReceita || !this.comReceita()) return { receita: false };
    const data = this.dataReceita();
    return {
      receita: true,
      // A API espera date-time ISO 8601: enviamos o início do dia no fuso local
      dataReceita: data ? new Date(`${data}T00:00:00`).toISOString() : undefined,
      numeroCrm: this.crm().trim(),
      ufMedico: this.uf(),
    };
  }

  private validarReceita(validacao: Validacao): Validacao {
    const r = this.dadosReceita();
    if (r.receita) {
      validacao.requerido('Data receita', r.dataReceita).requerido('CRM', r.numeroCrm).requerido('UF', r.ufMedico);
    }
    return validacao;
  }

  protected async enviar(): Promise<void> {
    if (this.processando()) return;

    const validacao = new Validacao().requerido('Cartão', this.cartao());
    if (this.cvvHabilitado() && !this.cvv() && this.cartao().length === 19) validacao.requerido('CVV', '');
    if (this.senhaHabilitada() && !this.senha()) validacao.requerido('Senha', '');
    if (!(await this.dialogos.validar(this.validarReceita(validacao)))) return;

    this.processando.set(true);
    this.visor.set({ texto: 'Processando pagamento...', tipo: 'info' });
    try {
      const meio: MeioPagamento = { tipo: 'cartao', cartao: this.cartao(), cvv: this.cvv() || undefined };
      const retorno = await this.api.solicitarCompra({
        ...this.dados,
        ...this.dadosReceita(),
        cartao: meio.cartao,
        cvv: meio.cvv,
        senha: this.senha() || undefined,
      });
      await this.finalizar({ compra: { retorno, meio } });
    } catch (e) {
      await this.finalizar({ erro: mensagemErro(e) });
    }
  }

  protected async pagarComQrCode(): Promise<void> {
    if (this.processando() || !this.qrCodeHabilitado()) return;
    if (!(await this.dialogos.validar(this.validarReceita(new Validacao())))) return;

    this.processando.set(true);
    this.visor.set({ texto: 'Processando QR Code...', tipo: 'info' });
    const resultado = await this.dialogos.abrir(QrCodeComponent, { ...this.dados, ...this.dadosReceita() });
    if (resultado && 'retorno' in resultado) {
      await this.finalizar({ compra: { retorno: resultado.retorno, meio: { tipo: 'qrcode', qrcode: resultado.qrcode } } });
    } else {
      await this.finalizar({ erro: resultado?.erro ?? 'Cancelado pelo operador.' });
    }
  }

  protected cancelar(): void {
    if (!this.processando()) void this.finalizar({ erro: 'Cancelado pelo operador.' });
  }

  protected override aoEsc(): void {
    this.cancelar();
  }

  /** Mostra o resultado no visor com contagem regressiva e fecha a tela. */
  private async finalizar(resultado: ResultadoVenda): Promise<void> {
    this.processando.set(true);
    const sucesso = 'compra' in resultado;
    const texto = sucesso ? 'Aprovado' : resultado.erro;
    for (let segundos = 2; segundos >= 0; segundos--) {
      this.visor.set({ texto: `${texto} (${segundos})`, tipo: sucesso ? 'sucesso' : 'erro' });
      await aguardar(1000);
    }
    this.fechar(resultado);
  }
}
