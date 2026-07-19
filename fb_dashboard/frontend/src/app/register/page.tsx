import dynamic from "next/dynamic"

const RegisterForm = dynamic(() => import("./RegisterForm"), { ssr: false })

export default function RegisterPage() {
  return <RegisterForm />
}
