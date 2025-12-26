export interface User {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  avatar?: string;
  rating: number;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface RegisterRequest {
  email?: string;
  phone?: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  identifier: string; // email or phone
  password: string;
}
