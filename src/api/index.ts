import { getAccessToken } from "@/auth/token-storage";
import { clientConfig } from "@/config/environment";

import { ApiClient } from "./api-client";

export const apiClient = new ApiClient(clientConfig.apiBaseUrl, getAccessToken);

export {
  ApiClient,
  ApiError,
  isApiErrorResponse,
  MissingAccessTokenError,
} from "./api-client";
export type {
  ApiAuthMode,
  ApiContractRequestOptions,
  ApiErrorResponse,
  ApiMethod,
  ApiRequestBodyFor,
  ApiRequestOptions,
  ApiResponseFor,
  ApiSchemas,
} from "./api-client";
