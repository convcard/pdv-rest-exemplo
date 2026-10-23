/**
 * Regras de negócio da integração com o Autorizador Convcard.
 *
 * =========================================================================
 * FLUXO DE UMA TRANSAÇÃO (modelo TEF: solicitação + confirmação)
 * =========================================================================
 *
 *   PDV                                   Autorizador Convcard
 *    |  1. solicitação (compra/cancel.)  ->  |  aprova e reserva o valor
 *    |  <-  autorizacao, nsu, comprovante    |
 *    |                                       |
 *    |  2. imprime o comprovante,            |
 *    |     emite o cupom/NF-e da venda       |
 *    |                                       |
 *    |  3a. deu tudo certo: CONFIRMAÇÃO  ->  |  efetiva a transação
 *    |  3b. falhou algo:    DESFAZIMENTO ->  |  estorna a transação
 *
 * Toda transação aprovada PRECISA ser confirmada ou desfeita, sempre com o
 * mesmo NST da solicitação. Se o PDV cair entre o passo 1 e o 3, a
 * transação fica "pendente" e deve ser desfeita assim que possível — por isso
 * guardamos a pendência em disco (ver armazenamento.ts).
 *
 * Endpoints de confirmação/desfazimento de cada tipo:
 *
 *   Compra cartão     PUT    /compra/confirmacao
 *                     DELETE /compra/desfazimento
 *   Compra QR Code    PUT    /qrcode-pdv/confirmacao-compra-qrcode
 *                     DELETE /qrcode-pdv/desfazimento-compra-qrcode
 *   Cancel. cartão    DELETE /cancelamento/confirmacao
 *                     DELETE /cancelamento/desfazimento
 *   Cancel. QR Code   DELETE /qrcode-pdv/confirmacao-cancelamento-compra-qrcode
 *                     DELETE /qrcode-pdv/desfazimento-cancelamento-compra-qrcode
 *   Recebimento       PUT    /pagamento/confirmacao-pagamento
 *                     (não existe desfazimento: basta não confirmar)
 *   Receb. antecipado PUT    /pagamento/confirmacao-pagamento-antecipado
 *                     (não existe desfazimento: basta não confirmar)
 *
 * Consultas, atualização de endereço e cadastro de token não têm confirmação.
 */
import {
  obterConfiguracao,
  obterPendente,
  proximoNst,
  removerPendente,
  salvarPendente,
  salvarUltimaTransacao,
} from '../armazenamento';
import type {
  DadosCancelamentoCartao,
  DadosCancelamentoQrCode,
  DadosCompraCartao,
  DadosEndereco,
  FiltroFatura,
  QrCodeGerado,
} from '../shared/ipc';
import { type Arquivo, ConvcardErro, requisitar, requisitarArquivo } from './cliente';
import type {
  AtualizacaoEnderecoModel,
  BaseModel,
  CadastrarTokenModel,
  CepModel,
  ConfirmacaoPagamentoAntecipadoModel,
  ConfirmacaoPagamentoModel,
  ConsultaCepModel,
  ConsultaFaturaModel,
  ConsultaSaldoModel,
  FaturaModel,
  PagamentoFaturaAntecipadaModel,
  PagamentoFaturaModel,
  SaldoDevedorModel,
  SolicitacaoPagamentoAntecipadoModel,
  SolicitacaoPagamentoModel,
  TokenModel,
  DadosCompra,
  MovimentoModel,
  MovimentoQrCodeModel,
  RetornoMovimentoModel,
  RetornoQrCodeModel,
  RetornoSolicitacaoQrCodeModel,
  SaldoModel,
  SolicitacaoCompraModel,
  SolicitacaoCompraQrCodeModel,
  SolicitacaoQrCodeModel,
  ValidarConfiguracaoModel,
  ValidarConfiguracaoOutputModel,
} from './modelos';

/**
 * Transação aprovada aguardando confirmação ou desfazimento.
 * "movimento" é exatamente o corpo enviado na confirmação/desfazimento.
 * "comprovante" é guardado para a reimpressão do último movimento.
 */
