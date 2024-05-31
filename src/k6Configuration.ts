const Network = {
    local: 'local',
    development: 'dev',
    qa: 'qa',
    production: 'prod'
}

export const resolverURL = () => {
    switch (__ENV.NETWORK) {
      case Network.local:
        // return `http://localhost:3000/`
        return `https://resolver-api.qa.holotest.net`
  
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
        //return `cloud-console`
        return `cloud-console.qa.holotest.net`
  
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

export const hbsURL = () => {
  switch (__ENV.NETWORK) {
    case Network.local:
      return `https://hbs.dev.holotest.net`

    case Network.development:
      return `https://hbs.dev.holotest.net`

    case Network.qa:
      return `https://hbs.dev.holotest.net`

    case Network.production:
      return `hbs.holo.host`

    default:
      throw new Error(`Error resolving HBS url. Found invalid environment key. __ENV.NETWORK: ${__ENV.NETWORK}`)
  }
}