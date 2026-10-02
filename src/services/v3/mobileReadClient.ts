import type {
  V3AnswerSheetManifestEnvelope,
  V3MobileDownloadEnvelope,
  V3MobileReferenceDataEnvelope,
} from '../../database/v3/contracts';
import {
  V3ContractParseError,
  parseV3AnswerSheetManifestEnvelope,
  parseV3MobileDownloadEnvelope,
  parseV3MobileReferenceDataEnvelope,
} from '../../database/v3/parsers';
import { v3Fetch } from './coldStartFetch';

export const V3_MOBILE_REFERENCE_DATA_PATH =
  '/api/v3/mobile/reference-data' as const;
export const V3_MOBILE_DOWNLOAD_PATH = '/api/v3/mobile/download' as const;

export type V3MobileFetch = typeof fetch;

export interface V3MobileReadClientConfig {
  baseUrl: string;
  getSessionToken: () => string | Promise<string>;
  fetchImpl?: V3MobileFetch;
}

export interface V3MobileRequestOptions {
  signal?: AbortSignal;
}

export interface V3MobileReadClient {
  getReferenceData(
    options?: V3MobileRequestOptions,
  ): Promise<V3MobileReferenceDataEnvelope>;
  getDownload(
    options?: V3MobileRequestOptions,
  ): Promise<V3MobileDownloadEnvelope>;
  getAnswerSheetManifest(
    assignmentUuid: string,
    answerSheetUuid: string,
    options?: V3MobileRequestOptions,
  ): Promise<V3AnswerSheetManifestEnvelope>;
}

export class V3MobileClientConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V3MobileClientConfigurationError';
  }
}

export class V3MobileNetworkError extends Error {
  readonly code: 'NETWORK_UNAVAILABLE' | 'REQUEST_ABORTED';
  readonly causeValue: unknown;

  constructor(
    code: V3MobileNetworkError['code'],
    message: string,
    causeValue: unknown,
  ) {
    super(message);
    this.name = 'V3MobileNetworkError';
    this.code = code;
    this.causeValue = causeValue;
  }
}

export class V3MobileHttpError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly errors: Readonly<Record<string, unknown>> | null;
  readonly retryable: boolean;

  constructor(
    status: number,
    message: string,
    code: string | null,
    errors: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = 'V3MobileHttpError';
    this.status = status;
    this.code = code;
    this.errors = errors ? Object.freeze({ ...errors }) : null;
    this.retryable = status === 408 || status === 429 || status >= 500;
  }
}

export class V3MobileContractError extends Error {
  readonly causeValue: unknown;

  constructor(message: string, causeValue: unknown) {
    super(message);
    this.name = 'V3MobileContractError';
    this.causeValue = causeValue;
  }
}

type SuccessParser<T> = (value: unknown) => T;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const normalizeBaseUrl = (baseUrl: string): string => {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/?#]+(?::\d+)?(?:\/[^\s?#]*)?$/.test(normalized)) {
    throw new V3MobileClientConfigurationError(
      'V3 baseUrl must be an absolute HTTP or HTTPS URL without query or fragment values.',
    );
  }
  return normalized;
};

const requireUuid = (value: string, field: string): string => {
  if (!UUID_PATTERN.test(value)) {
    throw new V3MobileClientConfigurationError(
      `${field} must be a canonical lowercase UUID.`,
    );
  }
  return value;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readErrorBody = (
  value: unknown,
  status: number,
): {
  message: string;
  code: string | null;
  errors: Record<string, unknown> | null;
} => {
  if (!isObject(value)) {
    return {
      message: `V3 Mobile request failed with status ${status}.`,
      code: null,
      errors: null,
    };
  }

  const errors = isObject(value.errors) ? value.errors : null;
  return {
    message:
      typeof value.message === 'string' && value.message.trim()
        ? value.message
        : `V3 Mobile request failed with status ${status}.`,
    code: errors && typeof errors.code === 'string' ? errors.code : null,
    errors,
  };
};

const readJsonBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const isAbortError = (error: unknown): boolean =>
  isObject(error) && error.name === 'AbortError';

export const createV3MobileReadClient = (
  config: V3MobileReadClientConfig,
): V3MobileReadClient => {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const fetchImpl = config.fetchImpl ?? v3Fetch;

  const request = async <T>(
    path: string,
    parser: SuccessParser<T>,
    options?: V3MobileRequestOptions,
  ): Promise<T> => {
    const token = (await config.getSessionToken()).trim();
    if (!token) {
      throw new V3MobileClientConfigurationError(
        'V3 session token is unavailable. Authenticate before requesting Mobile data.',
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: options?.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new V3MobileNetworkError(
          'REQUEST_ABORTED',
          'V3 Mobile request was cancelled.',
          error,
        );
      }
      throw new V3MobileNetworkError(
        'NETWORK_UNAVAILABLE',
        'Unable to reach the V3 Mobile service.',
        error,
      );
    }

    const body = await readJsonBody(response);
    if (!response.ok) {
      const details = readErrorBody(body, response.status);
      throw new V3MobileHttpError(
        response.status,
        details.message,
        details.code,
        details.errors,
      );
    }

    try {
      return parser(body);
    } catch (error) {
      const message =
        error instanceof V3ContractParseError
          ? `V3 Mobile response does not match the approved contract: ${error.message}`
          : 'Unable to validate the V3 Mobile response.';
      throw new V3MobileContractError(message, error);
    }
  };

  const client: V3MobileReadClient = {
    getReferenceData: (options?: V3MobileRequestOptions) =>
      request(
        V3_MOBILE_REFERENCE_DATA_PATH,
        parseV3MobileReferenceDataEnvelope,
        options,
      ),
    getDownload: (options?: V3MobileRequestOptions) =>
      request(V3_MOBILE_DOWNLOAD_PATH, parseV3MobileDownloadEnvelope, options),
    getAnswerSheetManifest: async (
      assignmentUuid: string,
      answerSheetUuid: string,
      options?: V3MobileRequestOptions,
    ) => {
      const assignment = requireUuid(assignmentUuid, 'assignmentUuid');
      const answerSheet = requireUuid(answerSheetUuid, 'answerSheetUuid');
      return request(
        `/api/v3/mobile/test-assignments/${assignment}/answer-sheets/${answerSheet}/manifest`,
        parseV3AnswerSheetManifestEnvelope,
        options,
      );
    },
  };

  return Object.freeze(client);
};
