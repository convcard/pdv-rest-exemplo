/**
 * Diálogos de uso geral:
 *  - mensagemOperador: "Mensagem Operador", fecha sozinho em 5s;
 *  - atencao / confirmar: diálogos "Atenção" e "Confirmação";
 *  - progresso: popup "aguarde";
 *  - imprimirComprovante: simula a impressora (um PDV real imprime no ECF
 *    ou em impressora não fiscal, na quantidade de vias configurada).
 */
import { Tela, type Validacao } from './base';
import { rotulo } from './icones';
import { escapar, linhasComprovante } from './util';

/** "Mensagem Operador": usado para mensagens da Convcard e "000 - APROVADO". */
export function mensagemOperador(mensagem: string, segundos = 5): Promise<void> {
  const tela = new Tela(
    { titulo: 'Mensagem Operador', largura: 580, logo: false, rodape: false },
    `<textarea class="mensagem-operador" readonly>${escapar(mensagem)}</textarea>
     <div class="botoes centro"><button data-id="ok" class="primario">OK</button></div>`,
  );
  return new Promise((resolve) => {
    let restantes = segundos;
    const ok = tela.el<HTMLButtonElement>('ok');
    const fechar = () => {
      clearInterval(contador);
      tela.fechar();
      resolve();
    };
    const contador = setInterval(() => {
      restantes--;
      ok.textContent = `OK (${restantes})`;
      if (restantes <= 0) fechar();
    }, 1000);
    ok.textContent = `OK (${restantes})`;
    tela.botao('ok', 'Enter', fechar);
    tela.aoEsc = fechar;
    tela.abrir();
    ok.focus();
  });
}

export const mostrarAprovado = () => mensagemOperador('000 - APROVADO');

export function atencao(mensagem: string): Promise<void> {
  const tela = new Tela(
    { titulo: 'Atenção', largura: 420, logo: false, rodape: false },
    `<div class="mensagem">${escapar(mensagem)}</div>
     <div class="botoes centro"><button data-id="ok">OK</button></div>`,
  );
  return new Promise((resolve) => {
    const fechar = () => {
      tela.fechar();
      resolve();
    };
    tela.botao('ok', undefined, fechar);
    tela.aoEsc = fechar;
    tela.abrir();
    tela.el('ok').focus();
  });
}

/** Mostra os erros da validação. Devolve true se não houver erros. */
export async function validar(validacao: Validacao): Promise<boolean> {
  if (!validacao.mensagem) return true;
  await atencao(validacao.mensagem);
  return false;
}

export function confirmar(mensagem: string, titulo = 'Confirmação'): Promise<boolean> {
  const tela = new Tela(
    { titulo, largura: 460, logo: false, rodape: false },
    `<div class="mensagem">${escapar(mensagem)}</div>
     <div class="botoes centro">
       <button data-id="sim" class="primario">Sim</button>
       <button data-id="nao">Não</button>
     </div>`,
  );
  return new Promise((resolve) => {
    const responder = (resposta: boolean) => {
      tela.fechar();
      resolve(resposta);
    };
    tela.botao('sim', undefined, () => responder(true));
    tela.botao('nao', undefined, () => responder(false));
    tela.aoEsc = () => responder(false);
    tela.abrir();
    tela.el('sim').focus();
  });
}

export interface Progresso {
  atualizar(mensagem: string): void;
  fechar(): void;
}

/** Popup "aguarde". Esc não fecha: o processo precisa terminar. */
export function abrirProgresso(mensagem: string): Progresso {
  const tela = new Tela(
    { titulo: 'Aguarde', largura: 360, logo: false, rodape: false },
    `<div class="progresso"><span class="spinner"></span><span data-id="mensagem">${escapar(mensagem)}</span></div>`,
  );
  tela.aoEsc = () => undefined;
  tela.abrir();
  return {
    atualizar: (texto) => (tela.el('mensagem').textContent = texto),
    fechar: () => tela.fechar(),
  };
}

/** Executa uma ação mostrando o popup "aguarde". */
export async function comProgresso<T>(mensagem: string, acao: (progresso: Progresso) => Promise<T>): Promise<T> {
  const progresso = abrirProgresso(mensagem);
  try {
    return await acao(progresso);
  } finally {
    progresso.fechar();
  }
}

/**
 * Simula a impressão do comprovante. O operador escolhe se a impressão deu
 * certo ou falhou, para demonstrar os dois caminhos:
 *  - impresso: o fluxo segue para a CONFIRMAÇÃO da transação;
 *  - falhou:   o fluxo DESFAZ a transação ("Não foi possível imprimir o
 *              comprovante. A transação foi desfeita.").
 */
export function imprimirComprovante(comprovante: string | undefined, titulo: string): Promise<boolean> {
  const linhas = linhasComprovante(comprovante);
  const tela = new Tela(
    { titulo: `Impressora (simulada) - ${titulo}`, largura: 420, logo: false, rodape: false },
    `<pre class="comprovante">${escapar(linhas.length ? linhas.join('\n') : '(transação sem comprovante)')}</pre>
     <div class="botoes centro">
       <button data-id="impresso" class="primario">${rotulo('imprimir', 'Impresso', 'F2')}</button>
       <button data-id="falha" class="perigo">${rotulo('falha', 'Falha na impressão', 'F3')}</button>
     </div>`,
  );
  return new Promise((resolve) => {
    const responder = (impresso: boolean) => {
      tela.fechar();
      resolve(impresso);
    };
    tela.botao('impresso', 'F2', () => responder(true));
    tela.botao('falha', 'F3', () => responder(false));
    tela.aoEsc = () => undefined;
    tela.abrir();
    tela.el('impresso').focus();
  });
}