type Pendente = { comprovante?: string } & (
  | { tipo: 'COMPRA'; movimento: MovimentoModel }
  | { tipo: 'COMPRA_QRCODE'; movimento: MovimentoQrCodeModel }
  | { tipo: 'CANCELAMENTO'; movimento: MovimentoModel }
  | { tipo: 'CANCELAMENTO_QRCODE'; movimento: MovimentoQrCodeModel }
  | { tipo: 'RECEBIMENTO'; movimento: ConfirmacaoPagamentoModel }
  | { tipo: 'RECEBIMENTO_ANTECIPADO'; movimento: ConfirmacaoPagamentoAntecipadoModel }
);

/** Agrupa os tipos de transação para a reimpressão: venda, cancelamento e recebimento. */
const GRUPO_REIMPRESSAO = {
  COMPRA: 'VENDA',
  COMPRA_QRCODE: 'VENDA',
  CANCELAMENTO: 'CANCELAMENTO',
  CANCELAMENTO_QRCODE: 'CANCELAMENTO',
  RECEBIMENTO: 'RECEBIMENTO',
  RECEBIMENTO_ANTECIPADO: 'RECEBIMENTO',
} as const;

type Endpoint = readonly ['PUT' | 'DELETE', string];

const ENDPOINTS_PENDENTE: Record<Pendente['tipo'], { confirmar: Endpoint; desfazer?: Endpoint }> = {
  COMPRA: {
    confirmar: ['PUT', '/compra/confirmacao'],
    desfazer: ['DELETE', '/compra/desfazimento'],
  },
  COMPRA_QRCODE: {
    confirmar: ['PUT', '/qrcode-pdv/confirmacao-compra-qrcode'],
    desfazer: ['DELETE', '/qrcode-pdv/desfazimento-compra-qrcode'],
  },
  CANCELAMENTO: {
    confirmar: ['DELETE', '/cancelamento/confirmacao'],
    desfazer: ['DELETE', '/cancelamento/desfazimento'],
  },
  CANCELAMENTO_QRCODE: {
    confirmar: ['DELETE', '/qrcode-pdv/confirmacao-cancelamento-compra-qrcode'],
    desfazer: ['DELETE', '/qrcode-pdv/desfazimento-cancelamento-compra-qrcode'],
  },
  // Pagamentos não têm desfazimento na API.
  RECEBIMENTO: {
    confirmar: ['PUT', '/pagamento/confirmacao-pagamento'],
  },
  RECEBIMENTO_ANTECIPADO: {
    confirmar: ['PUT', '/pagamento/confirmacao-pagamento-antecipado'],
  },
};

/** Monta os campos que vão em toda requisição (ver BaseModel). */
function base(nst: number): BaseModel {
  const config = obterConfiguracao();
  return {
    nst,
    nomeSoftware: config.nomeSoftware,
    versaoSoftware: config.versaoSoftware,
    identificadorLoja: config.identificadorLoja,
  };
}

function enviar<T>(metodo: 'POST' | 'PUT' | 'DELETE', caminho: string, corpo: unknown): Promise<T> {
  return requisitar<T>(obterConfiguracao(), metodo, caminho, corpo);
}

// ---------------------------------------------------------------------------
// Validação e consultas
// ---------------------------------------------------------------------------

/**
 * POST /validacao/validar-configuracao
 * Testa certificado + identificadorLoja. Use ao configurar/ativar a integração.
 */
export function validarConfiguracao(): Promise<ValidarConfiguracaoOutputModel> {
  const corpo: ValidarConfiguracaoModel = base(proximoNst());
  return enviar('POST', '/validacao/validar-configuracao', corpo);
}

/** POST /consulta/saldo */
export function consultarSaldo(cartao: string): Promise<SaldoModel> {
  const corpo: ConsultaSaldoModel = { ...base(proximoNst()), cartao };
  return enviar('POST', '/consulta/saldo', corpo);
}

// ---------------------------------------------------------------------------
// Compra com cartão (digitado)
// ---------------------------------------------------------------------------

/**
 * POST /compra/solicitacao
 * Após a aprovação, a compra fica pendente até confirmarPendente() ou
 * desfazerPendente().
 */
