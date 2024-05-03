import http from 'k6/http';
import { sleep, check } from 'k6';
import { resolverURL, domain } from './k6Configuration';
import { Options } from 'k6/options';
import EnvoyApi from './lib/EnvoyApi'
import type { HostDetails } from './lib/EnvoyTypes'

export const options: Options = {
    vus: 2,
    duration: '10s',
}

export const setup = () => {
    const resolverUrl = resolverURL(); // k6Configuration.resolverURL();
    const hAppDomain = domain(); // k6Configuration.domain();

    console.log(`resolverUrl: ${resolverUrl}`);
    console.log(`hAppDomain: ${hAppDomain}`);
  
    const domainTohAppUrl = `${resolverUrl}/resolve/happId?url=${hAppDomain}&name=url&isPath=false`;
  
    const domainTohAppResult: any = http.get(domainTohAppUrl);
    const hAppId: string | null = domainTohAppResult?.json()?.happ_id ?? null;
  
    if (domainTohAppResult.status !== 200) {
        throw new Error(`Setup failed: resolver returned unexpected status ${domainTohAppResult.status} for hApp domain ${hAppDomain}`);
    }

    if (! ((hAppId?.length ?? 0) > 0)) {
        throw new Error(`Setup failed: failed to resolve hApp ID for domain ${hAppDomain}`);
    }

    const currentIsoDate = new Date().toISOString();
    const resolveHostsUrl = `${resolverUrl}/resolve/hosts?happ_id=${hAppId}&date=${currentIsoDate}&num=9999`;

    const resolveHostsResult: any = http.get(resolveHostsUrl);
    const hosts: [] | null = resolveHostsResult?.json()?.hosts ?? null;
    
    if (domainTohAppResult.status !== 200) {
      throw new Error(`Setup failed: resolver returned unexpected status ${resolveHostsResult.status} fetching hosts for hApp Id: ${hAppId}`);
    }

    if (! ((hosts?.length ?? 0) > 0)) {
      throw new Error(`Setup failed: failed to resolve hosts for hAppID ${hAppId}`);
    }    

    return { hosts };
}

export default async (data:any) => {
  
    const { hosts } = data;

    check(hosts, { 'hosts is not empty': (hosts) => hosts.length > 0 });

    // await checkHoloport(hosts[0].host_url, hosts[0].preference_hash);
    console.log(`hosts: ${hosts.length}`);
    sleep(1);    
}

const checkHoloport = async (host_url: string, preference_hash: string): Promise<boolean> => {

    let envoyApi: EnvoyApi

    let host: HostDetails = {
        host_url,
        preference_hash,
        outdated_hash: false
    }

    try {
      envoyApi = await EnvoyApi.connect({
        host,
        signer: null as any,
        happ_id: "",
        is_anonymous: true,
      })
      await envoyApi.expectStatusThen(['installed', 'not_installed'], () => {}, 'reject')
      // if we get here, the envoyApi is in a "working" state, in that it has returned the expected status status
      return true
    } catch (e) {
        // @ts-ignore
        console.error(`EnvoyApi #(${envoyApi?.instance_count}) - error connecting in getWorkingEnvoyApi: `, e)
        // @ts-ignore
        envoyApi.close()
      throw e
    }    
}

const teardown = (data:any) => {
}