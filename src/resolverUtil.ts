import { resolverURL, domain } from './k6Configuration';
import http from 'k6/http';

type DomainHost = {
    host_url: string;
    preference_hash: string;
};

export type DomainHosts = {
    hosts: DomainHost[];
};

const API_TOKEN = __ENV.RESOLVER_API_TOKEN

const resolverPostRequest = async (url: string, payload: string, params: any):Promise<any> => {
    return http.post(url, payload, params);
}

export const resolveHappIdFromDomain = async (): Promise<string | null> => {
    const resolverUrl = resolverURL(); 
    const hAppDomain = domain(); 
    
    console.log(`resolverUrl: ${resolverUrl}`);
    console.log(`hAppDomain: ${hAppDomain}`);
  
    const payload = JSON.stringify({
      key: hAppDomain
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `${API_TOKEN}`,
      },
    };

    const resolveHappIdUrl = `${resolverUrl}/domain2happ`;
    const domainTohAppResult: any = await resolverPostRequest(resolveHappIdUrl, payload, params);

    if (domainTohAppResult.status !== 200) {
        throw new Error(`Resolver returned unexpected status ${domainTohAppResult.status} for hApp domain ${hAppDomain}`);
    }

    const hAppId: string | null = JSON.parse(domainTohAppResult?.body) ?? null;

    if (! ((hAppId?.length ?? 0) > 0)) {
        throw new Error(`Failed to resolve hApp ID for domain ${hAppDomain}`);
    }

    return hAppId;
}

export const resolveHostUrlsFromHappId = async (hAppId: string): Promise<DomainHosts | null> => {
    const resolverUrl = resolverURL(); 
    
    console.log(`resolverUrl: ${resolverUrl}`);

    const payload = JSON.stringify({
      happId: hAppId
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `${API_TOKEN}`,
      },
    };

    const resolveHostsUrl = `${resolverUrl}/happ2hosts`;
    const resolveHostsResult: any = await resolverPostRequest(resolveHostsUrl, payload, params);

    if (resolveHostsResult.status !== 200) {
        throw new Error(`Resolver returned unexpected status ${resolveHostsResult.status} fetching hosts for hApp Id: ${hAppId}`);
    }

    const domainHosts: DomainHosts | null = JSON.parse(resolveHostsResult?.body) ?? null;

    if (! ((domainHosts?.hosts?.length ?? 0) > 0)) {
        throw new Error(`Setup failed: failed to resolve hosts for hAppID ${hAppId}`);
    }        

    return domainHosts;
}