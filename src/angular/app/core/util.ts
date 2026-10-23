/** Funções auxiliares sem dependência de tela. */

/** Erro "de negócio" das telas (ex.: "Cancelado pelo operador."). */
export class ErroTela extends Error {}

/** Extrai a mensagem do erro devolvido pela API (ErroConvcard) ou de um Error comum. */
export function mensagemErro(e: unknown): string {
  const erro = e as { mensagem?: string; message?: string; codigo?: string; nsu?: number };
  const texto = erro?.mensagem ?? erro?.message ?? String(e);
  const extras = [erro?.codigo && `código ${erro.codigo}`, erro?.nsu && `NSU ${erro.nsu}`]
    .filter(Boolean)
    .join(', ');
  return extras ? `${texto} (${extras})` : texto;
}

export function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** O comprovante vem da API com as linhas separadas por '@'. */
export function linhasComprovante(comprovante?: string): string {
  return comprovante ? comprovante.split('@').join('\n') : '';
}

export function aguardar(ms?: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms && ms > 0 ? ms : 0));
}

/** Siglas das UFs, em ordem alfabética. */
export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

/**
 * Acumula erros de campos obrigatórios/inválidos para exibir de uma vez
 * (ver DialogosService.validar).
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

/** Estado do "visor" (área de mensagens das telas TEF). */
export interface Visor {
  texto: string;
  tipo: 'info' | 'sucesso' | 'erro' | 'qrcode';
}
