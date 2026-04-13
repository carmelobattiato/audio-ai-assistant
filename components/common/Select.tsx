import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string | number; label: string }>;
}

export const Select: React.FC<SelectProps> = ({ label, id, options, className, ...props }) => {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`block w-full bg-gray-700 border border-gray-600 text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${className || ''}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-gray-700 text-gray-100">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};
