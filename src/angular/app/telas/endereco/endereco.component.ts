/**
 * Tela "Atualização de endereço".
 *
 * Aberta quando o retorno de uma compra com cartão digitado ou de um
 * recebimento antecipado vem com endereco.atualizaEndereco = true. Os campos
 * já vêm com o endereço retornado e o operador confirma os dados com o
 * portador do cartão.
 *
 *  - Enter no CEP (ou lupa): POST /consulta/consulta-cep
 *  - Confirmar [F2]:         PUT /endereco/atualizacao
 *
 * Fecha com true se o endereço foi atualizado, false se o operador saiu.
 */
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { EnderecoModel } from '../../../../shared/modelos';
import { IconeComponent } from '../../componentes/icone.component';
import { MascaraDirective } from '../../componentes/mascara.directive';
import { TelaTefComponent } from '../../componentes/tela-tef.component';
import { CONVCARD_API } from '../../core/convcard-api';
import { DialogosService } from '../../core/dialogos.service';
import { TelaBase } from '../../core/tela-base';
import { UFS, Validacao, mensagemErro, somenteDigitos } from '../../core/util';

export interface DadosEnderecoTela {
  cartao: string;
  endereco: EnderecoModel;
}

@Component({
  selector: 'app-endereco',
  imports: [FormsModule, TelaTefComponent, IconeComponent, MascaraDirective],
  templateUrl: './endereco.component.html',
})
export class EnderecoComponent extends TelaBase<boolean> {
  static readonly largura = '540px';

  private readonly api = inject(CONVCARD_API);
  private readonly dialogos = inject(DialogosService);
  private readonly dados: DadosEnderecoTela = inject(DIALOG_DATA);

  protected readonly ufs = UFS;
  protected readonly cep = signal(somenteDigitos(this.dados.endereco.cep ?? ''));
  protected readonly logradouro = signal((this.dados.endereco.endereco ?? '').toUpperCase());
  protected readonly complemento = signal((this.dados.endereco.complemento ?? '').toUpperCase());
  protected readonly numero = signal((this.dados.endereco.numero ?? '').toUpperCase());
  protected readonly bairro = signal((this.dados.endereco.bairro ?? '').toUpperCase());
  protected readonly cidade = signal((this.dados.endereco.cidade ?? '').toUpperCase());
  protected readonly estado = signal((this.dados.endereco.estado ?? '').toUpperCase());

  private ultimoCepConsultado = this.cep();

  protected override readonly teclas = { F2: () => void this.confirmar() };

  /** Só consulta se o CEP tiver 8 dígitos e for diferente do último consultado. */
  protected async buscarCep(): Promise<void> {
    const cep = this.cep();
    if (cep.length !== 8 || cep === this.ultimoCepConsultado) return;
    this.ultimoCepConsultado = cep;
    try {
      const retorno = await this.dialogos.comProgresso('Buscando CEP...', () => this.api.consultarCep(cep));
      // Preenche só o que veio preenchido
      if (retorno.endereco) this.logradouro.set(retorno.endereco.toUpperCase());
      if (retorno.bairro) this.bairro.set(retorno.bairro.toUpperCase());
      if (retorno.cidade) this.cidade.set(retorno.cidade.toUpperCase());
      if (retorno.estado) this.estado.set(retorno.estado.toUpperCase());
    } catch (e) {
      await this.dialogos.atencao(mensagemErro(e));
    }
  }

  protected async confirmar(): Promise<void> {
    const dados = {
      cartao: this.dados.cartao,
      cep: this.cep(),
      endereco: this.logradouro().trim(),
      complemento: this.complemento().trim() || undefined,
      numero: this.numero().trim(),
      bairro: this.bairro().trim(),
      cidade: this.cidade().trim(),
      estado: this.estado(),
    };

    // Obrigatórios conforme a API (complemento é opcional)
    const validacao = new Validacao()
      .requerido('CEP', dados.cep)
      .requerido('Logradouro', dados.endereco)
      .requerido('Número', dados.numero)
      .requerido('Bairro', dados.bairro)
      .requerido('Cidade', dados.cidade)
      .requerido('Estado', dados.estado);
    if (dados.cep && dados.cep.length !== 8) validacao.adicionar('CEP', 'Inválido');
    if (!(await this.dialogos.validar(validacao))) return;

    try {
      await this.dialogos.comProgresso('Salvando alterações...', () => this.api.atualizarEndereco(dados));
      this.fechar(true);
    } catch (e) {
      await this.dialogos.atencao(mensagemErro(e));
    }
  }

  protected override aoEsc(): void {
    this.fechar(false);
  }
}
