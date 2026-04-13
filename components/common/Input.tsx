import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  rightIcon?: React.ReactNode;
  onRightIconClick?: () => void;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, id, type = "text", className, rightIcon, onRightIconClick, ...props }, ref) => {
    const hasIcon = !!rightIcon;

    return (
      <div>
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref} // Attach the forwarded ref here
            type={type}
            id={id}
            className={`block w-full bg-gray-700 border border-gray-600 text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-600 ${hasIcon ? 'pr-10' : ''} ${className || ''}`}
            {...props}
          />
          {hasIcon && (
            <button
              type="button"
              onClick={onRightIconClick}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-r-md"
              aria-label={type === 'password' ? 'Show password' : 'Hide password'}
            >
              {rightIcon}
            </button>
          )}
        </div>
      </div>
    );
  }
);
