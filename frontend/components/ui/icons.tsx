interface IconProps {
  size?: number;
  className?: string;
}

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function DashboardIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="11" width="8" height="10" rx="1.5" />
      <rect x="3" y="14" width="8" height="7" rx="1.5" />
    </svg>
  );
}

export function BriefcaseIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <line x1="3" y1="12.5" x2="21" y2="12.5" />
    </svg>
  );
}

export function ListIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
    </svg>
  );
}

export function UserIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.4-3.8 4.4-5.5 7.5-5.5s6.1 1.7 7.5 5.5" />
    </svg>
  );
}

export function UsersIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 19c1.1-3.2 3.5-4.6 6.5-4.6s5.4 1.4 6.5 4.6" />
      <circle cx="17" cy="8.5" r="2.4" />
      <path d="M15.5 14.6c2.3.3 4 1.7 4.9 4.4" />
    </svg>
  );
}

export function GiftIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3.5" y="9.5" width="17" height="10.5" rx="1.5" />
      <line x1="3.5" y1="14" x2="20.5" y2="14" />
      <line x1="12" y1="9.5" x2="12" y2="20" />
      <path d="M12 9.5C10 9.5 8 8.3 8 6.3A2 2 0 0 1 12 6c0-1.7 1.7-2.7 3.2-2 1.3.6 1.6 2.3.8 3.5-1 1.4-2.5 2-4 2Z" />
    </svg>
  );
}

export function BellIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M6 10.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14.5 6 10.5Z" />
      <path d="M10.3 19.5a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  );
}

export function CalendarIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <line x1="3.5" y1="10" x2="20.5" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );
}

export function SchoolIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4Z" />
      <path d="M6 11v5.5c0 1.2 2.7 2.5 6 2.5s6-1.3 6-2.5V11" />
    </svg>
  );
}

export function CreditCardIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="6.5" y1="14.5" x2="10.5" y2="14.5" />
    </svg>
  );
}

export function BuildingIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <line x1="9" y1="7.5" x2="9" y2="7.5" />
      <line x1="15" y1="7.5" x2="15" y2="7.5" />
      <line x1="9" y1="11.5" x2="9" y2="11.5" />
      <line x1="15" y1="11.5" x2="15" y2="11.5" />
      <line x1="9" y1="15.5" x2="9" y2="15.5" />
      <line x1="15" y1="15.5" x2="15" y2="15.5" />
      <line x1="9" y1="20.5" x2="15" y2="20.5" />
    </svg>
  );
}

export function CheckIcon({ size = 12, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4.5,12.5 9.5,17.5 19.5,6" />
    </svg>
  );
}

export function SearchIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="10" cy="10" r="6.5" />
      <line x1="15" y1="15" x2="20" y2="20" />
    </svg>
  );
}

export function PlusIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function InboxIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 12.5 6 5.5h12l2 7" />
      <rect x="3" y="12.5" width="18" height="7" rx="1.5" />
      <path d="M8 12.5c0 1.4 1.8 2.5 4 2.5s4-1.1 4-2.5" />
    </svg>
  );
}

export function GearIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8 6.2 6.2" />
    </svg>
  );
}

export function DownloadIcon({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 3.5v12" />
      <polyline points="7,11 12,16 17,11" />
      <path d="M4.5 17.5v2A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </svg>
  );
}

export function TrashIcon({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4.5 7h15" />
      <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
      <path d="M6.5 7l1 12.5A1.5 1.5 0 0 0 9 21h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <polyline points="9,5 16,12 9,19" />
    </svg>
  );
}

export function OfferIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <line x1="21" y1="3" x2="10.5" y2="13.5" />
      <polygon points="21,3 14,21 10.5,13.5 3,10" />
    </svg>
  );
}

export function ClockIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <polyline points="12,7.5 12,12 15.2,14" />
    </svg>
  );
}

export function XCircleIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function AlertIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <line x1="12" y1="10" x2="12" y2="14.5" />
      <line x1="12" y1="17.2" x2="12" y2="17.2" />
    </svg>
  );
}
