import React from 'react';
import Svg, { Path, Circle, Line, Polygon, Polyline, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
});

export function ChatIcon({ size = 22, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 12c0 4.97-4.03 9-9 9-1.5 0-2.9-.37-4.14-1.02L3 21l1.09-3.27A8.96 8.96 0 013 12c0-4.97 4.03-9 9-9s9 4.03 9 9z" />
    </Svg>
  );
}

export function LinkIcon({ size = 22, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="5" width="18" height="14" rx="3" />
      <Polygon points="10 9 15 12 10 15 10 9" fill={color} stroke="none" />
    </Svg>
  );
}

export function MapIcon({ size = 22, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 21s-7-6.5-7-11a7 7 0 0114 0c0 4.5-7 11-7 11z" />
      <Circle cx="12" cy="10" r="2.5" />
    </Svg>
  );
}

export function SettingsIcon({ size = 18, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </Svg>
  );
}

export function ShareIcon({ size = 17, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="18" cy="5" r="3" />
      <Circle cx="6" cy="12" r="3" />
      <Circle cx="18" cy="19" r="3" />
      <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </Svg>
  );
}

export function SendIcon({ size = 18, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="22" y1="2" x2="11" y2="13" />
      <Polygon points="22 2 15 22 11 13 2 9 22 2" />
    </Svg>
  );
}

export function EditIcon({ size = 13, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 20h9" />
      <Path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  );
}

export function ReplyIcon({ size = 15, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 17 4 12 9 7" />
      <Path d="M4 12h10a6 6 0 0 1 6 6v1" />
    </Svg>
  );
}

export function CloseIcon({ size = 14, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}

export function AttachIcon({ size = 19, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 0 1 5.19 5.19l-9.2 9.19a1.83 1.83 0 0 1-2.6-2.6l8.49-8.48" />
    </Svg>
  );
}

export function PlayIcon({ size = 22, color = '#000' }: IconProps) {
  return (
    <Svg {...base(size)} viewBox="0 0 24 24">
      <Polygon points="7 4 20 12 7 20 7 4" fill={color} />
    </Svg>
  );
}

export function MicIcon({ size = 19, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="9" y="2" width="6" height="12" rx="3" />
      <Path d="M5 10a7 7 0 0 0 14 0" />
      <Line x1="12" y1="17" x2="12" y2="22" />
      <Line x1="8" y1="22" x2="16" y2="22" />
    </Svg>
  );
}

export function StopIcon({ size = 19, color = '#000' }: IconProps) {
  return (
    <Svg {...base(size)} viewBox="0 0 24 24">
      <Rect x="6" y="6" width="12" height="12" rx="2" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ size = 22, color = '#000' }: IconProps) {
  return (
    <Svg {...base(size)} viewBox="0 0 24 24">
      <Rect x="6" y="4" width="4" height="16" rx="1" fill={color} />
      <Rect x="14" y="4" width="4" height="16" rx="1" fill={color} />
    </Svg>
  );
}

export function SearchIcon({ size = 18, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="11" cy="11" r="7" />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Svg>
  );
}

export function CheckIcon({ size = 12, color = '#000', strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 12 9 18 21 6" />
    </Svg>
  );
}

export function MoreIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg {...base(size)} viewBox="0 0 24 24">
      <Circle cx="12" cy="5" r="1.8" fill={color} />
      <Circle cx="12" cy="12" r="1.8" fill={color} />
      <Circle cx="12" cy="19" r="1.8" fill={color} />
    </Svg>
  );
}

export function PlusIcon({ size = 15, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  );
}

