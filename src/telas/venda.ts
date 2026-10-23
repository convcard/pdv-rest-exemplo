/**
 * Tela principal do PDV: carrinho simples + finalização com Convcard.
 *
 * Atalhos:
 *  - F5      Finalizar venda (pagamento Convcard)
 *  - Ctrl+U  Funções Convcard
 *
 * Fluxo da finalização:
 *  1. abre "TEF Convcard - Venda" -> solicitação aprovada;
 *  2. atualização de endereço / mensagem da loja / impressão do comprovante;
 *  3. confirmação (ou desfazimento se algo falhar);
 *  4. "000 - APROVADO".
 *
 * Excluir uma venda já finalizada cancela a transação Convcard
 * automaticamente, usando os dados guardados da venda.
 */
import type { DadosCompra, ProdutoModel, TipoProduto } from '../convcard/modelos';
import { atencao, comProgresso, confirmar, mensagemOperador, mostrarAprovado } from './comum';
import { abrirVendaConvcard, type MeioPagamento } from './dialogo-cartao';
import { finalizarTransacao } from './dialogo-comprovante';
import { icone, rotulo } from './icones';
import { abrirFuncoesConvcard } from './funcoes';
import { $, api, arredondar, config, escapar, formatarData, formatarMoeda, mensagemErro } from './util';

interface ItemCatalogo {
  codigoBarras: number;
  descricao: string;
  /** E=Ético (referência), G=Genérico, S=Similar, M=Manipulado, O=Outros */
  tipo: TipoProduto;
  valorUnitario: number;
  percentualDesconto: number;
}

/** Produtos fictícios só para montar a venda. */
const CATALOGO: ItemCatalogo[] = [
  { codigoBarras: 7896004703398, descricao: 'DIPIRONA 500MG 10 COMP', tipo: 'G', valorUnitario: 8.9, percentualDesconto: 0 },
  { codigoBarras: 7891058017392, descricao: 'AMOXICILINA 500MG 21 CAPS', tipo: 'E', valorUnitario: 32.5, percentualDesconto: 10 },
  { codigoBarras: 7896422506656, descricao: 'LOSARTANA 50MG 30 COMP', tipo: 'S', valorUnitario: 19.9, percentualDesconto: 5 },
  { codigoBarras: 7891010032356, descricao: 'SABONETE LIQUIDO 250ML', tipo: 'O', valorUnitario: 4.99, percentualDesconto: 0 },
];

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

let itens: ItemVenda[] = [];
const vendas: VendaFinalizada[] = [];
let numeroCupom = 1;

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

function total(): number {
  return arredondar(itens.map(paraProdutoModel).reduce((soma, p) => soma + p.valor, 0));
}

function renderizarItens(): void {
  const corpo = $<HTMLTableSectionElement>('itens-venda');
  corpo.innerHTML = itens
    .map((item, indice) => {
      const p = paraProdutoModel(item);
      return `<tr>
        <td>${p.codigoBarras}</td><td>${escapar(p.descricao)}</td><td>${p.tipo}</td>
        <td class="num">${p.quantidade}</td><td class="num">${formatarMoeda(p.valorUnitario)}</td>
        <td class="num">${p.percentualDesconto}</td><td class="num">${formatarMoeda(p.valor)}</td>
        <td><button data-remover="${indice}" class="so-icone" title="Remover item">${icone('remover')}</button></td></tr>`;
    })
    .join('') || '<tr><td colspan="8" class="vazio">Clique nos produtos acima para adicioná-los à venda.</td></tr>';
  $('venda-total').textContent = formatarMoeda(total());
  $('venda-cupom').textContent = String(numeroCupom);
}

function renderizarVendas(): void {
  const descricaoMeio = (m: MeioPagamento) =>
    m.tipo === 'cartao' ? `Cartão ${m.cartao.slice(0, 4)}...${m.cartao.slice(-4)}` : 'QR Code';
  $<HTMLTableSectionElement>('vendas-finalizadas').innerHTML = vendas
    .map(
      (v, indice) => `<tr>
        <td>${v.numero}</td><td>${formatarData(v.data)}</td><td>${descricaoMeio(v.meio)}</td>
        <td class="num">${formatarMoeda(v.valor)}</td><td class="num">${v.autorizacao}</td><td class="num">${v.nsu ?? ''}</td>
        <td><button data-excluir="${indice}" class="perigo pequeno">${rotulo('cancelamento', 'Excluir venda')}</button></td></tr>`,
    )
    .join('') || '<tr><td colspan="7" class="vazio">Nenhuma venda finalizada.</td></tr>';
}

function adicionar(item: ItemCatalogo): void {
  const existente = itens.find((i) => i.codigoBarras === item.codigoBarras);
  if (existente) existente.quantidade++;
  else itens.push({ ...item, quantidade: 1 });
  renderizarItens();
}

