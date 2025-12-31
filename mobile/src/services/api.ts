import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { AuthResponse, RegisterRequest, LoginRequest, User } from '../types/user.types';
import { API_BASE_URL } from '../../config/api.config';

const API_URL = API_BASE_URL;

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000, // 15 seconds timeout (increased for slower networks)
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests automatically
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.log('[API Request Error]', error.message);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log(`[API Response] ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    if (error.response) {
      console.log(`[API Error] ${error.response.status} ${error.response.config.url}`);
      console.log('[API Error Data]', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.log('[API Network Error] No response received');
      console.log('[API URL]', API_URL);
      console.log('[Error Details]', error.message);
    } else {
      console.log('[API Error]', error.message);
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/register', data);
    // Store token securely
    await SecureStore.setItemAsync('token', response.data.token);
    return response.data;
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', data);
    // Store token securely
    await SecureStore.setItemAsync('token', response.data.token);
    return response.data;
  },

  getProfile: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  logout: async (): Promise<void> => {
    await SecureStore.deleteItemAsync('token');
  },

  getToken: async (): Promise<string | null> => {
    return await SecureStore.getItemAsync('token');
  },
};

export default api;
