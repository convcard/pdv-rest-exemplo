/**
 * Processo principal (main) do Electron.
 *
 * Responsável por:
 *  - criar a janela do PDV;
 *  - registrar os handlers IPC que a tela usa para chamar a integração
 *    Convcard (a integração em si roda aqui, no Node.js);
 *  - desfazer, ao abrir, uma transação que tenha ficado pendente;
 *  - gravar o log em arquivo (log.ts): console do main e do renderer, cada
 *    operação IPC e cada requisição ao autorizador.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { fecharBanco, obterConfiguracao, salvarConfiguracao } from './armazenamento';
import { aoRegistrarLog, ConvcardErro } from './convcard/cliente';
import * as convcard from './convcard/servico';
import { capturarConsoleDoRenderer, iniciarLog } from './log';
import { mascararDadosSensiveis } from './mascara';
import {
  CANAL_LOG,
  canal,
  OPERACOES,
  type ConvcardApi,
  type FiltroFatura,
  type Operacao,
  type ResultadoIpc,
} from '../shared/ipc';

// Trata criação/remoção de atalhos no Windows durante instalação/desinstalação.
if (started) {
  app.quit();
}

iniciarLog();

let janela: BrowserWindow | undefined;

const criarJanela = () => {
  janela = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'PDV Convcard - Exemplo de integração',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  janela.removeMenu();
  capturarConsoleDoRenderer(janela.webContents);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    janela.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    janela.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

/**
 * Emissão de fatura: baixa o PDF via POST
 * /consulta/fatura-pdf, salva na pasta Downloads do usuário e abre no
 * visualizador padrão.
 */
async function emitirFatura(filtro: FiltroFatura): Promise<string> {
  const arquivo = await convcard.baixarFaturaPdf(filtro);
  const caminho = path.join(app.getPath('downloads'), arquivo.nome);
  try {
    fs.writeFileSync(caminho, arquivo.bytes);
  } catch (e) {
    console.error(`[FATURA] Erro ao salvar ${caminho}:`, e);
    throw new ConvcardErro('Erro ao salvar a fatura no disco');
  }
  console.info(`[FATURA] PDF salvo em ${caminho}`);

  const erroAoAbrir = await shell.openPath(caminho);
  if (erroAoAbrir) {
    console.warn(`[FATURA] Não foi possível abrir ${caminho}: ${erroAoAbrir}`);
    throw new ConvcardErro(`Não foi possível visualizar a fatura.\nSalva em: ${caminho}`);
  }
  return caminho;
}

