import { parseRequestTimeout } from "../utils/config";
export const clientConfig = Object.freeze({
  requestTimeoutMs: parseRequestTimeout(import.meta.env.VITE_API_TIMEOUT_MS),
});
