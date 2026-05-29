// components/CustomModal.tsx
'use client';
import React from 'react';

interface CustomModalProps {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'loading';
  title: string;
  message: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export default function CustomModal({ isOpen, type, title, message, onConfirm, onCancel }: CustomModalProps) {
  if (!isOpen) return null;

  const icons = {
    success: '🎉',
    error: '🚨',
    warning: '🤔',
    loading: '⏳'
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 text-center transform transition-all scale-100">
        
        <div className={`text-6xl mb-4 ${type === 'loading' ? 'animate-bounce' : 'animate-pulse'}`}>
          {icons[type]}
        </div>
        
        <h3 className="text-xl font-black text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 font-medium mb-6 leading-relaxed">{message}</p>

        {type === 'loading' ? (
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div className="bg-amber-500 h-full rounded-full animate-[ping_1.5s_ease-in-out_infinite] w-1/2 mx-auto"></div>
          </div>
        ) : (
          <div className="flex gap-3 justify-center">
            {onCancel && (
              <button onClick={onCancel} className="px-5 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors w-full">
                Batal
              </button>
            )}
            <button 
              onClick={onConfirm} 
              className={`px-5 py-3 rounded-xl font-bold text-white shadow-md transition-all w-full ${
                type === 'error' ? 'bg-rose-600 hover:bg-rose-700' : 
                type === 'warning' ? 'bg-amber-500 hover:bg-amber-600' : 
                'bg-emerald-500 hover:bg-emerald-600'
              }`}
            >
              Oke, Paham!
            </button>
          </div>
        )}
      </div>
    </div>
  );
}