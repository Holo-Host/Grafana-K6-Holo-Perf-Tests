import { hbsURL } from './k6Configuration';
import http from 'k6/http';

type HoloportStatusPayload = {
    hostUrl: string;
    preferenceHash: string;
    hAppId: string;
};

const hbsPostRequest = async (url: string, payload: string, params: any):Promise<any> => {
    return http.post(url, payload, params);
}

export const checkHolochainOnHoloport = async (hostUrl:string, preferenceHash: string, hAppId: string): Promise<boolean> => {
    const hbsUrl = hbsURL(); 
    
    const holoportStatusPayload: HoloportStatusPayload = {
        hostUrl,
        preferenceHash,
        hAppId
    };
  
    const payload = JSON.stringify(holoportStatusPayload);

    const params = {
      headers: {
        'Content-Type': 'application/json'
      },
    };

    const hbsUptimeHoloportStatusUrl = `${hbsUrl}/uptime/holoport-status`; 
    const holoportStatusResult: any = await hbsPostRequest(hbsUptimeHoloportStatusUrl, payload, params);

    if (holoportStatusResult.status !== 200) {
        // throw new Error(`Resolver returned unexpected status ${holoportStatusResult.status} for holoport ${hostUrl}`);
        return false;
    }

    const holoportStatus: boolean | null = JSON.parse(holoportStatusResult?.body) ?? null;

    return holoportStatus ?? false;
}