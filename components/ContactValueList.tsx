import React from "react";
import { splitContactValues } from "@/lib/contactDisplay";

type Kind = "phone" | "email";

interface ContactValueListProps {
  label: string;
  value: string | null | undefined;
  kind: Kind;
}

export const ContactValueList: React.FC<ContactValueListProps> = ({
  label,
  value,
  kind,
}) => {
  const items = splitContactValues(value ?? "");
  if (items.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <ul className="list-inside list-disc space-y-0.5 text-[11px] text-zinc-800">
        {items.map((item, i) => (
          <li key={`${item}-${i}`} className="break-all">
            {kind === "email" ? (
              <a
                href={`mailto:${item}`}
                className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-800"
              >
                {item}
              </a>
            ) : (
              <a
                href={`tel:${item.replace(/\s+/g, "")}`}
                className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-800"
              >
                {item}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
