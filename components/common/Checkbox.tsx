import React from 'react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, id, className, ...props }) => {
  return (
    <div className={`flex items-center ${className || ''}`}>
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
        {...props}
      />
      <label htmlFor={id} className="ml-2 block text-sm text-gray-300">
        {label}
      </label>
    </div>
  );
};
