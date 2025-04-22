// pages/index.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/revola");
  }, [router]);
  return null; // or a spinner
}
