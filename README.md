# Grafana-K6-Holo-Perf-Tests
Grafana K6 Performance Tests

These tests require the following environment variables to run. These can be configured locally by creating a .env file. If configured the run in K6 cloud they need to be set in the cloud runner - see https://k6.io/docs/cloud/manage/environment-variables/

RESOLVER_API_TOKEN= API Token giving access to devnet or QA resolver api - in cloudflare `api-secrets` store with key `devnet_resolver_kv_token`

NETWORK=`local` | `dev` | `qa` | `prod`

ID= Id of service account in HBS (see /auth/api/v1/service-account)

SECRET= Service account secret in HBS (see /auth/api/v1/service-account)
