
import React, { useState, useEffect, useMemo } from 'react';
import { AppMode, MCQ, QuizState, Attempt } from './types';
import { extractTextFromPdf } from './services/pdfService';
import { extractMCQsFromText } from './services/geminiService';
import { Button } from './components/Button';
import { ProgressBar } from './components/ProgressBar';

const STORAGE_KEY = 'quiz-ai-local-v3';
const HISTORY_KEY = 'quiz-ai-history-v1';

const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('quiz-dark-mode');
    return saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  const [questions, setQuestions] = useState<MCQ[]>([]);
  const [quizName, setQuizName] = useState<string>("Untitled Quiz");
  const [isEditingName, setIsEditingName] = useState(false);
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const [quizState, setQuizState] = useState<QuizState>({
    questions: [],
    currentQuestionIndex: 0,
    userAnswers: {},
    isFinished: false,
    isReviewMode: false
  });

  const [attempts, setAttempts] = useState<Attempt[]>(() => {
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [extractionProgress, setExtractionProgress] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Initial load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.questions && parsed.questions.length > 0) {
          setQuestions(parsed.questions);
          setQuizName(parsed.title || "Untitled Quiz");
          setQuizState({
            questions: parsed.questions,
            currentQuestionIndex: parsed.progress?.currentQuestionIndex ?? 0,
            userAnswers: parsed.progress?.userAnswers ?? {},
            isFinished: parsed.progress?.isFinished ?? false,
            isReviewMode: false
          });
        }
      } catch (e) {
        console.error("Failed to load local data", e);
      }
    }
  }, []);

  // Universal persistence: save state on every change
  useEffect(() => {
    if (questions.length > 0) {
      const dataToSave = {
        questions,
        title: quizName,
        progress: {
          currentQuestionIndex: quizState.currentQuestionIndex,
          userAnswers: quizState.userAnswers,
          isFinished: quizState.isFinished
        }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
      setLastSaved(new Date());
    }
  }, [questions, quizName, quizState.currentQuestionIndex, quizState.userAnswers, quizState.isFinished]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(attempts));
  }, [attempts]);

  useEffect(() => {
    localStorage.setItem('quiz-dark-mode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const steps = [
    { id: 'read', label: 'Reading PDF content' },
    { id: 'analyze', label: 'AI analysis of questions' },
    { id: 'structure', label: 'Structuring quiz data' },
    { id: 'finalize', label: 'Ready to start!' }
  ];

  const clearAllData = () => {
    if (confirm("Are you sure you want to delete all saved quiz data and history? This cannot be undone.")) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(HISTORY_KEY);
      setQuestions([]);
      setAttempts([]);
      setQuizName("Untitled Quiz");
      setQuizState({
        questions: [],
        currentQuestionIndex: 0,
        userAnswers: {},
        isFinished: false,
        isReviewMode: false
      });
      setMode(AppMode.UPLOAD);
      setLastSaved(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let file: File | undefined;
    if ('files' in event.target && (event.target as HTMLInputElement).files) {
      file = (event.target as HTMLInputElement).files![0];
    } else if ('dataTransfer' in event) {
      event.preventDefault();
      setIsDragging(false);
      file = (event as React.DragEvent).dataTransfer.files[0];
    }

    if (!file || file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }

    try {
      setError(null);
      setCompletedSteps([]);
      setExtractionProgress(5);
      setMode(AppMode.EXTRACTING);
      setLoadingStep('Initializing parser...');
      
      const text = await extractTextFromPdf(file);
      if (!text || text.replace(/--- PAGE \d+ ---/g, '').trim().length < 20) {
        throw new Error('No readable text found in the PDF.');
      }
      
      setCompletedSteps(['read']);
      setExtractionProgress(30);

      const result = await extractMCQsFromText(text);
      if (!result.questions || result.questions.length === 0) {
        throw new Error('No questions identified.');
      }

      setCompletedSteps(['read', 'analyze']);
      setExtractionProgress(70);
      setLoadingStep('Verifying data...');
      
      await new Promise(r => setTimeout(r, 600));
      setCompletedSteps(['read', 'analyze', 'structure']);
      setExtractionProgress(90);
      
      setQuizName(result.title);
      setQuestions(result.questions);
      setAttempts([]);
      setQuizState({
        questions: result.questions,
        currentQuestionIndex: 0,
        userAnswers: {},
        isFinished: false,
        isReviewMode: false
      });

      setExtractionProgress(100);
      setCompletedSteps(['read', 'analyze', 'structure', 'finalize']);
      setLoadingStep('Ready!');
      
      await new Promise(r => setTimeout(r, 800));
      setMode(AppMode.QUIZ);
    } catch (err: any) {
      setError(err.message || 'Extraction failed.');
      setMode(AppMode.UPLOAD);
    }
  };

  const handleConfirmAnswer = () => {
    if (pendingAnswer) {
      const currentQ = quizState.questions[quizState.currentQuestionIndex];
      setQuizState(prev => ({
        ...prev,
        userAnswers: { ...prev.userAnswers, [currentQ.id]: pendingAnswer }
      }));
      setPendingAnswer(null);
    }
  };

  const jumpToQuestion = (index: number) => {
    setQuizState(prev => ({ ...prev, currentQuestionIndex: index }));
    setPendingAnswer(null);
  };

  const finishQuiz = () => {
    const correctCount = quizState.questions.filter(q => quizState.userAnswers[q.id] === q.correctAnswer).length;
    
    const newAttempt: Attempt = {
      id: `attempt-${Date.now()}`,
      timestamp: Date.now(),
      score: correctCount,
      total: quizState.questions.length
    };
    setAttempts(prev => [newAttempt, ...prev]);

    setMode(AppMode.RESULTS);
    setQuizState(prev => ({ ...prev, isFinished: true }));
  };

  const goToNext = () => {
    if (quizState.currentQuestionIndex < quizState.questions.length - 1) {
      setQuizState(prev => ({ ...prev, currentQuestionIndex: prev.currentQuestionIndex + 1 }));
      setPendingAnswer(null);
    } else {
      finishQuiz();
    }
  };

  const goToPrev = () => {
    if (quizState.currentQuestionIndex > 0) {
      setQuizState(prev => ({ ...prev, currentQuestionIndex: prev.currentQuestionIndex - 1 }));
      setPendingAnswer(null);
    }
  };

  const resetQuiz = (filter?: 'all' | 'incorrect' | 'low-confidence') => {
    let newQuestions = [...questions];
    if (filter === 'incorrect') {
      newQuestions = questions.filter(q => quizState.userAnswers[q.id] !== q.correctAnswer);
    } else if (filter === 'low-confidence') {
      newQuestions = questions.filter(q => q.confidence < 0.8);
    }

    if (newQuestions.length === 0) {
      setError(`No questions match the filter.`);
      return;
    }

    setQuizState({
      questions: newQuestions,
      currentQuestionIndex: 0,
      userAnswers: {},
      isFinished: false,
      isReviewMode: false
    });
    setPendingAnswer(null);
    setMode(AppMode.QUIZ);
  };

  const saveEditedQuestion = (id: string, updated: Partial<MCQ>) => {
    const updatedAll = questions.map(q => q.id === id ? { ...q, ...updated } : q);
    setQuestions(updatedAll);
    setQuizState(prev => ({
      ...prev,
      questions: prev.questions.map(q => q.id === id ? { ...q, ...updated } : q)
    }));
  };

  const currentQuestion = quizState.questions[quizState.currentQuestionIndex];
  const hasAnsweredCurrent = currentQuestion ? !!quizState.userAnswers[currentQuestion.id] : false;

  // SVG Line Chart Logic
  const chartData = useMemo(() => {
    if (attempts.length === 0) return null;
    const history = attempts.slice(0, 15).reverse();
    const width = 800;
    const height = 300;
    const padding = 40;
    
    const points = history.map((at, i) => {
      const x = padding + (i * (width - 2 * padding) / (history.length - 1 || 1));
      const percentage = (at.score / at.total);
      const y = height - padding - (percentage * (height - 2 * padding));
      return { x, y, percentage, at };
    });

    const pathData = points.length > 0 
      ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
      : '';
    
    const areaData = points.length > 0
      ? `${pathData} L ${points[points.length-1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
      : '';

    return { points, pathData, areaData, width, height, padding };
  }, [attempts]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-[1400px] mx-auto px-4 py-8">
        
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 w-full">
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setMode(AppMode.UPLOAD)}
          >
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-xl shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
              <i className="fas fa-brain"></i>
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100 leading-none mb-1">QuizAI</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {lastSaved && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter animate-in fade-in">
                Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                onClick={() => setDarkMode(!darkMode)}
                className="w-10 h-10 p-0 rounded-full"
              >
                <i className={`fas ${darkMode ? 'fa-sun' : 'fa-moon'}`}></i>
              </Button>

              <Button variant="ghost" onClick={() => setMode(AppMode.UPLOAD)} className={mode === AppMode.UPLOAD ? 'text-indigo-600' : ''}>
                <i className="fas fa-home"></i> <span className="hidden sm:inline">Home</span>
              </Button>

              {questions.length > 0 && mode !== AppMode.EXTRACTING && (
                <>
                  <Button variant="ghost" onClick={() => setMode(AppMode.PROGRESS)} className={mode === AppMode.PROGRESS ? 'text-indigo-600' : ''}>
                    <i className="fas fa-chart-line"></i> <span className="hidden sm:inline">History</span>
                  </Button>
                  <Button variant="ghost" onClick={() => setMode(AppMode.ADMIN)} className={mode === AppMode.ADMIN ? 'text-indigo-600' : ''}>
                    <i className="fas fa-cog"></i> <span className="hidden sm:inline">Edit</span>
                  </Button>
                  <Button variant="secondary" onClick={() => setMode(AppMode.UPLOAD)}>
                    <i className="fas fa-plus"></i> <span className="hidden sm:inline">New PDF</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-6 rounded-r-lg flex justify-between items-center animate-in fade-in slide-in-from-top-4 max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <i className="fas fa-exclamation-circle text-red-500"></i>
              <p className="text-red-700 dark:text-red-300 text-sm font-medium">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="p-2 hover:bg-red-100 dark:hover:bg-red-800/30 rounded-full">
              <i className="fas fa-times text-red-400"></i>
            </button>
          </div>
        )}

        <main className={`transition-all duration-300 ${mode === AppMode.QUIZ ? 'w-full' : 'max-w-4xl mx-auto'}`}>
          
          {mode === AppMode.UPLOAD && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div 
                className={`bg-white dark:bg-slate-900 border-2 border-dashed rounded-3xl p-16 text-center transition-all duration-300 cursor-pointer group relative ${
                  isDragging ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-slate-300 dark:border-slate-800 hover:border-indigo-400'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileUpload}
              >
                <input 
                  type="file" 
                  accept=".pdf" 
                  onChange={handleFileUpload} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="mb-6">
                  <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto text-slate-400 dark:text-slate-500 group-hover:bg-indigo-600 group-hover:text-white group-hover:rotate-6 transition-all duration-300 shadow-sm">
                    <i className="fas fa-file-upload text-4xl"></i>
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-3 text-slate-800 dark:text-slate-100">Upload Study Material</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-8 text-lg">
                  Drop your PDF here. We'll extract questions instantly and save them locally.
                </p>
                <Button variant="primary" className="px-8 py-3 rounded-xl text-lg pointer-events-none mx-auto">
                  Choose File
                </Button>
              </div>

              {questions.length > 0 && (
                <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-6 duration-500">
                   <div 
                    className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm group"
                  >
                    <div className="flex items-center gap-5 w-full">
                      <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm group-hover:scale-105 transition-transform shrink-0">
                        <i className="fas fa-book-open text-2xl"></i>
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center gap-2 group/title mb-1">
                          {isEditingName ? (
                            <input
                              autoFocus
                              className="bg-slate-50 dark:bg-slate-800 border-2 border-indigo-500 text-lg font-black text-slate-800 dark:text-slate-100 focus:outline-none px-2 py-1 rounded-lg w-full"
                              value={quizName}
                              onChange={(e) => setQuizName(e.target.value)}
                              onBlur={() => setIsEditingName(false)}
                              onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">{quizName}</h3>
                              <button onClick={() => setIsEditingName(true)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-indigo-500 transition-colors">
                                <i className="fas fa-pen text-xs"></i>
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                          {questions.length} questions extracted. {attempts.length > 0 ? `Last score: ${attempts[0].score}/${attempts[0].total}` : 'Not yet attempted.'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <Button variant="secondary" className="flex-1 sm:flex-none py-3" onClick={() => setMode(AppMode.PROGRESS)}>
                         <i className="fas fa-chart-bar"></i> Progress
                      </Button>
                      <Button 
                        variant="primary" 
                        className="flex-1 sm:flex-none py-3 px-6 shadow-lg shadow-indigo-600/20" 
                        onClick={() => setMode(quizState.isFinished ? AppMode.RESULTS : AppMode.QUIZ)}
                      >
                         {quizState.isFinished ? 'View Results' : 'Continue Quiz'} <i className="fas fa-play ml-2 text-xs"></i>
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <Button variant="ghost" onClick={clearAllData} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest">
                      <i className="fas fa-trash-alt mr-2"></i> Reset Everything
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === AppMode.PROGRESS && (
            <div className="space-y-8 animate-in fade-in duration-500">
               <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100">Learning Progress</h2>
                      <p className="text-slate-500 dark:text-slate-400 font-medium italic">{quizName}</p>
                    </div>
                    <Button variant="ghost" onClick={() => setMode(AppMode.UPLOAD)}>
                      <i className="fas fa-times"></i>
                    </Button>
                  </div>

                  {attempts.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                      <i className="fas fa-chart-area text-5xl text-slate-300 dark:text-slate-600 mb-4"></i>
                      <p className="text-slate-500 dark:text-slate-400 font-bold">No history available yet.</p>
                      <p className="text-slate-400 dark:text-slate-500 text-sm">Complete the quiz once to see your progress chart.</p>
                      <Button variant="primary" className="mt-6 mx-auto" onClick={() => setMode(AppMode.QUIZ)}>Start Now</Button>
                    </div>
                  ) : (
                    <div className="space-y-12">
                      <div className="bg-slate-50 dark:bg-slate-800/30 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 relative overflow-hidden aspect-[8/3]">
                        {chartData && (
                          <svg 
                            viewBox={`0 0 ${chartData.width} ${chartData.height}`} 
                            className="w-full h-full"
                            preserveAspectRatio="none"
                          >
                            {[0, 0.25, 0.5, 0.75, 1].map(v => {
                              const y = chartData.height - chartData.padding - (v * (chartData.height - 2 * chartData.padding));
                              return (
                                <line 
                                  key={v}
                                  x1={chartData.padding} 
                                  y1={y} 
                                  x2={chartData.width - chartData.padding} 
                                  y2={y} 
                                  className="stroke-slate-200 dark:stroke-slate-700 transition-colors"
                                  strokeWidth="1"
                                />
                              );
                            })}
                            
                            <defs>
                              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            <path d={chartData.areaData} fill="url(#chartGradient)" />

                            <path 
                              d={chartData.pathData} 
                              fill="none" 
                              stroke="#4f46e5" 
                              strokeWidth="4" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                              className="transition-all duration-700"
                            />

                            <line 
                               x1={chartData.padding} 
                               y1={chartData.height - chartData.padding - (0.8 * (chartData.height - 2 * chartData.padding))}
                               x2={chartData.width - chartData.padding}
                               y2={chartData.height - chartData.padding - (0.8 * (chartData.height - 2 * chartData.padding))}
                               className="stroke-emerald-500/40"
                               strokeWidth="2"
                               strokeDasharray="4 4"
                            />

                            {chartData.points.map((p, i) => (
                              <g key={i} className="group/point">
                                <circle 
                                  cx={p.x} 
                                  cy={p.y} 
                                  r="6" 
                                  className="fill-white dark:fill-slate-900 stroke-indigo-600 stroke-[3px] cursor-pointer hover:r-8 transition-all"
                                />
                                <text 
                                  x={p.x} 
                                  y={p.y - 12} 
                                  textAnchor="middle" 
                                  className="fill-slate-600 dark:fill-slate-300 text-[10px] font-black opacity-0 group-hover/point:opacity-100 transition-opacity"
                                >
                                  {Math.round(p.percentage * 100)}%
                                </text>
                              </g>
                            ))}
                          </svg>
                        )}
                        <div className="absolute top-4 left-4 flex gap-4">
                           <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 bg-indigo-600 rounded-full"></div>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Your Score</span>
                           </div>
                           <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 border-t-2 border-dashed border-emerald-500 rounded-full"></div>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Goal (80%)</span>
                           </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Recent Performance</h4>
                        <div className="grid gap-4">
                          {attempts.map((at, idx) => (
                            <div key={at.id} className="flex items-center justify-between p-5 bg-white dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl hover:shadow-md transition-shadow">
                               <div className="flex items-center gap-4">
                                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black ${
                                    (at.score / at.total) >= 0.8 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                  }`}>
                                    {Math.round((at.score / at.total) * 100)}%
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-800 dark:text-slate-100">Attempt {attempts.length - idx}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(at.timestamp).toLocaleString()}</p>
                                  </div>
                               </div>
                               <div className="text-right">
                                  <p className="font-black text-slate-700 dark:text-slate-200">{at.score} <span className="text-slate-400 font-medium">/ {at.total}</span></p>
                                  <p className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">{at.score === at.total ? 'Perfect Score!' : at.score >= at.total * 0.8 ? 'Excellent' : 'Keep practicing'}</p>
                               </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
               </div>
            </div>
          )}

          {mode === AppMode.EXTRACTING && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center shadow-xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-300">
              <div className="mb-8 relative">
                <div className="w-24 h-24 border-4 border-slate-100 dark:border-slate-800 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-indigo-600 text-lg">
                  {extractionProgress}%
                </div>
              </div>
              <h2 className="text-2xl font-bold mb-2 text-slate-800 dark:text-slate-100">Analyzing Content...</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-10 font-medium">{loadingStep}</p>
              <div className="max-w-md mx-auto space-y-4 text-left">
                {steps.map((step) => {
                  const isCompleted = completedSteps.includes(step.id);
                  const isCurrent = loadingStep.toLowerCase().includes(step.label.toLowerCase().split(' ')[0]);
                  return (
                    <div key={step.id} className="flex items-center gap-4 transition-all duration-300">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-colors ${
                        isCompleted ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                      }`}>
                        {isCompleted ? <i className="fas fa-check"></i> : <i className="fas fa-circle text-[6px]"></i>}
                      </div>
                      <span className={`text-sm font-semibold transition-colors ${
                        isCompleted ? 'text-emerald-600 dark:text-emerald-400' : isCurrent ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {mode === AppMode.QUIZ && quizState.questions.length > 0 && (
            <div className="flex flex-col md:flex-row gap-8 items-start animate-in fade-in slide-in-from-bottom-6 duration-500 relative">
              
              {/* Sidebar Navigator - Now in flex flow with layout pushing logic */}
              <aside 
                className={`flex-shrink-0 transition-all duration-500 ease-in-out overflow-hidden h-fit ${
                  sidebarOpen ? 'w-full md:w-64 opacity-100' : 'w-0 md:w-0 opacity-0 pointer-events-none'
                }`}
              >
                 <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-100 dark:border-slate-800 sticky top-8 min-w-[256px]">
                   <div className="flex justify-between items-center mb-6">
                     <h4 className="font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest text-[10px]">Questions</h4>
                     <span className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">{Object.keys(quizState.userAnswers).length} / {quizState.questions.length}</span>
                   </div>
                   <div className="grid grid-cols-5 md:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {quizState.questions.map((q, idx) => {
                        const isCurrent = quizState.currentQuestionIndex === idx;
                        const isAnswered = !!quizState.userAnswers[q.id];
                        const isCorrect = isAnswered && quizState.userAnswers[q.id] === q.correctAnswer;
                        const isWrong = isAnswered && !isCorrect;
                        let colorClass = "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700";
                        if (isAnswered) {
                          if (isCorrect) colorClass = "bg-emerald-500 text-white";
                          else if (isWrong) colorClass = "bg-red-500 text-white";
                        }
                        return (
                          <button
                            key={q.id}
                            onClick={() => jumpToQuestion(idx)}
                            className={`w-full aspect-square rounded-xl flex items-center justify-center text-xs font-black transition-all transform active:scale-90 ${colorClass} ${
                              isCurrent ? 'ring-4 ring-indigo-500/30 ring-offset-2 dark:ring-offset-slate-950' : ''
                            }`}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                   </div>
                   <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Correct
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        <div className="w-2 h-2 rounded-full bg-red-500"></div> Incorrect
                      </div>
                   </div>
                   <div className="mt-6">
                      <Button variant="primary" className="w-full text-xs font-black py-3 rounded-xl" onClick={finishQuiz}>
                         Submit Score
                      </Button>
                   </div>
                 </div>
              </aside>

              {/* Toggle Button - Placed relatively in the grid gap area to "push" instead of floating over */}
              <div className="hidden md:flex flex-col pt-12">
                <button 
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className={`w-8 h-12 bg-white dark:bg-slate-900 flex items-center justify-center rounded-r-xl border border-l-0 border-slate-100 dark:border-slate-800 shadow-md hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all group z-20`}
                >
                  <i className={`fas fa-chevron-${sidebarOpen ? 'left' : 'right'} text-slate-400 group-hover:text-indigo-600 transition-transform`}></i>
                </button>
              </div>

              {/* Main Quiz Content */}
              <div className={`flex-grow space-y-6 transition-all duration-500`}>
                <div className="flex items-center justify-between gap-4 md:hidden">
                  <Button variant="secondary" onClick={() => setSidebarOpen(!sidebarOpen)} className="w-full flex justify-between px-6">
                    <span className="font-black text-[10px] uppercase tracking-widest">Question List</span>
                    <i className={`fas fa-chevron-${sidebarOpen ? 'up' : 'down'}`}></i>
                  </Button>
                </div>
                <ProgressBar current={quizState.currentQuestionIndex + 1} total={quizState.questions.length} />
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 md:p-10 shadow-xl border border-slate-100 dark:border-slate-800 transition-colors">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-10 leading-snug">
                    {currentQuestion.question}
                  </h3>
                  <div className="space-y-4 mb-10">
                    {currentQuestion.options.map((option, idx) => {
                      const isSelectedPending = pendingAnswer === option;
                      const isSelectedFinal = quizState.userAnswers[currentQuestion.id] === option;
                      const isCorrectAnswer = currentQuestion.correctAnswer === option;
                      const hasAnswered = !!quizState.userAnswers[currentQuestion.id];
                      let optionStyles = "flex items-center gap-4 p-5 rounded-2xl border-2 transition-all duration-200 text-left w-full group relative overflow-hidden ";
                      if (hasAnswered) {
                        if (isCorrectAnswer) optionStyles += "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-900 dark:text-emerald-300";
                        else if (isSelectedFinal) optionStyles += "bg-red-50 dark:bg-red-900/20 border-red-500 text-red-900 dark:text-red-300";
                        else optionStyles += "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-600 opacity-60";
                      } else {
                        if (isSelectedPending) optionStyles += "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 text-indigo-900 dark:text-indigo-300 ring-2 ring-indigo-200 ring-offset-2 dark:ring-offset-slate-900";
                        else optionStyles += "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900/30 text-slate-700 dark:text-slate-300 hover:translate-x-1";
                      }
                      return (
                        <button key={idx} onClick={() => !hasAnswered && setPendingAnswer(option)} disabled={hasAnswered} className={optionStyles}>
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black flex-shrink-0 transition-all ${isSelectedPending || isSelectedFinal ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                            {String.fromCharCode(65 + idx)}
                          </div>
                          <span className="flex-grow font-medium">{option}</span>
                        </button>
                      );
                    })}
                  </div>
                  {hasAnsweredCurrent && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="p-8 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400"><i className="fas fa-lightbulb"></i></div>
                          <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-xs">Explanation (Page {currentQuestion.pageNumber})</h4>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed italic text-lg">{currentQuestion.explanation}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center px-2">
                  <Button variant="ghost" onClick={goToPrev} disabled={quizState.currentQuestionIndex === 0}><i className="fas fa-chevron-left mr-2"></i> Prev</Button>
                  <div className="flex gap-4 items-center">
                    {pendingAnswer && !hasAnsweredCurrent ? (
                      <Button variant="primary" onClick={handleConfirmAnswer} className="px-10 py-3 text-lg font-black animate-in slide-in-from-bottom-2 bg-indigo-600 shadow-xl shadow-indigo-500/30">Confirm <i className="fas fa-check ml-2"></i></Button>
                    ) : (
                      <Button variant="primary" onClick={goToNext} className="px-8 shadow-lg shadow-indigo-600/20">{quizState.currentQuestionIndex === quizState.questions.length - 1 ? 'Finish' : (hasAnsweredCurrent ? 'Next' : 'Skip')} <i className="fas fa-chevron-right ml-2"></i></Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === AppMode.RESULTS && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-indigo-600 p-16 text-center text-white">
                <h2 className="text-4xl font-black mb-2">Final Score</h2>
                <p className="text-indigo-100 opacity-90 text-lg">Stored in your local history.</p>
              </div>
              <div className="p-10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                  {(() => {
                    const correctCount = quizState.questions.filter(q => quizState.userAnswers[q.id] === q.correctAnswer).length;
                    const totalCount = quizState.questions.length;
                    const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
                    return (
                      <>
                        <div className="p-8 rounded-3xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 text-center">
                          <div className="text-5xl font-black text-indigo-600 dark:text-indigo-400 mb-2">{correctCount} / {totalCount}</div>
                          <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Correct Answers</div>
                        </div>
                        <div className="p-8 rounded-3xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 text-center">
                          <div className="text-5xl font-black text-emerald-600 dark:text-emerald-400 mb-2">{percentage}%</div>
                          <div className="text-xs font-black text-emerald-500 uppercase tracking-widest">Score</div>
                        </div>
                        <div className="p-8 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 text-center">
                           <div className="text-5xl font-black text-slate-600 dark:text-slate-300 mb-2">{totalCount - correctCount}</div>
                          <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Wrong/Skipped</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Button variant="primary" className="py-4" onClick={() => resetQuiz('all')}><i className="fas fa-redo-alt"></i> Retake All</Button>
                  <Button variant="secondary" className="py-4" onClick={() => resetQuiz('incorrect')}><i className="fas fa-times-circle"></i> Retake Incorrect</Button>
                  <Button variant="ghost" className="py-4 bg-slate-100 dark:bg-slate-800" onClick={() => setMode(AppMode.PROGRESS)}><i className="fas fa-chart-line"></i> Progress Chart</Button>
                </div>
              </div>
            </div>
          )}

          {mode === AppMode.ADMIN && (
            <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
               <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Verification Center</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Edit questions or adjust extracted data.</p>
                </div>
                <Button variant="primary" onClick={() => setMode(quizState.isFinished ? AppMode.RESULTS : AppMode.QUIZ)} className="px-8">Save & Return</Button>
              </div>
              <div className="space-y-6">
                {questions.map((q, idx) => (
                  <div key={q.id} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
                    <div className="mb-6 flex items-center justify-between">
                       <span className="text-lg font-black text-slate-400">#{idx + 1} <span className="text-xs ml-2 uppercase tracking-widest font-bold">Page {q.pageNumber}</span></span>
                       {q.confidence < 0.8 && <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-1 rounded-full font-bold">Low AI Confidence</span>}
                    </div>
                    <div className="space-y-4">
                      <textarea className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" rows={2} value={q.question} onChange={(e) => saveEditedQuestion(q.id, { question: e.target.value })} />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Correct Answer</label>
                            <select className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 dark:text-white" value={q.correctAnswer} onChange={(e) => saveEditedQuestion(q.id, { correctAnswer: e.target.value })}>
                              {q.options.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                            </select>
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Explanation</label>
                            <textarea className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 text-xs dark:text-white outline-none focus:ring-1 focus:ring-indigo-500" rows={2} value={q.explanation} onChange={(e) => saveEditedQuestion(q.id, { explanation: e.target.value })} />
                         </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }
        main { transition: max-width 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
    </div>
  );
};

export default App;
