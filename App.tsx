
import React, { useState, useEffect, useMemo } from 'react';
import { AppMode, MCQ, QuizState, Attempt } from './types';
import { extractTextFromPdf } from './services/pdfService';
import { extractMCQsFromText } from './services/geminiService';
import { Button } from './components/Button';
import { ProgressBar } from './components/ProgressBar';

const STORAGE_KEY = 'quiz-ai-storage';
const HISTORY_KEY = 'quiz-ai-history';

const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('quiz-ai-dark-mode');
    return saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  const [questions, setQuestions] = useState<MCQ[]>([]);
  const [quizName, setQuizName] = useState<string>("New Quiz");
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

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.questions && parsed.questions.length > 0) {
          setQuestions(parsed.questions);
          setQuizName(parsed.title || "New Quiz");
          setQuizState({
            questions: parsed.questions,
            currentQuestionIndex: parsed.progress?.currentQuestionIndex ?? 0,
            userAnswers: parsed.progress?.userAnswers ?? {},
            isFinished: parsed.progress?.isFinished ?? false,
            isReviewMode: false
          });
        }
      } catch (e) {
        console.error("Failed to restore state", e);
      }
    }
  }, []);

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
    localStorage.setItem('quiz-ai-dark-mode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const steps = [
    { id: 'read', label: 'Reading PDF contents' },
    { id: 'analyze', label: 'AI Study analysis' },
    { id: 'structure', label: 'Generating MCQs' },
    { id: 'finalize', label: 'Finalizing Quiz' }
  ];

  const clearAllData = () => {
    if (confirm("Reset everything? Your history and the current quiz will be deleted.")) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(HISTORY_KEY);
      setQuestions([]);
      setAttempts([]);
      setQuizName("New Quiz");
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

  const downloadQuizData = () => {
    const data = JSON.stringify({ title: quizName, questions }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quizName.replace(/\s+/g, '_')}_quiz.json`;
    a.click();
    URL.revokeObjectURL(url);
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
      setError('Please provide a valid PDF file.');
      return;
    }

    try {
      setError(null);
      setCompletedSteps([]);
      setExtractionProgress(5);
      setMode(AppMode.EXTRACTING);
      setLoadingStep('Initializing PDF parser...');
      
      const text = await extractTextFromPdf(file);
      if (!text || text.length < 50) throw new Error('Could not read enough text from this PDF.');
      
      setCompletedSteps(['read']);
      setExtractionProgress(30);
      setLoadingStep('Consulting Gemini AI...');

      const result = await extractMCQsFromText(text);
      if (!result.questions || result.questions.length === 0) throw new Error('No study material could be processed.');

      setCompletedSteps(['read', 'analyze']);
      setExtractionProgress(70);
      setLoadingStep('Structuring questions...');
      
      await new Promise(r => setTimeout(r, 600));
      setCompletedSteps(['read', 'analyze', 'structure']);
      setExtractionProgress(95);
      
      setQuizName(result.title);
      setQuestions(result.questions);
      setQuizState({
        questions: result.questions,
        currentQuestionIndex: 0,
        userAnswers: {},
        isFinished: false,
        isReviewMode: false
      });

      setExtractionProgress(100);
      setCompletedSteps(['read', 'analyze', 'structure', 'finalize']);
      setLoadingStep('Quiz Ready!');
      
      await new Promise(r => setTimeout(r, 800));
      setMode(AppMode.QUIZ);
    } catch (err: any) {
      setError(err.message || 'Error converting PDF.');
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

  const resetQuiz = (filter?: 'all' | 'incorrect') => {
    let nextQs = [...questions];
    if (filter === 'incorrect') {
      nextQs = questions.filter(q => quizState.userAnswers[q.id] !== q.correctAnswer);
    }
    if (nextQs.length === 0) return;

    setQuizState({
      questions: nextQs,
      currentQuestionIndex: 0,
      userAnswers: {},
      isFinished: false,
      isReviewMode: false
    });
    setPendingAnswer(null);
    setMode(AppMode.QUIZ);
  };

  const saveEditedQuestion = (id: string, updated: Partial<MCQ>) => {
    const upAll = questions.map(q => q.id === id ? { ...q, ...updated } : q);
    setQuestions(upAll);
    setQuizState(prev => ({
      ...prev,
      questions: prev.questions.map(q => q.id === id ? { ...q, ...updated } : q)
    }));
  };

  const chartData = useMemo(() => {
    if (attempts.length === 0) return null;
    const history = attempts.slice(0, 10).reverse();
    const w = 800;
    const h = 240;
    const p = 40;
    const pts = history.map((at, i) => {
      const x = p + (i * (w - 2 * p) / (history.length - 1 || 1));
      const perc = (at.score / at.total);
      const y = h - p - (perc * (h - 2 * p));
      return { x, y, perc, at };
    });
    const path = pts.length > 0 ? `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map(pt => `L ${pt.x} ${pt.y}`).join(' ') : '';
    const area = pts.length > 0 ? `${path} L ${pts[pts.length-1].x} ${h - p} L ${pts[0].x} ${h - p} Z` : '';
    return { pts, path, area, w, h, p };
  }, [attempts]);

  const currentQuestion = quizState.questions[quizState.currentQuestionIndex];
  const hasAnsweredCurrent = currentQuestion ? !!quizState.userAnswers[currentQuestion.id] : false;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-500">
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        <header className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setMode(AppMode.UPLOAD)}>
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-xl shadow-indigo-500/20 group-hover:rotate-6 transition-transform">
              <i className="fas fa-brain"></i>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 dark:text-white leading-none">QuizAI</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Instant Smart Quizzes</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setDarkMode(!darkMode)} className="w-10 h-10 p-0 rounded-full">
              <i className={`fas ${darkMode ? 'fa-sun' : 'fa-moon'}`}></i>
            </Button>
            {questions.length > 0 && mode !== AppMode.EXTRACTING && (
              <div className="flex gap-2 ml-4">
                <Button variant="ghost" onClick={() => setMode(AppMode.PROGRESS)} className={mode === AppMode.PROGRESS ? 'text-indigo-600 bg-indigo-50' : ''}>
                  <i className="fas fa-history"></i>
                </Button>
                <Button variant="ghost" onClick={() => setMode(AppMode.ADMIN)} title="Edit Questions">
                  <i className="fas fa-edit"></i>
                </Button>
                <Button variant="primary" onClick={() => setMode(AppMode.UPLOAD)} className="rounded-full w-10 h-10 p-0">
                  <i className="fas fa-plus"></i>
                </Button>
              </div>
            )}
          </div>
        </header>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-8 rounded-r-xl flex items-center justify-between animate-in slide-in-from-top-4">
             <div className="flex items-center gap-3">
               <i className="fas fa-circle-exclamation text-red-500"></i>
               <p className="text-red-700 dark:text-red-300 font-bold text-sm">{error}</p>
             </div>
             <button onClick={() => setError(null)}><i className="fas fa-times text-red-300"></i></button>
          </div>
        )}

        <main className="max-w-5xl mx-auto">
          
          {mode === AppMode.UPLOAD && (
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
              <div 
                className={`group bg-white dark:bg-slate-900 border-2 border-dashed rounded-[2.5rem] p-16 text-center transition-all duration-500 cursor-pointer relative shadow-lg hover:shadow-2xl hover:shadow-indigo-500/10 hover:scale-[1.01] ${
                  isDragging ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileUpload}
              >
                <input type="file" accept=".pdf" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-300 transition-all group-hover:scale-110 group-hover:bg-indigo-50 group-hover:text-indigo-500 dark:group-hover:bg-indigo-900/30">
                  <i className="fas fa-cloud-upload-alt text-4xl"></i>
                </div>
                <h2 className="text-3xl font-black mb-3 text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Convert PDF to Quiz</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-10 font-medium">
                  Upload any text-based study PDF. QuizAI will analyze the content and generate a complete interactive quiz instantly.
                </p>
                <div className="relative inline-block">
                  <Button variant="primary" className="px-10 py-4 text-lg rounded-2xl pointer-events-none group-hover:bg-indigo-700 dark:group-hover:bg-indigo-400 transition-all">
                    Select Study Material
                  </Button>
                </div>
              </div>

              {questions.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-xl border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6 group">
                   <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                         <i className="fas fa-book text-3xl"></i>
                      </div>
                      <div>
                         <div className="flex items-center gap-2">
                           <h3 className="text-2xl font-black text-slate-800 dark:text-white">{quizName}</h3>
                           <button onClick={() => setMode(AppMode.ADMIN)} className="text-slate-400 hover:text-indigo-500"><i className="fas fa-pen-nib text-xs"></i></button>
                         </div>
                         <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{questions.length} Questions • {attempts.length} Attempts</p>
                      </div>
                   </div>
                   <div className="flex gap-3 w-full md:w-auto">
                      <Button variant="secondary" className="flex-1 md:flex-none py-4 px-6" onClick={() => setMode(AppMode.PROGRESS)}><i className="fas fa-chart-line"></i></Button>
                      <Button variant="primary" className="flex-1 md:flex-none py-4 px-10 shadow-lg shadow-indigo-600/20" onClick={() => setMode(quizState.isFinished ? AppMode.RESULTS : AppMode.QUIZ)}>
                        {quizState.isFinished ? 'Results' : 'Continue'} <i className="fas fa-arrow-right ml-2"></i>
                      </Button>
                   </div>
                </div>
              )}
            </div>
          )}

          {mode === AppMode.EXTRACTING && (
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-16 text-center shadow-2xl animate-in zoom-in-95 duration-500">
              <div className="mb-10 relative inline-block">
                <div className="w-32 h-32 border-[6px] border-slate-100 dark:border-slate-800 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-indigo-600">{extractionProgress}%</div>
              </div>
              <h2 className="text-3xl font-black mb-2 text-slate-800 dark:text-white">Analyzing PDF...</h2>
              <p className="text-slate-500 dark:text-slate-400 font-bold mb-12 uppercase tracking-widest text-xs">{loadingStep}</p>
              <div className="max-w-sm mx-auto space-y-4">
                {steps.map(s => (
                  <div key={s.id} className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs transition-all ${completedSteps.includes(s.id) ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      {completedSteps.includes(s.id) ? <i className="fas fa-check"></i> : <i className="fas fa-brain"></i>}
                    </div>
                    <span className={`font-bold transition-all ${completedSteps.includes(s.id) ? 'text-emerald-600' : 'text-slate-400'}`}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === AppMode.QUIZ && questions.length > 0 && (
            <div className="flex flex-col md:flex-row gap-8 items-start animate-in fade-in slide-in-from-bottom-8 duration-500">
              <aside className={`w-full md:w-64 shrink-0 transition-all duration-300 ${sidebarOpen ? 'block' : 'hidden md:block opacity-0 w-0'}`}>
                 <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-xl border border-slate-100 dark:border-slate-800 sticky top-8">
                   <div className="flex justify-between items-center mb-6 px-2">
                     <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Roadmap</span>
                     <span className="text-[10px] font-black text-indigo-600">{Object.keys(quizState.userAnswers).length} / {questions.length}</span>
                   </div>
                   <div className="grid grid-cols-5 md:grid-cols-4 gap-2">
                     {quizState.questions.map((q, i) => {
                       const active = quizState.currentQuestionIndex === i;
                       const done = !!quizState.userAnswers[q.id];
                       return (
                         <button 
                           key={q.id} 
                           onClick={() => setQuizState(s => ({...s, currentQuestionIndex: i}))}
                           className={`aspect-square rounded-xl flex items-center justify-center text-xs font-black transition-all transform active:scale-90 ${
                            active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : done ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200'
                           }`}
                         >
                           {i + 1}
                         </button>
                       );
                     })}
                   </div>
                   <div className="mt-8">
                      <Button variant="danger" className="w-full text-xs font-black py-4 rounded-2xl" onClick={finishQuiz}>End Session</Button>
                   </div>
                 </div>
              </aside>

              <div className="flex-grow space-y-6">
                <ProgressBar current={quizState.currentQuestionIndex + 1} total={questions.length} />
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 md:p-14 shadow-2xl border border-slate-100 dark:border-slate-800">
                  <span className="bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-8 inline-block">
                    Question {quizState.currentQuestionIndex + 1}
                  </span>
                  <h3 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white mb-12 leading-tight">
                    {currentQuestion.question}
                  </h3>
                  <div className="space-y-4 mb-12">
                    {currentQuestion.options.map((opt, i) => {
                      const selected = pendingAnswer === opt || quizState.userAnswers[currentQuestion.id] === opt;
                      const isCorrect = currentQuestion.correctAnswer === opt;
                      const answered = !!quizState.userAnswers[currentQuestion.id];
                      
                      let base = "w-full p-6 rounded-2xl border-2 flex items-center gap-5 text-left transition-all duration-300 group ";
                      if (answered) {
                        if (isCorrect) base += "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-900 dark:text-emerald-300";
                        else if (selected) base += "bg-red-50 dark:bg-red-900/20 border-red-500 text-red-900 dark:text-red-300";
                        else base += "border-slate-100 dark:border-slate-800 text-slate-300 dark:text-slate-700 opacity-50";
                      } else {
                        if (selected) base += "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 text-indigo-900 dark:text-indigo-200 ring-4 ring-indigo-500/10";
                        else base += "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 hover:translate-x-2";
                      }

                      return (
                        <button key={i} disabled={answered} onClick={() => setPendingAnswer(opt)} className={base}>
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black transition-colors ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
                            {String.fromCharCode(65 + i)}
                          </div>
                          <span className="font-bold flex-grow">{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                  {hasAnsweredCurrent && (
                    <div className="p-8 bg-slate-50 dark:bg-slate-800/40 rounded-[2rem] border-2 border-slate-100 dark:border-slate-700 animate-in slide-in-from-top-4">
                       <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                         <i className="fas fa-lightbulb text-indigo-500"></i> Insight (Source Page {currentQuestion.pageNumber})
                       </h4>
                       <p className="text-slate-600 dark:text-slate-300 font-medium leading-relaxed italic text-lg">"{currentQuestion.explanation}"</p>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center px-4">
                  <Button variant="ghost" onClick={() => setQuizState(s => ({...s, currentQuestionIndex: Math.max(0, s.currentQuestionIndex - 1)}))} disabled={quizState.currentQuestionIndex === 0}>
                    <i className="fas fa-chevron-left mr-2"></i> Previous
                  </Button>
                  {pendingAnswer && !hasAnsweredCurrent ? (
                    <Button variant="primary" onClick={handleConfirmAnswer} className="px-12 py-4 text-xl font-black shadow-2xl shadow-indigo-600/40 animate-bounce">Confirm Choice</Button>
                  ) : (
                    <Button variant="primary" onClick={goToNext} className="px-12 py-4">
                      {quizState.currentQuestionIndex === questions.length - 1 ? 'Finish Results' : (hasAnsweredCurrent ? 'Next Question' : 'Skip')} <i className="fas fa-chevron-right ml-2"></i>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {mode === AppMode.RESULTS && (
            <div className="space-y-8 animate-in zoom-in-95 duration-700">
               <div className="bg-white dark:bg-slate-900 rounded-[3rem] overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800">
                  <div className="bg-indigo-600 p-20 text-center text-white relative">
                    <div className="relative z-10">
                      <h2 className="text-5xl font-black mb-4">Mastery Score</h2>
                      <div className="text-8xl font-black mb-2">
                        {Math.round((quizState.questions.filter(q => quizState.userAnswers[q.id] === q.correctAnswer).length / questions.length) * 100)}%
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 p-10 opacity-10 text-[20rem] leading-none pointer-events-none">
                      <i className="fas fa-award"></i>
                    </div>
                  </div>
                  <div className="p-12">
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
                        <div className="bg-slate-50 dark:bg-slate-800 p-8 rounded-3xl text-center border-b-4 border-emerald-500">
                           <div className="text-4xl font-black text-slate-800 dark:text-white mb-2">{quizState.questions.filter(q => quizState.userAnswers[q.id] === q.correctAnswer).length}</div>
                           <div className="text-[10px] font-black uppercase text-slate-400">Correct</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-8 rounded-3xl text-center border-b-4 border-red-500">
                           <div className="text-4xl font-black text-slate-800 dark:text-white mb-2">{questions.length - quizState.questions.filter(q => quizState.userAnswers[q.id] === q.correctAnswer).length}</div>
                           <div className="text-[10px] font-black uppercase text-slate-400">Wrong</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-8 rounded-3xl text-center border-b-4 border-indigo-500">
                           <div className="text-4xl font-black text-slate-800 dark:text-white mb-2">{questions.length}</div>
                           <div className="text-[10px] font-black uppercase text-slate-400">Total</div>
                        </div>
                     </div>
                     <div className="flex flex-col sm:flex-row gap-4">
                        <Button variant="primary" className="flex-grow py-5 text-lg" onClick={() => resetQuiz('all')}>Retake Full Quiz</Button>
                        <Button variant="secondary" className="flex-grow py-5 text-lg" onClick={() => resetQuiz('incorrect')}>Retry Mistakes</Button>
                        <Button variant="ghost" className="px-8 py-5 border border-slate-200 dark:border-slate-800" onClick={downloadQuizData}>
                           <i className="fas fa-download mr-2"></i> JSON
                        </Button>
                     </div>
                  </div>
               </div>
               <div className="text-center">
                  <Button variant="ghost" className="text-slate-400 hover:text-indigo-500" onClick={() => setMode(AppMode.UPLOAD)}>Back to Dashboard</Button>
               </div>
            </div>
          )}

          {mode === AppMode.PROGRESS && (
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in slide-in-from-right-8 duration-500">
               <div className="flex justify-between items-center mb-12">
                  <h2 className="text-3xl font-black text-slate-800 dark:text-white">Learning History</h2>
                  <Button variant="ghost" onClick={() => setMode(AppMode.UPLOAD)}><i className="fas fa-times"></i></Button>
               </div>
               {attempts.length === 0 ? (
                 <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                    <i className="fas fa-chart-area text-6xl text-slate-200 mb-6"></i>
                    <p className="font-bold text-slate-400">Finish your first quiz to see progress!</p>
                 </div>
               ) : (
                 <div className="space-y-12">
                   <div className="aspect-[2/1] md:aspect-[3/1] bg-slate-50 dark:bg-slate-800/30 p-8 rounded-[2rem] relative overflow-hidden">
                      {chartData && (
                        <svg viewBox={`0 0 ${chartData.w} ${chartData.h}`} className="w-full h-full" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.2" />
                              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path d={chartData.area} fill="url(#chartGrad)" />
                          <path d={chartData.path} fill="none" stroke="#4f46e5" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                          {chartData.pts.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r="6" className="fill-white dark:fill-slate-900 stroke-indigo-600 stroke-[4px]" />
                          ))}
                        </svg>
                      )}
                      <div className="absolute top-6 left-8 flex gap-4">
                        <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2"><div className="w-3 h-3 bg-indigo-600 rounded-full"></div> Progress Line</span>
                      </div>
                   </div>
                   <div className="space-y-4">
                     {attempts.map((at, i) => (
                        <div key={at.id} className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl flex items-center justify-between group hover:bg-white dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">
                                {Math.round((at.score/at.total)*100)}%
                              </div>
                              <div>
                                 <p className="font-black text-slate-800 dark:text-white">Attempt {attempts.length - i}</p>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(at.timestamp).toLocaleDateString()}</p>
                              </div>
                           </div>
                           <div className="text-right">
                              <p className="font-black text-indigo-600">{at.score} <span className="text-slate-300">/ {at.total}</span></p>
                           </div>
                        </div>
                     ))}
                   </div>
                   <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-center">
                      <Button variant="ghost" onClick={clearAllData} className="text-red-400 text-xs font-black uppercase tracking-widest"><i className="fas fa-trash-alt mr-2"></i> Clear History</Button>
                   </div>
                 </div>
               )}
            </div>
          )}

          {mode === AppMode.ADMIN && (
            <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500">
               <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] shadow-xl flex items-center justify-between border border-slate-100 dark:border-slate-800">
                  <h2 className="text-2xl font-black">Edit Quiz Data</h2>
                  <Button variant="primary" onClick={() => setMode(AppMode.UPLOAD)}>Finish Edits</Button>
               </div>
               <div className="space-y-6">
                 {questions.map((q, i) => (
                    <div key={q.id} className="bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800">
                       <div className="flex justify-between items-center mb-6">
                          <span className="text-xl font-black text-indigo-600">Question #{i+1}</span>
                          <span className="text-[10px] font-black text-slate-300 uppercase">Page {q.pageNumber}</span>
                       </div>
                       <div className="space-y-6">
                          <div>
                             <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Question Text</label>
                             <textarea className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-indigo-500 text-lg font-bold" rows={3} value={q.question} onChange={e => saveEditedQuestion(q.id, {question: e.target.value})} />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             {q.options.map((opt, oi) => (
                               <div key={oi}>
                                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Option {String.fromCharCode(65 + oi)}</label>
                                  <input className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none" value={opt} onChange={e => {
                                    const nextOpts = [...q.options];
                                    nextOpts[oi] = e.target.value;
                                    saveEditedQuestion(q.id, {options: nextOpts});
                                  }} />
                               </div>
                             ))}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                             <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Correct Answer</label>
                                <select className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 font-bold" value={q.correctAnswer} onChange={e => saveEditedQuestion(q.id, {correctAnswer: e.target.value})}>
                                   {q.options.map((o, oi) => <option key={oi} value={o}>{o}</option>)}
                                </select>
                             </div>
                             <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">AI Explanation</label>
                                <textarea className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm" rows={3} value={q.explanation} onChange={e => saveEditedQuestion(q.id, {explanation: e.target.value})} />
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
    </div>
  );
};

export default App;
