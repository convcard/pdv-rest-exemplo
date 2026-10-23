/**
 * Tela "Recebimento": a loja recebe do portador do cartão o pagamento da
 * fatura e repassa para a Convcard. Dois modos:
 *
 * Recebimento [F3] (fatura fechada):
 *  1. pesquisa a fatura por Cartão, CPF, Número ou NSU da fatura
 *     -> POST /consulta/fatura (preenche número, NSU, vencimento e valor);
 *  2. Finalizar -> POST /pagamento/solicitacao-pagamento (NSU da fatura + valor);
 *  3. imprime o comprovante -> PUT /pagamento/confirmacao-pagamento.
 *
 * Recebimento antecipado [F4] (antes do fechamento da fatura):
 *  1. pesquisa pelo cartão -> POST /consulta/saldo-devedor ("Valor receber");
 *  2. Finalizar -> POST /pagamento/solicitacao-pagamento-antecipado (cartão + valor);
 *  3. se pedido, atualização de endereço;
 *  4. imprime o comprovante -> PUT /pagamento/confirmacao-pagamento-antecipado.
 *
 * A API não tem desfazimento de pagamento: se algo falhar antes da
 * confirmação, basta não confirmar.
 *
 * Num PDV real, entre a solicitação e a confirmação também entram a escolha
 * do caixa e o lançamento das formas de pagamento (dinheiro, cartão...).
 * Isso é regra de cada PDV e foi omitido neste exemplo.
 *
 * Fecha com true se algum recebimento foi concluído.
 */
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { FaturaModel } from '../../../../shared/modelos';
import { IconeComponent } from '../../componentes/icone.component';
import { MascaraDirective } from '../../componentes/mascara.directive';
import { TelaTefComponent } from '../../componentes/tela-tef.component';
import { CONVCARD_API } from '../../core/convcard-api';
import { DialogosService } from '../../core/dialogos.service';
import { FILTROS_FATURA, montarFiltroFatura, type TipoFiltroFatura } from '../../core/filtro-fatura';
import { TelaBase } from '../../core/tela-base';
import { TransacaoService } from '../../core/transacao.service';
import { Validacao, mensagemErro } from '../../core/util';

type Modo = 'RECEBIMENTO' | 'RECEBIMENTO_ANTECIPADO';

/** Dados vindos da consulta de saldo (F6 na consulta) */
export interface DadosFatura {
  cartao: string;
  fatura?: FaturaModel;
}

