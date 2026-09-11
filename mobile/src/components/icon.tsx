/**
 * SmartBot Mobile — أيقونات SVG (نفس مجموعة lucide-react المستخدمة في الويب،
 * نفس المسارات — توابق بصري). stroke 24x24 مثل lucide.
 */
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg'
import { useTheme } from '@/hooks/use-theme'

type StrokeProps = { stroke: string; strokeWidth: number }

export type IconName =
  | 'dashboard'
  | 'message-circle'
  | 'message-square'
  | 'bar-chart'
  | 'grid'
  | 'users'
  | 'user-plus'
  | 'send'
  | 'settings'
  | 'bell'
  | 'radio'
  | 'clock'
  | 'newspaper'
  | 'trending-up'
  | 'calendar'
  | 'bot'
  | 'credit-card'
  | 'help-circle'
  | 'wrench'
  | 'refresh'
  | 'check'
  | 'x'
  | 'chevron-left'
  | 'chevron-right'
  | 'plus'
  | 'search'
  | 'eye'
  | 'eye-off'
  | 'trash'
  | 'edit'
  | 'target'
  | 'megaphone'
  | 'workflow'
  | 'activity'
  | 'sparkles'
  | 'file-text'
  | 'zap'
  | 'log-out'
  | 'arrow-left'
  | 'mail'
  | 'phone'
  | 'shield'
  | 'alert-circle'
  | 'info'

