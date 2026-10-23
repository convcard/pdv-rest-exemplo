/**
 * Ponto de entrada das telas (processo renderer).
 *
 * As telas ficam em src/telas, uma por arquivo. A integração com a Convcard
 * em si roda no
 * processo main (src/convcard) e é acessada via window.convcard (preload.ts).
 */
import './index.css';
import type { LogIntegracao } from './shared/ipc';
import { abrirConfiguracao } from './telas/configuracao';
import { $, api, carregarConfiguracao, config } from './telas/util';
import { iniciarVenda } from './telas/venda';

/** Mostra cada requisição/resposta do autorizador (dados sensíveis já vêm mascarados do main). */
function iniciarLog(): void {
  const lista = $<HTMLDivElement>('log-itens');
  api().aoRegistrarLog((log: LogIntegracao) => {
    const item = document.createElement('details');
    const sucesso = log.status !== undefined && log.status >= 200 && log.status < 300;
    item.className = sucesso ? 'ok' : 'falha';
    const resumo = document.createElement('summary');
    resumo.textContent = `${new Date(log.data).toLocaleTimeString('pt-BR')} ${log.metodo} ${new URL(log.url).pathname} → ${log.status ?? log.erro} (${log.duracaoMs}ms)`;
    const corpo = document.createElement('pre');
    corpo.textContent =
      `URL: ${log.url}\n\nRequisição:\n${JSON.stringify(log.requisicao, null, 2)}\n\n` +
      `Resposta:\n${JSON.stringify(log.resposta ?? log.erro, null, 2)}`;
    item.append(resumo, corpo);
    lista.prepend(item);
  });
  $('btn-limpar-log').addEventListener('click', () => (lista.innerHTML = ''));
}

function atualizarFaixaAmbiente(): void {
  $('faixa-homologacao').hidden = config().ambiente !== 'HOMOLOGACAO';
}

async function iniciar(): Promise<void> {
  await carregarConfiguracao();
  atualizarFaixaAmbiente();
  document.addEventListener('configuracao-alterada', atualizarFaixaAmbiente);

  iniciarLog();
  iniciarVenda();
  $('btn-configuracoes').addEventListener('click', () => void abrirConfiguracao());

  // Primeira execução: abre a configuração para informar certificado e token da loja
  if (!config().caminhoCertificado) {
    void abrirConfiguracao();
  }
}

void iniciar();
