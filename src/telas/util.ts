/** Funções auxiliares usadas pelas telas. */
import type { Configuracao, ConvcardApi } from '../shared/ipc';

declare global {
  interface Window {
    /** API exposta pelo preload.ts */
    convcard: ConvcardApi;
  }
}

export const api = (): ConvcardApi => window.convcard;

/** Elemento da página principal pelo id. */
export function $<T extends HTMLElement = HTMLInputElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado`);
  return el as T;
}

/** Configuração carregada (usada no rodapé das telas e nas regras de receita/nota). */
let configuracao: Configuracao | undefined;

export async function carregarConfiguracao(): Promise<Configuracao> {
  configuracao = await api().obterConfiguracao();
  return configuracao;
}

export function config(): Configuracao {
  if (!configuracao) {
    throw new Error('Configuração ainda não carregada');
  }
  return configuracao;
}

const moeda = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1234.5 -> "1.234,50" */
export function formatarValor(valor?: number): string {
  return valor === undefined || valor === null ? '' : moeda.format(valor);
}

export function formatarMoeda(valor?: number): string {
  return valor === undefined || valor === null ? '' : `R$ ${moeda.format(valor)}`;
}

/** ISO (date-time ou yyyy-MM-dd) -> dd/MM/yyyy */
export function formatarData(iso?: string): string {
  if (!iso) return '';
  // "yyyy-MM-dd" sem hora seria interpretado como UTC e poderia virar o dia anterior
  const data = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return data.toLocaleDateString('pt-BR');
}

export function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** Escapa texto antes de montar HTML. */
export function escapar(texto?: string | number): string {
  const div = document.createElement('div');
  div.textContent = texto === undefined || texto === null ? '' : String(texto);
  return div.innerHTML;
}

/** Extrai a mensagem do erro devolvido pelo preload (ErroConvcard) ou de um Error comum. */
export function mensagemErro(e: unknown): string {
  const erro = e as { mensagem?: string; message?: string; codigo?: string; nsu?: number };
  const texto = erro?.mensagem ?? erro?.message ?? String(e);
  const extras = [erro?.codigo && `código ${erro.codigo}`, erro?.nsu && `NSU ${erro.nsu}`]
    .filter(Boolean)
    .join(', ');
  return extras ? `${texto} (${extras})` : texto;
}

/** O comprovante vem da API com as linhas separadas por '@'. */
export function linhasComprovante(comprovante?: string): string[] {
  return comprovante ? comprovante.split('@') : [];
}

export function aguardar(ms?: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms && ms > 0 ? ms : 0));
}

/** Erro "de negócio" lançado pelas telas (ex.: "Cancelado pelo operador."). */
export class ErroTela extends Error {}

/** Siglas das UFs, em ordem alfabética. */
export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

export const opcoesUf = () => ['<option value=""></option>', ...UFS.map((uf) => `<option>${uf}</option>`)].join('');