async function finalizarVenda(): Promise<void> {
  if (!itens.length) {
    await atencao('Adicione produtos à venda.');
    return;
  }

  const dados: DadosCompra = {
    valor: total(),
    qtdParcelas: Math.max(1, Number($('venda-parcelas').value) || 1),
    // Configuração "Enviar número nota": envia o número do cupom/nota da venda
    numeroNota: config().usaNumNota ? numeroCupom : undefined,
    produtos: itens.map(paraProdutoModel),
  };

  // 1. Solicitação (cartão ou QR Code)
  let aprovada;
  try {
    aprovada = await abrirVendaConvcard(dados);
  } catch (e) {
    await mensagemOperador(mensagemErro(e));
    return;
  }

  // 2 e 3. Endereço, mensagem da loja, comprovante e confirmação
  const { retorno, meio } = aprovada;
  try {
    await finalizarTransacao({
      titulo: 'Venda',
      comprovante: retorno.comprovante,
      mensagemLoja: retorno.mensagemLoja,
      endereco: retorno.endereco,
      // A atualização de endereço só se aplica à compra com cartão digitado
      cartao: meio.tipo === 'cartao' ? meio.cartao : undefined,
    });
  } catch (e) {
    await mensagemOperador(mensagemErro(e));
    return;
  }

  await mostrarAprovado();
  vendas.unshift({
    numero: numeroCupom++,
    data: retorno.data ?? new Date().toISOString(),
    valor: dados.valor,
    autorizacao: retorno.autorizacao,
    nsu: retorno.nsu,
    meio,
  });
  itens = [];
  renderizarItens();
  renderizarVendas();
}

/**
 * Exclusão de venda finalizada: cancela a transação na Convcard.
 *  - Cartão:      DELETE /cancelamento/solicitacao
 *  - QR Code PDV: DELETE /qrcode-pdv/solicitacao-cancelamento-compra-qrcode
 * Depois imprime o comprovante do cancelamento e confirma.
 */
async function excluirVenda(indice: number): Promise<void> {
  const venda = vendas[indice];
  const prosseguir = await confirmar(
    'Esta venda possui transação Convcard.\r\nAo excluir a venda a transação será automaticamente cancelada.\r\nDeseja prosseguir?',
  );
  if (!prosseguir) return;

  const meio = venda.meio;
  try {
    const retorno = await comProgresso('Processando cancelamento...', () =>
      meio.tipo === 'cartao'
        ? api().solicitarCancelamento({ cartao: meio.cartao, cvv: meio.cvv, valor: venda.valor, autorizacao: venda.autorizacao })
        : api().solicitarCancelamentoQrCode({ qrcode: meio.qrcode, valor: venda.valor, autorizacao: venda.autorizacao }),
    );
    await finalizarTransacao({ titulo: 'Cancelamento', comprovante: retorno.comprovante, mensagemLoja: retorno.mensagemLoja });
  } catch (e) {
    await mensagemOperador(mensagemErro(e));
    return;
  }

  await mostrarAprovado();
  vendas.splice(indice, 1);
  renderizarVendas();
}

/** Evita abrir uma tela enquanto outra (modal) já está aberta. */
const semDialogoAberto = () => !document.querySelector('dialog[open]');

export function iniciarVenda(): void {
  const catalogo = $<HTMLDivElement>('catalogo');
  for (const item of CATALOGO) {
    const botao = document.createElement('button');
    botao.className = 'produto';
    botao.innerHTML = `${icone('adicionar')}<span class="produto-nome">${escapar(item.descricao)}</span><span class="produto-preco">${formatarMoeda(item.valorUnitario)}</span>`;
    botao.addEventListener('click', () => adicionar(item));
    catalogo.appendChild(botao);
  }

  $('itens-venda').addEventListener('click', (e) => {
    const indice = (e.target as Element).closest<HTMLElement>('[data-remover]')?.dataset.remover;
    if (indice !== undefined) {
      itens.splice(Number(indice), 1);
      renderizarItens();
    }
  });
  $('vendas-finalizadas').addEventListener('click', (e) => {
    const indice = (e.target as Element).closest<HTMLElement>('[data-excluir]')?.dataset.excluir;
    if (indice !== undefined) void excluirVenda(Number(indice));
  });

  $('btn-finalizar').addEventListener('click', () => void finalizarVenda());
  $('btn-funcoes').addEventListener('click', () => abrirFuncoesConvcard());

  document.addEventListener('keydown', (e) => {
    if (!semDialogoAberto()) return;
    if (e.key === 'F5') {
      e.preventDefault();
      void finalizarVenda();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      abrirFuncoesConvcard();
    }
  });

  renderizarItens();
  renderizarVendas();
}