export async function solicitarCompra(dados: DadosCompraCartao): Promise<RetornoMovimentoModel> {
  await desfazerPendenteAnterior();

  const corpo: SolicitacaoCompraModel = { ...base(proximoNst()), ...dados };
  const retorno = await enviar<RetornoMovimentoModel>('POST', '/compra/solicitacao', corpo);

  // Dados necessários para confirmar/desfazer: mesmo NST, cartão e valor da
  // solicitação + autorização devolvida pelo autorizador.
  salvarPendente({
    tipo: 'COMPRA',
    comprovante: retorno.comprovante,
    movimento: {
      ...base(corpo.nst),
      cartao: corpo.cartao,
      cvv: corpo.cvv,
      valor: corpo.valor,
      autorizacao: retorno.autorizacao,
    },
  } satisfies Pendente);

  return retorno;
}

// ---------------------------------------------------------------------------
// Compra com QR Code (modelo "QRCode PDV")
// ---------------------------------------------------------------------------
//
//  1. PDV gera o QR Code (/qrcode-pdv/gerar) e exibe na tela;
//  2. PDV aguarda "sleepMs" e começa o pooling em
//     /qrcode-pdv/solicitacao-compra-qrcode, repetindo enquanto
//     "pendente" = true (aguardando "sleepMs" entre as chamadas);
//  3. Cliente escaneia o QR Code no APP Convcard e aprova;
//  4. Pooling devolve "pendente" = false com o "retorno" da compra;
//  5. PDV imprime o comprovante e confirma/desfaz (igual à compra por cartão).
//
// O loop do pooling fica na tela (telas/dialogo-qrcode.ts) para que o operador
// possa cancelar a espera a qualquer momento.

/** POST /qrcode-pdv/gerar */
export async function gerarQrCode(valor: number, qtdParcelas: number): Promise<QrCodeGerado> {
  await desfazerPendenteAnterior();

  const corpo: SolicitacaoQrCodeModel = { ...base(proximoNst()), valor, qtdParcelas };
  const retorno = await enviar<RetornoQrCodeModel>('POST', '/qrcode-pdv/gerar', corpo);

  // Devolvemos o NST para a tela reutilizá-lo no pooling
  return { ...retorno, nst: corpo.nst };
}

/**
 * POST /qrcode-pdv/solicitacao-compra-qrcode (uma chamada do pooling)
 *
 * Deve ser chamado com o MESMO NST e os MESMOS dados (valor, parcelas) usados
 * no gerarQrCode.
 */
export async function solicitarCompraQrCode(
  nst: number,
  qrcode: string,
  dados: DadosCompra,
): Promise<RetornoSolicitacaoQrCodeModel> {
  const corpo: SolicitacaoCompraQrCodeModel = { ...base(nst), ...dados, qrcode };
  const retorno = await enviar<RetornoSolicitacaoQrCodeModel>(
    'POST',
    '/qrcode-pdv/solicitacao-compra-qrcode',
    corpo,
  );

  if (!retorno.pendente && retorno.retorno) {
    salvarPendente({
      tipo: 'COMPRA_QRCODE',
      comprovante: retorno.retorno.comprovante,
      movimento: {
        ...base(nst),
        qrcode,
        valor: corpo.valor,
        autorizacao: retorno.retorno.autorizacao,
      },
    } satisfies Pendente);
  }

  return retorno;
}

// ---------------------------------------------------------------------------
// Cancelamento de compra
// ---------------------------------------------------------------------------
//
// O cancelamento também é uma transação de duas pernas: solicitação e depois
// confirmação/desfazimento. Para identificar a compra a ser cancelada são
// usados o cartão (ou QR Code), o valor e o número de autorização da compra.

/** DELETE /cancelamento/solicitacao (compra feita com cartão) */
export async function solicitarCancelamento(dados: DadosCancelamentoCartao): Promise<RetornoMovimentoModel> {
  await desfazerPendenteAnterior();

  const corpo: MovimentoModel = { ...base(proximoNst()), ...dados };
  const retorno = await enviar<RetornoMovimentoModel>('DELETE', '/cancelamento/solicitacao', corpo);

  // Na confirmação vai a autorização devolvida pelo cancelamento (não a da compra)
  salvarPendente({
    tipo: 'CANCELAMENTO',
    comprovante: retorno.comprovante,
    movimento: { ...corpo, autorizacao: retorno.autorizacao },
  } satisfies Pendente);

  return retorno;
}

