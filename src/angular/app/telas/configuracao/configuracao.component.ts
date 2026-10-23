/**
 * Tela "Configurações" da integração.
 *
 * O exemplo usa somente o ambiente de homologação (URL fixa em
 * src/electron/convcard/cliente.ts).
 *
 *  - Token da loja: enviado como identificadorLoja em toda requisição;
 *  - Enviar dados receita: exibe os campos de receita médica na venda;
 *  - Enviar número nota: envia o número do cupom/nota na venda;
 *  - Certificado .p12 + senha: autenticação com o autorizador (mTLS).
 * Certificado, senha e token da loja são fornecidos pela Convcard.
 *
 * "Validar configuração [F3]" chama POST /validacao/validar-configuracao,
 * que confere certificado e token da loja.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Configuracao } from '../../../../shared/ipc';
import { IconeComponent } from '../../componentes/icone.component';
import { TelaTefComponent } from '../../componentes/tela-tef.component';
import { ConfiguracaoService } from '../../core/configuracao.service';
import { CONVCARD_API } from '../../core/convcard-api';
import { DialogosService } from '../../core/dialogos.service';
import { TelaBase } from '../../core/tela-base';
import { Validacao, mensagemErro } from '../../core/util';

@Component({
  selector: 'app-configuracao',
  imports: [FormsModule, TelaTefComponent, IconeComponent],
  templateUrl: './configuracao.component.html',
})
export class ConfiguracaoComponent extends TelaBase {
  static readonly largura = '580px';

  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);
  private readonly configuracao = inject(ConfiguracaoService);

  // Cópia editável da configuração atual
  private readonly atual = this.configuracao.valor;
  protected readonly identificadorLoja = signal(this.atual.identificadorLoja);
  protected readonly nomeLoja = signal(this.atual.nomeLoja);
  protected readonly usaReceita = signal(this.atual.usaReceita);
  protected readonly usaNumNota = signal(this.atual.usaNumNota);
  protected readonly caminhoCertificado = signal(this.atual.caminhoCertificado);
  protected readonly senhaCertificado = signal(this.atual.senhaCertificado);
  protected readonly nomeSoftware = signal(this.atual.nomeSoftware);
  protected readonly versaoSoftware = signal(this.atual.versaoSoftware);

  protected override readonly teclas = {
    F2: () => void this.salvarEFechar(),
    F3: () => void this.validar(),
  };

  protected async selecionarCertificado(): Promise<void> {
    const caminho = await this.api.selecionarCertificado();
    if (caminho) this.caminhoCertificado.set(caminho);
  }

  protected async salvarEFechar(): Promise<void> {
    if (await this.salvar()) this.fechar();
  }

  /** Salva e chama POST /validacao/validar-configuracao. */
  protected async validar(): Promise<void> {
    if (!(await this.salvar())) return;
    try {
      const retorno = await this.dialogos.comProgresso('Validando configuração...', () => this.api.validarConfiguracao());
      await this.dialogos.mensagemOperador(retorno.mensagem || '000 - APROVADO');
    } catch (e) {
      await this.dialogos.atencao(mensagemErro(e));
    }
  }

  private async salvar(): Promise<boolean> {
    const nova: Configuracao = {
      identificadorLoja: this.identificadorLoja().trim(),
      nomeLoja: this.nomeLoja().trim(),
      usaReceita: this.usaReceita(),
      usaNumNota: this.usaNumNota(),
      caminhoCertificado: this.caminhoCertificado(),
      senhaCertificado: this.senhaCertificado(),
      nomeSoftware: this.nomeSoftware().trim(),
      versaoSoftware: this.versaoSoftware().trim(),
    };
    const validacao = new Validacao()
      .requerido('Token da loja', nova.identificadorLoja)
      .requerido('Certificado', nova.caminhoCertificado)
      .requerido('Nome do software', nova.nomeSoftware)
      .requerido('Versão do software', nova.versaoSoftware);
    if (!(await this.dialogos.validar(validacao))) return false;

    await this.configuracao.salvar(nova);
    return true;
  }
}
