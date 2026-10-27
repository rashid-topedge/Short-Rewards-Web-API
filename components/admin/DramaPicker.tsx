"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, Tv2, X } from "lucide-react";

export type DramaRef = { dramaId: number; title: string | null };

type Props = {
  label: string;
  value: DramaRef | null;
  onChange: (value: DramaRef | null) => void;
  /** Optional id for the text input (so an outside <label htmlFor> can point to it). */
  inputId?: string;
  disabled?: boolean;
};

type Option = { dramaId: number; title: string | null; episodeCount?: number };

/**
 * Searchable drama selector (ARIA combobox pattern).
 * Type to search by title, use ↑/↓ to move, Enter to pick, Esc to close.
 * Typing a number searches by drama id as well.
 */
export default function DramaPicker({ label, value, onChange, inputId, disabled }: Props) {
  const autoId = useId();
  const id = inputId || `drama-picker-${autoId}`;
  const listId = `${id}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query.trim(), limit: "8", status: "all" });
        const res = await fetch(`/api/admin/dramas?${params}`, { signal: controller.signal });
        const data = res.ok ? ((await res.json()) as { items?: Option[] }) : { items: [] };
        let items = data.items || [];
        const asId = Number(query.trim());
        if (Number.isInteger(asId) && asId > 0 && !items.some((o) => o.dramaId === asId)) {
          const one = await fetch(`/api/admin/dramas/${asId}`, { signal: controller.signal });
          if (one.ok) {
            const d = (await one.json()) as Option;
            if (d?.dramaId) items = [d, ...items];
          }
        }
        setOptions(items);
        setActive(0);
      } catch {
        // aborted or network error: keep previous options
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  const pick = (o: Option) => {
    onChange({ dramaId: o.dramaId, title: o.title });
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(0, options.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && options[active]) {
        e.preventDefault();
        pick(options[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault(); // don't close the surrounding <dialog>
        e.stopPropagation();
        setOpen(false);
      }
    }
  };

  if (value) {
    return (
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-neutral-200">{label}</span>
        <div className="flex items-center gap-2 rounded-xl border border-[#2b3850] bg-[#161c28] px-3 py-2.5">
          <Tv2 className="h-4 w-4 shrink-0 text-purple-300" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm text-white">
            {value.title || "Untitled drama"} <span className="text-neutral-400">#{value.dramaId}</span>
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="rounded-lg p-1 text-neutral-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            aria-label={`Remove linked drama ${value.title || value.dramaId}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const activeId = open && options[active] ? `${id}-opt-${options[active].dramaId}` : undefined;

  return (
    <div className="relative space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-200">
        {label} <span className="font-normal text-neutral-400">(optional)</span>
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder="Search drama by title or ID"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-[#2b3850] bg-[#161c28] py-2.5 pl-9 pr-9 text-sm text-white placeholder:text-neutral-500 focus:border-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-400" aria-hidden="true" />
        )}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} results`}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[#2b3850] bg-[#121826] py-1 shadow-2xl"
        >
          {options.length === 0 && !loading ? (
            <li className="px-3 py-2.5 text-sm text-neutral-400" role="presentation">
              No dramas found
            </li>
          ) : (
            options.map((o, i) => (
              <li
                key={o.dramaId}
                id={`${id}-opt-${o.dramaId}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm ${
                  i === active ? "bg-purple-600/30 text-white" : "text-neutral-200"
                }`}
              >
                <span className="truncate">{o.title || "Untitled drama"}</span>
                <span className="shrink-0 text-xs text-neutral-400">#{o.dramaId}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
