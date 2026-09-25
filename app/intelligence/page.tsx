import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PeopleIntelligenceWorkbench from "@/app/components/people-intelligence-workbench";

export const metadata: Metadata = {
  title: "People Intelligence | Researcher Map",
  description:
    "Compare a public people roster against a seed-paper researcher graph.",
};

export default function IntelligencePage() {
  return (
    <>
      <div className="fixed left-4 top-4 z-20">
        <Link
          href="/"
          className="ui-press inline-flex items-center gap-2 rounded-full bg-[var(--color-cream)] px-3 py-2 text-sm font-medium text-[var(--color-steel)] hover:text-[var(--color-jet-ink)]"
        >
          <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />
          Graph
        </Link>
      </div>
      <PeopleIntelligenceWorkbench />
    </>
  );
}
