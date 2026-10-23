/**
 * Preload: ponte segura entre a tela (renderer) e o processo main.
 *
 * Expõe window.convcard com as funções da integração. Cada função envia uma
 * mensagem IPC ao main (canal "convcard:<operação>"), que faz a chamada ao
 * autorizador e devolve um ResultadoIpc. Aqui o envelope é desfeito: em caso
 * de sucesso devolvemos os dados; em caso de erro lançamos um ErroConvcard
 * (mensagem, código e NSU) para a tela tratar com try/catch normal.
 */
import { contextBridge, ipcRenderer } from 'electron';
import {
  CANAL_LOG,
  canal,
  OPERACOES,
  type ConvcardApi,
  type ErroConvcard,
  type LogIntegracao,
  type Operacao,
  type ResultadoIpc,
} from './shared/ipc';

async function chamar(operacao: Operacao, ...args: unknown[]): Promise<unknown> {
  const resultado = (await ipcRenderer.invoke(canal(operacao), ...args)) as ResultadoIpc<unknown>;
  if (resultado.ok) {
    return resultado.dados;
  }
  // Objetos Error perdem propriedades extras ao atravessar o contextBridge,
  // então lançamos um objeto simples no formato ErroConvcard.
  throw resultado.erro satisfies ErroConvcard;
}

const api = Object.fromEntries(
  OPERACOES.map((operacao) => [operacao, (...args: unknown[]) => chamar(operacao, ...args)]),
) as Omit<ConvcardApi, 'aoRegistrarLog'>;

contextBridge.exposeInMainWorld('convcard', {
  ...api,
  aoRegistrarLog: (callback: (log: LogIntegracao) => void) => {
    ipcRenderer.on(CANAL_LOG, (_evento, log: LogIntegracao) => callback(log));
  },
} satisfies ConvcardApi);
