// pages/[company].tsx
import { useRouter } from "next/router";
import ConsolePage from "./ConsolePage"; // or "../components/ConsolePage" if you’ve moved it

export default function CompanyPage() {
  const { query, isFallback } = useRouter();
  const { company } = query as { company?: string };

  // While Next is pre‑rendering or company isn’t defined yet
  if (isFallback || !company) {
    return <div>Loading…</div>;
  }

  // Pass companyName as a prop into your ConsolePage
  return <ConsolePage companyName={company} />;
}
