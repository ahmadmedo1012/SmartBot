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
import { motion, useAnimate } from "framer-motion"
import { forwardRef, useImperativeHandle, type SVGProps } from "react"

/**
 * Motion-enhanced lucide icons. Ported from Smart-Menu (smart-link.ly
 * shared identity) — same useAnimate choreography (scale + rotate on
 * hoverStart/hoverEnd via imperative animate, more reliable than
 * whileHover on nested SVGs). Drop-in replacement for plain lucide:
 * size/color/className API unchanged.
 */
type MotionIconProps = SVGProps<SVGSVGElement>

function makeMotionIcon(Icon: typeof Plus, label: string) {
  const Cmp = forwardRef<SVGSVGElement, MotionIconProps>(({ className, width, height, ...rest }, ref) => {
    const [scope, animate] = useAnimate()
    useImperativeHandle(ref, () => scope.current as SVGSVGElement)

    const start = () => {
      animate(
        scope.current,
        { scale: 1.15, rotate: label === "Plus" ? 90 : label === "Check" ? 15 : label === "Minus" ? -90 : 0 },
        { type: "spring", stiffness: 400, damping: 15 },
      )
    }
    const stop = () => {
      animate(scope.current, { scale: 1, rotate: 0 }, { type: "spring", stiffness: 300, damping: 20 })
    }

    return (
      <motion.svg
        ref={scope}
        className={className}
        width={width ?? "100%"}
        height={height ?? "100%"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: "block" }}
        onHoverStart={start}
        onHoverEnd={stop}
      >
        <Icon {...(rest as object)} className="w-full h-full" />
      </motion.svg>
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
