import axios from "axios";
import { clearAuthData, getAuthToken } from "../utils/auth";

const baseURL = import.meta.env.VITE_API_URL || "/api";

const PUBLIC_AUTH_ENDPOINTS = new Set(["/auth/login", "/auth/verify-otp"]);

const instance = axios.create({
  baseURL,
});

instance.interceptors.request.use((config) => {
  const token = getAuthToken();
  const requestUrl = config.url || "";
  const isPublicAuthEndpoint = PUBLIC_AUTH_ENDPOINTS.has(requestUrl);

  if (token && !isPublicAuthEndpoint) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAuthData();
    }
    return Promise.reject(error);
  }
);

export default instance;
