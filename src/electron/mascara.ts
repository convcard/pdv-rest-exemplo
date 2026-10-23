/**
 * Mascara dados sensíveis antes de qualquer log (arquivo ou painel da tela).
 * Percorre o objeto inteiro, inclusive objetos e listas aninhados.
 *
 *  - cartao / token: mantém os 4 primeiros e os 4 últimos caracteres;
 *  - cvv, senha, qrcode: totalmente ocultos;
 *  - qualquer texto só com 13 a 19 dígitos (formato de cartão): como "cartao".
 */
const PARCIAL = new Set(['cartao', 'token']);
const OCULTO = new Set(['cvv', 'senha', 'qrcode']);

export function mascararDadosSensiveis(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(mascararDadosSensiveis);
  }
  // Proteção extra: texto com cara de número de cartão, mesmo fora de um campo "cartao"
  if (typeof valor === 'string' && /^\d{13,19}$/.test(valor)) {
    return parcial(valor);
  }
  if (!valor || typeof valor !== 'object' || Buffer.isBuffer(valor)) {
    return valor;
  }
  const copia: Record<string, unknown> = {};
  for (const [campo, conteudo] of Object.entries(valor)) {
    if (OCULTO.has(campo) && conteudo) {
      copia[campo] = '***';
    } else if (PARCIAL.has(campo) && typeof conteudo === 'string' && conteudo.length > 8) {
      copia[campo] = parcial(conteudo);
    } else {
      copia[campo] = mascararDadosSensiveis(conteudo);
    }
  }
  return copia;
}

function parcial(texto: string): string {
  return texto.slice(0, 4) + '*'.repeat(texto.length - 8) + texto.slice(-4);
}
