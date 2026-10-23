/**
 * Ícone SVG da biblioteca Lucide (empacotada no app, nada vem da internet).
 * Uso: <app-icone nome="enviar" />
 */
import { Component, ElementRef, effect, inject, input } from '@angular/core';
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
  createElement,
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
  enviar: Send,
  falha: TriangleAlert,
  fatura: FileText,
  finalizar: CircleCheck,
  funcoes: LayoutGrid,
  homologacao: FlaskConical,
  imprimir: Printer,
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
  token: KeyRound,
  validar: ShieldCheck,
} satisfies Record<string, IconNode>;

export type NomeIcone = keyof typeof ICONES;

@Component({
  selector: 'app-icone',
  template: '',
})
export class IconeComponent {
  readonly nome = input.required<NomeIcone>();

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    effect(() => host.replaceChildren(createElement(ICONES[this.nome()], { class: 'icone', 'aria-hidden': 'true' })));
  }
}
