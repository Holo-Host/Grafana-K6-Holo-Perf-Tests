import { sleep, check  } from 'k6';
import ws, { Params } from 'k6/ws';
import { WebSocket } from 'k6/experimental/websockets';
import { resolveHappIdFromDomain, resolveHostUrlsFromHappId } from './resolverUtil';
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
    duration: '10s',
}

export const setup = async () => {

    const hAppId: string | null = await resolveHappIdFromDomain()
    console.log(`hAppId: ${hAppId}`);

    const domainHosts: DomainHosts | null = await resolveHostUrlsFromHappId(hAppId ?? '')
    const hosts = domainHosts?.hosts ?? [];

    console.log(`Found ${hosts.length} hosts for hApp ID ${hAppId}`);

    return { hosts };
}

export default async (data:any) => {
    return;
  
    const { hosts } = data;

    check(hosts, { 'hosts is not empty': (hosts) => hosts.length > 0 });

    // let hostCount = 0;
    // hosts.forEach(async (host:any) => {
    //   console.log(`🚓 checking host: ${++hostCount}`);
    //   await checkHoloport(host.host_url, host.preference_hash, hostCount);  
    // });

    // await checkHoloport(hosts[0].host_url, hosts[0].preference_hash);  
    // ws://localhost:9999/hosting/?host_preference_hash=uhCkk6DzfLR-9NE1O4e7uv4eGYGo2iSMc3PSGOp7OBqg_zvf6BGK7&agent=uhCAkGy3Evf-AwkD72V4xVZ43PHFRyOJhmwlKCtnGHbAF8Q-1OBKt&happ=uhCkkCQHxC8aG3v3qwD_5Velo1IHE1RdxEr9-tuNSK15u73m1LPOo&anonymous
    const local_hostUrl = 'localhost:9999';
    const local_host_preference_hash = 'uhCkk6DzfLR-9NE1O4e7uv4eGYGo2iSMc3PSGOp7OBqg_zvf6BGK7';
    checkHoloport(local_hostUrl, local_host_preference_hash, 1);
    
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
    // const params: Params = {};
    const scheme = host_url.includes("localhost") ? 'ws' : 'wss'
    const ws_url = `${scheme}://${host_url}/hosting/?host_preference_hash=${preference_hash}&agent=uhCAkGy3Evf-AwkD72V4xVZ43PHFRyOJhmwlKCtnGHbAF8Q-1OBKt&happ=uhCkkCQHxC8aG3v3qwD_5Velo1IHE1RdxEr9-tuNSK15u73m1LPOo&anonymous`

    const web_socket = new WebSocket(ws_url);
    // const web_socket = new WebSocket(`ws://localhost:10000`)

    web_socket.addEventListener('ping' as any, () => console.log('🙇 PING!'));
    web_socket.addEventListener('pong' as any, () => console.log('🙆 PONG!'));

    web_socket.addEventListener('open' as any, () => {
      console.log(`🙋 connected to host ${hostCount}`);
      web_socket.ping();
      const appStatusRequest = app_status_request()
      var bd:any = new ArrayBuffer(Object.keys(appStatusRequest).length);
      // var bd:any = new Uint8Array(Object.keys(appStatusRequest).length);
      // {"0", "123"}
      for (var key in appStatusRequest) {
          const index = parseInt(key);
          bd[index] = appStatusRequest[key];
      }
      
      // var bd2 = new Uint8Array(bd);
      console.log(`---- start bd -----`);
      console.log(bd);
      console.log(`---- end bd -----`);
      try {
        web_socket.send(bd);
      } catch (e:any) {
        console.log(`🤦  error sending app_status_request ${e?.message}`, e);
      }

      wait(4000)
      web_socket.close();
    });

    web_socket.addEventListener('message' as any, async(message: any) => {
      console.log(`👩‍🎤 Message received from host ${hostCount}: message: ${message}`);
      web_socket.close();
    });


    web_socket.addEventListener('close' as any, () => {
      console.log(`🙅  disconnected from ${hostCount}`);
      resolve(true);
    })

    web_socket.addEventListener('error' as any, (e:any) => {
      console.log(`🤦  error on host ${hostCount}`, e);
      reject(e);
    })    

      // check(res, { 'Connected successfully': (r) => r && r.status === 101 });
  });    
}