export function TrashIcon({ size = 16, color = '#000', strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <Path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function ChevronIcon({ size = 17, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

export function BackIcon({ size = 20, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="19" y1="12" x2="5" y2="12" />
      <Polyline points="12 19 5 12 12 5" />
    </Svg>
  );
}

export function EyeIcon({ size = 19, color = '#000', strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M1.8 12S5.6 5.2 12 5.2 22.2 12 22.2 12 18.4 18.8 12 18.8 1.8 12 1.8 12z" />
      <Circle cx="12" cy="12" r="3.1" />
    </Svg>
  );
}

export function EyeOffIcon({ size = 19, color = '#000', strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10.1 5.4A9.9 9.9 0 0112 5.2c6.4 0 10.2 6.8 10.2 6.8a18.6 18.6 0 01-3.1 4" />
      <Path d="M6.4 6.7A18.4 18.4 0 001.8 12S5.6 18.8 12 18.8c1.9 0 3.6-.6 5-1.5" />
      <Path d="M9.9 9.9a3.1 3.1 0 004.4 4.4" />
      <Line x1="3.2" y1="3.2" x2="20.8" y2="20.8" />
    </Svg>
  );
}

export function ImageIcon({ size = 20, color = '#000', strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="4" width="18" height="16" rx="2.2" />
      <Circle cx="8.5" cy="9.5" r="1.8" />
      <Path d="M4 17l5.2-5.2a1.5 1.5 0 012.1 0L15 15.5" />
      <Path d="M13 13.5l1.7-1.7a1.5 1.5 0 012.1 0L20 15" />
    </Svg>
  );
}

export function FileIcon({ size = 20, color = '#000', strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 2.8h8.2L19 7.6V20a1.2 1.2 0 01-1.2 1.2H6A1.2 1.2 0 014.8 20V4A1.2 1.2 0 016 2.8z" />
      <Path d="M14.2 2.8V7a1 1 0 001 1h3.8" />
      <Line x1="8" y1="12.2" x2="15.5" y2="12.2" />
      <Line x1="8" y1="15.6" x2="15.5" y2="15.6" />
    </Svg>
  );
}

export function StarIcon({ size = 17, color = '#000', strokeWidth = 1.8, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...base(size)} fill={filled ? color : 'none'} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Polygon points="12 2.5 15.1 8.8 22 9.8 17 14.7 18.2 21.6 12 18.3 5.8 21.6 7 14.7 2 9.8 8.9 8.8 12 2.5" />
    </Svg>
  );
}

export function LocateIcon({ size = 20, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="7" />
      <Circle cx="12" cy="12" r="2.2" fill={color} stroke="none" />
      <Line x1="12" y1="1.5" x2="12" y2="4" />
      <Line x1="12" y1="20" x2="12" y2="22.5" />
      <Line x1="1.5" y1="12" x2="4" y2="12" />
      <Line x1="20" y1="12" x2="22.5" y2="12" />
    </Svg>
  );
}

export function SunIcon({ size = 18, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="5" />
      <Line x1="12" y1="1" x2="12" y2="3" />
      <Line x1="12" y1="21" x2="12" y2="23" />
      <Line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <Line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <Line x1="1" y1="12" x2="3" y2="12" />
      <Line x1="21" y1="12" x2="23" y2="12" />
      <Line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <Line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </Svg>
  );
}

export function MoonIcon({ size = 18, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </Svg>
  );
}

/** Bandierina: segnalare un contenuto a chi gestisce il servizio. */
export function FlagIcon({ size = 18, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 21V4M5 4h11l-2 3.5L16 11H5" />
    </Svg>
  );
}

/** Cerchio sbarrato: bloccare una persona. */
export function BanIcon({ size = 18, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="9" />
      <Path d="M5.6 5.6l12.8 12.8" />
    </Svg>
  );
}

export function UsersIcon({ size = 38, color = '#000', strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </Svg>
  );
}

export function LogoutIcon({ size = 18, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  );
}

export function ShieldIcon({ size = 18, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3L4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" />
    </Svg>
  );
}

/** Freccia in diagonale: la riga apre qualcosa fuori dall'app. */
export function ExternalIcon({ size = 14, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="7" y1="17" x2="17" y2="7" />
      <Polyline points="8 7 17 7 17 16" />
    </Svg>
  );
}

/** Cerchio metà pieno: il tema che segue quello del telefono. */
export function AutoThemeIcon({ size = 18, color = '#000', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 3a9 9 0 010 18z" fill={color} />
    </Svg>
  );
}
