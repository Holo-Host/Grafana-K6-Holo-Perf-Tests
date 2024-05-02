const Network = {
    local: 'local',
    development: 'dev',
    qa: 'qa',
    production: 'prod'
}

const resolverURL = () => {
    switch (__ENV.NETWORK) {
      case Network.local:
        return `http://localhost:3000/`
  
      case Network.development:
        return `https://resolver.dev.holotest.net`
  
      case Network.qa:
        return `https://resolver.qa.holotest.net`
  
      case Network.production:
        return `resolver.holo.host`
  
      default:
        throw new Error(`Error resolving resolver url. Found invalid environment key. __ENV.NETWORK: ${__ENV.NETWORK}`, __ENV)
    }
}

const domain = () => {
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
        throw new Error('Error resolving hApp domain. Found invalid environment key.')
    }
}

module.exports = {
  resolverURL: resolverURL,
  domain: domain
};