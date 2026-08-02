import { Redis } from '@upstash/redis';

// Uses KV_REST_API_URL + KV_REST_API_TOKEN from Vercel KV environment vars.
// Provision a KV store on Vercel (free tier works) and the REST env vars are
// injected automatically. See README → "Online sync backend".
export const redis = Redis.fromEnv();
