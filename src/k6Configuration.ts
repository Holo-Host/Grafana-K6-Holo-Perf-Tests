const Network = {
    local: 'local',
    development: 'dev',
    qa: 'qa',
    production: 'prod'
}

export const resolverURL = () => {
    switch (__ENV.NETWORK) {
      case Network.local:
        return `http://localhost:3000/`
  
      case Network.development:
        return `https://devnet-resolver-api.holo.host`
  
      case Network.qa:
        return `https://resolver-api.qa.holotest.net`
  
      case Network.production:
        return `resolver.holo.host`
  
      default:
        throw new Error(`Error resolving resolver url. Found invalid environment key. __ENV.NETWORK: ${__ENV.NETWORK}`)
    }
}

export const domain = () => {
    switch (__ENV.NETWORK) {
      case Network.local:
        return `cloud-console`
  
      case Network.development:
        return `cloud-console.dev.holotest.net`
  
      case Network.qa:
        return `cloud-console.qa.holotest.net`
  
      case Network.production:
        return `cloud-console.holo.host`
  
      default:
        throw new Error(`Error resolving hApp domain. Found invalid environment key. __ENV.NETWORK: ${__ENV.NETWORK}`)
    }
}

// - API_TOKEN giving access to [devnet / QA resolver API](https://github.com/Holo-Host/devnet-resolver-api)
// in cloudflare `api-secrets` store with key `devnet_resolver_kv_token`
export const API_TOKEN = "cLU351BwlLtaJBU9POWsNYUJJDvZW7cFnOracf58fYQ==";
