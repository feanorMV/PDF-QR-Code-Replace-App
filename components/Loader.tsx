
import React from 'react';

interface LoaderProps {
  text: string;
}

const Loader: React.FC<LoaderProps> = ({ text }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-brand-surface rounded-lg shadow-lg">
      <div className="w-12 h-12 border-4 border-brand-secondary border-t-brand-primary rounded-full animate-spin mb-4"></div>
      <p className="text-lg text-brand-text-light">{text}</p>
    </div>
  );
};

export default Loader;
