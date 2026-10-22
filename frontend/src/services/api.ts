import axios from 'axios';

const storedBackend = typeof window !== 'undefined' ? localStorage.getItem('cs_backend_url') : null;
const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const localApi = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:5000/api` : 'http://localhost:5000/api';
const API_BASE_URL = (storedBackend && storedBackend.startsWith('http'))
  ? `${storedBackend.replace(/\/$/, '')}/api`
  : (isLocal ? localApi : ((rawApiUrl && !rawApiUrl.includes('your-backend-app') && !rawApiUrl.includes('%') && rawApiUrl.startsWith('http'))
    ? rawApiUrl
    : 'https://collabsapace-backend.onrender.com/api'));

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
