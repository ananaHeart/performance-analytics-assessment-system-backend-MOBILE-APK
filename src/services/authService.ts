import { API_BASE_URL } from '../config/api';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  token: string;
}

export interface V2LoginResponse {
  tokenType: string;
  accessToken: string;
  expiresAt: string;
  user: {
    userId: number;
    schoolId: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    suffix: string | null;
    email: string;
    role: string;
    status: string;
  };
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, unknown> | null;
  timestamp?: string;
}

export const loginTeacher = async (payload: LoginRequest): Promise<LoginResponse> => {
  const loginUrl = `${API_BASE_URL}/api/auth/login`;
  console.log('AUTH: Login request URL:', loginUrl);

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseBody = (await response.json().catch(() => ({}))) as ApiResponse<LoginResponse>;

  if (!response.ok || !responseBody.success || !responseBody.data) {
    throw new Error(responseBody.message || `Login failed with status ${response.status}`);
  }

  console.log('AUTH: Login success userId:', responseBody.data.userId);
  return responseBody.data;
};

export const loginV2Teacher = async (payload: LoginRequest): Promise<V2LoginResponse> => {
  const loginUrl = `${API_BASE_URL}/api/v2/auth/login`;
  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      deviceIdentifier: null,
    }),
  });

  const responseBody = (await response.json().catch(() => ({}))) as ApiResponse<V2LoginResponse>;
  if (!response.ok || !responseBody.success || !responseBody.data?.accessToken) {
    throw new Error(responseBody.message || `V2 login failed with status ${response.status}`);
  }

  return responseBody.data;
};