const renderers: Record<IconName, (p: StrokeProps) => React.ReactNode> = {
  dashboard: (p) => (
    <>
      <Rect width="7" height="9" x="3" y="3" rx="1" {...p} />
      <Rect width="7" height="5" x="14" y="3" rx="1" {...p} />
      <Rect width="7" height="9" x="14" y="12" rx="1" {...p} />
      <Rect width="7" height="5" x="3" y="16" rx="1" {...p} />
    </>
  ),
  'message-circle': (p) => <Path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" {...p} />,
  'message-square': (p) => <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" {...p} />,
  'bar-chart': (p) => (
    <>
      <Path d="M3 3v18h18" {...p} />
      <Path d="M18 17V9" {...p} />
      <Path d="M13 17V5" {...p} />
      <Path d="M8 17v-3" {...p} />
    </>
  ),
  grid: (p) => (
    <>
      <Rect width="18" height="18" x="3" y="3" rx="2" {...p} />
      <Path d="M3 12h18" {...p} />
      <Path d="M12 3v18" {...p} />
    </>
  ),
  users: (p) => (
    <>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...p} />
      <Circle cx="9" cy="7" r="4" {...p} />
      <Path d="M22 21v-2a4 4 0 0 0-3-3.87" {...p} />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" {...p} />
    </>
  ),
  'user-plus': (p) => (
    <>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...p} />
      <Circle cx="9" cy="7" r="4" {...p} />
      <Path d="M19 8v6" {...p} />
      <Path d="M22 11h-6" {...p} />
    </>
  ),
  send: (p) => (
    <>
      <Path d="m22 2-7 20-4-9-9-4Z" {...p} />
      <Path d="M22 2 11 13" {...p} />
    </>
  ),
  settings: (p) => (
    <>
      <Path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        {...p}
      />
      <Circle cx="12" cy="12" r="3" {...p} />
    </>
  ),
  bell: (p) => (
    <>
      <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" {...p} />
      <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" {...p} />
    </>
  ),
  radio: (p) => (
    <>
      <Path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" {...p} />
      <Path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" {...p} />
      <Circle cx="12" cy="12" r="2" {...p} />
      <Path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" {...p} />
      <Path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" {...p} />
    </>
  ),
  clock: (p) => (
    <>
      <Circle cx="12" cy="12" r="10" {...p} />
      <Polyline points="12 6 12 12 16 14" {...p} />
    </>
  ),
  newspaper: (p) => (
    <>
      <Path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" {...p} />
      <Path d="M18 14h-8" {...p} />
      <Path d="M15 18h-5" {...p} />
      <Path d="M10 6h8v4h-8V6Z" {...p} />
    </>
  ),
  'trending-up': (p) => (
    <>
      <Polyline points="22 7 13.5 15.5 8.5 10.5 2 17" {...p} />
      <Polyline points="16 7 22 7 22 13" {...p} />
    </>
  ),
  calendar: (p) => (
    <>
      <Path d="M8 2v4" {...p} />
      <Path d="M16 2v4" {...p} />
      <Rect width="18" height="18" x="3" y="4" rx="2" {...p} />
      <Path d="M3 10h18" {...p} />
    </>
  ),
  bot: (p) => (
    <>
      <Path d="M12 8V4H8" {...p} />
      <Rect width="16" height="12" x="4" y="8" rx="2" {...p} />
      <Path d="M2 14h2" {...p} />
      <Path d="M20 14h2" {...p} />
      <Path d="M15 13v2" {...p} />
      <Path d="M9 13v2" {...p} />
    </>
  ),
  'credit-card': (p) => (
    <>
      <Rect width="20" height="14" x="2" y="5" rx="2" {...p} />
      <Line x1="2" x2="22" y1="10" y2="10" {...p} />
    </>
  ),
  'help-circle': (p) => (
    <>
      <Circle cx="12" cy="12" r="10" {...p} />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" {...p} />
      <Path d="M12 17h.01" {...p} />
    </>
  ),
  wrench: (p) => <Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" {...p} />,
  refresh: (p) => (
    <>
      <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" {...p} />
      <Path d="M21 3v5h-5" {...p} />
      <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" {...p} />
      <Path d="M8 16H3v5" {...p} />
    </>
  ),
  check: (p) => <Path d="M20 6 9 17l-5-5" {...p} />,
  x: (p) => (
    <>
      <Path d="M18 6 6 18" {...p} />
      <Path d="m6 6 12 12" {...p} />
    </>
  ),
  'chevron-left': (p) => <Path d="m15 18-6-6 6-6" {...p} />,
  'chevron-right': (p) => <Path d="m9 18 6-6-6-6" {...p} />,
  plus: (p) => (
    <>
      <Path d="M5 12h14" {...p} />
      <Path d="M12 5v14" {...p} />
    </>
  ),
  search: (p) => (
    <>
      <Circle cx="11" cy="11" r="8" {...p} />
      <Path d="m21 21-4.3-4.3" {...p} />
    </>
  ),
  eye: (p) => (
    <>
      <Path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" {...p} />
      <Circle cx="12" cy="12" r="3" {...p} />
    </>
  ),
  'eye-off': (p) => (
    <>
      <Path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" {...p} />
      <Path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" {...p} />
      <Path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" {...p} />
      <Line x1="2" x2="22" y1="2" y2="22" {...p} />
    </>
  ),
  trash: (p) => (
    <>
      <Path d="M3 6h18" {...p} />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" {...p} />
      <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" {...p} />
    </>
  ),
  edit: (p) => (
    <>
      <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" {...p} />
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" {...p} />
    </>
  ),
  target: (p) => (
    <>
      <Circle cx="12" cy="12" r="10" {...p} />
      <Circle cx="12" cy="12" r="6" {...p} />
      <Circle cx="12" cy="12" r="2" {...p} />
    </>
  ),
  megaphone: (p) => (
    <>
      <Path d="m3 11 18-5v12L3 14v-3z" {...p} />
      <Path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" {...p} />
    </>
  ),
  workflow: (p) => (
    <>
      <Rect width="8" height="8" x="3" y="3" rx="2" {...p} />
      <Path d="M7 11v4a2 2 0 0 0 2 2h4" {...p} />
      <Rect width="8" height="8" x="13" y="13" rx="2" {...p} />
    </>
  ),
  activity: (p) => <Path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" {...p} />,
  sparkles: (p) => (
    <>
      <Path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" {...p} />
      <Path d="M20 3v4" {...p} />
      <Path d="M22 5h-4" {...p} />
    </>
  ),
  'file-text': (p) => (
    <>
      <Path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" {...p} />
      <Path d="M14 2v4a2 2 0 0 0 2 2h4" {...p} />
      <Path d="M16 13H8" {...p} />
      <Path d="M16 17H8" {...p} />
      <Path d="M10 9H8" {...p} />
    </>
  ),
  zap: (p) => <Path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" {...p} />,
  'log-out': (p) => (
    <>
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" {...p} />
      <Path d="m16 17 5-5-5-5" {...p} />
      <Path d="M21 12H9" {...p} />
    </>
  ),
  'arrow-left': (p) => (
    <>
      <Path d="m12 19-7-7 7-7" {...p} />
      <Path d="M19 12H5" {...p} />
    </>
  ),
  mail: (p) => (
    <>
      <Rect width="20" height="16" x="2" y="4" rx="2" {...p} />
      <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" {...p} />
    </>
  ),
  phone: (p) => <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" {...p} />,
  shield: (p) => <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" {...p} />,
  'alert-circle': (p) => (
    <>
      <Circle cx="12" cy="12" r="10" {...p} />
      <Line x1="12" x2="12" y1="8" y2="12" {...p} />
      <Path d="M12 16h.01" {...p} />
    </>
  ),
  info: (p) => (
    <>
      <Circle cx="12" cy="12" r="10" {...p} />
      <Path d="M12 16v-4" {...p} />
      <Path d="M12 8h.01" {...p} />
    </>
  ),
}

export interface IconProps {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
}

export function Icon({ name, size = 22, color, strokeWidth = 2 }: IconProps) {
  const { colors } = useTheme()
  const strokeProps: StrokeProps = { stroke: color ?? colors.foreground, strokeWidth }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {renderers[name](strokeProps)}
    </Svg>
  )
}
