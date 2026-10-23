/**
 * Modelos (payloads JSON) do Autorizador Convcard.
 *
 * Os nomes e campos abaixo são os mesmos do swagger oficial:
 *   https://aut-h.convcard.com.br/autorizador/swagger-ui/index.html
 *
 * Só estão aqui os modelos dos endpoints usados neste exemplo. Para os demais
 * (pagamento de fatura, consulta de CEP, token, etc.) consulte o swagger.
 */

/**
 * Campos obrigatórios em TODA requisição ao autorizador.
 *
 * - nst: Número Sequencial da Transação (1 a 9999999999), gerado pelo PDV.
 *   IMPORTANTE: o mesmo NST deve ser usado em todas as "pernas" da mesma
 *   operação. Ex.: solicitação de compra (NST 10) -> confirmação (NST 10).
 *   No QR Code: gerar (NST 11) -> pooling (NST 11) -> confirmação (NST 11).
 * - nomeSoftware / versaoSoftware: identificação do seu PDV (a Convcard usa
 *   isso para rastrear de qual software veio a transação).
 * - identificadorLoja: token da loja (UUID) fornecido pela Convcard, ex.:
 *   "01c760b2-a9db-429c-ad60-d926f49878cd".
 */
export interface BaseModel {
  nst: number;
  nomeSoftware: string;
  versaoSoftware: string;
  identificadorLoja: string;
}

/**
 * Tipo do produto: E=Ético, G=Genérico, S=Similar, M=Manipulado (classificação
 * de medicamentos) e O=Outros. Para itens que não são medicamentos, use "O".
 */
export type TipoProduto = 'E' | 'G' | 'S' | 'M' | 'O';

/** Item da venda. Enviado na compra para a Convcard aplicar regras por produto. */
export interface ProdutoModel {
  /** EAN13 */
  codigoBarras: number;
  descricao: string;
  quantidade: number;
  /** Valor total do item (quantidade x valorUnitarioLiquido) */
  valor: number;
  tipo: TipoProduto;
  valorUnitario: number;
  percentualDesconto: number;
  valorDesconto: number;
  valorUnitarioLiquido: number;
}

/** Dados da venda que são comuns à compra por cartão e à compra por QR Code. */
export interface DadosCompra {
  qtdParcelas: number;
  valor: number;
  /** Número do cupom fiscal / NF-e da venda */
  numeroNota?: number;
  /** Compra com receita médica. Se true, dataReceita, numeroCrm e ufMedico são obrigatórios. */
  receita?: boolean;
  /** ISO 8601 com fuso (ex.: 2023-12-29T00:00:00-03:00) */
  dataReceita?: string;
  numeroCrm?: string;
  ufMedico?: string;
  produtos?: ProdutoModel[];
}

/** POST /compra/solicitacao */
export interface SolicitacaoCompraModel extends BaseModel, DadosCompra {
  /** Número do cartão (digitado) ou token do cartão */
  cartao: string;
  /** CVV do cartão. Não é necessário quando "cartao" for um token. */
  cvv?: string;
  /** Senha do cartão. Não é necessária quando "cartao" for um token. */
  senha?: string;
}

/**
 * Usado na confirmação, desfazimento e cancelamento de compras feitas com
 * cartão. PUT /compra/confirmacao, DELETE /compra/desfazimento,
 * DELETE /cancelamento/solicitacao|confirmacao|desfazimento
 */
export interface MovimentoModel extends BaseModel {
  cartao: string;
  cvv?: string;
  valor: number;
  /** Número de autorização devolvido na solicitação */
  autorizacao: number;
}

/** POST /qrcode-pdv/gerar */
export interface SolicitacaoQrCodeModel extends BaseModel {
  qtdParcelas: number;
  valor: number;
}

/** POST /qrcode-pdv/solicitacao-compra-qrcode */
export interface SolicitacaoCompraQrCodeModel extends BaseModel, DadosCompra {
  /** Conteúdo do QR Code devolvido no /qrcode-pdv/gerar */
  qrcode: string;
}

