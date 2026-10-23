/**
 * Tipos compartilhados entre o processo "main" (Node.js, onde fica a
 * integração com a Convcard) e o "renderer" (as telas).
 *
 * Por que a integração fica no main e não na tela?
 *  - A comunicação com o autorizador usa certificado digital (.crt + .key) e a chave
 *    dele. Isso não deve ficar exposto no renderer (que é uma página web).
 *  - O main tem acesso a disco (config, NST, transação pendente) e ao módulo
 *    https do Node, necessário para enviar o certificado do cliente (mTLS).
 *
 * A tela conversa com o main através da API exposta no preload.ts
 * (window.convcard), cujo contrato é a interface ConvcardApi abaixo.
 */
import type {
  CepModel,
  DadosCompra,
  FaturaModel,
  PagamentoFaturaAntecipadaModel,
  PagamentoFaturaModel,
  RetornoMovimentoModel,
  RetornoQrCodeModel,
  RetornoSolicitacaoQrCodeModel,
  SaldoDevedorModel,
  SaldoModel,
  TokenModel,
  ValidarConfiguracaoOutputModel,
} from './modelos';

/**
 * Configuração da integração, salva pelo main no banco SQLite (tabela configuracao).
 */
export interface Configuracao {
  /** Caminho do certificado (.crt, PEM) fornecido pela Convcard */
  caminhoCertificado: string;
  /** Caminho da chave privada (.key, PEM "BEGIN RSA PRIVATE KEY", sem senha) fornecida pela Convcard */
  caminhoChave: string;
  /** Token da loja fornecido pela Convcard (enviado como identificadorLoja) */
  identificadorLoja: string;
  /** Exibido no rodapé das telas */
  nomeLoja: string;
  /** Exibe os campos de receita médica na venda (opcional; só para quem vende com receita) */
  usaReceita: boolean;
  /** Envia o número do cupom/nota na venda */
  usaNumNota: boolean;
  nomeSoftware: string;
  versaoSoftware: string;
}

/** Erro da integração já tratado, pronto para ser exibido ao operador. */
export interface ErroConvcard {
  mensagem: string;
  /** Código de erro da Convcard (campo "code" do ErrorModel) */
  codigo?: string;
  /** NSU devolvida junto com o erro, quando houver */
  nsu?: number;
  /** Status HTTP (0 quando nem chegou a ter resposta, ex.: sem internet) */
  status?: number;
}

/**
 * Envelope de resposta do IPC. Usamos isso em vez de lançar exceção no main
 * porque o Electron só repassa a "message" do Error para o renderer, e assim
 * conseguimos devolver também o código e a NSU do erro.
 */
export type ResultadoIpc<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: ErroConvcard };

/** Dados digitados na tela de venda por cartão */
export interface DadosCompraCartao extends DadosCompra {
  /** Número do cartão (ou token) */
  cartao: string;
  cvv?: string;
  senha?: string;
}

export interface DadosCancelamentoCartao {
  cartao: string;
  cvv?: string;
  valor: number;
  autorizacao: number;
}

/** Endereço digitado na atualização cadastral. CEP pode vir com máscara. */
export interface DadosEndereco {
  cartao: string;
  cep: string;
  endereco: string;
  complemento?: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
}

/** Filtros da consulta de fatura: informe apenas um deles. */
export interface FiltroFatura {
  cartao?: string;
  cpf?: string;
  numeroFatura?: number;
  nsuFatura?: number;
}

/** Retorno do gerarQrCode junto com o NST, que deve ser reutilizado no pooling. */
export interface QrCodeGerado extends RetornoQrCodeModel {
  nst: number;
}

export type TipoReimpressao = 'VENDA' | 'CANCELAMENTO' | 'RECEBIMENTO';

export interface UltimaTransacao {
  data: string;
  comprovante?: string;
}

/** Registro de uma requisição feita ao autorizador, exibido no painel de log da tela. */
export interface LogIntegracao {
  data: string;
  metodo: string;
  url: string;
  requisicao?: unknown;
  status?: number;
  resposta?: unknown;
  erro?: string;
  duracaoMs?: number;
}

/**
 * API disponível na tela como window.convcard.
 * Cada função corresponde a uma função de src/electron/convcard/servico.ts (veja lá
 * qual endpoint é chamado e as regras de cada uma).
 */
export interface ConvcardApi {
  // Configuração / utilidades do PDV
  obterConfiguracao(): Promise<Configuracao>;
  salvarConfiguracao(config: Configuracao): Promise<void>;
  /** Abre a janela de seleção do arquivo .crt */
  selecionarCertificado(): Promise<string | undefined>;
  /** Abre a janela de seleção do arquivo .key */
  selecionarChave(): Promise<string | undefined>;
  /** Baixa o PDF da fatura, salva em Downloads e abre. Devolve o caminho salvo. */
  emitirFatura(filtro: FiltroFatura): Promise<string>;
  obterUltimaTransacao(tipo: TipoReimpressao): Promise<UltimaTransacao | undefined>;

  // Validação e consultas
  validarConfiguracao(): Promise<ValidarConfiguracaoOutputModel>;
  consultarSaldo(cartao: string): Promise<SaldoModel>;
  consultarSaldoDevedor(cartao: string): Promise<SaldoDevedorModel>;
  consultarFatura(filtro: FiltroFatura): Promise<FaturaModel>;
  consultarCep(cep: string): Promise<CepModel>;

  // Compra
  solicitarCompra(dados: DadosCompraCartao): Promise<RetornoMovimentoModel>;
  gerarQrCode(valor: number, qtdParcelas: number): Promise<QrCodeGerado>;
  solicitarCompraQrCode(nst: number, qrcode: string, dados: DadosCompra): Promise<RetornoSolicitacaoQrCodeModel>;

  // Cancelamento
  solicitarCancelamento(dados: DadosCancelamentoCartao): Promise<RetornoMovimentoModel>;

  // Recebimento
  solicitarRecebimento(nsuFatura: number, valor: number): Promise<PagamentoFaturaModel>;
  solicitarRecebimentoAntecipado(cartao: string, valor: number): Promise<PagamentoFaturaAntecipadaModel>;

  // Confirmação / desfazimento da transação pendente
  confirmarPendente(): Promise<void>;
  desfazerPendente(): Promise<void>;

  // Outros
  atualizarEndereco(dados: DadosEndereco): Promise<void>;
  cadastrarToken(cartao: string, cvv: string): Promise<TokenModel>;

  /** Recebe cada requisição feita ao autorizador (para o painel de log) */
  aoRegistrarLog(callback: (log: LogIntegracao) => void): void;
}

/** Nome das operações que atravessam o IPC (canal = "convcard:<nome>"). */
export const OPERACOES = [
  'obterConfiguracao',
  'salvarConfiguracao',
  'selecionarCertificado',
  'selecionarChave',
  'emitirFatura',
  'obterUltimaTransacao',
  'validarConfiguracao',
  'consultarSaldo',
  'consultarSaldoDevedor',
  'consultarFatura',
  'consultarCep',
  'solicitarCompra',
  'gerarQrCode',
  'solicitarCompraQrCode',
  'solicitarCancelamento',
  'solicitarRecebimento',
  'solicitarRecebimentoAntecipado',
  'confirmarPendente',
  'desfazerPendente',
  'atualizarEndereco',
  'cadastrarToken',
] as const satisfies readonly Exclude<keyof ConvcardApi, 'aoRegistrarLog'>[];

export type Operacao = (typeof OPERACOES)[number];

export const canal = (operacao: Operacao) => `convcard:${operacao}`;
export const CANAL_LOG = 'convcard:log';
