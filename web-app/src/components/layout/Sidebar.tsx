import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  FolderKanban,
  LayoutTemplate,
  Settings2,
  BookOpen,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

export interface SidebarProps {
  wsConnected: boolean;
  version: string;
}

const LS_KEY = 'pl_sidebar_collapsed';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

const mainNav: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
];

const secondaryNav: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: Settings2 },
];

export function Sidebar({ wsConnected, version }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, collapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [collapsed]);

  const linkClasses = (isActive: boolean) =>
    [
      'flex items-center gap-3 px-3 py-2 text-sm transition-colors rounded-[5px]',
      collapsed && 'justify-center',
      isActive
        ? 'bg-[#553DE9]/8 text-[#553DE9] font-medium border-l-2 border-[#553DE9]'
        : 'text-[#36342E] hover:bg-[#F8F4F0]',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <aside
      className="flex flex-col h-full border-r border-[#ECEAE3] bg-white transition-[width] duration-200"
      style={{ width: collapsed ? 64 : 240, minWidth: collapsed ? 64 : 240 }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-[#ECEAE3]">
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-heading text-lg font-bold leading-tight text-[#36342E]">
              Purple Lab
            </span>
            <span className="text-xs text-[#6B6960]">Powered by Loki</span>
          </div>
        )}
        <button
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed(!collapsed)}
          className="inline-flex items-center justify-center w-7 h-7 rounded-[3px] text-[#939084] hover:bg-[#F8F4F0] transition-colors"
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-1" aria-label="Main navigation">
        {mainNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => linkClasses(isActive)}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={18} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}

        {/* Separator */}
        <div className="my-2 border-t border-[#ECEAE3]" />

        {secondaryNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => linkClasses(isActive)}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={18} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-3 border-t border-[#ECEAE3] flex flex-col gap-2">
        {/* Connection status */}
        <div
          className={[
            'flex items-center gap-2 text-xs',
            collapsed && 'justify-center',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              wsConnected ? 'bg-[#1FC5A8]' : 'bg-[#C45B5B]'
            }`}
          />
          {!collapsed && (
            <span className="text-[#6B6960]">
              {wsConnected ? 'Connected' : 'Disconnected'}
            </span>
          )}
        </div>

        {/* Version */}
        {!collapsed && version && (
          <span className="text-xs text-[#6B6960]">v{version}</span>
        )}

        {/* Docs link */}
        <a
          href="https://www.autonomi.dev/docs"
          target="_blank"
          rel="noopener noreferrer"
          className={[
            'flex items-center gap-2 text-xs text-[#6B6960] hover:text-[#36342E] transition-colors',
            collapsed && 'justify-center',
          ]
            .filter(Boolean)
            .join(' ')}
          title={collapsed ? 'Documentation' : undefined}
        >
          <BookOpen size={14} />
          {!collapsed && <span>Docs</span>}
        </a>
      </div>
    </aside>
  );
}
