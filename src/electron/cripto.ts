/**
 * Criptografia dos dados sensíveis gravados em disco (a transação pendente,
 * que contém o número do cartão ou o QR Code).
 *
 * Usa o safeStorage do Electron, que guarda a chave no cofre do sistema
 * operacional:
 *  - Windows: DPAPI (chave ligada ao usuário do Windows);
 *  - macOS:   Keychain;
 *  - Linux:   gnome-keyring/libsecret ou KWallet.
 *
 * No Linux sem cofre de senhas (ex.: PDV sem ambiente gráfico completo), o
 * Electron cai no backend "basic_text", que criptografa com uma senha fixa
 * conhecida, ou seja, não protege nada. Nesse caso usamos AES-256-GCM com
 * uma chave aleatória gerada no primeiro uso e gravada num arquivo com
 * permissão 0600 (só o usuário do PDV lê).
 *
 * O primeiro byte do resultado indica o método usado, para que a leitura
 * saiba como descriptografar.
 */
import { app, safeStorage } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const METODO_SAFE_STORAGE = 1;
const METODO_CHAVE_LOCAL = 2;

export async function criptografar(texto: string): Promise<Buffer> {
  if (await usaSafeStorage()) {
    return Buffer.concat([Buffer.from([METODO_SAFE_STORAGE]), await safeStorage.encryptStringAsync(texto)]);
  }
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', chaveLocal(), iv);
  const conteudo = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  // [método][iv 12 bytes][tag 16 bytes][conteúdo]
  return Buffer.concat([Buffer.from([METODO_CHAVE_LOCAL]), iv, cifra.getAuthTag(), conteudo]);
}

/** Lança erro se os dados não puderem ser lidos (outra máquina/usuário, arquivo corrompido). */
export async function descriptografar(dados: Buffer): Promise<string> {
  const conteudo = dados.subarray(1);
  if (dados[0] === METODO_SAFE_STORAGE) {
    return (await safeStorage.decryptStringAsync(conteudo)).result;
  }
  if (dados[0] === METODO_CHAVE_LOCAL) {
    const decifra = crypto.createDecipheriv('aes-256-gcm', chaveLocal(), conteudo.subarray(0, 12));
    decifra.setAuthTag(conteudo.subarray(12, 28));
    return Buffer.concat([decifra.update(conteudo.subarray(28)), decifra.final()]).toString('utf8');
  }
  throw new Error('Formato de dados criptografados desconhecido.');
}

async function usaSafeStorage(): Promise<boolean> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
  return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text';
}

let chave: Buffer | undefined;

/** Chave AES de 256 bits em <userData>/pendencia.key, criada no primeiro uso. */
function chaveLocal(): Buffer {
  if (!chave) {
    const arquivo = path.join(app.getPath('userData'), 'pendencia.key');
    if (!fs.existsSync(arquivo)) {
      fs.writeFileSync(arquivo, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' });
      console.info(`[CRIPTO] Cofre do sistema indisponível; chave local criada em ${arquivo}`);
    }
    chave = fs.readFileSync(arquivo);
  }
  return chave;
}
