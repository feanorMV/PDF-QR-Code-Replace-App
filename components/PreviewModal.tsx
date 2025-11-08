import React from 'react';
import Loader from './Loader';
import { CheckCircleIcon } from './icons';

interface PreviewModalProps {
  imageUrl: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ imageUrl, onConfirm, onCancel, isProcessing }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" aria-modal="true">
      <div className="bg-brand-surface rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-brand-secondary flex justify-between items-center">
          <h2 className="text-xl font-bold">Попередній перегляд</h2>
          <button onClick={onCancel} disabled={isProcessing} className="text-brand-text-dark hover:text-white">&times;</button>
        </div>
        <div className="p-6 flex-grow overflow-y-auto">
          {imageUrl ? (
            <img src={imageUrl} alt="Preview of modified page" className="w-full h-auto object-contain" />
          ) : (
            <div className="flex items-center justify-center h-full">
                <Loader text="Створення попереднього перегляду..."/>
            </div>
          )}
        </div>
        <div className="p-4 bg-black/20 border-t border-brand-secondary flex justify-end items-center gap-4">
            {isProcessing && <p className="text-sm text-brand-text-dark">Обробка PDF...</p>}
            <button
                onClick={onCancel}
                disabled={isProcessing}
                className="px-4 py-2 bg-brand-secondary text-white font-bold rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
                Скасувати
            </button>
            <button
                onClick={onConfirm}
                disabled={!imageUrl || isProcessing}
                className="px-6 py-2 bg-brand-primary text-white font-bold rounded-lg hover:bg-blue-500 transition-colors disabled:bg-brand-secondary disabled:cursor-not-allowed flex items-center gap-2"
            >
                <CheckCircleIcon className="w-5 h-5" />
                Підтвердити та згенерувати
            </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
