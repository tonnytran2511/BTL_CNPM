import type {
  User,
  PublicConfig,
  HubSummary,
  HubDetail,
  NetworkOverview,
  ApiError,
} from "@emobility/contracts";
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = `HTTP_${status}`,
  ) {
    super(message);
  }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new RequestError(
      "Không thể kết nối máy chủ. Kiểm tra kết nối và thử lại.",
      0,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new RequestError(
      "Máy chủ tạm thời chưa sẵn sàng. Vui lòng thử lại.",
      response.ok ? 502 : response.status,
    );
  }
  if (!response.ok)
    throw new RequestError(
      body && typeof body === "object" && "message" in body
        ? String((body as ApiError).message)
        : "Yêu cầu thất bại.",
      response.status,
      body &&
        typeof body === "object" &&
        "code" in body &&
        typeof body.code === "string"
        ? body.code
        : undefined,
    );
  return body as T;
}
export const api = {
  config: (signal?: AbortSignal) =>
    request<PublicConfig>("/config", { signal }),
  me: (signal?: AbortSignal) => request<User>("/auth/me", { signal }),
  login: (email: string, password: string) =>
    request<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    request<{ success: boolean }>("/auth/logout", { method: "POST" }),
  hubs: (signal?: AbortSignal) => request<HubSummary[]>("/hubs", { signal }),
  overview: (signal?: AbortSignal) =>
    request<NetworkOverview>("/network/overview", { signal }),
  detail: (id: string, signal?: AbortSignal) =>
    request<HubDetail>(`/hubs/${encodeURIComponent(id)}`, { signal }),
};
