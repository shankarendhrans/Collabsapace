import axios from 'axios';

const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const API_BASE_URL = (rawApiUrl && !rawApiUrl.includes('your-backend-app') && !rawApiUrl.includes('%') && rawApiUrl.startsWith('http'))
  ? rawApiUrl
  : (isLocal ? 'http://localhost:5000/api' : 'https://collabsapace-backend.onrender.com/api');

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
