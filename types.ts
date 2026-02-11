
export interface MCQ {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  pageNumber: number;
  confidence: number;
}

export interface Attempt {
  id: string;
  timestamp: number;
  score: number;
  total: number;
}

export interface QuizState {
  questions: MCQ[];
  currentQuestionIndex: number;
  userAnswers: Record<string, string>;
  isFinished: boolean;
  isReviewMode: boolean;
  quizName?: string;
}

export enum AppMode {
  UPLOAD,
  EXTRACTING,
  QUIZ,
  RESULTS,
  ADMIN,
  PROGRESS
}

export interface ExtractionResult {
  title: string;
  questions: MCQ[];
}