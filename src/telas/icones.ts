/**
 * Ícones das telas (biblioteca Lucide, empacotada pelo Vite; nada é baixado
 * da internet). Cada ícone vira um <svg> inline que herda a cor do texto.
 */
import {
  Ban,
  Check,
  CircleCheck,
  Eraser,
  FileText,
  FlaskConical,
  FolderOpen,
  HandCoins,
  KeyRound,
  LayoutGrid,
  LogOut,
  Plus,
  Printer,
  QrCode,
  Receipt,
  Save,
  ScrollText,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Trash,
  TriangleAlert,
  Wallet,
  X,
  type IconNode,
} from 'lucide';

const ICONES = {
  adicionar: Plus,
  antecipado: Wallet,
  cancelamento: Ban,
  cancelar: X,
  carrinho: ShoppingCart,
  compartilhar: Share2,
  configuracoes: Settings,
  confirmar: Check,
  fatura: FileText,
  finalizar: CircleCheck,
  funcoes: LayoutGrid,
  homologacao: FlaskConical,
  imprimir: Printer,
  falha: TriangleAlert,
  limpar: Eraser,
  log: ScrollText,
  loja: Store,
  pasta: FolderOpen,
  pesquisar: Search,
  qrcode: QrCode,
  recebimento: Receipt,
  recebimentos: HandCoins,
  remover: Trash,
  sair: LogOut,
  salvar: Save,
  enviar: Send,
  token: KeyRound,
  validar: ShieldCheck,
} satisfies Record<string, IconNode>;

export type NomeIcone = keyof typeof ICONES;

/** Devolve o HTML do <svg> do ícone. */
export function icone(nome: NomeIcone): string {
  const filhos = ICONES[nome]
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('');
  return `<svg class="icone" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${filhos}</svg>`;
}

/** Texto de botão com ícone e atalho de teclado: "Enviar" + <kbd>F2</kbd>. */
export function rotulo(nome: NomeIcone, texto: string, tecla?: string): string {
  return `${icone(nome)}<span>${texto}</span>${tecla ? `<kbd>${tecla}</kbd>` : ''}`;
}

/** Preenche os elementos estáticos do index.html marcados com data-icone="nome". */
export function preencherIcones(raiz: ParentNode = document): void {
  raiz.querySelectorAll<HTMLElement>('[data-icone]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icone(el.dataset.icone as NomeIcone));
    el.removeAttribute('data-icone');
  });
}
