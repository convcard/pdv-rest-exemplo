/**
 * Cliente HTTP do Autorizador Convcard.
 *
 * Pontos importantes da comunicação:
 *  1. Autenticação por certificado de cliente (mTLS): a Convcard fornece o
 *     certificado (.crt) e a chave privada (.key), em formato PEM. Os dois são
 *     usados no handshake TLS; não existe header de token/Authorization.
 *  2. Corpo sempre em JSON (Content-Type e Accept: application/json),
 *     inclusive nos métodos PUT e DELETE.
 *  3. Sucesso = HTTP 2xx. Alguns endpoints (confirmação/desfazimento) devolvem
 *     200 sem corpo.
 *  4. Erro = HTTP 4xx/5xx com corpo no formato ErrorModel; o campo "message"
 *     é a mensagem para o operador.
 */
import https from 'node:https';
import fs from 'node:fs';
import type { Configuracao, LogIntegracao } from '../../shared/ipc';
import type { ErrorModel } from '../../shared/modelos';

/**
 * URL do ambiente de homologação (a mesma da descrição do swagger).
 * Este exemplo usa somente homologação. A credencial de produção só é
 * enviada pela Convcard depois que a homologação é aprovada.
 */
const URL_HOMOLOGACAO = 'https://aut-h.convcard.com.br/autorizador';

/**
 * Tempo máximo de espera pela resposta. O pooling do QR Code
 * (/qrcode-pdv/solicitacao-compra-qrcode) é um "long pooling": o servidor
 * segura a requisição por alguns segundos antes de responder, por isso o
 * timeout não pode ser curto (usamos 1 minuto).
 */
const TIMEOUT_MS = 60_000;

