/**
 * Persistência local em SQLite (módulo node:sqlite, embutido no Node do
 * Electron: não precisa instalar nem compilar dependência nativa, funciona
 * igual no Windows e no Linux).
 *
 * Banco: pdv-convcard.db na pasta de dados do app
 * (Windows: %APPDATA%\PDV Convcard Exemplo; Linux: ~/.config/PDV Convcard Exemplo).
 *
 * Tabelas:
 *  - configuracao:        configuração da integração (uma linha)
 *  - sequencia_nst:       último NST gerado (uma linha)
 *  - transacao_pendente:  transação aprovada que ainda não foi confirmada/desfeita
 *  - ultima_transacao:    comprovante da última venda/cancelamento/recebimento
 *                         (para a "Reimpressão do último movimento")
 *
 * Número do cartão, CVV e QR Code não são gravados no banco. A única exceção é
 * a transacao_pendente: ela precisa do movimento completo para desfazer a
 * transação se o PDV morrer antes da confirmação. O registro inteiro é gravado
 * CRIPTOGRAFADO (cripto.ts) e é apagado assim que a transação é confirmada ou
 * desfeita.
 *
 * Conexão: uma única conexão, aberta no primeiro uso e fechada ao sair do app
 * (fecharBanco). É o uso recomendado do SQLite num processo só: cada comando
 * já é gravado em disco ao terminar (autocommit), então uma queda do PDV não
 * perde o que foi gravado, e não há custo de reabrir o arquivo a cada operação.
 */
import { app } from 'electron';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Configuracao, TipoReimpressao, UltimaTransacao } from '../shared/ipc';
import { criptografar, descriptografar } from './cripto';

let banco: DatabaseSync | undefined;

/** Abre (e cria, na primeira vez) o banco e as tabelas. */
function db(): DatabaseSync {
  if (!banco) {
    const arquivo = path.join(app.getPath('userData'), 'pdv-convcard.db');
    banco = new DatabaseSync(arquivo);
    banco.exec(`
      -- Sobrescreve com zeros o conteúdo apagado, para que uma pendência
      -- removida não continue legível nas páginas livres do arquivo.
      PRAGMA secure_delete = ON;

      CREATE TABLE IF NOT EXISTS configuracao (
        id                  INTEGER PRIMARY KEY CHECK (id = 1),
        identificador_loja  TEXT    NOT NULL,
        nome_loja           TEXT    NOT NULL,
        usa_receita         INTEGER NOT NULL,
        usa_num_nota        INTEGER NOT NULL,
        caminho_certificado TEXT    NOT NULL, -- arquivo .crt
        caminho_chave       TEXT    NOT NULL, -- arquivo .key
        nome_software       TEXT    NOT NULL,
        versao_software     TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sequencia_nst (
        id     INTEGER PRIMARY KEY CHECK (id = 1),
        ultimo INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transacao_pendente (
        id    INTEGER PRIMARY KEY CHECK (id = 1),
        dados BLOB    NOT NULL -- JSON do RegistroPendente, criptografado
      );

      CREATE TABLE IF NOT EXISTS ultima_transacao (
        tipo        TEXT PRIMARY KEY, -- VENDA, CANCELAMENTO ou RECEBIMENTO
        data        TEXT NOT NULL,
        comprovante TEXT
      );
    `);
    console.info(`[BANCO] Aberto: ${arquivo}`);
  }
  return banco;
}

