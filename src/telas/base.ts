/**
 * Base de todas as telas "TEF Convcard".
 *
 * Cada tela é um <dialog> modal criado ao abrir e removido ao fechar, com:
 *  - cabeçalho com o logo Convcard (ou só o símbolo, nos diálogos genéricos) e título;
 *  - rodapé padrão: nome da loja e o selo "Homologação";
 *  - atalhos de teclado (F2, F3, Esc...).
 */
import { icone } from './icones';
import { config, escapar } from './util';

export interface OpcoesTela {
  titulo: string;
  /** Largura em px */
  largura: number;
  /** true (padrão) = logo completo; false = só o símbolo da marca */
  logo?: boolean;
  /** Rodapé com loja e ambiente (padrão true; os diálogos genéricos não têm) */
  rodape?: boolean;
}

/** Rodapé padrão das telas Convcard. */
function rodapeHtml(): string {
  const { nomeLoja } = config();
  return `<footer class="tela-rodape">
      <span class="rodape-loja">${nomeLoja ? `${icone('loja')}${escapar(nomeLoja)}` : ''}</span>
      <span class="selo-homologacao">${icone('homologacao')}Homologação</span>
    </footer>`;
}

/** "TEF Convcard - Venda" vira sobretítulo "TEF Convcard" + título "Venda". */
function cabecalhoHtml(opcoes: OpcoesTela): string {
  const [sobretitulo, titulo] = opcoes.titulo.includes(' - ')
    ? opcoes.titulo.split(' - ', 2)
    : ['', opcoes.titulo];
  return `<header class="tela-cabecalho">
      ${
        opcoes.logo === false
          ? '<img class="tela-simbolo" src="imagens/convcard-icone.svg" alt="Convcard" />'
          : '<img class="tela-logo" src="imagens/convcard-logo.svg" alt="Convcard" />'
      }
      <div class="tela-titulos">
        ${sobretitulo ? `<small>${escapar(sobretitulo)}</small>` : ''}
        <h2>${escapar(titulo)}</h2>
      </div>
    </header>`;
}

export class Tela {
  readonly dlg: HTMLDialogElement;
  private readonly atalhos = new Map<string, () => void>();
  /** Ação do Esc. Se não definida, o Esc fecha a tela. */
  aoEsc?: () => void;

  constructor(opcoes: OpcoesTela, corpoHtml: string) {
    this.dlg = document.createElement('dialog');
    this.dlg.className = 'tela';
    this.dlg.style.width = `${opcoes.largura}px`;
    this.dlg.tabIndex = -1;
    this.dlg.innerHTML = `
      ${cabecalhoHtml(opcoes)}
      <div class="tela-corpo">${corpoHtml}</div>
      ${opcoes.rodape === false ? '' : rodapeHtml()}`;
    document.body.appendChild(this.dlg);

    this.dlg.addEventListener('keydown', (e) => {
      const tecla = (e.ctrlKey ? 'Ctrl+' : '') + e.key;
      const acao = this.atalhos.get(tecla);
      if (acao) {
        e.preventDefault();
        e.stopPropagation();
        acao();
      }
    });
    // Esc dispara o evento "cancel" do <dialog>
    this.dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (this.aoEsc) this.aoEsc();
      else this.fechar();
    });
  }

  /** Busca um elemento da tela pelo atributo data-id. */
  el<T extends HTMLElement = HTMLInputElement>(id: string): T {
    const el = this.dlg.querySelector<T>(`[data-id="${id}"]`);
    if (!el) throw new Error(`Elemento data-id="${id}" não encontrado`);
    return el;
  }

  /**
   * Liga um botão à sua ação e ao atalho de teclado. O atalho só funciona
   * se o botão estiver visível e habilitado.
   */
  botao(id: string, tecla: string | undefined, acao: () => void): void {
    const botao = this.el<HTMLButtonElement>(id);
    botao.addEventListener('click', acao);
    if (tecla) {
      this.atalhos.set(tecla, () => {
        if (!botao.disabled && !botao.hidden) acao();
      });
    }
  }

  atalho(tecla: string, acao: () => void): void {
    this.atalhos.set(tecla, acao);
  }

  abrir(): void {
    this.dlg.showModal();
  }

  fechar(): void {
    this.dlg.close();
    this.dlg.remove();
  }

  /** Habilita/desabilita todos os campos e botões da tela. */
  habilitar(habilitado: boolean, exceto: string[] = []): void {
    this.dlg.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select').forEach((el) => {
      if (!exceto.includes(el.dataset.id ?? '')) el.disabled = !habilitado;
    });
  }
}

export type TipoVisor = 'info' | 'sucesso' | 'erro';

/** Escreve no "visor" da tela (azul = informação, verde = sucesso, vermelho = erro). */
export function escreverVisor(el: HTMLElement, texto: string, tipo: TipoVisor = 'info'): void {
  el.textContent = texto;
  el.className = `visor ${tipo}`;
}

/**
 * Acumula erros de campos obrigatórios/inválidos para exibir de uma vez.
 */
export class Validacao {
  private readonly erros: string[] = [];

  requerido(campo: string, valor: unknown): this {
    if (valor === undefined || valor === null || valor === '' || Number.isNaN(valor)) {
      this.erros.push(`${campo}: Campo obrigatório`);
    }
    return this;
  }

  adicionar(campo: string, mensagem: string): this {
    this.erros.push(`${campo}: ${mensagem}`);
    return this;
  }

  get mensagem(): string | undefined {
    return this.erros.length ? this.erros.join('\n') : undefined;
  }
}