export class ConvcardErro extends Error {
  constructor(
    mensagem: string,
    readonly status = 0,
    readonly codigo?: string,
    readonly nsu?: number,
  ) {
    super(mensagem);
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';

let registrarLog: (log: LogIntegracao) => void = () => undefined;

/** Permite ao main.ts repassar cada requisição para o painel de log da tela. */
export function aoRegistrarLog(callback: (log: LogIntegracao) => void): void {
  registrarLog = callback;
}

/** Resposta binária (usada no PDF da fatura). */
export interface Arquivo {
  bytes: Buffer;
  nome: string;
  contentType: string;
}

/**
 * Envia uma requisição ao autorizador e devolve o JSON da resposta
 * (ou undefined quando a resposta vem sem corpo).
 */
export function requisitar<T>(
  config: Configuracao,
  metodo: Metodo,
  caminho: string,
  corpo: unknown,
): Promise<T> {
  return executar(config, metodo, caminho, corpo, false) as Promise<T>;
}

/**
 * Igual ao requisitar, mas para endpoints que devolvem arquivo
 * (POST /consulta/fatura-pdf). O nome do arquivo vem no header
 * Content-Disposition.
 */
export function requisitarArquivo(
  config: Configuracao,
  metodo: Metodo,
  caminho: string,
  corpo: unknown,
): Promise<Arquivo> {
  return executar(config, metodo, caminho, corpo, true) as Promise<Arquivo>;
}

function executar(
  config: Configuracao,
  metodo: Metodo,
  caminho: string,
  corpo: unknown,
  binario: boolean,
): Promise<unknown> {
  if (!config.caminhoCertificado || !config.caminhoChave) {
    return Promise.reject(
      new ConvcardErro('Certificado (.crt) e chave (.key) da Convcard não configurados.'),
    );
  }

  let cert: Buffer;
  let key: Buffer;
  try {
    cert = fs.readFileSync(config.caminhoCertificado);
  } catch (e) {
    return Promise.reject(new ConvcardErro(`Não foi possível ler o certificado (.crt): ${(e as Error).message}`));
  }
  try {
    key = fs.readFileSync(config.caminhoChave);
  } catch (e) {
    return Promise.reject(new ConvcardErro(`Não foi possível ler a chave (.key): ${(e as Error).message}`));
  }

  const url = URL_HOMOLOGACAO + caminho;
  const json = JSON.stringify(corpo);
  const inicio = Date.now();
  const log: LogIntegracao = {
    data: new Date().toISOString(),
    metodo,
    url,
    requisicao: mascararDadosSensiveis(corpo),
  };

  return new Promise<unknown>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: metodo,
        // Certificado do cliente (mTLS): certificado (.crt) + chave privada (.key) em PEM
        cert,
        key,
        headers: {
          'Content-Type': 'application/json',
          Accept: binario ? 'application/pdf, application/json' : 'application/json',
          'Content-Length': Buffer.byteLength(json),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on('data', (parte: Buffer) => partes.push(parte));
        res.on('end', () => {
          const bytes = Buffer.concat(partes);
          const status = res.statusCode ?? 0;
          const sucesso = status >= 200 && status < 300;

          if (binario && sucesso) {
            const arquivo: Arquivo = {
              bytes,
              nome: extrairNomeArquivo(res.headers['content-disposition']),
              contentType: res.headers['content-type'] ?? 'application/octet-stream',
            };
            registrarLog({
              ...log,
              status,
              resposta: `<arquivo ${arquivo.nome} - ${bytes.length} bytes>`,
              duracaoMs: Date.now() - inicio,
            });
            resolve(arquivo);
            return;
          }

          const texto = bytes.toString('utf-8');
          const resposta = lerJson(texto);
          registrarLog({
            ...log,
            status,
            resposta: mascararDadosSensiveis(resposta),
            duracaoMs: Date.now() - inicio,
          });

          if (sucesso) {
            resolve(resposta);
          } else {
            reject(montarErro(status, resposta, texto));
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(
        new ConvcardErro('Tempo de resposta da Convcard esgotado.'),
      );
    });

    req.on('error', (e: NodeJS.ErrnoException) => {
      const erro = traduzirErroDeRede(e);
      registrarLog({ ...log, erro: erro.message, duracaoMs: Date.now() - inicio });
      reject(erro);
    });

    req.end(json);
  }).catch((e: NodeJS.ErrnoException) => {
    // Erros lançados de forma síncrona pelo https.request (ex.: chave que não
    // corresponde ao certificado) não passam pelo req.on('error'); traduzimos
    // aqui também.
    throw traduzirErroDeRede(e);
  });
}

/** Content-Disposition: attachment; filename="fatura-123.pdf" */
function extrairNomeArquivo(disposition?: string): string {
  const nome = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  return nome ? decodeURIComponent(nome) : `fatura-${Date.now()}.pdf`;
}

function lerJson(texto: string): unknown {
  if (!texto.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

/** Converte a resposta de erro (ErrorModel) em ConvcardErro. */
function montarErro(status: number, resposta: unknown, texto: string): ConvcardErro {
  const erro = (typeof resposta === 'object' ? resposta : {}) as ErrorModel;

  // Certificado recusado: o proxy (nginx) responde 400 em HTML com
  // "SSL certificate error". 401 também indica problema de autenticação.
  // Causas comuns: certificado de produção, expirado ou revogado.
  if ((status === 401 && !erro.message) || /SSL certificate/i.test(texto)) {
    return new ConvcardErro(
      'Falha de autenticação com a Convcard. Verifique o certificado configurado.',
      status,
    );
  }

  const mensagem =
    erro.message || erro.error || `Erro HTTP ${status} na comunicação com a Convcard.`;
  return new ConvcardErro(mensagem, status, erro.code, erro.nsu);
}

/** Mensagens amigáveis para os erros mais comuns de rede/certificado. */
function traduzirErroDeRede(e: NodeJS.ErrnoException): ConvcardErro {
  if (e instanceof ConvcardErro) {
    return e;
  }
  if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET') {
    return new ConvcardErro(
      `Erro de conectividade: sem acesso à Convcard. Verifique a conexão de rede. (${e.code})`,
    );
  }
  // Erros ao carregar o certificado/chave (mensagens do OpenSSL)
  if (/key values mismatch/i.test(e.message)) {
    return new ConvcardErro('A chave (.key) não corresponde ao certificado (.crt).');
  }
  if (/bad decrypt|interrupted or cancelled|bad password/i.test(e.message)) {
    return new ConvcardErro('A chave (.key) está protegida por senha. Use a chave sem senha fornecida pela Convcard.');
  }
  if (/no start line|PEM routines|unsupported|ASN1|DECODER/i.test(e.message)) {
    return new ConvcardErro('Certificado (.crt) ou chave (.key) inválidos. Use os arquivos PEM fornecidos pela Convcard.');
  }
  return new ConvcardErro(`Erro inesperado na integração com a Convcard: ${e.message}`);
}

/** Evita que número do cartão, CVV e senha apareçam por completo no log. */
function mascararDadosSensiveis(valor: unknown): unknown {
  if (!valor || typeof valor !== 'object') {
    return valor;
  }
  const copia: Record<string, unknown> = { ...(valor as Record<string, unknown>) };
  if (typeof copia.cartao === 'string' && copia.cartao.length > 8) {
    copia.cartao = copia.cartao.slice(0, 4) + '*'.repeat(copia.cartao.length - 8) + copia.cartao.slice(-4);
  }
  if (copia.cvv) copia.cvv = '***';
  if (copia.senha) copia.senha = '****';
  return copia;
}
