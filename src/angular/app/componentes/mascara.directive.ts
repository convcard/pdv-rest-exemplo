/**
 * Máscara de digitação para usar com [(ngModel)]. A tela exibe o valor
 * formatado e o modelo recebe o valor "limpo":
 *
 *   <input appMascara="cartao" [(ngModel)]="cartao" />   cartao() === '1111111111111111111'
 *
 * Tipos:
 *  - cartao:     000 0000 0000 0000 0000 (até 19 dígitos) -> só dígitos
 *  - cpf:        000.000.000-00                          -> só dígitos
 *  - cep:        00000-000                               -> só dígitos
 *  - numero:     só dígitos, até [tamanho]               -> só dígitos
 *  - valor:      1234,56 (máx. 99.999,99)                -> number | null
 *  - maiusculas: texto em maiúsculas, até [tamanho]      -> string
 */
import { Directive, ElementRef, forwardRef, inject, input } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { somenteDigitos } from '../core/util';

export type TipoMascara = 'cartao' | 'cpf' | 'cep' | 'numero' | 'valor' | 'maiusculas';

const FORMATADORES: Record<'cartao' | 'cpf' | 'cep' | 'numero', { max: number; formatar: (d: string) => string }> = {
  // Espaço antes dos dígitos de índice 3, 7, 11 e 15
  cartao: { max: 19, formatar: (d) => [...d].map((c, i) => ([3, 7, 11, 15].includes(i) ? ` ${c}` : c)).join('') },
  cpf: {
    max: 11,
    formatar: (d) =>
      d
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2'),
  },
  cep: { max: 8, formatar: (d) => d.replace(/^(\d{5})(\d)/, '$1-$2') },
  numero: { max: Infinity, formatar: (d) => d },
};

@Directive({
  selector: 'input[appMascara]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MascaraDirective), multi: true }],
  host: { '(input)': 'aoDigitar()', '(blur)': 'aoTocar()' },
})
export class MascaraDirective implements ControlValueAccessor {
  readonly appMascara = input.required<TipoMascara>();
  /** Tamanho máximo (para "numero" e "maiusculas") */
  readonly tamanho = input<number>();

  private readonly campo: HTMLInputElement = inject(ElementRef).nativeElement;
  private aoMudar: (valor: unknown) => void = () => undefined;
  private notificarToque: () => void = () => undefined;

  writeValue(valor: unknown): void {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    const tipo = this.appMascara();
    if (tipo === 'valor') {
      this.campo.value = typeof valor === 'number' ? valor.toFixed(2).replace('.', ',') : texto;
    } else if (tipo === 'maiusculas') {
      this.campo.value = texto.toUpperCase();
    } else {
      this.campo.value = FORMATADORES[tipo].formatar(somenteDigitos(texto));
    }
  }

  registerOnChange(fn: (valor: unknown) => void): void {
    this.aoMudar = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.notificarToque = fn;
  }

  setDisabledState(desabilitado: boolean): void {
    this.campo.disabled = desabilitado;
  }

  protected aoTocar(): void {
    this.notificarToque();
  }

  protected aoDigitar(): void {
    const tipo = this.appMascara();

    if (tipo === 'maiusculas') {
      const cursor = this.campo.selectionStart;
      this.campo.value = this.campo.value.toUpperCase().slice(0, this.tamanho() ?? Infinity);
      if (cursor !== null) this.campo.setSelectionRange(cursor, cursor);
      this.aoMudar(this.campo.value);
      return;
    }

    if (tipo === 'valor') {
      // Só dígitos e uma vírgula, 5 dígitos inteiros e 2 decimais
      const [inteiro, ...resto] = this.campo.value.replace(/[^\d,]/g, '').split(',');
      this.campo.value = inteiro.slice(0, 5) + (resto.length ? ',' + resto.join('').slice(0, 2) : '');
      this.aoMudar(this.campo.value ? Number(this.campo.value.replace(',', '.')) : null);
      return;
    }

    const { max, formatar } = FORMATADORES[tipo];
    const cursor = this.campo.selectionStart ?? this.campo.value.length;
    const digitosAntesDoCursor = somenteDigitos(this.campo.value.slice(0, cursor)).length;
    const digitos = somenteDigitos(this.campo.value).slice(0, Math.min(max, this.tamanho() ?? max));
    this.campo.value = formatar(digitos);

    // Mantém o cursor depois do mesmo dígito em que estava
    let posicao = 0;
    let contados = 0;
    while (posicao < this.campo.value.length && contados < digitosAntesDoCursor) {
      if (/\d/.test(this.campo.value[posicao])) contados++;
      posicao++;
    }
    this.campo.setSelectionRange(posicao, posicao);
    this.aoMudar(digitos);
  }
}
