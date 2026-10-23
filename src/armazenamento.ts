/**
 * Persistência simples em arquivos JSON na pasta de dados do app
 * (no Windows: %APPDATA%/PDV Convcard Exemplo).
 *
 * Num PDV real isso normalmente fica no banco de dados. Aqui guardamos:
 *  - config.json:   configuração da integração
 *  - nst.json:      último NST gerado
 *  - pendente.json: transação aprovada que ainda não foi confirmada/desfeita
 *  - ultimas.json:  comprovante da última venda/cancelamento/recebimento
 *                   (para a "Reimpressão do último movimento")
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Configuracao, TipoReimpressao, UltimaTransacao } from './shared/ipc';

function arquivo(nome: string): string {
  return path.join(app.getPath('userData'), nome);
}

function ler<T>(nome: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(arquivo(nome), 'utf-8')) as T;
  } catch {
    return undefined;
  }
}

function gravar(nome: string, valor: unknown): void {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(arquivo(nome), JSON.stringify(valor, null, 2), 'utf-8');
}

function remover(nome: string): void {
  fs.rmSync(arquivo(nome), { force: true });
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const CONFIG_PADRAO: Configuracao = {
  caminhoCertificado: '',
  senhaCertificado: '',
  identificadorLoja: '',
  nomeLoja: 'FARMÁCIA EXEMPLO',
  usaReceita: false,
  usaNumNota: false,
  nomeSoftware: 'PDV Convcard Exemplo',
  versaoSoftware: app.getVersion(),
};

// Atenção: a senha do certificado fica em texto puro aqui por simplicidade.
// Em produção, proteja-a (ex.: safeStorage do Electron ou cofre do sistema).
export function obterConfiguracao(): Configuracao {
  return { ...CONFIG_PADRAO, ...ler<Partial<Configuracao>>('config.json') };
}

export function salvarConfiguracao(config: Configuracao): void {
  gravar('config.json', config);
}

// ---------------------------------------------------------------------------
// NST - Número Sequencial da Transação
// ---------------------------------------------------------------------------

const NST_MAXIMO = 9999999999;

/**
 * Gera o próximo NST. O autorizador aceita de 1 a 9999999999, então ao chegar
 * no máximo voltamos para 1.
 *
 * Cada nova operação (compra, cancelamento, consulta...) recebe um NST novo.
 * As "pernas" seguintes da mesma operação (confirmação, desfazimento,
 * pooling do QR Code) reutilizam o NST da solicitação.
 */
export function proximoNst(): number {
  const atual = ler<{ nst: number }>('nst.json')?.nst ?? 0;
  const proximo = atual >= NST_MAXIMO ? 1 : atual + 1;
  gravar('nst.json', { nst: proximo });
  return proximo;
}

// ---------------------------------------------------------------------------
// Transação pendente
// ---------------------------------------------------------------------------

/**
 * Guardamos em disco a transação aprovada ANTES de devolvê-la para a tela.
 * Se o PDV fechar/travar antes de confirmar, na próxima abertura ela é
 * desfeita (ver desfazerPendenteAoIniciar em servico.ts). Isso evita cobrar
 * o cliente por uma venda que não foi concluída no caixa.
 */
export function obterPendente<T>(): T | undefined {
  return ler<T>('pendente.json');
}

export function salvarPendente(pendente: unknown): void {
  gravar('pendente.json', pendente);
}

export function removerPendente(): void {
  remover('pendente.json');
}

// ---------------------------------------------------------------------------
// Últimas transações (reimpressão)
// ---------------------------------------------------------------------------

type Ultimas = Partial<Record<TipoReimpressao, UltimaTransacao>>;

export function salvarUltimaTransacao(tipo: TipoReimpressao, comprovante?: string): void {
  const ultimas = ler<Ultimas>('ultimas.json') ?? {};
  ultimas[tipo] = { data: new Date().toISOString(), comprovante };
  gravar('ultimas.json', ultimas);
}

export function obterUltimaTransacao(tipo: TipoReimpressao): UltimaTransacao | undefined {
  return ler<Ultimas>('ultimas.json')?.[tipo];
}
