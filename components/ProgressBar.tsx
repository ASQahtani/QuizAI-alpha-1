
import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const percentage = Math.round((current / total) * 100);
  
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors">
        <span>Question {current} of {total}</span>
        <span>{percentage}% complete</span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden transition-colors">
        <div 
          className="bg-indigo-600 dark:bg-indigo-500 h-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
