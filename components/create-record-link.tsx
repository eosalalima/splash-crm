"use client";
import Link, { useLinkStatus } from "next/link";
import { Plus } from "lucide-react";
import { singular } from "@/lib/format";
import type { Kind } from "@/lib/validation";

function Label({ kind }: { kind: Kind }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-live="polite" aria-busy={pending}>
      {pending ? "Opening…" : `Add ${singular[kind]}`}
    </span>
  );
}

export function CreateRecordLink({
  kind,
  appearance,
}: {
  kind: Kind;
  appearance: "primary" | "secondary";
}) {
  return (
    <Link href={`/${kind}/new`} className={`button ${appearance}`}>
      <Plus size={17} aria-hidden="true" />
      <Label kind={kind} />
    </Link>
  );
}
