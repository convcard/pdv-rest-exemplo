/**
 * Venda do PDV: carrinho simples + finalização com Convcard.
 *
 * Fluxo da finalização (finalizarVenda):
 *  1. abre a tela "Venda" (VendaCartaoComponent) -> solicitação aprovada;
 *  2. TransacaoService: atualização de endereço, mensagem da loja,
 *     impressão do comprovante e confirmação (ou desfazimento);
 *  3. "000 - APROVADO".
 *
 * Excluir uma venda finalizada cancela a transação Convcard:
 *  - Cartão:      DELETE /cancelamento/solicitacao
 *  - QR Code PDV: DELETE /qrcode-pdv/solicitacao-cancelamento-compra-qrcode
 */
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DadosCompra, ProdutoModel, TipoProduto } from '../../../shared/modelos';
import { IconeComponent } from '../componentes/icone.component';
import { ConfiguracaoService } from '../core/configuracao.service';
import { CONVCARD_API } from '../core/convcard-api';
import { DialogosService } from '../core/dialogos.service';
import { TransacaoService } from '../core/transacao.service';
import { arredondar, mensagemErro } from '../core/util';
import { VendaCartaoComponent, type MeioPagamento } from '../telas/venda-cartao/venda-cartao.component';

interface ItemCatalogo {
  codigoBarras: number;
  descricao: string;
  /**
   * Classificação do produto na API: E=Ético, G=Genérico, S=Similar,
   * M=Manipulado (medicamentos) e O=Outros (qualquer outro item).
   */
  tipo: TipoProduto;
  valorUnitario: number;
  percentualDesconto: number;
}

interface ItemVenda extends ItemCatalogo {
  quantidade: number;
}

interface VendaFinalizada {
  numero: number;
  data: string;
  valor: number;
  autorizacao: number;
  nsu?: number;
  meio: MeioPagamento;
}

/** Produtos fictícios só para montar a venda (itens comuns: tipo "O" = Outros). */
const CATALOGO: ItemCatalogo[] = [
  { codigoBarras: 7890000000011, descricao: 'CAFE TORRADO 250G', tipo: 'O', valorUnitario: 8.9, percentualDesconto: 0 },
  { codigoBarras: 7890000000028, descricao: 'CAMISETA ALGODAO M', tipo: 'O', valorUnitario: 32.5, percentualDesconto: 10 },
  { codigoBarras: 7890000000035, descricao: 'CANECA DE PORCELANA', tipo: 'O', valorUnitario: 19.9, percentualDesconto: 5 },
  { codigoBarras: 7890000000042, descricao: 'CANETA ESFEROGRAFICA', tipo: 'O', valorUnitario: 4.99, percentualDesconto: 0 },
];

/**
 * Converte o item da venda para o ProdutoModel da Convcard.
 * - valorUnitarioLiquido = valorUnitario - desconto unitário
 * - valor                = quantidade x valorUnitarioLiquido (total do item)
 * - valorDesconto        = desconto total do item
 */
function paraProdutoModel(item: ItemVenda): ProdutoModel {
  const descontoUnitario = arredondar((item.valorUnitario * item.percentualDesconto) / 100);
  const valorUnitarioLiquido = arredondar(item.valorUnitario - descontoUnitario);
  return {
    codigoBarras: item.codigoBarras,
    descricao: item.descricao,
    quantidade: item.quantidade,
    valor: arredondar(valorUnitarioLiquido * item.quantidade),
    tipo: item.tipo,
    valorUnitario: item.valorUnitario,
    percentualDesconto: item.percentualDesconto,
    valorDesconto: arredondar(descontoUnitario * item.quantidade),
    valorUnitarioLiquido,
  };
}

