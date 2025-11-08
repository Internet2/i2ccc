export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: Source[];
}

export interface Source {
  title: string;
  url: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

export interface ApiResponse {
  response: string;
  timestamp: number;
  session_id: string;
  sources?: Source[];
}

export interface FeedbackRequest {
  session_id: string;
  timestamp: number;
  rating: 'thumbs_up' | 'thumbs_down' | 'text_feedback';
  feedback_text?: string;
}

export interface ExampleQuestion {
  id: string;
  question: string;
  category: string;
}

export type PageType = 'chat' | 'about';

export interface AppState {
  currentPage: PageType;
  currentSessionId: string;
  sessions: ChatSession[];
  sidebarOpen: boolean;
}