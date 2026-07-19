import dynamic from "next/dynamic"

const SubscribeContent = dynamic(() => import("./SubscribeContent"), { ssr: false })

export default function SubscribePage() {
  return <SubscribeContent />
}
