import { toast } from "sonner"

export function premiumToast(type: "success" | "error" | "info", message: string) {
  const fn = type === "success" ? toast.success : type === "error" ? toast.error : toast.info
  fn(message)
}
