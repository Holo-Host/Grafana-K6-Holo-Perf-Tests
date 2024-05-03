
import {
  type CellId,
  type AppInfo,
  type InstalledCell,
  type CallZomeRequestUnsigned,
  randomNonce,
  getNonceExpiration,
  hashZomeCall,
  type AppCreateCloneCellRequest,
  type CreateCloneCellResponse,
  type EnableCloneCellResponse,
  type DisableCloneCellResponse,
  type AppEnableCloneCellRequest,
  type AppDisableCloneCellRequest
} from '@holochain/client'
import type { HoloAppStatus, HoloAppStatusType, HostDetails, HappConfig } from './EnvoyTypes'
import  { raceResolved, msgpackDecodeFromBlob, serializeAndHash, getHostIdFromUrl, holoEncodeDnaHash, wait } from './EnvoyTypes'
import type Signer from './Signer'
const { EventEmitter } = require('events')
const WebSocket = require('isomorphic-ws')
const msgpack = require('@msgpack/msgpack')

const BASE_RETRY_DELAY = 5_000
const MAX_RETRIES = 7
const MAX_RETRY_DELAY = Math.pow(2, MAX_RETRIES) * BASE_RETRY_DELAY

let next_instance_count = 0

export default class EnvoyApi extends EventEmitter {
  instance_count: number
  response_consumers: ResponseConsumers
  next_response_id: ResponseId
  // @ts-ignore
  envoy_ws: WebSocket
  host: HostDetails
  host_id: string
  is_anonymous: boolean
  happ_id: string
  signer: Signer
  // @ts-ignore
  happ_config: Promise<HappConfig>
  retry_delay: number

  constructor({
    host,
    signer,
    happ_id,
    is_anonymous,
  }: EnvoyApiInput) {
    super()

    this.instance_count = next_instance_count++

    console.log(`Instantiating EnvoyApi #(${this.instance_count}) with: `, {host, happ_id, is_anonymous, agent_id: signer.agent_id})

    // There's some redundancy between this class and Agent. Specifically, from a seed we can get a keypair and agent id, so passing all
    // three is not strictly necessary. The alternative is to make multiple redundant relatively expensive cryptographic calls.
    this.signer = signer
    this.happ_id = happ_id
    this.host = host
    this.host_id = getHostIdFromUrl(host.host_url)
    this.is_anonymous = is_anonymous

    this.response_consumers = {}
    this.next_response_id = 0 as ResponseId
    this.retry_delay = 0
  }

