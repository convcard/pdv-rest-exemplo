/**
 * Tela "TEF Convcard - QRCode".
 *
 * Fluxo "QRCode PDV" (padrão de mercado):
 *  1. POST /qrcode-pdv/gerar -> conteúdo do QR Code, expiração e "sleepMs";
 *  2. aguarda "sleepMs" e faz o pooling em
 *     POST /qrcode-pdv/solicitacao-compra-qrcode, enviando a solicitação
 *     completa (valor, parcelas, produtos, receita) + o QR Code:
 *       - pendente = true  -> cliente ainda não vinculou no APP: aguarda o
 *                             novo "sleepMs" e chama de novo;
 *       - pendente = false -> "retorno" traz a compra aprovada.
 *  3. A compra fica PENDENTE (imprime comprovante e confirma/desfaz).
 */
import QRCode from 'qrcode';
import type { DadosCompra, RetornoMovimentoModel } from '../convcard/modelos';
import { escreverVisor, Tela } from './base';
import { atencao, comProgresso } from './comum';
import { icone, rotulo } from './icones';
import { aguardar, api, ErroTela, mensagemErro } from './util';

export interface CompraQrCodeAprovada {
  retorno: RetornoMovimentoModel;
  qrcode: string;
}

/** Códigos de 6 caracteres são exibidos como "ABC-DEF" para facilitar a leitura. */
function formatarCodigo(qrcode: string): string {
  return qrcode.length === 6 ? `${qrcode.slice(0, 3)}-${qrcode.slice(3)}` : qrcode;
}

export function abrirQrCode(dados: DadosCompra): Promise<CompraQrCodeAprovada> {
  const tela = new Tela(
    { titulo: 'TEF Convcard - QRCode', largura: 460 },
    `<div data-id="visor" class="visor qrcode">Gerando QRCode...</div>
     <div class="qrcode-imagem"><div data-id="carregando" class="qrcode-carregando">${icone('qrcode')}</div><img data-id="imagem" alt="QR Code" hidden /></div>
     <div data-id="codigo" class="qrcode-codigo"></div>
     <div class="botoes centro">
       <button data-id="compartilhar" disabled>${rotulo('compartilhar', 'Compartilhar', 'F2')}</button>
       <button data-id="imprimir" disabled title="A impressão é efetuada somente na impressora padrão do windows.">${rotulo('imprimir', 'Imprimir', 'F4')}</button>
       <button data-id="cancelar">${rotulo('cancelar', 'Cancelar', 'Esc')}</button>
     </div>`,
  );
  const visor = tela.el<HTMLDivElement>('visor');

  /** true quando a tela foi fechada; interrompe o pooling. */
  let fechada = false;
  let qrcodeAtual = '';

  return new Promise((resolve, reject) => {
    const fechar = (resultado: CompraQrCodeAprovada | Error) => {
      if (fechada) return;
      fechada = true;
      tela.fechar();
      if (resultado instanceof Error) reject(resultado);
      else resolve(resultado);
    };

    // Compartilhar: aqui só copiamos o código (um PDV real poderia enviar por WhatsApp, e-mail...).
    tela.botao('compartilhar', 'F2', () => {
      void navigator.clipboard.writeText(qrcodeAtual);
      void atencao('Código do QR Code copiado para a área de transferência.');
    });
    tela.botao('imprimir', 'F4', () => void atencao('Impressão do QR Code simulada.'));
    tela.botao('cancelar', undefined, () => fechar(new ErroTela('Cancelado pelo operador.')));
    tela.aoEsc = () => fechar(new ErroTela('Cancelado pelo operador.'));
    tela.abrir();

    executar()
      .then((resultado) => resultado && fechar(resultado))
      .catch((e) => {
        if (fechada) return;
        // Mostra o erro e fecha (o erro volta para a tela de venda)
        escreverVisor(visor, mensagemErro(e), 'erro');
        void aguardar(2000).then(() => fechar(new ErroTela(mensagemErro(e))));
      });
  });

  async function executar(): Promise<CompraQrCodeAprovada | undefined> {
    // 1. Gera o QR Code. O NST devolvido deve ser reutilizado no pooling.
    const qr = await comProgresso('Gerando QRCode...', () => api().gerarQrCode(dados.valor, dados.qtdParcelas));
    if (fechada) return undefined;

    qrcodeAtual = qr.qrcode;
    tela.el<HTMLImageElement>('imagem').src = await QRCode.toDataURL(qr.qrcode, { width: 300, margin: 1 });
    tela.el('imagem').hidden = false;
    tela.el('carregando').hidden = true;
    tela.el('codigo').textContent = formatarCodigo(qr.qrcode);
    tela.el<HTMLButtonElement>('compartilhar').disabled = false;
    tela.el<HTMLButtonElement>('imprimir').disabled = false;

    // Contagem regressiva até a expiração do QR Code
    const expiracao = new Date(qr.expiracao).getTime();
    const contador = setInterval(() => {
      const segundos = Math.max(0, Math.round((expiracao - Date.now()) / 1000));
      escreverVisor(visor, `Aguardando pagamento (${segundos})...`);
      visor.classList.add('qrcode');
    }, 1000);
    escreverVisor(visor, 'Aguardando pagamento...');
    visor.classList.add('qrcode');

    try {
      // 2. Pooling
      await aguardar(qr.sleepMs);
      return await pooling(qr.nst, qr.qrcode);
    } finally {
      clearInterval(contador);
    }
  }

  async function pooling(nst: number, qrcode: string): Promise<CompraQrCodeAprovada | undefined> {
    let resposta = await api().solicitarCompraQrCode(nst, qrcode, dados);
    while (!fechada && resposta.pendente) {
      await aguardar(resposta.sleepMs);
      if (fechada) break;
      resposta = await api().solicitarCompraQrCode(nst, qrcode, dados);
    }

    if (!resposta.pendente && resposta.retorno) {
      if (fechada) {
        // O operador fechou a tela enquanto a última chamada estava em
        // andamento e ela voltou aprovada: desfaz para não cobrar o cliente
        // por uma venda que o PDV não vai concluir.
        await api().desfazerPendente();
        return undefined;
      }
      return { retorno: resposta.retorno, qrcode };
    }
    if (fechada) return undefined;
    throw new ErroTela('Cancelado pelo operador.');
  }
}
