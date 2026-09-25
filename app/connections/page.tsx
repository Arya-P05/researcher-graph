import type { Metadata } from "next";
import OverlapHome from "@/app/components/overlap-home";

export const metadata: Metadata = {
  title: "Author Connections | Researcher Map",
  description:
    "Explore the people and papers shared across a research paper's authors.",
};

export default function ConnectionsPage() {
  return <OverlapHome />;
}