  // TODO: consider refactoring constructor/initialize/connect into two functions 
  async initialize () : Promise<EnvoyApi> { // returns itself
    console.log(`Initializing EnvoyApi #(${this.instance_count})`)    

    if (this.retry_delay > MAX_RETRY_DELAY) {
      console.log(`EnvoyApi #(${this.instance_count}) reached max number of retries. Closing`)
      this.emit('error', new Error('Failed to connect'))
      this.close()
      // @ts-ignore
      return
    }

    await wait(this.retry_delay)

    this.retry_delay = this.retry_delay === 0 ? BASE_RETRY_DELAY : this.retry_delay * 2

    const scheme = process.env.CHAPERONE_CONFIG_SECURE_WS ? 'wss' : 'ws'

    try {
      this.envoy_ws = new WebSocket(
        `${scheme}://${this.host.host_url}/hosting/?host_preference_hash=${
          this.host.preference_hash
        }&agent=${this.signer.agent_id}&happ=${this.happ_id}${this.is_anonymous ? '&anonymous' : ''}`
      )
    } catch (e) {
      // This will very rarely (ever?) throw. In case of a bad connection, `new Websocket` will return and then call `onerror`
      throw {
        type: 'failed_host_connect',
        data: { host_url: this.host.host_url }
      }
    }

    this.envoy_ws.onclose = async () => {
      console.log(`EnvoyApi #(${this.instance_count}) - Websocket unexpectedly closing, attempting to restart in ${this.retry_delay/1000} seconds`)

      this.emit('close')

      this.initialize()
    }

    this.envoy_ws.onmessage = async message => {
      const decoded_message: EnvoyIncomingMessage =
        (await msgpackDecodeFromBlob(message.data)) as EnvoyIncomingMessage

      switch (decoded_message.type) {
        case 'app_status_changed':
          this.emit('app_status_changed', decoded_message.data)
          break
        case 'signing_request':
          this.handleSigningRequest(decoded_message.data)
          break
        case 'response':
          const { id, body } = decoded_message.data
          this.response_consumers[id](body)
          break
        case 'signal':
          this.handleSignal(decoded_message.data)
          break
        case 'outdated_host_preferences':
          this.emit('outdated_host_preferences', decoded_message.data)
          break
        case 'happ_config':
          this.retry_delay = 0 // happ config should happen exactly once at the beginning of the connection so resetting here makes sense
          this.emit('happ_config', decoded_message.data.data)
          break
        case 'version':
          checkEnvoyVersion(decoded_message.data)
          break
        default:
          console.log('unknown message type', decoded_message)
      }
    }

    // Translating happ_config from an event to a field on the object, to avoid timing issues
    // This is necessary because we don't have a "ping for happ_config" message for envoy 
    // and only works because happ_config never changes over the lifecycle of an EnvoyApi instance.
    // If either of these conditions change we should rethink this.
    this.happ_config = new Promise(resolve => {
      this.on('happ_config', (happ_config:any) => resolve(happ_config))
    })

    // keep alive heart beat
    this.heartbeat_interval = setInterval(() => {
      this.get_app_status()
    }, 15_000)

    return new Promise(resolve => {
      // wait til socket is open before adding error handler and returning
      this.envoy_ws.onopen = () => {
        this.emit('open')

        this.envoy_ws.onerror = e => {
          this.emit('error', e)
        }        

        resolve(this)
      }
    })
  }

  static async connect(input: EnvoyApiInput): Promise<EnvoyApi> {
    const envoy_api = new EnvoyApi(input)
    return envoy_api.initialize()
  }

  async get_envoy_version() {
    console.log(`EnvoyApi #(${this.instance_count}) - Getting envoy version`)
    await this.sendRequest(version_request())
  }

  async get_app_status() {
    console.log(`EnvoyApi #(${this.instance_count}) - Getting app status`)
    await this.sendRequest(app_status_request())
  }

  async install_app(membrane_proof?: Buffer) {
    console.log(`EnvoyApi #(${this.instance_count}) - Installing app`, membrane_proof)
    await this.sendRequest(install_request(membrane_proof))
  }

  async enable_app() {
    console.log(`EnvoyApi #(${this.instance_count}) - Enabling app`)
    await this.sendRequest(enable_request())
  }

  async zome_call(zome_call_args: ZomeCallArgs) {
    console.log(`EnvoyApi #(${this.instance_count}) - Making zome call`, zome_call_args)
    const id = this.next_response_id++ as ResponseId

    const request = await zome_call_request({
      ...zome_call_args,
      signer: this.signer,
      hha_hash: this.happ_id,
      id,
      host_id: this.host_id,
      hha_pricing_pref: this.host.preference_hash
    })

    this.sendRequest(request)

    const body = await new Promise<ResponseBody>(resolve => {
      this.response_consumers[id] = resolve
    })

    if (body.type === 'error') {
      return body
    } else {
      return {
        ...body,
        data: msgpack.decode(body.data)
      }
    }
  }

  async create_clone_cell(
    args: AppCreateCloneCellRequest
  ): Promise<Result<CreateCloneCellResponse>> {
    console.log(`EnvoyApi #(${this.instance_count}) - Making create clone call`, args)
    const id = this.next_response_id++ as ResponseId

    const request = await create_clone_cell_request(args, id)

    this.sendRequest(request)

    return new Promise<ResponseBody>(resolve => {
      this.response_consumers[id] = resolve
    })
  }