/**
 * Equivalente ao MovimentoModel para compras feitas via QR Code
 * (identifica a compra pelo qrcode em vez do cartão).
 */
export interface MovimentoQrCodeModel extends BaseModel {
  qrcode: string;
  valor: number;
  autorizacao: number;
}

/** POST /consulta/saldo */
export interface ConsultaSaldoModel extends BaseModel {
  cartao: string;
}

/** POST /validacao/validar-configuracao (só os campos base) */
export type ValidarConfiguracaoModel = BaseModel;

// ---------------------------------------------------------------------------
// Retornos
// ---------------------------------------------------------------------------

export interface EnderecoModel {
  /** Quando true, a Convcard pede que o endereço do portador seja atualizado (PUT /endereco/atualizacao) */
  atualizaEndereco?: boolean;
  cep?: string;
  endereco?: string;
  complemento?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
}

/** Retorno de solicitação de compra e de cancelamento. */
export interface RetornoMovimentoModel {
  /** Cartão mascarado */
  cartao?: string;
  usuario?: string;
  saldo?: number;
  valor?: number;
  /** Guarde este número: ele é necessário para confirmar, desfazer e cancelar. */
  autorizacao: number;
  /** ISO 8601 */
  data?: string;
  nsu?: number;
  /** Comprovante a ser impresso. As linhas vêm separadas por '@'. */
  comprovante?: string;
  endereco?: EnderecoModel;
  bin?: string;
  rede?: string;
  bandeira?: string;
  /** MM/yyyy */
  mesAnoRefer?: string;
  /** Mensagem para ser exibida ao operador do caixa */
  mensagemLoja?: string;
}

/** Retorno do POST /qrcode-pdv/gerar */
export interface RetornoQrCodeModel {
  nsu?: number;
  /** Conteúdo a ser exibido como QR Code para o cliente escanear no APP */
  qrcode: string;
  /** ISO 8601. Após essa data o QR Code não pode mais ser usado. */
  expiracao: string;
  /** Tempo (ms) que o PDV deve aguardar antes de iniciar o pooling */
  sleepMs?: number;
}

/** Retorno do POST /qrcode-pdv/solicitacao-compra-qrcode */
export interface RetornoSolicitacaoQrCodeModel {
  /** true = o cliente ainda não vinculou o QR Code no APP. Continue o pooling. */
  pendente: boolean;
  /** Tempo (ms) que o PDV deve aguardar antes de chamar o pooling novamente */
  sleepMs?: number;
  /** Preenchido quando a compra foi aprovada (pendente = false) */
  retorno?: RetornoMovimentoModel;
}

export interface FaturaModel {
  numero?: number;
  valor?: number;
  valorMinimo?: number;
  vencimento?: string;
  nsu?: number;
  status?: 'PAGO' | 'ABERTO';
}

/** Retorno do POST /consulta/saldo */
export interface SaldoModel {
  cartao?: string;
  usuario?: string;
  /** Ex.: "000 - APROVADO" */
  situacao?: string;
  saldo?: number;
  limite?: number;
  compras?: number;
  comprovante?: string;
  fatura?: FaturaModel;
}

/** Retorno do POST /validacao/validar-configuracao */
export interface ValidarConfiguracaoOutputModel {
  mensagem?: string;
}

/**
 * Corpo devolvido pelo autorizador quando o status HTTP não é 2xx
 * (400, 401, 500...). "message" é o texto a ser mostrado ao operador.
 */
export interface ErrorModel {
  timestamp?: string;
  status?: number;
  error?: string;
  message?: string;
  path?: string;
  /** Código do erro na Convcard (ex.: "H500") */
  code?: string;
  /** NSU da transação negada, quando houver */
  nsu?: number;
}

// ---------------------------------------------------------------------------
// Consultas adicionais (tag "2. Consulta")
// ---------------------------------------------------------------------------