@Component({
  selector: 'app-recebimento',
  imports: [FormsModule, DatePipe, DecimalPipe, TelaTefComponent, IconeComponent, MascaraDirective],
  templateUrl: './recebimento.component.html',
})
export class RecebimentoComponent extends TelaBase<boolean> {
  static readonly largura = '600px';

  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);
  private readonly transacao = inject(TransacaoService);
  private readonly dadosFatura: DadosFatura | undefined = inject(DIALOG_DATA);

  protected readonly filtros = FILTROS_FATURA;
  protected readonly modo = signal<Modo>('RECEBIMENTO');
  protected readonly tipo = signal<TipoFiltroFatura>('CPF');
  protected readonly filtro = signal('');
  protected readonly numero = signal<number | undefined>(undefined);
  protected readonly nsu = signal<number | undefined>(undefined);
  protected readonly vencimento = signal<string | undefined>(undefined);
  protected readonly valor = signal<number | null>(null);
  protected readonly receber = signal<number | undefined>(undefined);
  /** Aberto pela consulta de saldo: cartão/fatura já definidos e não podem ser trocados */
  protected readonly travado = !!this.dadosFatura;

  /** Filtro usado na última pesquisa; se o filtro mudar, os resultados são limpos. */
  private filtroPesquisado = '';
  private concluiu = false;

  protected override readonly teclas: Record<string, () => void> = {
    F2: () => void this.finalizar(),
    F3: () => this.definirModo('RECEBIMENTO'),
    F4: () => this.definirModo('RECEBIMENTO_ANTECIPADO'),
    F5: () => this.limpar(),
  };

  constructor() {
    super();
    if (this.dadosFatura) this.preencherDaConsulta(this.dadosFatura);
  }

  protected definirModo(modo: Modo): void {
    if (this.travado) return;
    this.modo.set(modo);
    // O antecipado é sempre pelo cartão
    this.tipo.set(modo === 'RECEBIMENTO_ANTECIPADO' ? 'Cartão' : 'CPF');
    this.filtro.set('');
    this.limparResultados();
  }

  protected trocarTipo(tipo: TipoFiltroFatura): void {
    this.tipo.set(tipo);
    this.filtro.set('');
    this.limparResultados();
  }

  protected aoMudarFiltro(valor: string): void {
    this.filtro.set(valor);
    if (this.filtroPesquisado && valor !== this.filtroPesquisado) this.limparResultados();
  }

  protected limpar(): void {
    if (!this.travado) this.definirModo('RECEBIMENTO');
  }

  protected async pesquisar(): Promise<void> {
    const filtro = this.filtro();
    if (!filtro) return;
    try {
      if (this.modo() === 'RECEBIMENTO') {
        const fatura = await this.dialogos.comProgresso('Consultando os dados da fatura...', () =>
          this.api.consultarFatura(montarFiltroFatura(this.tipo(), filtro)),
        );
        this.preencherFatura(fatura);
      } else {
        const devedor = await this.dialogos.comProgresso('Consultando o saldo devedor...', () =>
          this.api.consultarSaldoDevedor(filtro),
        );
        this.valor.set(0);
        this.receber.set(devedor.saldo);
      }
      this.filtroPesquisado = filtro;
    } catch (e) {
      this.limparResultados();
      await this.dialogos.atencao(mensagemErro(e));
    }
  }

  protected async finalizar(): Promise<void> {
    if (!(await this.dialogos.validar(new Validacao().requerido(this.tipo(), this.filtro())))) return;
    if (this.modo() === 'RECEBIMENTO' && !this.nsu()) await this.pesquisar();

    const valor = this.valor();
    const validacao = new Validacao().requerido('Valor recebido', valor);
    if (this.modo() === 'RECEBIMENTO') validacao.requerido('NSU fatura', this.nsu());
    if (valor !== null && valor < 0) validacao.adicionar('Valor recebido', 'Inválido');
    if (!(await this.dialogos.validar(validacao))) return;

    try {
      const antecipado = this.modo() === 'RECEBIMENTO_ANTECIPADO';
      const retorno = await this.dialogos.comProgresso('Enviando solicitação...', () =>
        antecipado
          ? this.api.solicitarRecebimentoAntecipado(this.filtro(), valor!)
          : this.api.solicitarRecebimento(this.nsu()!, valor!),
      );

      await this.transacao.finalizar({
        titulo: 'Recebimento',
        comprovante: retorno.comprovante,
        endereco: retorno.endereco,
        // Só o antecipado identifica o cartão (e portanto permite atualizar o endereço)
        cartao: antecipado ? this.filtro() : undefined,
      });
      await this.dialogos.aprovado();
      this.concluiu = true;

      if (this.travado) this.fechar(true);
      else this.definirModo('RECEBIMENTO');
    } catch (e) {
      await this.dialogos.mensagemOperador(mensagemErro(e));
    }
  }

  protected override aoEsc(): void {
    this.fechar(this.concluiu);
  }

  private preencherFatura(fatura: FaturaModel): void {
    this.numero.set(fatura.numero);
    this.nsu.set(fatura.nsu);
    this.vencimento.set(fatura.vencimento);
    this.valor.set(fatura.valor ?? null);
  }

  private limparResultados(): void {
    this.filtroPesquisado = '';
    this.numero.set(undefined);
    this.nsu.set(undefined);
    this.vencimento.set(undefined);
    this.valor.set(null);
    this.receber.set(undefined);
  }

  /** Fatura em aberto -> recebimento da fatura; quitada (ou sem fatura) -> antecipado. */
  private preencherDaConsulta({ cartao, fatura }: DadosFatura): void {
    const quitada = !fatura?.nsu || fatura.status === 'PAGO';
    this.modo.set(quitada ? 'RECEBIMENTO_ANTECIPADO' : 'RECEBIMENTO');
    this.tipo.set('Cartão');
    this.filtro.set(cartao);
    this.filtroPesquisado = cartao;
    if (quitada) void this.pesquisar();
    else if (fatura) this.preencherFatura(fatura);
  }
}
