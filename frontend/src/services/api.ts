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

const MOCK_CITATIONS_ENABLED = import.meta.env.VITE_MOCK_CITATIONS === '1';

const mockChatResponse = async (sessionId: string): Promise<ApiResponse> => {
  // Simulate network latency so the loading indicator/spinner is exercised.
  await new Promise((resolve) => setTimeout(resolve, 900));

  const response = [
    "Internet2's **Cloud Infrastructure Community Program (CICP)** supports higher education with vendor-neutral guidance on cloud adoption [[1]]. Key benefits include monthly community calls and technical deep-dives [[1]], plus discounted training through the **CLASS** program [[2]].",
    '',
    'For institutions evaluating AWS, the NET+ AWS Marketplace Private Offers initiative provides pre-negotiated terms — there are both slides [[3]] and a full session recording with timestamped highlights [[4]]. GCP-focused tech jams cover cost management strategies relevant to research workloads [[5]].',
    '',
    'Citations inside code blocks should render literally, not as chips:',
    '',
    '```python',
    '# [[1]] inside a code block should be left alone',
    'def fetch():',
    '    return [[1]]',
    '```',
    '',
    'A hallucinated citation like [[7]] should fall back to plain text since source 7 does not exist.',
    '',
    'Workforce transformation with AI is covered in subscriber-only sessions [[5]] [[2]].',
  ].join('\n');

  return {
    response,
    session_id: sessionId,
    timestamp: Date.now(),
    sources: [
      {
        n: 1,
        title: 'CICP Program Overview — Internet2',
        url: 'https://spaces.at.internet2.edu/spaces/cicp',
        badge: 'public',
      },
      {
        n: 2,
        title: 'CLASS: Cloud Learning and Skills Sessions',
        url: 'https://internet2.edu/class',
        badge: 'public',
      },
      {
        n: 3,
        title: 'Apr 08 2026 NET+ AWS Marketplace Private Offers Slides.pdf',
        url: 'https://example.com/net-plus-aws-slides.pdf',
        badge: 'public',
      },
      {
        n: 4,
        title: 'Apr 08 2026 — NET+ AWS Marketplace Private Offers Recording',
        url: 'https://example.com/net-plus-aws-recording#t=842',
        badge: 'public',
      },
      {
        n: 5,
        title: 'Sep 23 2025 NET+ GCP Tech Jam — Architecting to Manage Cost Overruns',
        url: 'https://example.com/gcp-tech-jam',
        badge: 'cicp_subscriber_only',
      },
    ],
  };
};

export const sendMessage = async (query: string, sessionId: string): Promise<ApiResponse> => {
  if (MOCK_CITATIONS_ENABLED) {
    console.info('[mock] returning fixture citations payload for query:', query);
    return mockChatResponse(sessionId);
  }

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