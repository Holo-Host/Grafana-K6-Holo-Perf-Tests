import http from 'k6/http';
import { sleep, check } from 'k6';
import { Options } from 'k6/options';
import { resolverURL, domain } from './k6Configuration';

export const options: Options = {
    vus: 2,
    duration: '10s',
}

export const setup = () => {
    const resolverUrl = resolverURL();
    const hAppDomain = domain();

    console.log(`resolverUrl: ${resolverUrl}`);
    console.log(`hAppDomain: ${hAppDomain}`);
  
    const domainTohAppUrl = `${resolverUrl}/resolve/happId?url=${hAppDomain}&name=url&isPath=false`;
  
    const domainTohAppResult:any = http.get(domainTohAppUrl);
    const hAppId: string | null = domainTohAppResult?.json()?.happ_id ?? null;
  
    if (domainTohAppResult.status !== 200) {
        throw new Error(`Setup failed: resolver returned unexpected status ${domainTohAppResult.status} for hApp domain ${hAppDomain}`);
    }

    if (! ((hAppId?.length ?? 0) > 0)) {
        throw new Error(`Setup failed: failed to resolve hApp ID for domain ${hAppDomain}`);
    }
      
    return { hAppId };
}

export default (data:any) => {
  
    const { hAppId } = data;
    console.log(`hAppId: ${hAppId}`);
    sleep(1);    
}