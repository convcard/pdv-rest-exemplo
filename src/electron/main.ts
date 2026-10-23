/**
 * Processo principal (main) do Electron.
 *
 * Responsável por:
 *  - criar a janela do PDV;
 *  - registrar os handlers IPC que a tela usa para chamar a integração
 *    Convcard (a integração em si roda aqui, no Node.js);
 *  - desfazer, ao abrir, uma transação que tenha ficado pendente.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { obterConfiguracao, salvarConfiguracao } from './armazenamento';
import { aoRegistrarLog, ConvcardErro } from './convcard/cliente';
import * as convcard from './convcard/servico';
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
  } catch {
    throw new ConvcardErro('Erro ao salvar a fatura no disco');
  }

  const erroAoAbrir = await shell.openPath(caminho);
  if (erroAoAbrir) {
    throw new ConvcardErro(`Não foi possível visualizar a fatura.\nSalva em: ${caminho}`);
  }
  return caminho;
}

async function selecionarCertificado(): Promise<string | undefined> {
  const resultado = await dialog.showOpenDialog({
    title: 'Selecione o certificado Convcard',
    filters: [{ name: 'Certificado PKCS#12', extensions: ['p12', 'pfx'] }],
    properties: ['openFile'],
  });
  return resultado.canceled ? undefined : resultado.filePaths[0];
}

/**
 * Função do main que atende cada operação da ConvcardApi. O "satisfies"
 * garante em tempo de compilação que os parâmetros e retornos batem com o
 * contrato usado pela tela.
 */
const HANDLERS = {
  obterConfiguracao,
  salvarConfiguracao,
  selecionarCertificado,
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
  solicitarCancelamentoQrCode: convcard.solicitarCancelamentoQrCode,
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
 * Registra os handlers IPC. Cada um devolve sempre um ResultadoIpc,
 * convertendo exceções em { ok: false, erro } para que a tela receba
 * mensagem, código e NSU do erro.
 */
function registrarHandlers() {
  for (const operacao of OPERACOES) {
    const acao = HANDLERS[operacao] as (...args: unknown[]) => unknown;
    ipcMain.handle(canal(operacao), async (_evento, ...args: unknown[]): Promise<ResultadoIpc<unknown>> => {
      try {
        return { ok: true, dados: await acao(...args) };
      } catch (e) {
        if (e instanceof ConvcardErro) {
          return {
            ok: false,
            erro: { mensagem: e.message, codigo: e.codigo, nsu: e.nsu, status: e.status },
          };
        }
        return { ok: false, erro: { mensagem: (e as Error).message } };
      }
    });
  }

  // Repassa cada requisição/resposta do autorizador para o painel de log da tela
  aoRegistrarLog((log) => janela?.webContents.send(CANAL_LOG, log));
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
