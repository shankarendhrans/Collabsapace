import axios from 'axios';

const storedBackend = typeof window !== 'undefined' ? localStorage.getItem('cs_backend_url') : null;
const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const API_BASE_URL = (rawApiUrl && !rawApiUrl.includes('your-backend-app') && !rawApiUrl.includes('%') && rawApiUrl.startsWith('http'))
  ? rawApiUrl
  : (storedBackend && storedBackend.startsWith('http')
    ? `${storedBackend.replace(/\/$/, '')}/api`
    : 'https://collabsapace-backend.onrender.com/api');

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('collabspace_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
