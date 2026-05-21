import { Suspense } from "react";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-md h-32" />}>
      <RegisterForm />
    </Suspense>
  );
}
