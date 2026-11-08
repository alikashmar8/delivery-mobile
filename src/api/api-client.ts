import type { components, paths } from "./openapi";

export type AccessTokenProvider = () => Promise<string | null>;
export type ApiAuthMode = "none" | "optional" | "required";
export type ApiSchemas = components["schemas"];
export type ApiErrorResponse = ApiSchemas["ErrorResponseDto"];

type HttpMethod =
  "get" | "post" | "put" | "delete" | "options" | "head" | "patch" | "trace";

type Operation<
  Path extends keyof paths,
  Method extends HttpMethod,
> = Method extends keyof paths[Path] ? paths[Path][Method] : never;

type ResponseBody<Value> = Value extends {
  content: { "application/json": infer Body };
}
  ? Body
  : never;

type ResponseForStatus<
  Responses,
  Status extends number,
> = Responses extends object
  ? Status extends keyof Responses
    ? ResponseBody<Responses[Status]>
    : never
  : never;

type OperationResponses<Path extends keyof paths, Method extends HttpMethod> =
  Operation<Path, Method> extends { responses: infer Responses }
    ? Responses
    : never;

type SuccessResponse<Responses> =
  | ResponseForStatus<Responses, 200>
  | ResponseForStatus<Responses, 201>
  | ResponseForStatus<Responses, 202>
  | ResponseForStatus<Responses, 204>;

type RequestBody<Value> = Value extends {
  requestBody: { content: { "application/json": infer Body } };
}
  ? Body
  : never;

export type ApiMethod<Path extends keyof paths> = {
  [Method in HttpMethod]: Operation<Path, Method> extends { responses: object }
    ? Method
    : never;
}[HttpMethod];

export type ApiResponseFor<
  Path extends keyof paths,
  Method extends ApiMethod<Path>,
> = SuccessResponse<OperationResponses<Path, Method>>;

export type ApiRequestBodyFor<
  Path extends keyof paths,
  Method extends ApiMethod<Path>,
> = RequestBody<Operation<Path, Method>>;

export interface ApiRequestOptions extends Omit<
  RequestInit,
  "body" | "headers"
> {
  readonly auth?: ApiAuthMode;
  readonly headers?: HeadersInit;
  readonly json?: unknown;
}

export type ApiContractRequestOptions<
  Path extends keyof paths,
  Method extends ApiMethod<Path>,
> = Omit<ApiRequestOptions, "json"> & {
  readonly json?: ApiRequestBodyFor<Path, Method>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  readonly requestId: string | null;

  constructor(status: number, payload: unknown, requestId: string | null) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export class MissingAccessTokenError extends Error {
  constructor() {
    super("An authenticated API request requires an access token");
    this.name = "MissingAccessTokenError";
  }
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const responseText = await response.text();
  return responseText || null;
}

function resolveApiUrl(baseUrl: string, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    throw new Error(
      "API paths must be origin-relative and start with one slash",
    );
  }

  return `${baseUrl}${path}`;
}

export class ApiClient {
  readonly #baseUrl: string;
  readonly #getAccessToken: AccessTokenProvider;

  constructor(baseUrl: string, getAccessToken: AccessTokenProvider) {
    this.#baseUrl = baseUrl;
    this.#getAccessToken = getAccessToken;
  }

  async request<TResponse = unknown>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    const {
      auth = "required",
      headers: providedHeaders,
      json,
      ...requestInit
    } = options;
    const headers = new Headers(providedHeaders);

    headers.set("Accept", "application/json");
    headers.delete("Authorization");

    if (auth !== "none") {
      const accessToken = await this.#getAccessToken();
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      } else if (auth === "required") {
        throw new MissingAccessTokenError();
      }
    }

    let body: string | undefined;
    if (json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(json);
    }

    const response = await fetch(resolveApiUrl(this.#baseUrl, path), {
      ...requestInit,
      headers,
      body,
    });
    const payload = await readPayload(response);

    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload,
        response.headers.get("x-request-id"),
      );
    }

    return payload as TResponse;
  }

  async requestContract<
    Path extends keyof paths,
    Method extends ApiMethod<Path>,
  >(
    path: Path,
    method: Method,
    options: ApiContractRequestOptions<Path, Method> = {},
  ): Promise<ApiResponseFor<Path, Method>> {
    return await this.request<ApiResponseFor<Path, Method>>(path, {
      ...options,
      method: method.toUpperCase(),
      json: options.json,
    });
  }
}

export function isApiErrorResponse(
  payload: unknown,
): payload is ApiErrorResponse {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("error" in payload)
  ) {
    return false;
  }

  const error = (payload as { error?: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string" &&
    typeof (error as { requestId?: unknown }).requestId === "string"
  );
}