@Component({
  selector: 'app-venda',
  imports: [FormsModule, CurrencyPipe, DatePipe, IconeComponent],
  templateUrl: './venda.component.html',
})
export class VendaComponent {
  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);
  private readonly transacao = inject(TransacaoService);
  private readonly configuracao = inject(ConfiguracaoService);

  protected readonly catalogo = CATALOGO;
  protected readonly itens = signal<ItemVenda[]>([]);
  protected readonly vendas = signal<VendaFinalizada[]>([]);
  protected readonly numeroCupom = signal(1);
  protected readonly parcelas = signal(1);

  protected readonly produtos = computed(() => this.itens().map(paraProdutoModel));
  protected readonly total = computed(() => arredondar(this.produtos().reduce((soma, p) => soma + p.valor, 0)));

  protected adicionar(item: ItemCatalogo): void {
    this.itens.update((itens) =>
      itens.some((i) => i.codigoBarras === item.codigoBarras)
        ? itens.map((i) => (i.codigoBarras === item.codigoBarras ? { ...i, quantidade: i.quantidade + 1 } : i))
        : [...itens, { ...item, quantidade: 1 }],
    );
  }

  protected remover(indice: number): void {
    this.itens.update((itens) => itens.filter((_, i) => i !== indice));
  }

  protected descricaoPagamento(meio: MeioPagamento): string {
    return meio.tipo === 'cartao' ? `Cartão ${meio.cartao.slice(0, 4)}...${meio.cartao.slice(-4)}` : 'QR Code';
  }

  async finalizarVenda(): Promise<void> {
    if (!this.itens().length) {
      await this.dialogos.atencao('Adicione produtos à venda.');
      return;
    }

    const dados: DadosCompra = {
      valor: this.total(),
      qtdParcelas: Math.max(1, this.parcelas() || 1),
      // Configuração "Enviar número nota": envia o número do cupom/nota da venda
      numeroNota: this.configuracao.valor.usaNumNota ? this.numeroCupom() : undefined,
      produtos: this.produtos(),
    };

    // 1. Solicitação (cartão ou QR Code)
    const resultado = await this.dialogos.abrir(VendaCartaoComponent, dados);
    if (!resultado || 'erro' in resultado) {
      await this.dialogos.mensagemOperador(resultado?.erro ?? 'Cancelado pelo operador.');
      return;
    }

    // 2. Endereço, mensagem da loja, comprovante e confirmação
    const { retorno, meio } = resultado.compra;
    try {
      await this.transacao.finalizar({
        titulo: 'Venda',
        comprovante: retorno.comprovante,
        mensagemLoja: retorno.mensagemLoja,
        endereco: retorno.endereco,
        // A atualização de endereço só se aplica à compra com cartão digitado
        cartao: meio.tipo === 'cartao' ? meio.cartao : undefined,
      });
    } catch (e) {
      await this.dialogos.mensagemOperador(mensagemErro(e));
      return;
    }

    // 3. Venda concluída
    await this.dialogos.aprovado();
    this.vendas.update((vendas) => [
      {
        numero: this.numeroCupom(),
        data: retorno.data ?? new Date().toISOString(),
        valor: dados.valor,
        autorizacao: retorno.autorizacao,
        nsu: retorno.nsu,
        meio,
      },
      ...vendas,
    ]);
    this.numeroCupom.update((n) => n + 1);
    this.itens.set([]);
  }

  protected async excluirVenda(venda: VendaFinalizada): Promise<void> {
    const prosseguir = await this.dialogos.confirmar(
      'Esta venda possui transação Convcard.\r\nAo excluir a venda a transação será automaticamente cancelada.\r\nDeseja prosseguir?',
    );
    if (!prosseguir) return;

    const meio = venda.meio;
    try {
      const retorno = await this.dialogos.comProgresso('Processando cancelamento...', () =>
        meio.tipo === 'cartao'
          ? this.api.solicitarCancelamento({ cartao: meio.cartao, cvv: meio.cvv, valor: venda.valor, autorizacao: venda.autorizacao })
          : this.api.solicitarCancelamentoQrCode({ qrcode: meio.qrcode, valor: venda.valor, autorizacao: venda.autorizacao }),
      );
      await this.transacao.finalizar({ titulo: 'Cancelamento', comprovante: retorno.comprovante, mensagemLoja: retorno.mensagemLoja });
    } catch (e) {
      await this.dialogos.mensagemOperador(mensagemErro(e));
      return;
    }

    await this.dialogos.aprovado();
    this.vendas.update((vendas) => vendas.filter((v) => v !== venda));
  }
}