/** DELETE /qrcode-pdv/solicitacao-cancelamento-compra-qrcode (compra feita com QR Code) */
export async function solicitarCancelamentoQrCode(dados: DadosCancelamentoQrCode): Promise<RetornoMovimentoModel> {
  await desfazerPendenteAnterior();

  const corpo: MovimentoQrCodeModel = { ...base(proximoNst()), ...dados };
  const retorno = await enviar<RetornoMovimentoModel>(
    'DELETE',
    '/qrcode-pdv/solicitacao-cancelamento-compra-qrcode',
    corpo,
  );

  salvarPendente({
    tipo: 'CANCELAMENTO_QRCODE',
    comprovante: retorno.comprovante,
    movimento: { ...corpo, autorizacao: retorno.autorizacao },
  } satisfies Pendente);

  return retorno;
}

// ---------------------------------------------------------------------------
// Confirmação / desfazimento
// ---------------------------------------------------------------------------

/**
 * Confirma a transação pendente. Chame depois que a venda (ou o cancelamento)
 * foi concluída com sucesso no PDV: comprovante impresso, cupom emitido etc.
 */
export async function confirmarPendente(): Promise<void> {
  await finalizarPendente('confirmar');
}

/**
 * Desfaz a transação pendente. Chame quando algo falhar depois da aprovação
 * (ex.: erro ao emitir o cupom, operador desistiu da venda).
 */
export async function desfazerPendente(): Promise<void> {
  await finalizarPendente('desfazer');
}

async function finalizarPendente(acao: 'confirmar' | 'desfazer'): Promise<void> {
  const pendente = obterPendente<Pendente>();
  if (!pendente) {
    throw new ConvcardErro('Não há transação pendente.');
  }

  const endpoint = ENDPOINTS_PENDENTE[pendente.tipo][acao];
  if (endpoint) {
    await enviar<void>(endpoint[0], endpoint[1], pendente.movimento);
  } else {
    // Recebimento: sem endpoint de desfazimento. Como a solicitação só é
    // efetivada na confirmação, basta descartar a pendência.
    console.warn(`[CONVCARD] ${pendente.tipo} não possui desfazimento; pendência descartada.`);
  }

  // Só remove depois que o autorizador respondeu com sucesso. Se der erro de
  // rede, a pendência continua salva para nova tentativa.
  removerPendente();

  if (acao === 'confirmar') {
    salvarUltimaTransacao(GRUPO_REIMPRESSAO[pendente.tipo], pendente.comprovante);
  }
}

/**
 * Antes de iniciar uma nova transação, desfaz qualquer transação que ficou
 * pendente (mesma regra usada pelos TEFs de mercado).
 */
async function desfazerPendenteAnterior(): Promise<void> {
  if (!obterPendente()) {
    return;
  }
  try {
    await desfazerPendente();
  } catch (e) {
    throw new ConvcardErro(
      `Existe uma transação anterior pendente que não pôde ser desfeita: ${(e as Error).message}`,
    );
  }
}

