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

export const checkHolochainOnHoloport = async (hostUrl:string, preferenceHash: string, hAppId: string, serviceAuthToken: string): Promise<boolean> => {
    const hbsUrl = hbsURL(); 
    
    const holoportStatusPayload: HoloportStatusPayload = {
        hostUrl,
        preferenceHash,
        hAppId
    };
  
    const payload = JSON.stringify(holoportStatusPayload);

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': serviceAuthToken
      },
    };

    const hbsUptimeHoloportStatusUrl = `${hbsUrl}/ops/api/v1/holoport-status`; 
    const holoportStatusResult: any = await hbsPostRequest(hbsUptimeHoloportStatusUrl, payload, params);

    if (holoportStatusResult.status !== 200) {
        // throw new Error(`Resolver returned unexpected status ${holoportStatusResult.status} for holoport ${hostUrl}`);
        return false;
    }

    const holoportStatus: boolean | null = JSON.parse(holoportStatusResult?.body) ?? null;

    return holoportStatus ?? false;
}

export const fetchServiceAuthToken = async (): Promise<string> => {
    const hbsUrl = hbsURL();
    const id = __ENV.ID;
    const secret = __ENV.SECRET;

    const hbsServiceAuthTokenUrl = `${hbsUrl}/auth/api/v1/service-account?id=${id}&secret=${secret}`;
    const hbsServiceAuthTokenResult: any = await http.get(hbsServiceAuthTokenUrl);

    if (hbsServiceAuthTokenResult.status !== 200) {
        throw new Error(`Unable to fetch HBS auth token. Result: ${hbsServiceAuthTokenResult.status}`);
    }

    const serviceAuthToken: string = hbsServiceAuthTokenResult?.body;

    if (!serviceAuthToken) {
        throw new Error(`Unable to parse HBS auth token. Result: ${hbsServiceAuthTokenResult.status}`);
    }

    return serviceAuthToken;
}