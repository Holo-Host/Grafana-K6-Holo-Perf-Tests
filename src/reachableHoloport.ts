import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    vus: 2,
    duration: '10s',
}

export default () => {
    const resolverUrl = 'https://resolver.qa.holotest.net';
    const hAppDomain = 'cloud-console.qa.holotest.net';
  
    const domainTohAppUrl = `${resolverUrl}/resolve/happId?url=${hAppDomain}&name=url&isPath=false`;
  
    const domainTohAppResult:any = http.get(domainTohAppUrl);
    const hAppId: string | null = domainTohAppResult?.json()?.happ_id ?? null;
  
    check(domainTohAppResult, {
      "response code was 200": (domainTohAppResult) => domainTohAppResult.status == 200,
    });

    check(hAppId, {
        'found hApp for domain': (hAppId) => (hAppId?.length ?? 0) > 0,
    });
  
    sleep(1);    
}