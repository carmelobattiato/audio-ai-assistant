import React from 'react';

export interface NeoTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

interface NeoTabsProps {
  tabs: NeoTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const NeoTabs: React.FC<NeoTabsProps> = ({ tabs, activeTab, onTabChange, children, className = '' }) => {
  const childArray = React.Children.toArray(children);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Tab bar */}
      <div
        className="flex gap-1 p-1 rounded-xl mb-4 flex-shrink-0"
        style={{ background: 'var(--neo-card)', border: '1px solid var(--neo-border)' }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex items-center gap-2 flex-1 px-4 py-2 rounded-lg text-sm font-medium
                transition-all duration-200 relative
                ${isActive
                  ? 'text-white'
                  : 'hover:bg-white/10'
                }
              `}
              style={isActive ? {
                background: 'linear-gradient(135deg, rgba(124,58,237,0.5), rgba(192,38,211,0.3))',
                boxShadow: '0 0 16px rgba(124,58,237,0.25)',
              } : {
                color: 'var(--neo-muted)',
              }}
            >
              {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(139,92,246,0.2)',
                    color: isActive ? '#fff' : '#A78BFA',
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tabs.map((tab, i) => (
          <div key={tab.id} className={tab.id === activeTab ? 'block h-full' : 'hidden'}>
            {childArray[i]}
          </div>
        ))}
      </div>
    </div>
  );
};
