import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { AuthResponse, RegisterRequest, LoginRequest, User } from '../types/user.types';

const API_URL = 'http://100.64.13.57:3000';

const api = axios.create({
  baseURL: API_URL,
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
    return config;
  },
  (error) => Promise.reject(error)
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