  async enable_clone_cell(
    args: AppEnableCloneCellRequest
  ): Promise<Result<EnableCloneCellResponse>> {
    console.log(`EnvoyApi #(${this.instance_count}) - Making enable clone call`, args)
    const id = this.next_response_id++ as ResponseId

    const request = await enable_clone_cell_request(args, id)

    this.sendRequest(request)

    return new Promise<ResponseBody>(resolve => {
      this.response_consumers[id] = resolve
    })
  }

  async disable_clone_cell(
    args: AppDisableCloneCellRequest
  ): Promise<Result<DisableCloneCellResponse>> {
    console.log(`EnvoyApi #(${this.instance_count}) - Making disable clone call`, args)
    const id = this.next_response_id++ as ResponseId

    const request = await disable_clone_cell_request(args, id)

    this.sendRequest(request)

    return new Promise<ResponseBody>(resolve => {
      this.response_consumers[id] = resolve
    })
  }

  async handleSigningRequest(signingRequest: SigningRequest) {
    const { id, payload } = signingRequest
    const signature = await this.signer.sign(payload)

    await this.sendRequest(
      signing_response_request({
        id,
        signature
      })
    )
  }

  async handleSignal(envoy_signal: EnvoySignal) {
    // we decode the data here so that Agent.ts doesn't have to know about msgpack
    const data = msgpack.decode(envoy_signal.data)
    const dna_hash = envoy_signal.dna_hash
    const zome_name = envoy_signal.zome_name

    this.emit('signal', {
      data,
      dna_hash,
      zome_name
    })
  }

  sendRequest(request: EnvoyOutgoingMessageSerialized) {
    this.envoy_ws.send(request)
  }

  // pings envoy for an app_status and returns a promise that resolves if the app_status matches expected_status, otherwise it either rejects or retries
  // if strategy is 'retry', this is recursive, retrying until delay is longer than 2 hours
  async expectStatusThen<T>(expected_status: HoloAppStatusType | HoloAppStatusType[], onStatus: (app_status: HoloAppStatus) => T, unexpected_strategy: 'reject' | 'retry', delay = 1000): Promise<T> {
    await this.get_app_status()

    const statusMatches = (app_status_type: HoloAppStatusType): boolean => {
      if (typeof expected_status === 'string') {
        return app_status_type === expected_status
      } else {
        return expected_status.includes(app_status_type)
      }
    }

    return new Promise((resolve, reject) => {
      this.once('app_status_changed', async (app_status: HoloAppStatus) => {
        if (statusMatches(app_status.type)) {
          resolve(onStatus(app_status))
        } else {
          if (unexpected_strategy === 'reject') {
            reject(new Error(`Unexpected app status in EnvoyApi #(${this.instance_count}) - expected ${expected_status}, got ${app_status.type}`))
          } else {
            // unexpected_strategy === 'retry'
            if (delay < 2 * 60 * 60 * 1000) { // 2 hours
              await wait (delay)
              resolve(this.expectStatusThen(expected_status, onStatus, unexpected_strategy, delay * 2))
            } else {
              reject(`Expected app status timed out in EnvoyApi #(${this.instance_count}) - expected ${expected_status}`)
            }
          }
        }
      })
    })  
  }

  close () {
    console.log(`Closing EnvoyApi #(${this.instance_count})`)
    clearInterval(this.heartbeat_interval)
    this.envoy_ws.onclose = null
    this.emit('close')
    this.envoy_ws.close()
    this.removeAllListeners()
  }
}

export const HOLOPORT_CONNECT_TIMEOUT = process.env.HOLOPORT_CONNECT_TIMEOUT
  ? parseInt(process.env.HOLOPORT_CONNECT_TIMEOUT)
  : 30_000

