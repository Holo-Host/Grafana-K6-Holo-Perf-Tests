import type { KeyPair } from "./EnvoyTypes"
import type { IHoloKeyManager } from '@holo-host/holo-key-manager-js-client/lib/holo-key-manager-js-client/src/types'


let sign_count = 0

export var cryptolib: any

// @ts-ignore
import('@holo-host/cryptolib').then((cryptolib:any) => {
  cryptolib = cryptolib
})

export default class Signer {
  // @ts-ignore
  key_pair: KeyPair
  // @ts-ignore
  key_manager_extension_client: IHoloKeyManager
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

    const { Codec } = cryptolib()

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
  key_manager_extension_client?: IHoloKeyManager
  pubkey?: Uint8Array
}