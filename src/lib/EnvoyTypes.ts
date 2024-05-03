import * as msgpack from '@msgpack/msgpack'
// @ts-ignore
import SerializeJSON from 'json-stable-stringify'

export type HoloAppStatus = {
    type: 'not_installed'  
  } | {
    type: 'installing'
  } | {
    type: 'installed',
    data: HoloAppInfo
  } | {
    type: 'error_installing',
    data: string
  } | {
    type: 'not_hosted'
  } | {
    type: 'paused'
  } | {
    type: 'error_getting_app_info',
    data: string
  } | {
    type: 'error_enabling',
    data: string
  }
  
  export type HoloAppStatusType = "not_installed" | "installing" | "installed" | "error_installing" | "not_hosted" | "paused" | "error_getting_app_info" | "error_enabling"
  
  export type HoloAppInfo = {
    cell_info: {[role_name: string]: Array<CellInfo>},
    status: any,
    enable_errors: Array<any>,
    agent_pub_key: string,
    manifest: any
  }
  
  export type CellInfo = {
    data: {
      cell_id: any
    }
  }
  
  export type HostDetails = {
    host_url: string
    preference_hash: string
    outdated_hash?: boolean
  }

  export const wait = (ms:any) => new Promise(resolve => setTimeout(resolve, ms))

  export async function raceResolved<T> (promises: Promise<T>[], rejectDelay: number): Promise<T> {
    return Promise.race(promises.map(promise => promise.catch(async e => {
      await wait(rejectDelay)
      throw e
    })))
  }

  export type KeyPair = {
    publicKey: () => Uint8Array
    sign: (Uint8Array: any) => Uint8Array
  }

  export type HappConfig = {
    name: string,
    logo_url?: string,
    publisher_name?: string,
    registration_info_url?: string,
    is_paused: boolean,
  }

  export async function msgpackDecodeFromBlob(blob: Blob): Promise<unknown> {
    if (blob.stream) {
      return await msgpack.decodeAsync(blob.stream())
    } else {
      return msgpack.decode(await blob.arrayBuffer())
    }
  }

  const sha256 = async (buffer:any) => {
    if (crypto.subtle === undefined) {
      return (<any>crypto).createHash('sha256').update(buffer).digest()
    } else {
      return Buffer.from(await crypto.subtle.digest('SHA-256', buffer))
    }
  }

  export function serializeAndHash(payload: any): Promise<any> {
    const serialized_args = SerializeJSON(payload)
    return sha256(Buffer.from(serialized_args, 'utf8'))
  }

  export function getHostIdFromUrl(host_url: string): string {
    const components = host_url.split('.')
    if (components.length > 2) {
      // a real domain containing the host pubkey
      return components[0]
    } else {
      // a localhost domain
      return 'mock_host_id_string'
    }
  }

  // Copied from cryptolib
function convert_b64_to_holohash_b64(rawBase64:any) {
    let holoHashbase64 = ''
    const len = rawBase64.length
    for (let i = 0; i < len; i++) {
      let char = rawBase64[i]
      if (char === '/') {
        char = '_'
      } else if (char === '+') {
        char = '-'
      }
      holoHashbase64 += char
    }
    return holoHashbase64
  }

  let holoCryptoLib: any
  // @ts-ignore
  import('@holo-host/cryptolib').then(cryptolib => {
    holoCryptoLib = cryptolib
  })
  
  // This should be handled entirely by cryptolib, but it doesn't quite play nice
  export function holoEncodeDnaHash(dna_hash:any) {
    const { Codec } = holoCryptoLib()
    const url_unsafe = 'u' + Codec.Signature.encode(Buffer.from(dna_hash))
    return convert_b64_to_holohash_b64(url_unsafe)
  }