/** Chamado ao abrir o PDV: desfaz transação que ficou pendente (ex.: PDV fechou no meio da venda). */
export async function desfazerPendenteAoIniciar(): Promise<void> {
  if (!obterPendente()) {
    return;
  }
  try {
    await desfazerPendente();
    console.info('[CONVCARD] Transação pendente desfeita ao iniciar.');
  } catch (e) {
    // Mantém a pendência; ela será desfeita antes da próxima transação.
    console.error('[CONVCARD] Falha ao desfazer transação pendente:', (e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Consultas adicionais
// ---------------------------------------------------------------------------

/** POST /consulta/saldo-devedor: quanto o portador deve no total (faturas em aberto). */
export function consultarSaldoDevedor(cartao: string): Promise<SaldoDevedorModel> {
  const corpo: ConsultaSaldoModel = { ...base(proximoNst()), cartao };
  return enviar('POST', '/consulta/saldo-devedor', corpo);
}

/** POST /consulta/fatura: devolve a fatura (com a NSU usada no recebimento). */
export function consultarFatura(filtro: FiltroFatura): Promise<FaturaModel> {
  const corpo: ConsultaFaturaModel = { ...base(proximoNst()), ...filtro };
  return enviar('POST', '/consulta/fatura', corpo);
}

/** POST /consulta/fatura-pdf: devolve o PDF da fatura (acesso liberado pela Convcard). */
export function baixarFaturaPdf(filtro: FiltroFatura): Promise<Arquivo> {
  const corpo: ConsultaFaturaModel = { ...base(proximoNst()), ...filtro };
  return requisitarArquivo(obterConfiguracao(), 'POST', '/consulta/fatura-pdf', corpo);
}

/** POST /consulta/consulta-cep: usado para preencher o endereço na atualização cadastral. */
export function consultarCep(cep: string): Promise<CepModel> {
  const corpo: ConsultaCepModel = { ...base(proximoNst()), cep: Number(cep.replace(/\D/g, '')) };
  return enviar('POST', '/consulta/consulta-cep', corpo);
}

// ---------------------------------------------------------------------------
// Recebimento (pagamento de fatura)
// ---------------------------------------------------------------------------
//
//  1. Consulta a fatura (consultarFatura ou consultarSaldo) para obter a NSU
//     da fatura e o valor;
//  2. POST /pagamento/solicitacao-pagamento com a NSU e o valor recebido;
//  3. Imprime o comprovante e confirma (PUT /pagamento/confirmacao-pagamento).
//
// Se o retorno vier com endereco.atualizaEndereco = true, o PDV deve pedir o
// endereço atualizado ao cliente (atualizarEndereco).

/** POST /pagamento/solicitacao-pagamento */
export async function solicitarRecebimento(nsuFatura: number, valor: number): Promise<PagamentoFaturaModel> {
  await desfazerPendenteAnterior();

  const corpo: SolicitacaoPagamentoModel = { ...base(proximoNst()), nsu: nsuFatura, valor };
  const retorno = await enviar<PagamentoFaturaModel>('POST', '/pagamento/solicitacao-pagamento', corpo);

  salvarPendente({
    tipo: 'RECEBIMENTO',
    comprovante: retorno.comprovante,
    movimento: {
      ...base(corpo.nst),
      nsu: nsuFatura,
      valor: retorno.valor ?? valor,
      autorizacao: retorno.autorizacao,
    },
  } satisfies Pendente);

  return retorno;
}

/**
 * POST /pagamento/solicitacao-pagamento-antecipado
 * Recebimento antes do fechamento da fatura: identifica pelo cartão.
 */
export async function solicitarRecebimentoAntecipado(cartao: string, valor: number): Promise<PagamentoFaturaAntecipadaModel> {
  await desfazerPendenteAnterior();

  const corpo: SolicitacaoPagamentoAntecipadoModel = { ...base(proximoNst()), cartao, valor };
  const retorno = await enviar<PagamentoFaturaAntecipadaModel>('POST', '/pagamento/solicitacao-pagamento-antecipado', corpo);

  salvarPendente({
    tipo: 'RECEBIMENTO_ANTECIPADO',
    comprovante: retorno.comprovante,
    movimento: {
      ...base(corpo.nst),
      cartao,
      valor: retorno.valor ?? valor,
      autorizacao: retorno.autorizacao,
    },
  } satisfies Pendente);

  return retorno;
}

// ---------------------------------------------------------------------------
// Endereço
// ---------------------------------------------------------------------------

/** PUT /endereco/atualizacao */
export function atualizarEndereco(dados: DadosEndereco): Promise<void> {
  const corpo: AtualizacaoEnderecoModel = {
    ...base(proximoNst()),
    ...dados,
    cep: Number(dados.cep.replace(/\D/g, '')),
  };
  return enviar('PUT', '/endereco/atualizacao', corpo);
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

/** POST /token/cadastrar: troca cartão + CVV por um token reutilizável. */
export function cadastrarToken(cartao: string, cvv: string): Promise<TokenModel> {
  const corpo: CadastrarTokenModel = { ...base(proximoNst()), cartao, cvv };
  return enviar('POST', '/token/cadastrar', corpo);
}

/** Comprovante da última venda/cancelamento/recebimento confirmado (reimpressão). */
export { obterUltimaTransacao } from '../armazenamento';
