import type { Metadata } from "next";
import AuthorOverlapWorkbench from "@/app/components/author-overlap-workbench";

export const metadata: Metadata = {
  title: "Author Overlap Workbench",
  description:
    "Plain functionality page for finding author overlap around a seed research paper.",
};

export default function OverlapPage() {
  return <AuthorOverlapWorkbench />;
}
