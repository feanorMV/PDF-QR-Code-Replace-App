import React, { useRef, useState, useLayoutEffect } from 'react';
import Loader from './Loader';
import { CheckCircleIcon } from './icons';
import { QrCodeLocation } from '../types';

interface PreviewModalProps {
  imageUrl: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
  qrLocation: QrCodeLocation;
  pageDimensions: { width: number; height: number };
}

const PreviewModal: React.FC<PreviewModalProps> = ({ imageUrl, onConfirm, onCancel, isProcessing, qrLocation, pageDimensions }) => {
  const PREVIEW_RENDER_SCALE = 1.5;
  const imgRef = useRef<HTMLImageElement>(null);
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({ display: 'none' });

  useLayoutEffect(() => {
    if (!imageUrl || !imgRef.current) return;

    const img = imgRef.current;

    const handleImageLoad = () => {
      const { naturalWidth, clientWidth } = img;
      
      // The preview image was rendered at a specific scale from the original PDF size.
      // The highlight coordinates must be based on this initial render scale.
      const imageRenderedWidth = pageDimensions.width * PREVIEW_RENDER_SCALE;
      
      // Now, find out how the browser has scaled that rendered image to fit the screen.
      const displayScale = clientWidth / imageRenderedWidth;

      setHighlightStyle({
        position: 'absolute',
        top: `${qrLocation.y * PREVIEW_RENDER_SCALE * displayScale}px`,
        left: `${qrLocation.x * PREVIEW_RENDER_SCALE * displayScale}px`,
        width: `${qrLocation.width * PREVIEW_RENDER_SCALE * displayScale}px`,
        height: `${qrLocation.height * PREVIEW_RENDER_SCALE * displayScale}px`,
        border: '3px solid #00aaff',
        boxShadow: '0 0 15px #00aaff, inset 0 0 15px #00aaff',
        pointerEvents: 'none',
        display: 'block'
      });
    };
    
    // If the image is already loaded (e.g., from cache), call handler directly.
    if (img.complete) {
      handleImageLoad();
    } else {
      img.addEventListener('load', handleImageLoad);
    }
    
    // Also handle window resizing
    window.addEventListener('resize', handleImageLoad);

    return () => {
      img.removeEventListener('load', handleImageLoad);
      window.removeEventListener('resize', handleImageLoad);
    };
  }, [imageUrl, qrLocation, pageDimensions]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" aria-modal="true">
      <div className="bg-brand-surface rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-brand-secondary flex justify-between items-center">
          <h2 className="text-xl font-bold">Попередній перегляд</h2>
          <button onClick={onCancel} disabled={isProcessing} className="text-brand-text-dark hover:text-white">&times;</button>
        </div>
        <div className="p-6 flex-grow overflow-y-auto flex items-center justify-center">
          {imageUrl ? (
            <div className="relative">
              <img ref={imgRef} src={imageUrl} alt="Preview of modified page" className="max-w-full max-h-[65vh] object-contain" />
              <div style={highlightStyle}></div>
            </div>
          ) : (
            <Loader text="Створення попереднього перегляду..."/>
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
