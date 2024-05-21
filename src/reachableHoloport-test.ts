import { sleep, check  } from 'k6';
import ws, { Params } from 'k6/ws';
import { WebSocket } from 'k6/experimental/websockets';
import { resolveHappIdFromDomain, resolveHostUrlsFromHappId } from './resolverUtil';
import { checkHolochainOnHoloport } from './hbsUtil';
import type { DomainHosts } from './resolverUtil';
import { Options } from 'k6/options';

const msgpack = require('@msgpack/msgpack')

export const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => {
      const date = Date.now();
      let currentDate = null;
      do {
          currentDate = Date.now();
      } while (currentDate - date < ms);
      resolve();
  });
}

export const options: Options = {
    vus: 1,
    duration: '300s',
}

export const setup = async () => {

    const hAppId: string | null = await resolveHappIdFromDomain()
    console.log(`hAppId: ${hAppId}`);

    const domainHosts: DomainHosts | null = await resolveHostUrlsFromHappId(hAppId ?? '')
    const hosts = domainHosts?.hosts ?? [];

    console.log(`Found ${hosts.length} hosts for hApp ID ${hAppId}`);

    return { hosts, hAppId };
}

export default async (data:any) => {
  
    const { hosts, hAppId } = data;

    check(hosts, { 'Found hosts in environment': (hosts) => hosts.length > 0 });

    hosts.forEach(async (host:any) => {
      const holoportStatus = await checkHolochainOnHoloport(host.host_url, host.preference_hash, hAppId);
      check(holoportStatus, { 'holoport is reachable and holochain is running': (holoportStatus) => holoportStatus === true });
    });

}

