import React from 'react';

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({ label, id, className, ...props }) => {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={4}
        className={`block w-full bg-gray-700 border border-gray-600 text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-600 disabled:text-gray-400 ${className || ''}`}
        {...props}
      />
    </div>
  );
};
