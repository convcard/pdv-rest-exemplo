/**
 * Ponto de entrada das telas (processo renderer).
 *
 * As telas ficam em src/telas, uma por arquivo. A integração com a Convcard
 * em si roda no processo main (src/convcard) e é acessada via window.convcard
 * (preload.ts).
 */
import './index.css';
import type { LogIntegracao } from './shared/ipc';
import { abrirConfiguracao } from './telas/configuracao';
import { preencherIcones } from './telas/icones';
import { $, api, carregarConfiguracao, config, escapar } from './telas/util';
import { iniciarVenda } from './telas/venda';

/** Mostra cada requisição/resposta do autorizador (dados sensíveis já vêm mascarados do main). */
function iniciarLog(): void {
  const lista = $<HTMLDivElement>('log-itens');
  api().aoRegistrarLog((log: LogIntegracao) => {
    lista.querySelector('.vazio')?.remove();
    const sucesso = log.status !== undefined && log.status >= 200 && log.status < 300;
    const item = document.createElement('details');
    item.className = sucesso ? 'ok' : 'falha';
    item.innerHTML = `
      <summary>
        <span class="metodo metodo-${log.metodo.toLowerCase()}">${log.metodo}</span>
        <span class="caminho">${escapar(new URL(log.url).pathname.replace('/autorizador', ''))}</span>
        <span class="status">${escapar(log.status ?? 'erro')}</span>
        <span class="tempo">${new Date(log.data).toLocaleTimeString('pt-BR')} · ${log.duracaoMs}ms</span>
      </summary>
      <pre></pre>`;
    item.querySelector('pre')!.textContent =
      `URL: ${log.url}\n\nRequisição:\n${JSON.stringify(log.requisicao, null, 2)}\n\n` +
      `Resposta:\n${JSON.stringify(log.resposta ?? log.erro, null, 2)}`;
    lista.prepend(item);
  });
  $('btn-limpar-log').addEventListener('click', () => (lista.innerHTML = ''));
}

async function iniciar(): Promise<void> {
  await carregarConfiguracao();
  preencherIcones();
  iniciarLog();
  iniciarVenda();
  $('btn-configuracoes').addEventListener('click', () => void abrirConfiguracao());

  // Primeira execução: abre a configuração para informar certificado e token da loja
  if (!config().caminhoCertificado) {
    void abrirConfiguracao();
  }
}

void iniciar();
