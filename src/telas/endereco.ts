/**
 * Tela "TEF Convcard - Atualização de endereço".
 *
 * Aberta quando o retorno de uma compra com cartão digitado ou de um
 * recebimento antecipado vem com endereco.atualizaEndereco = true. Os campos
 * já vêm preenchidos com o endereço retornado e o operador confirma os dados
 * com o portador do cartão.
 *
 *  - Enter no CEP: POST /consulta/consulta-cep (preenche logradouro, bairro,
 *    cidade e estado);
 *  - Confirmar [F2]: PUT /endereco/atualizacao.
 */
import type { EnderecoModel } from '../convcard/modelos';
import { Tela, Validacao } from './base';
import { comProgresso, atencao, validar } from './comum';
import { icone, rotulo } from './icones';
import { maiusculas, mascaraCep } from './mascaras';
import { api, escapar, mensagemErro, opcoesUf, somenteDigitos } from './util';

/** Resolve com true se o endereço foi atualizado, false se o operador saiu sem confirmar. */
export function abrirAtualizacaoEndereco(cartao: string, endereco: EnderecoModel): Promise<boolean> {
  const tela = new Tela(
    { titulo: 'TEF Convcard - Atualização de endereço', largura: 500 },
    `<div class="faixa-titulo">Atualização do endereço postal<br />Favor confirmar os dados abaixo com o usuário do cartão</div>
     <div class="grade-campos" style="grid-template-columns: 91px 1fr 82px 1fr">
       <label>CEP:</label>
       <span class="linha"><input data-id="cep" value="${escapar(endereco.cep)}" /><button data-id="lupa" class="so-icone" tabindex="-1" title="Buscar CEP">${icone('pesquisar')}</button></span>
       <span></span><span></span>
       <label>Logradouro:</label><input data-id="logradouro" class="span3" value="${escapar(endereco.endereco)}" />
       <label>Complemento:</label><input data-id="complemento" value="${escapar(endereco.complemento)}" />
       <label>Número:</label><input data-id="numero" value="${escapar(endereco.numero)}" />
       <label>Bairro:</label><input data-id="bairro" class="span3" value="${escapar(endereco.bairro)}" />
       <label>Cidade:</label><input data-id="cidade" value="${escapar(endereco.cidade)}" />
       <label>Estado:</label><select data-id="estado">${opcoesUf()}</select>
     </div>
     <div class="botoes centro"><button data-id="confirmar" class="primario">${rotulo('confirmar', 'Confirmar', 'F2')}</button></div>`,
  );

  tela.el<HTMLSelectElement>('estado').value = endereco.estado ?? '';
  mascaraCep(tela.el('cep'));
  tela.el('cep').dispatchEvent(new Event('input'));
  maiusculas(tela.el('logradouro'), 40);
  maiusculas(tela.el('complemento'), 20);
  maiusculas(tela.el('numero'), 10);
  maiusculas(tela.el('bairro'), 25);
  maiusculas(tela.el('cidade'), 25);

  let ultimoCepConsultado = somenteDigitos(endereco.cep ?? '');

  /** Enter no CEP: só consulta se tiver 8 dígitos e for diferente do último consultado. */
  async function buscarCep(): Promise<void> {
    const cep = somenteDigitos(tela.el('cep').value);
    if (cep.length !== 8 || cep === ultimoCepConsultado) return;
    ultimoCepConsultado = cep;
    try {
      const retorno = await comProgresso('Buscando CEP...', () => api().consultarCep(cep));
      // Preenche só o que veio preenchido
      if (retorno.endereco) tela.el('logradouro').value = retorno.endereco.toUpperCase();
      if (retorno.bairro) tela.el('bairro').value = retorno.bairro.toUpperCase();
      if (retorno.cidade) tela.el('cidade').value = retorno.cidade.toUpperCase();
      if (retorno.estado) tela.el<HTMLSelectElement>('estado').value = retorno.estado.toUpperCase();
    } catch (e) {
      await atencao(mensagemErro(e));
    }
  }

  tela.el('cep').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void buscarCep();
  });

  return new Promise((resolve) => {
    async function confirmarEndereco(): Promise<void> {
      const cep = somenteDigitos(tela.el('cep').value);
      const dados = {
        cartao,
        cep,
        endereco: tela.el('logradouro').value.trim(),
        complemento: tela.el('complemento').value.trim(),
        numero: tela.el('numero').value.trim(),
        bairro: tela.el('bairro').value.trim(),
        cidade: tela.el('cidade').value.trim(),
        estado: tela.el<HTMLSelectElement>('estado').value,
      };

      // Todos os campos são obrigatórios
      const validacao = new Validacao()
        .requerido('CEP', dados.cep)
        .requerido('Logradouro', dados.endereco)
        .requerido('Complemento', dados.complemento)
        .requerido('Numero', dados.numero)
        .requerido('Bairro', dados.bairro)
        .requerido('Cidade', dados.cidade)
        .requerido('Estado', dados.estado);
      if (cep && cep.length !== 8) validacao.adicionar('CEP', 'Inválido');
      if (!(await validar(validacao))) return;

      try {
        await comProgresso('Salvando alterações...', () => api().atualizarEndereco(dados));
        tela.fechar();
        resolve(true);
      } catch (e) {
        await atencao(mensagemErro(e));
      }
    }

    tela.botao('confirmar', 'F2', () => void confirmarEndereco());
    tela.aoEsc = () => {
      tela.fechar();
      resolve(false);
    };
    tela.abrir();
    tela.el('cep').focus();
  });
}
