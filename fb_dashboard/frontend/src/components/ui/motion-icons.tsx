"use client"

import {
  Check,
  ArrowLeft,
  ArrowRight,
  Plus,
  Minus,
  Search,
  Phone,
  MapPin,
  Store,
  Crown,
  Award,
  Gift,
  Medal,
  Settings,
  TrendingUp,
  Activity,
  BarChart3,
  Smartphone,
  Menu as MenuIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Building2,
  Landmark,
  CreditCard,
  LogIn,
  Lightbulb,
} from "lucide-react"
import { forwardRef, type SVGProps, type CSSProperties } from "react"

/**
 * Motion-enhanced lucide icons. Ported from Smart-Menu (smart-link.ly
 * shared identity) — v6+: the useAnimate choreography (scale + rotate on
 * hover) is now a pure CSS hover (.motion-icon in globals.css, per-icon
 * rotation via --mi-rot). Drop-in replacement for plain lucide:
 * size/color/className API unchanged, framer-motion fully out of the
 * public (subscribe) critical path.
 */
type MotionIconProps = SVGProps<SVGSVGElement>

const LABEL_ROTATION: Record<string, number> = {
  Plus: 90,
  Check: 15,
  Minus: -90,
}

function makeMotionIcon(Icon: typeof Plus, label: string) {
  const Cmp = forwardRef<SVGSVGElement, MotionIconProps>(({ className, width, height, style, ...rest }, ref) => {
    const iconStyle: CSSProperties = {
      ...(style as CSSProperties | undefined),
      "--mi-rot": `${LABEL_ROTATION[label] ?? 0}deg`,
    } as CSSProperties
    return (
      <svg
        ref={ref}
        className={["motion-icon", className].filter(Boolean).join(" ")}
        width={width ?? "100%"}
        height={height ?? "100%"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={iconStyle}
        aria-hidden="true"
      >
        <Icon {...(rest as object)} className="w-full h-full" />
      </svg>
    )
  })
  Cmp.displayName = `Motion${label}`
  return Cmp
}

export const MotionPlus = makeMotionIcon(Plus, "Plus")
export const MotionCheck = makeMotionIcon(Check, "Check")
export const MotionMinus = makeMotionIcon(Minus, "Minus")
export const MotionSearch = makeMotionIcon(Search, "Search")
export const MotionPhone = makeMotionIcon(Phone, "Phone")
export const MotionMapPin = makeMotionIcon(MapPin, "MapPin")
export const MotionStore = makeMotionIcon(Store, "Store")
export const MotionCrown = makeMotionIcon(Crown, "Crown")
export const MotionAward = makeMotionIcon(Award, "Award")
export const MotionGift = makeMotionIcon(Gift, "Gift")
export const MotionMedal = makeMotionIcon(Medal, "Medal")
export const MotionSettings = makeMotionIcon(Settings, "Settings")
export const MotionTrendingUp = makeMotionIcon(TrendingUp, "TrendingUp")
export const MotionActivity = makeMotionIcon(Activity, "Activity")
export const MotionBarChart3 = makeMotionIcon(BarChart3, "BarChart3")
export const MotionArrowLeft = makeMotionIcon(ArrowLeft, "ArrowLeft")
export const MotionArrowRight = makeMotionIcon(ArrowRight, "ArrowRight")
export const MotionSmartphone = makeMotionIcon(Smartphone, "Smartphone")
export const MotionMenu = makeMotionIcon(MenuIcon, "Menu")
export const MotionChevronLeft = makeMotionIcon(ChevronLeft, "ChevronLeft")
export const MotionChevronRight = makeMotionIcon(ChevronRight, "ChevronRight")
export const MotionChevronDown = makeMotionIcon(ChevronDown, "ChevronDown")
export const MotionAlertTriangle = makeMotionIcon(AlertTriangle, "AlertTriangle")
export const MotionBuilding2 = makeMotionIcon(Building2, "Building2")
export const MotionLandmark = makeMotionIcon(Landmark, "Landmark")
export const MotionCreditCard = makeMotionIcon(CreditCard, "CreditCard")
export const MotionLogIn = makeMotionIcon(LogIn, "LogIn")
export const MotionLightbulb = makeMotionIcon(Lightbulb, "Lightbulb")
