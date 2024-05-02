import http from 'k6/http';
import { sleep, check } from 'k6';
// import { resolverURL, domain } from './k6Configuration';
var k6Configuration = require('./k6Configuration.js');

export const options = {
    vus: 2,
    duration: '10s',
}

export const setup = () => {
    const resolverUrl = k6Configuration.resolverURL();
    const hAppDomain = k6Configuration.domain();

    console.log(`resolverUrl: ${resolverUrl}`);
    console.log(`hAppDomain: ${hAppDomain}`);
  
    const domainTohAppUrl = `${resolverUrl}/resolve/happId?url=${hAppDomain}&name=url&isPath=false`;
  
    const domainTohAppResult = http.get(domainTohAppUrl);
    const hAppId = domainTohAppResult?.json()?.happ_id ?? null;
  
    if (domainTohAppResult.status !== 200) {
        throw new Error(`Setup failed: resolver returned unexpected status ${domainTohAppResult.status} for hApp domain ${hAppDomain}`);
    }

    if (! ((hAppId?.length ?? 0) > 0)) {
        throw new Error(`Setup failed: failed to resolve hApp ID for domain ${hAppDomain}`);
    }
      
    return { hAppId };
}

export default (data) => {
  
    const { hAppId } = data;

    check(hAppId, { 'hAppId is not empty': (hAppId) => hAppId.length > 0 });
    console.log(`hAppId: ${hAppId}`);
    sleep(1);    
}