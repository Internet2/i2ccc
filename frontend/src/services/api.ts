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
  // Note: API key is now handled securely server-side by the proxy Lambda
});

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