// utils
export const getWorkingEnvoyApi = ({ expected_status, is_anonymous }: { expected_status: HoloAppStatusType | HoloAppStatusType[], is_anonymous: boolean }) => async ({
  host,
  signer,
  happ_id,
}: {
  host: HostDetails,
  signer: Signer,
  happ_id: string,
}): Promise<EnvoyApi> => {

  let envoyApi: EnvoyApi

  try {
    envoyApi = await EnvoyApi.connect({
      host,
      signer,
      happ_id,
      is_anonymous,
    })
    await envoyApi.expectStatusThen(expected_status, () => {}, 'reject')
    // if we get here, the envoyApi is in a "working" state, in that it has returned the expected status status
    return envoyApi
  } catch (e) {
    // @ts-ignore
    console.error(`EnvoyApi #(${envoyApi?.instance_count}) - error connecting in getWorkingEnvoyApi: `, e)
    // @ts-ignore
    envoyApi.close()
    throw e
  }
}

// Returns a working anonymous EnvoyApi or throws
export const getWorkingAnonymousEnvoyApi = getWorkingEnvoyApi({ expected_status: ['installed', 'not_installed'], is_anonymous: true })

// Returns a working identified EnvoyApi or throws
export const getWorkingIdentifiedEnvoyApi = getWorkingEnvoyApi({ expected_status: 'installed', is_anonymous: false})

// Returns a working installable EnvoyApi or throws
export const getWorkingInstallableEnvoyApi = getWorkingEnvoyApi({ expected_status: ['installed', 'not_installed'], is_anonymous: true})

type FindWorkingHoloportArgs = {
  hosts: HostDetails[]
  signer: Signer
  happ_id: string
}

// takes a list of hosts and returns a working anonymous EnvoyApi or throws with the first failure
export async function findWorkingHoloport({
  hosts,
  signer,
  happ_id,
}: FindWorkingHoloportArgs, envoyApiGetFn: ReturnType<typeof getWorkingEnvoyApi>): Promise<EnvoyApi> {

  let getWorkingAnonymousPromises = []

  for (const host of hosts) {
    getWorkingAnonymousPromises.push(envoyApiGetFn({
      host,
      signer,
      happ_id,
    }))
  }

  // add a timeout in case none of the above promises come back
  let timeoutId: NodeJS.Timeout | null

  getWorkingAnonymousPromises.push(new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject({ type: 'anonymous_no_working_hosts' }), 
      HOLOPORT_CONNECT_TIMEOUT)
  }))

  // @ts-ignore
  let winnerPromise: Promise<EnvoyApi> = raceResolved(getWorkingAnonymousPromises, HOLOPORT_CONNECT_TIMEOUT)

  // asynchronously clean up any losing envoyApis that come back after the winner
  // @ts-ignore
  getWorkingAnonymousPromises.map((envoyApiPromise: Promise<EnvoyApi>) => envoyApiPromise.then(async envoyApi => {
    const winner = await winnerPromise
    if (envoyApi.instance_count !== winner.instance_count) {
      envoyApi.close()
    }

    if (winner && timeoutId) { // stop the anonymous_no_working_hosts timeout firing if we have a winner
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }))

  return winnerPromise
}

export async function findWorkingAnonymousHoloport(args: FindWorkingHoloportArgs): Promise<EnvoyApi> {
  return findWorkingHoloport(args, getWorkingAnonymousEnvoyApi)
}

export async function findWorkingInstallableHoloport(args: FindWorkingHoloportArgs): Promise<EnvoyApi> {
  return findWorkingHoloport(args, getWorkingInstallableEnvoyApi)
}


// installs the happ with this agent on the given host, returning a new instance of EnvoyApi
export const installAgentHappOnHost = async (anonymousEnvoyApi: EnvoyApi, membrane_proof?: Buffer): Promise<EnvoyApi> => {
  // TODO: It might be possible to elminate this second instantiation, and just start out with the identified connection
  const identifedEnvoyApi = await EnvoyApi.connect({
    is_anonymous: false,
    happ_id: anonymousEnvoyApi.happ_id,
    signer: anonymousEnvoyApi.signer,
    host: anonymousEnvoyApi.host
  })

  await identifedEnvoyApi.expectStatusThen('not_installed', () => {}, `reject`)

  await identifedEnvoyApi.install_app(membrane_proof)

  await identifedEnvoyApi.expectStatusThen('installed', () => {}, `retry`)

  // clean up original envoyApi
  anonymousEnvoyApi.close()

  return identifedEnvoyApi
} 