async function selecionarArquivo(titulo: string, nome: string, extensoes: string[]): Promise<string | undefined> {
  const resultado = await dialog.showOpenDialog({
    title: titulo,
    filters: [
      { name: nome, extensions: extensoes },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  const arquivo = resultado.canceled ? undefined : resultado.filePaths[0];
  console.info(`[CONFIG] ${titulo}: ${arquivo ?? 'cancelado'}`);
  return arquivo;
}

const selecionarCertificado = () =>
  selecionarArquivo('Selecione o certificado Convcard (.crt)', 'Certificado PEM', ['crt', 'pem', 'cer']);

const selecionarChave = () =>
  selecionarArquivo('Selecione a chave privada Convcard (.key)', 'Chave privada PEM', ['key', 'pem']);

/**
 * Função do main que atende cada operação da ConvcardApi. O "satisfies"
 * garante em tempo de compilação que os parâmetros e retornos batem com o
 * contrato usado pela tela.
 */
const HANDLERS = {
  obterConfiguracao,
  salvarConfiguracao,
  selecionarCertificado,
  selecionarChave,
  emitirFatura,
  obterUltimaTransacao: convcard.obterUltimaTransacao,
  validarConfiguracao: convcard.validarConfiguracao,
  consultarSaldo: convcard.consultarSaldo,
  consultarSaldoDevedor: convcard.consultarSaldoDevedor,
  consultarFatura: convcard.consultarFatura,
  consultarCep: convcard.consultarCep,
  solicitarCompra: convcard.solicitarCompra,
  gerarQrCode: convcard.gerarQrCode,
  solicitarCompraQrCode: convcard.solicitarCompraQrCode,
  solicitarCancelamento: convcard.solicitarCancelamento,
  solicitarRecebimento: convcard.solicitarRecebimento,
  solicitarRecebimentoAntecipado: convcard.solicitarRecebimentoAntecipado,
  confirmarPendente: convcard.confirmarPendente,
  desfazerPendente: convcard.desfazerPendente,
  atualizarEndereco: convcard.atualizarEndereco,
  cadastrarToken: convcard.cadastrarToken,
} satisfies {
  [K in Operacao]: (...args: Parameters<ConvcardApi[K]>) => ReturnType<ConvcardApi[K]> | Awaited<ReturnType<ConvcardApi[K]>>;
};

/**
 * Nome dos parâmetros posicionais de cada operação. Usado só no log: os
 * parâmetros viram um objeto ({ cartao: ..., cvv: ... }) para que a máscara
 * reconheça os dados sensíveis pelo nome. Operações sem entrada aqui recebem
 * um único objeto (ou nenhum parâmetro).
 */
const PARAMETROS: Partial<Record<Operacao, string[]>> = {
  obterUltimaTransacao: ['tipo'],
  consultarSaldo: ['cartao'],
  consultarSaldoDevedor: ['cartao'],
  consultarCep: ['cep'],
  gerarQrCode: ['valor', 'qtdParcelas'],
  solicitarCompraQrCode: ['nst', 'qrcode', 'dados'],
  solicitarRecebimento: ['nsuFatura', 'valor'],
  solicitarRecebimentoAntecipado: ['cartao', 'valor'],
  cadastrarToken: ['cartao', 'cvv'],
};

function parametrosParaLog(operacao: Operacao, args: unknown[]): string {
  if (!args.length) return '';
  const nomes = PARAMETROS[operacao];
  const valor = nomes ? Object.fromEntries(nomes.map((nome, i) => [nome, args[i]])) : args[0];
  return JSON.stringify(mascararDadosSensiveis(valor));
}

/**
 * Registra os handlers IPC. Cada um devolve sempre um ResultadoIpc,
 * convertendo exceções em { ok: false, erro } para que a tela receba
 * mensagem, código e NSU do erro.
 *
 * Cada operação é registrada no log (parâmetros mascarados, duração e
 * resultado).
 */
function registrarHandlers() {
  for (const operacao of OPERACOES) {
    const acao = HANDLERS[operacao] as (...args: unknown[]) => unknown;
    ipcMain.handle(canal(operacao), async (_evento, ...args: unknown[]): Promise<ResultadoIpc<unknown>> => {
      const inicio = Date.now();
      console.info(`[IPC] ${operacao} iniciado ${parametrosParaLog(operacao, args)}`.trimEnd());
      try {
        const dados = await acao(...args);
        console.info(`[IPC] ${operacao} concluído em ${Date.now() - inicio} ms`);
        return { ok: true, dados };
      } catch (e) {
        console.warn(`[IPC] ${operacao} falhou em ${Date.now() - inicio} ms: ${(e as Error).message}`);
        if (e instanceof ConvcardErro) {
          return {
            ok: false,
            erro: { mensagem: e.message, codigo: e.codigo, nsu: e.nsu, status: e.status },
          };
        }
        console.error(`[IPC] ${operacao} erro inesperado:`, e);
        return { ok: false, erro: { mensagem: (e as Error).message } };
      }
    });
  }

  // Cada requisição/resposta do autorizador (já mascarada) vai para o log em
  // arquivo e para o painel de log da tela
  aoRegistrarLog((log) => {
    const resultado = log.erro ? `ERRO ${log.erro}` : `HTTP ${log.status}`;
    const linha = `[HTTP] ${log.metodo} ${log.url} -> ${resultado} (${log.duracaoMs} ms)`;
    if (log.erro || (log.status ?? 0) >= 400) console.warn(linha);
    else console.info(linha);
    console.debug(`[HTTP] Requisição: ${JSON.stringify(log.requisicao)}`);
    if (log.resposta !== undefined) console.debug(`[HTTP] Resposta: ${JSON.stringify(log.resposta)}`);
    janela?.webContents.send(CANAL_LOG, log);
  });
}

app.whenReady().then(() => {
  registrarHandlers();
  criarJanela();
  void convcard.desfazerPendenteAoIniciar();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      criarJanela();
    }
  });
});

app.on('will-quit', () => {
  console.info('[APP] Encerrando');
  fecharBanco();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
