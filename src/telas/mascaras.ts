/**
 * Máscaras dos campos.
 */
import { somenteDigitos } from './util';

/** Aplica a formatação a cada digitação, mantendo o cursor após o mesmo dígito. */
function aplicar(input: HTMLInputElement, formatar: (digitos: string) => string, maxDigitos: number): void {
  input.addEventListener('input', () => {
    const cursor = input.selectionStart ?? input.value.length;
    const digitosAntesDoCursor = somenteDigitos(input.value.slice(0, cursor)).length;
    const digitos = somenteDigitos(input.value).slice(0, maxDigitos);
    input.value = formatar(digitos);

    // Reposiciona o cursor depois do mesmo dígito em que estava
    let posicao = 0;
    let contados = 0;
    while (posicao < input.value.length && contados < digitosAntesDoCursor) {
      if (/\d/.test(input.value[posicao])) contados++;
      posicao++;
    }
    input.setSelectionRange(posicao, posicao);
  });
}

/**
 * Cartão Convcard: até 19 dígitos, formatado em
 * grupos 3-4-4-4-4 -> "000 0000 0000 0000 0000". Leia sempre com somenteDigitos().
 */
export function mascaraCartao(input: HTMLInputElement): void {
  // Espaço antes dos dígitos de índice 3, 7, 11 e 15
  const formatar = (d: string) =>
    [...d].map((c, i) => ([3, 7, 11, 15].includes(i) ? ` ${c}` : c)).join('');
  aplicar(input, formatar, 19);
}

/** Somente números com tamanho máximo. */
export function mascaraNumero(input: HTMLInputElement, maxDigitos: number): void {
  aplicar(input, (d) => d, maxDigitos);
}

/** CPF: 000.000.000-00 */
export function mascaraCpf(input: HTMLInputElement): void {
  aplicar(
    input,
    (d) =>
      d
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2'),
    11,
  );
}

/** CEP: 00000-000 */
export function mascaraCep(input: HTMLInputElement): void {
  aplicar(input, (d) => d.replace(/^(\d{5})(\d)/, '$1-$2'), 8);
}

/** Texto em maiúsculas com tamanho máximo. */
export function maiusculas(input: HTMLInputElement, max: number): void {
  input.maxLength = max;
  input.addEventListener('input', () => {
    const cursor = input.selectionStart;
    input.value = input.value.toUpperCase();
    if (cursor !== null) input.setSelectionRange(cursor, cursor);
  });
}

/** Lê um campo de valor "1.234,56" ou "1234.56" como número. */
export function lerValor(input: HTMLInputElement): number {
  const texto = input.value.trim();
  if (!texto) return NaN;
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  return Number(normalizado);
}

/** Valor monetário: só dígitos e vírgula, 2 casas, máximo 99.999,99. */
export function mascaraValor(input: HTMLInputElement): void {
  input.addEventListener('input', () => {
    let texto = input.value.replace(/[^\d,]/g, '');
    const [inteiro, ...resto] = texto.split(',');
    texto = inteiro.slice(0, 5) + (resto.length ? ',' + resto.join('').slice(0, 2) : '');
    input.value = texto;
  });
}
