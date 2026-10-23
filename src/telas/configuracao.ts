/**
 * Tela "TEF Convcard - Configurações".
 *
 * O exemplo usa somente o ambiente de homologação (URL fixa em cliente.ts).
 *
 *  - Enviar dados receita: exibe os campos de receita médica na venda;
 *  - Enviar número nota: envia o número do cupom/nota na venda.
 * O certificado .p12 + senha e o token da loja (enviado como
 * identificadorLoja) são fornecidos pela Convcard.
 *
 * "Validar configuração [F3]" chama POST /validacao/validar-configuracao,
 * que confere certificado e token da loja.
 */
import type { Configuracao } from '../shared/ipc';
import { Tela, Validacao } from './base';
import { rotulo } from './icones';
import { atencao, comProgresso, mensagemOperador, validar } from './comum';
import { api, carregarConfiguracao, config, escapar, mensagemErro } from './util';

export function abrirConfiguracao(): Promise<void> {
  const c = config();
  const simNao = (valor: boolean) =>
    `<option value="S" ${valor ? 'selected' : ''}>SIM</option><option value="N" ${valor ? '' : 'selected'}>NÃO</option>`;

  const tela = new Tela(
    { titulo: 'TEF Convcard - Configurações', largura: 560 },
    `<div class="grade-campos" style="grid-template-columns: 170px 1fr">
       <label>Ambiente:</label><input value="Homologação (aut-h.convcard.com.br)" readonly tabindex="-1" />
       <label>Token da loja:</label><input data-id="token-loja" placeholder="01c760b2-a9db-429c-ad60-d926f49878cd" value="${escapar(c.identificadorLoja)}" />
       <label>Nome da loja:</label><input data-id="nome-loja" value="${escapar(c.nomeLoja)}" />
       <label>Enviar dados receita:</label><select data-id="usa-receita">${simNao(c.usaReceita)}</select>
       <label>Enviar número nota:</label><select data-id="usa-num-nota">${simNao(c.usaNumNota)}</select>
       <label>Certificado (.p12):</label>
       <span class="linha"><input data-id="certificado" readonly value="${escapar(c.caminhoCertificado)}" /><button data-id="selecionar" title="Selecionar certificado">${rotulo('pasta', 'Selecionar')}</button></span>
       <label>Senha do certificado:</label><input data-id="senha" type="password" value="${escapar(c.senhaCertificado)}" />
       <label>Nome do software:</label><input data-id="nome-software" value="${escapar(c.nomeSoftware)}" />
       <label>Versão do software:</label><input data-id="versao-software" value="${escapar(c.versaoSoftware)}" />
     </div>
     <div class="botoes centro">
       <button data-id="salvar" class="primario">${rotulo('salvar', 'Salvar', 'F2')}</button>
       <button data-id="validar">${rotulo('validar', 'Validar configuração', 'F3')}</button>
       <button data-id="sair">${rotulo('sair', 'Sair', 'Esc')}</button>
     </div>`,
  );

  function lerFormulario(): Configuracao {
    return {
      identificadorLoja: tela.el('token-loja').value.trim(),
      nomeLoja: tela.el('nome-loja').value.trim(),
      usaReceita: tela.el<HTMLSelectElement>('usa-receita').value === 'S',
      usaNumNota: tela.el<HTMLSelectElement>('usa-num-nota').value === 'S',
      caminhoCertificado: tela.el('certificado').value,
      senhaCertificado: tela.el('senha').value,
      nomeSoftware: tela.el('nome-software').value.trim(),
      versaoSoftware: tela.el('versao-software').value.trim(),
    };
  }

  async function salvar(): Promise<boolean> {
    const nova = lerFormulario();
    const validacao = new Validacao()
      .requerido('Token da loja', nova.identificadorLoja)
      .requerido('Certificado', nova.caminhoCertificado)
      .requerido('Nome do software', nova.nomeSoftware)
      .requerido('Versão do software', nova.versaoSoftware);
    if (!(await validar(validacao))) return false;
    await api().salvarConfiguracao(nova);
    await carregarConfiguracao();
    document.dispatchEvent(new Event('configuracao-alterada'));
    return true;
  }

  async function validarConfiguracao(): Promise<void> {
    if (!(await salvar())) return;
    try {
      const retorno = await comProgresso('Validando configuração...', () => api().validarConfiguracao());
      await mensagemOperador(retorno.mensagem || '000 - APROVADO');
    } catch (e) {
      await atencao(mensagemErro(e));
    }
  }

  return new Promise((resolve) => {
    const fechar = () => {
      tela.fechar();
      resolve();
    };
    tela.botao('selecionar', undefined, async () => {
      const caminho = await api().selecionarCertificado();
      if (caminho) tela.el('certificado').value = caminho;
    });
    tela.botao('salvar', 'F2', async () => {
      if (await salvar()) fechar();
    });
    tela.botao('validar', 'F3', () => void validarConfiguracao());
    tela.botao('sair', undefined, fechar);
    tela.aoEsc = fechar;
    tela.abrir();
    tela.el('token-loja').focus();
  });
}
