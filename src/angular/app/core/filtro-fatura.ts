/** Filtros de consulta de fatura (recebimento e emissão de fatura): informe apenas um. */
import type { FiltroFatura } from '../../../shared/ipc';
import type { TipoMascara } from '../componentes/mascara.directive';

export type TipoFiltroFatura = 'Cartão' | 'CPF' | 'Número Fatura' | 'NSU Fatura';

export const FILTROS_FATURA: { tipo: TipoFiltroFatura; mascara: TipoMascara; tamanho?: number }[] = [
  { tipo: 'Cartão', mascara: 'cartao' },
  { tipo: 'CPF', mascara: 'cpf' },
  { tipo: 'Número Fatura', mascara: 'numero', tamanho: 20 },
  { tipo: 'NSU Fatura', mascara: 'numero', tamanho: 18 },
];

/** Monta o corpo da consulta a partir do tipo escolhido e do valor digitado (só dígitos). */
export function montarFiltroFatura(tipo: TipoFiltroFatura, valor: string): FiltroFatura {
  switch (tipo) {
    case 'Cartão':
      return { cartao: valor };
    case 'CPF':
      return { cpf: valor };
    case 'Número Fatura':
      return { numeroFatura: Number(valor) };
    default:
      return { nsuFatura: Number(valor) };
  }
}
