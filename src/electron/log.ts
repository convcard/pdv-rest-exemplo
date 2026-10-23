/**
 * Log em arquivo do PDV.
 *
 *  - Pasta: <userData>/logs (Windows: %APPDATA%\PDV Convcard Exemplo\logs;
 *    Linux: ~/.config/PDV Convcard Exemplo/logs).
 *  - Um arquivo por dia (pdv-AAAA-MM-DD.log). Nenhum arquivo é apagado pelo
 *    app: a ideia é manter o máximo de informação para diagnóstico.
 *  - Formato: "2026-10-23 15:04:05.123 [INFO ] [exec 3] [main] mensagem",
 *    onde "exec" é o número da execução do app (tabela execucao do banco).
 *    Cada abertura do app começa com uma linha separadora.
 *
 * Tudo que sai no console do main (console.log/info/warn/error/debug) e no
 * console do renderer (telas Angular) também é gravado aqui, então basta usar
 * console.* normalmente em qualquer parte do código.
 *
 * Nunca registre dados sensíveis sem passar por mascararDadosSensiveis().
 */
import { app, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { format } from 'node:util';

type Nivel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
type Origem = 'main' | 'renderer';

const consoleOriginal = {
  debug: console.debug.bind(console),
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let pasta: string | undefined;
let execucao: number | undefined;

/** Chame uma vez, no início do main. */
export function iniciarLog(): void {
  pasta = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(pasta, { recursive: true });

  // Redireciona o console do main para o arquivo (sem deixar de mostrar no terminal)
  const redirecionar = (metodo: keyof typeof consoleOriginal, nivel: Nivel) => {
    console[metodo] = (...args: unknown[]) => {
      consoleOriginal[metodo](...args);
      escrever(nivel, 'main', format(...args));
    };
  };
  redirecionar('debug', 'DEBUG');
  redirecionar('log', 'INFO');
  redirecionar('info', 'INFO');
  redirecionar('warn', 'WARN');
  redirecionar('error', 'ERROR');

  process.on('uncaughtException', (e) => console.error('[MAIN] Exceção não tratada:', e));
  process.on('unhandledRejection', (e) => console.error('[MAIN] Promise rejeitada sem tratamento:', e));
}

/** Marca o início de uma execução: linha separadora e o número dela nas linhas seguintes. */
export function iniciarExecucaoNoLog(numero: number): void {
  execucao = numero;
  escreverLinha(`${'='.repeat(30)} Execução ${numero} ${'='.repeat(30)}\n`);
  console.info(`[APP] ${app.getName()} ${app.getVersion()} iniciado (Electron ${process.versions.electron}, ${process.platform} ${process.arch})`);
  console.info(`[APP] Log em ${pasta}`);
}

/** Grava no log tudo que a tela escreve no console, além de travamentos e falhas de carga. */
export function capturarConsoleDoRenderer(web: WebContents): void {
  const niveis: Record<string, Nivel> = { debug: 'DEBUG', info: 'INFO', warning: 'WARN', error: 'ERROR' };
  web.on('console-message', (evento) => {
    const origem = evento.sourceId ? ` (${evento.sourceId.split('/').pop()}:${evento.lineNumber})` : '';
    escrever(niveis[evento.level] ?? 'INFO', 'renderer', evento.message + origem);
  });
  web.on('render-process-gone', (_e, detalhes) =>
    escrever('ERROR', 'renderer', `Processo da tela encerrado: ${detalhes.reason} (código ${detalhes.exitCode})`),
  );
  web.on('unresponsive', () => escrever('WARN', 'renderer', 'Tela não está respondendo'));
  web.on('responsive', () => escrever('INFO', 'renderer', 'Tela voltou a responder'));
  web.on('did-fail-load', (_e, codigo, descricao, url) =>
    escrever('ERROR', 'renderer', `Falha ao carregar ${url}: ${descricao} (${codigo})`),
  );
  web.on('preload-error', (_e, caminho, erro) => escrever('ERROR', 'renderer', `Erro no preload ${caminho}: ${erro.stack ?? erro.message}`));
}

function escrever(nivel: Nivel, origem: Origem, mensagem: string): void {
  const exec = execucao ? ` [exec ${execucao}]` : '';
  escreverLinha(`${carimbo(new Date())} [${nivel.padEnd(5)}]${exec} [${origem}] ${mensagem}\n`);
}

function escreverLinha(linha: string): void {
  if (!pasta) return;
  try {
    fs.appendFileSync(path.join(pasta, `pdv-${dataLocal(new Date())}.log`), linha);
  } catch (e) {
    consoleOriginal.error('Falha ao gravar o log:', e);
  }
}

const dois = (n: number) => String(n).padStart(2, '0');

function dataLocal(d: Date): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

function carimbo(d: Date): string {
  return `${dataLocal(d)} ${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}