// specific envoy request messages

const version_request = (): EnvoyOutgoingMessageSerialized =>
  msgpack.encode({
    type: 'version',
    data: null
  })

const app_status_request = (): EnvoyOutgoingMessageSerialized =>
  msgpack.encode({
    type: 'app_status',
    data: null
  })

const install_request = (membrane_proof?: Buffer): EnvoyOutgoingMessageSerialized =>
  msgpack.encode({
    type: 'install_app',
    data: {
      membrane_proof: membrane_proof || null
    }
  })

const enable_request = (): EnvoyOutgoingMessageSerialized =>
  msgpack.encode({
    type: 'enable_app',
    data: null
  })

const signing_response_request = (signing_response: {
  id: SigningRequestId
  signature: Uint8Array
}): EnvoyOutgoingMessageSerialized =>
  msgpack.encode({
    type: 'signing_response',
    data: signing_response
  })

  
const zome_call_request = async ({
  zome_name,
  fn_name,
  payload,
  role_name,
  cell_id,
  cap_secret,
  signer,
  hha_hash,
  id,
  host_id,
  hha_pricing_pref
}:any): Promise<EnvoyOutgoingMessageSerialized> => {
  const args_hash = await serializeAndHash(payload)
  // hha_hash is deserialized as an ActionHash and must be sent as bytes

  // @ts-ignore
  const { Codec, HHT } = await import('@holo-host/cryptolib')
  const hha_hash_bytes = Codec.HoloHash.holoHashFromBuffer(
    HHT.HEADER,
    Codec.HoloHash.decode(hha_hash)
  )

  const pricing_pref = Codec.HoloHash.holoHashFromBuffer(
    HHT.HEADER,
    Codec.HoloHash.decode(hha_pricing_pref)
  )
  // The order of these fields matters. Changing it will cause a signature validation error.
  const spec = {
    call_spec: {
      args_hash,
      function: fn_name,
      zome: zome_name,
      role_name,
      hha_hash: hha_hash_bytes
    },
    host_id,
    timestamp: Date.now() * 1000,
    hha_pricing_pref: pricing_pref
  }

  const spec_bytes = msgpack.encode(spec)
  const spec_signature = await signer.sign(spec_bytes)

  const signed_spec = {
    spec,
    signature: spec_signature
  }
  const encoded_payload = msgpack.encode(payload)

  const provenance = Codec.HoloHash.holoHashFromBuffer(
    HHT.AGENT,
    signer.pubkey
  )

  const nonce = await randomNonce()
  const expires_at = getNonceExpiration()
  const unsigned_zome_call_payload: CallZomeRequestUnsigned = {
    cap_secret: cap_secret || null,
    cell_id,
    zome_name,
    fn_name,
    provenance,
    payload: encoded_payload,
    nonce,
    expires_at
  }
  const hashed_zome_call = await hashZomeCall(unsigned_zome_call_payload)
// try {

  const zome_call_signature = await signer.sign(hashed_zome_call)

  const cell_dna_hash = holoEncodeDnaHash(cell_id[0])
  // TODO: add a type for this
  const request = {
    type: 'request',
    data: {
      id,
      body: {
        type: 'zome_call',
        data: {
          signed_spec,
          payload: encoded_payload,
          cell_dna_hash,
          cap_secret,
          signature: zome_call_signature,
          nonce,
          expires_at
        }
      }
    }
  }

  return msgpack.encode(request)
}

