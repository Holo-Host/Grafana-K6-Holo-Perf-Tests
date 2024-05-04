import http from 'k6/http';
import { sleep, check  } from 'k6';
import ws, { Params } from 'k6/ws';
import { resolverURL, domain } from './k6Configuration';
import { Options } from 'k6/options';
export const wait = (ms:any) => new Promise(resolve => setTimeout(resolve, ms))
const msgpack = require('@msgpack/msgpack')

export const options: Options = {
    vus: 1,
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

    let hostCount = 0;
    hosts.forEach(async (host:any) => {
      console.log(`🚓 checking host: ${++hostCount}`);
      await checkHoloport(host.host_url, host.preference_hash, hostCount);  
    });

    // await checkHoloport(hosts[0].host_url, hosts[0].preference_hash);  
    
    console.log(`hosts: ${hosts.length}`);
    sleep(1);    
}

const app_status_request = (): any =>
  msgpack.encode({
    type: 'app_status',
    data: null
  })

const version_request = (): any =>
  msgpack.encode({
    type: 'version',
    data: null
  })  

const checkHoloport = async (host_url: string, preference_hash: string, hostCount: number): Promise<boolean | Error> => {
  return new Promise((resolve, reject) => {
    const params: Params = {};
    const scheme = true ? 'wss' : 'ws'
    const ws_url = `${scheme}://${host_url}/hosting/?host_preference_hash=${preference_hash}&anonymous`

    const res = ws.connect(ws_url, params, (socket) => {
      socket.on('open', function open() {
        console.log(`connected to host ${hostCount}`);
        socket.send(version_request());
        wait(4000)
        socket.close();
      })
  
      socket.on('message', async (message:any) => {
        console.log(`☎ Message received from host ${hostCount}: message: ${message}`);
        socket.close();
      });    
  
      socket.on('close', () => {
        console.log(`disconnected from ${hostCount}`);
        resolve(true);
      })

      socket.on('error', (e:any) => {
        console.log(`error on host ${hostCount}`, e);
        reject(e);
      })
    });    

    check(res, { 'Connected successfully': (r) => r && r.status === 101 });
  });
}
