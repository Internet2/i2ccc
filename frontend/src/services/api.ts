import axios from 'axios';
import type { ApiResponse } from '../types';

// Use Vite proxy in development, secure proxy API in production
const isDevelopment = import.meta.env.VITE_ENVIRONMENT === 'development';
const baseURL = isDevelopment ? '/api/' : import.meta.env.VITE_API_ENDPOINT;

const api = axios.create({
  baseURL: baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 second timeout
  // Note: API key is now handled securely server-side by the proxy Lambda
});

// Attach Cognito ID token to every request
api.interceptors.request.use((config) => {
  const idToken = sessionStorage.getItem('cognito_id_token');
  if (idToken) {
    config.headers.Authorization = `Bearer ${idToken}`;
  }
  return config;
});

// On 401, clear tokens and trigger re-auth
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      sessionStorage.removeItem('cognito_id_token');
      sessionStorage.removeItem('cognito_access_token');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export const sendMessage = async (query: string, sessionId: string): Promise<ApiResponse> => {
  try {
    const response = await api.post('chat-response', {
      query,
      session_id: sessionId,
    });
    
    return response.data;
  } catch (error) {
    console.error('API Error Details:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response status:', error.response?.status);
      console.error('Response data:', error.response?.data);
      console.error('Request URL:', error.config?.url);
    }
    throw new Error('Failed to send message. Please try again.');
  }
};

export const sendFeedback = async (
  sessionId: string,
  timestamp: number,
  rating: 'thumbs_up' | 'thumbs_down' | 'text_feedback',
  feedbackText?: string
): Promise<{ success: boolean }> => {
  try {
    const response = await api.post('feedback', {
      session_id: sessionId,
      timestamp,
      rating,
      feedback_text: feedbackText,
    });
    return response.data;
  } catch (error) {
    console.error('Feedback Error:', error);
    throw new Error('Failed to submit feedback. Please try again.');
  }
};

export default api;