const create_clone_cell_request = (
  args: AppCreateCloneCellRequest,
  id: ResponseId
): EnvoyOutgoingMessageSerialized =>
  msgpack.encode({
    type: 'request',
    data: {
      id,
      body: {
        type: 'create_clone_cell',
        data: args
      }
    }
  })

const enable_clone_cell_request = (
  args: AppEnableCloneCellRequest,
  id: ResponseId
): EnvoyOutgoingMessageSerialized =>
  msgpack.encode({
    type: 'request',
    data: {
      id,
      body: {
        type: 'enable_clone_cell',
        data: args
      }
    }
  })

const disable_clone_cell_request = (
  args: AppDisableCloneCellRequest,
  id: ResponseId
): EnvoyOutgoingMessageSerialized => {
  return msgpack.encode({
    type: 'request',
    data: {
      id,
      body: {
        type: 'disable_clone_cell',
        data: args
      }
    }
  })
}

const COMPATIBLE_ENVOY_VERSION = '0.2.x'

function checkEnvoyVersion(envoyVersion: string) {
  const isSatisfied = true

  if (!isSatisfied) {
    console.error(
      `!!!!! WARNING: you are connecting to an unsupported version of Envoy. Expected version matching: ${COMPATIBLE_ENVOY_VERSION}. Actual version: ${envoyVersion} !!!!!`
    )
  }
}

type ZomeCallArgs = {
  zome_name: string
  fn_name: string
  payload: any
  role_name: string
  cell_id: CellId
  cap_secret: any
}

type AppStatus =
  | {
      type: 'not_installed'
    }
  | {
      type: 'installing'
    }
  | {
      type: 'installed'
      data: AppInfo
    }
  | {
      type: 'error_installing'
      data: string
    }
  | {
      type: 'not_hosted'
    }
  | {
      type: 'paused'
    }
  | {
      type: 'error_getting_app_info'
      data: String
    }
  | {
      type: 'error_enabling'
      data: String
    }

// explanation of this pattern https://kubyshkin.name/posts/newtype-in-typescript/
type ResponseId = number & { readonly __tag: unique symbol }

type ZomeCallResponse = {
  id: ResponseId
  body: ResponseBody
}

// explanation of this pattern https://kubyshkin.name/posts/newtype-in-typescript/
type SigningRequestId = unknown & { readonly __tag: unique symbol }

type SigningRequest = {
  id: SigningRequestId
  payload: Uint8Array
}

export type Result<T> =
  | {
      type: 'ok'
      data: T
    }
  | {
      type: 'error'
      data: string
    }

type ResponseBody = Result<
  | any
  | CreateCloneCellResponse
  | EnableCloneCellResponse
  | DisableCloneCellResponse
>

type ResponseConsumers = {
  [key: ResponseId]: (value: ResponseBody | PromiseLike<ResponseBody>) => void
}

// The signal as we get it from envoy
type EnvoySignal = {
  data: Uint8Array
  dna_hash: Uint8Array
  zome_name: string
}

// The signal we emit to web-sdk
type HoloSignal = {
  data: any
  cell: InstalledCell
  zome_name: string
}

// ALERT: This is Incoming wrt Chaperone. It is equivalent to OutgoingMessage in the envoy rust code, as it is outgoing wrt Envoy
type EnvoyIncomingMessage =
  | {
      type: 'signal'
      data: EnvoySignal
    }
  | {
      type: 'response'
      data: ZomeCallResponse
    }
  | {
      type: 'happ_config'
      data: {
        data: HappConfig
      }
    }
  | {
      type: 'app_status_changed'
      data: AppStatus
    }
  | {
      type: 'outdated_host_preferences'
      data: string // host happ pref (ActionHash64)
    }
  | {
      type: 'signing_request'
      data: SigningRequest
    }
  | {
      type: 'version'
      data: string
    }

type EnvoyApiInput = {
  host: HostDetails
  signer: Signer
  happ_id: string
  is_anonymous: boolean
}

type EnvoyOutgoingMessageSerialized = Uint8Array & {
  readonly __tag: unique symbol
}
