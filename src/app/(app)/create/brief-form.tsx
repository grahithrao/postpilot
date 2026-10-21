"use client";

import * as React from "react";
import { ContentType, ContentLength, Platform, Tone } from "@prisma/client";
import { Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlatformIcon } from "@/components/shared/platform-badge";
import {
  CONTENT_TYPE_HINT,
  CONTENT_TYPE_LABEL,
  LANGUAGES,
  LENGTH_LABEL,
  TONE_LABEL,
} from "@/lib/constants/labels";
import { PLATFORM_LIST } from "@/lib/constants/platforms";
import { cn } from "@/lib/utils";

export interface BriefState {
  topic: string;
  product: string;
  audience: string;
  platform: Platform;
  contentType: ContentType;
  tone: Tone;
  length: ContentLength;
  language: string;
  ctaRequest: string;
  keywords: string[];
  hashtags: string[];
  notes: string;
}

export const EMPTY_BRIEF: BriefState = {
  topic: "",
  product: "",
  audience: "",
  platform: Platform.LINKEDIN,
  contentType: ContentType.EDUCATIONAL,
  tone: Tone.PROFESSIONAL,
  length: ContentLength.MEDIUM,
  language: "English",
  ctaRequest: "",
  keywords: [],
  hashtags: [],
  notes: "",
};

const EXAMPLES = [
  "why weekly reporting rituals beat quarterly dashboards",
  "three mistakes teams make when automating a workflow",
  "what we learned from 200 customer onboarding calls",
];

export function BriefForm({
  value,
  onChange,
  onSubmit,
  loading,
  connectedPlatforms,
}: {
  value: BriefState;
  onChange: (next: BriefState) => void;
  onSubmit: () => void;
  loading: boolean;
  connectedPlatforms: Platform[];
}) {
  const set = <K extends keyof BriefState>(key: K, next: BriefState[K]) => onChange({ ...value, [key]: next });

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {/* Platform first: everything downstream depends on it. */}
      <div className="space-y-2">
        <Label>Platform</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLATFORM_LIST.map((spec) => {
            const active = value.platform === spec.id;
            const connected = connectedPlatforms.includes(spec.id);
            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => set("platform", spec.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-[11px] font-medium transition-all duration-150",
                  active
                    ? "border-sky-500 bg-sky-50/90 text-sky-800 shadow-xs dark:bg-sky-950/60 dark:border-sky-500 dark:text-sky-300 ring-2 ring-sky-500/25 font-semibold"
                    : "bg-card border-sky-100/90 hover:bg-sky-50/50 hover:border-sky-200 text-slate-700 dark:text-slate-300 dark:border-sky-950/60",
                )}
                aria-pressed={active}
              >
                <PlatformIcon platform={spec.id} className="size-4" />
                {spec.name}
                {!connected && <span className="text-muted-foreground/70 text-[9px]">not connected</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="topic">
          Topic <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="topic"
          required
          minLength={3}
          rows={2}
          value={value.topic}
          onChange={(e) => set("topic", e.target.value)}
          placeholder="What should this post be about?"
          className="border-sky-100 dark:border-sky-950 focus-visible:border-sky-400"
        />
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => set("topic", example)}
              className="bg-sky-50/70 hover:bg-sky-100 hover:text-sky-800 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/50 rounded-md border border-sky-200/60 px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="product">Product or service</Label>
          <Input
            id="product"
            value={value.product}
            onChange={(e) => set("product", e.target.value)}
            placeholder="Northwind Pulse"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audience">Target audience</Label>
          <Input
            id="audience"
            value={value.audience}
            onChange={(e) => set("audience", e.target.value)}
            placeholder="operations leaders"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Content type</Label>
        <Select value={value.contentType} onValueChange={(v) => set("contentType", v as ContentType)}>
          <SelectTrigger>
            <SelectValue>{CONTENT_TYPE_LABEL[value.contentType]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.values(ContentType).map((type) => (
              <SelectItem key={type} value={type}>
                {CONTENT_TYPE_LABEL[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-[11px]">{CONTENT_TYPE_HINT[value.contentType]}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Tone</Label>
          <Select value={value.tone} onValueChange={(v) => set("tone", v as Tone)}>
            <SelectTrigger>
              <SelectValue>{TONE_LABEL[value.tone]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.values(Tone).map((tone) => (
                <SelectItem key={tone} value={tone}>
                  {TONE_LABEL[tone]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Length</Label>
          <Select value={value.length} onValueChange={(v) => set("length", v as ContentLength)}>
            <SelectTrigger>
              <SelectValue>{LENGTH_LABEL[value.length]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.values(ContentLength).map((len) => (
                <SelectItem key={len} value={len}>
                  {LENGTH_LABEL[len]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Language</Label>
          <Select value={value.language} onValueChange={(v) => set("language", v)}>
            <SelectTrigger>
              <SelectValue>{value.language}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((language) => (
                <SelectItem key={language} value={language}>
                  {language}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cta">Call to action</Label>
        <Input
          id="cta"
          value={value.ctaRequest}
          onChange={(e) => set("ctaRequest", e.target.value)}
          placeholder="Leave blank and the agent will write one"
        />
      </div>

      <TagField
        label="Keywords"
        hint="Worked into the copy naturally, and checked afterwards"
        placeholder="Add a keyword"
        values={value.keywords}
        onChange={(next) => set("keywords", next)}
      />

      <TagField
        label="Hashtags"
        hint="Yours are used first, then the agent fills to the platform's sweet spot"
        placeholder="Add a hashtag"
        values={value.hashtags}
        onChange={(next) => set("hashtags", next)}
        prefix="#"
      />

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes for the agent</Label>
        <Textarea
          id="notes"
          rows={2}
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Anything else it should know — a constraint, a angle to avoid, a fact to include."
        />
      </div>

      <Button
        type="submit"
        className="w-full h-10 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-500 hover:to-sky-600 text-white shadow-md shadow-sky-600/25 font-semibold text-sm cursor-pointer"
        loading={loading}
        disabled={value.topic.trim().length < 3}
      >
        <Sparkles className="size-4" />
        {loading ? "Agent is drafting & scoring…" : "Generate with AI Agent"}
      </Button>
    </form>
  );
}

function TagField({
  label,
  hint,
  placeholder,
  values,
  onChange,
  prefix = "",
}: {
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
  prefix?: string;
}) {
  const [draft, setDraft] = React.useState("");

  function add() {
    const clean = draft.trim().replace(/^#/, "");
    if (!clean || values.some((v) => v.toLowerCase() === clean.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, clean]);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" size="icon" onClick={add} aria-label={`Add ${label.toLowerCase()}`}>
          <Plus className="size-4" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {values.map((tag) => (
            <span
              key={tag}
              className="bg-muted inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
            >
              {prefix}
              {tag}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== tag))}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${tag}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-[11px]">{hint}</p>
    </div>
  );
}