/** Chamado pelo main ao encerrar o app. */
export function fecharBanco(): void {
  if (banco) {
    banco.close();
    banco = undefined;
    console.info('[BANCO] Fechado');
  }
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const CONFIG_PADRAO: Configuracao = {
  caminhoCertificado: '',
  caminhoChave: '',
  identificadorLoja: '',
  nomeLoja: 'LOJA EXEMPLO',
  usaReceita: false,
  usaNumNota: false,
  nomeSoftware: 'PDV Convcard Exemplo',
  versaoSoftware: app.getVersion(),
};

interface LinhaConfiguracao {
  identificador_loja: string;
  nome_loja: string;
  usa_receita: number;
  usa_num_nota: number;
  caminho_certificado: string;
  caminho_chave: string;
  nome_software: string;
  versao_software: string;
}

export function obterConfiguracao(): Configuracao {
  const linha = db().prepare('SELECT * FROM configuracao WHERE id = 1').get() as LinhaConfiguracao | undefined;
  if (!linha) return { ...CONFIG_PADRAO };
  return {
    identificadorLoja: linha.identificador_loja,
    nomeLoja: linha.nome_loja,
    usaReceita: linha.usa_receita === 1,
    usaNumNota: linha.usa_num_nota === 1,
    caminhoCertificado: linha.caminho_certificado,
    caminhoChave: linha.caminho_chave,
    nomeSoftware: linha.nome_software,
    versaoSoftware: linha.versao_software,
  };
}

export function salvarConfiguracao(config: Configuracao): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO configuracao
         (id, identificador_loja, nome_loja, usa_receita, usa_num_nota,
          caminho_certificado, caminho_chave, nome_software, versao_software)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      config.identificadorLoja,
      config.nomeLoja,
      config.usaReceita ? 1 : 0,
      config.usaNumNota ? 1 : 0,
      config.caminhoCertificado,
      config.caminhoChave,
      config.nomeSoftware,
      config.versaoSoftware,
    );
  console.info(
    `[BANCO] Configuração salva: loja "${config.nomeLoja}", receita=${config.usaReceita}, numeroNota=${config.usaNumNota}, ` +
      `certificado=${path.basename(config.caminhoCertificado)}, chave=${path.basename(config.caminhoChave)}`,
  );
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
  const linha = db()
    .prepare(
      `INSERT INTO sequencia_nst (id, ultimo) VALUES (1, 1)
       ON CONFLICT (id) DO UPDATE SET ultimo = CASE WHEN ultimo >= ? THEN 1 ELSE ultimo + 1 END
       RETURNING ultimo`,
    )
    .get(NST_MAXIMO) as { ultimo: number };
  console.debug(`[BANCO] NST gerado: ${linha.ultimo}`);
  return linha.ultimo;
}

// ---------------------------------------------------------------------------
// Transação pendente
// ---------------------------------------------------------------------------

/** Transação aprovada aguardando confirmação/desfazimento (ver servico.ts). */
export interface RegistroPendente {
  tipo: string;
  /** Corpo enviado na confirmação/desfazimento */
  movimento: unknown;
  comprovante?: string;
}

/**
 * Guardamos a transação aprovada ANTES de devolvê-la para a tela. Se o PDV
 * fechar/travar antes de confirmar, na próxima abertura ela é desfeita (ver
 * desfazerPendenteAoIniciar em servico.ts). Isso evita cobrar o cliente por
 * uma venda que não foi concluída no caixa.
 */
export async function obterPendente<T extends RegistroPendente = RegistroPendente>(): Promise<T | undefined> {
  const linha = db().prepare('SELECT dados FROM transacao_pendente WHERE id = 1').get() as { dados: Uint8Array } | undefined;
  if (!linha) return undefined;
  try {
    return JSON.parse(await descriptografar(Buffer.from(linha.dados))) as T;
  } catch (e) {
    // Ex.: banco copiado de outro usuário/máquina. A pendência não pode ser
    // usada, então é descartada para não bloquear as próximas transações.
    console.error('[BANCO] Transação pendente ilegível; descartada:', (e as Error).message);
    removerPendente();
    return undefined;
  }
}

export async function salvarPendente(pendente: RegistroPendente): Promise<void> {
  const dados = await criptografar(JSON.stringify(pendente));
  db().prepare('INSERT OR REPLACE INTO transacao_pendente (id, dados) VALUES (1, ?)').run(dados);
  console.info(`[BANCO] Transação pendente gravada (criptografada): ${pendente.tipo}`);
}

export function removerPendente(): void {
  db().prepare('DELETE FROM transacao_pendente').run();
  console.info('[BANCO] Transação pendente removida');
}

// ---------------------------------------------------------------------------
// Últimas transações (reimpressão)
// ---------------------------------------------------------------------------

export function salvarUltimaTransacao(tipo: TipoReimpressao, comprovante?: string): void {
  db()
    .prepare('INSERT OR REPLACE INTO ultima_transacao (tipo, data, comprovante) VALUES (?, ?, ?)')
    .run(tipo, new Date().toISOString(), comprovante ?? null);
  console.info(`[BANCO] Último comprovante de ${tipo} gravado para reimpressão`);
}

export function obterUltimaTransacao(tipo: TipoReimpressao): UltimaTransacao | undefined {
  const linha = db().prepare('SELECT data, comprovante FROM ultima_transacao WHERE tipo = ?').get(tipo) as
    | { data: string; comprovante: string | null }
    | undefined;
  return linha ? { data: linha.data, comprovante: linha.comprovante ?? undefined } : undefined;
}
