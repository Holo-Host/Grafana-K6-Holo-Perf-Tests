export type KeyPair = {
  publicKey: () => Uint8Array
  sign: (Uint8Array: Uint8Array) => Uint8Array
}


let holoCryptoLib: any
// @ts-ignore
import('@holo-host/cryptolib').then(cryptolib => {
  holoCryptoLib = cryptolib
})

let sign_count = 0

export default class Signer {
  key_pair: KeyPair | undefined
  key_manager_extension_client: any
  pubkey: Uint8Array            // the raw bytes of the pubkey
  agent_id: string              // the holo encoded pubkey (ie with the prefix)
  pure_encoded_pubkey: string   // the pubkey encoded as a signature (ie with no prefix)

  constructor({
    key_pair,
    key_manager_extension_client,
    pubkey
  }: SignerInput) {
    if (key_pair) {
      this.key_pair = key_pair
      this.pubkey = key_pair.publicKey()
    } else if (key_manager_extension_client && pubkey) {
      this.key_manager_extension_client = key_manager_extension_client
      this.pubkey = pubkey
    } else {
      throw new Error("Must provide either KeyPair or IHoloKeyManager and pubkey to instantiate Signer")
    }

    const { Codec } = holoCryptoLib

    this.agent_id = Codec.AgentId.encode(this.pubkey)
    this.pure_encoded_pubkey = Codec.Signature.encode(this.pubkey)
  }

  sign(message: Uint8Array): Promise<Uint8Array> {
    if (this.key_pair) {
      return Promise.resolve(this.key_pair.sign(message))
    } else {
      return this.key_manager_extension_client.signMessage(message)
    }
  }
}

type SignerInput = {
  key_pair?: KeyPair
  key_manager_extension_client?: any
  pubkey?: Uint8Array
}