/** Retorno do POST /consulta/saldo-devedor (corpo da requisição = ConsultaSaldoModel) */
export interface SaldoDevedorModel {
  saldo?: number;
}

/**
 * POST /consulta/fatura e POST /consulta/fatura-pdf
 * Informe UM dos filtros: cartao, cpf, numeroFatura ou nsuFatura.
 */
export interface ConsultaFaturaModel extends BaseModel {
  cartao?: string;
  cpf?: string;
  numeroFatura?: number;
  nsuFatura?: number;
}

/** POST /consulta/consulta-cep */
export interface ConsultaCepModel extends BaseModel {
  /** Somente números */
  cep: number;
}

export interface CepModel {
  cep?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
}

// ---------------------------------------------------------------------------
// Pagamento de fatura / recebimento (tag "6. Pagamento")
// ---------------------------------------------------------------------------
// A loja recebe do portador do cartão o valor da fatura (ou um valor
// antecipado) e repassa para a Convcard. Também é transação de duas pernas:
// solicitação + confirmação. Não há endpoint de desfazimento: um pagamento
// solicitado e não confirmado não é efetivado.

/** POST /pagamento/solicitacao-pagamento (pagamento de fatura fechada) */
export interface SolicitacaoPagamentoModel extends BaseModel {
  /** NSU da fatura (obtida no /consulta/fatura ou /consulta/saldo) */
  nsu: number;
  valor: number;
}

export interface PagamentoFaturaModel {
  /** Número da fatura */
  numero?: number;
  cartao?: string;
  usuario?: string;
  saldo?: number;
  valor?: number;
  autorizacao: number;
  endereco?: EnderecoModel;
  comprovante?: string;
}

/** PUT /pagamento/confirmacao-pagamento */
export interface ConfirmacaoPagamentoModel extends BaseModel {
  /** NSU da fatura */
  nsu: number;
  valor: number;
  autorizacao: number;
}

/** POST /pagamento/solicitacao-pagamento-antecipado (pagamento antes do fechamento da fatura) */
export interface SolicitacaoPagamentoAntecipadoModel extends BaseModel {
  cartao: string;
  valor: number;
}

export interface PagamentoFaturaAntecipadaModel {
  cartao?: string;
  usuario?: string;
  saldo?: number;
  valor?: number;
  autorizacao: number;
  endereco?: EnderecoModel;
  comprovante?: string;
}

/** PUT /pagamento/confirmacao-pagamento-antecipado */
export interface ConfirmacaoPagamentoAntecipadoModel extends BaseModel {
  cartao: string;
  valor: number;
  autorizacao: number;
}

// ---------------------------------------------------------------------------
// Endereço (tag "7. Endereço")
// ---------------------------------------------------------------------------

/**
 * PUT /endereco/atualizacao
 * Chamado quando um retorno vem com endereco.atualizaEndereco = true:
 * o PDV pede ao cliente o endereço atualizado e envia aqui.
 */
export interface AtualizacaoEnderecoModel extends BaseModel {
  cartao: string;
  /** Somente números */
  cep: number;
  endereco: string;
  complemento?: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
}

// ---------------------------------------------------------------------------
// Token (tag "8. Token")
// ---------------------------------------------------------------------------

/**
 * POST /token/cadastrar
 * Troca cartão + CVV por um token (UUID). O token pode ser usado no lugar do
 * número do cartão nas compras/consultas, sem precisar de CVV e senha.
 * Não está disponível para todos os integradores (consulte a Convcard).
 */
export interface CadastrarTokenModel extends BaseModel {
  cartao: string;
  cvv: string;
}

export interface TokenModel {
  cartao?: string;
  token?: string;
}

/** Arquivo binário (ex.: PDF da fatura) */
export interface ArquivoModel {
  nome: string;
  contentType: string;
  /** Conteúdo em base64 (para atravessar o IPC) */
  base64: string;
}
