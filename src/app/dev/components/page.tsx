import type { Metadata } from "next";
import { BookOpen, Home, MessageCircle, TrendingUp } from "lucide-react";
import {
  AdaptiveToggleBar,
  AskNevoButton,
  BreathingCharacter,
  Button,
  Card,
  EmptyState,
  Grid,
  Icon,
  IllustrationWrapper,
  Input,
  NotificationBadge,
  Pill,
  ProgressBar,
  ProgressDots,
  SettlingCharacter,
  Skeleton,
  StretchingCharacter,
  Switch,
} from "@/components/shared";
import { ChartsDemo } from "./_charts-demo";
import { NavDemo } from "./_nav-demo";

export const metadata: Metadata = {
  title: "Component Library - Nevo (dev)",
  robots: { index: false, follow: false },
};

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-semibold">{title}</h2>
        {note && <p className="text-sm text-nevo-near-black/60">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Dev-only Design System v2 showcase (not linked, noindex). Living reference for
 * the shared component library — mirrors the design's Component Library page.
 */
export default function ComponentsPage() {
  return (
    <main className="min-h-dvh bg-nevo-cream px-6 py-12 text-nevo-near-black">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <header className="flex flex-col gap-2 border-b-[1.5px] border-nevo-near-black/12 pb-6">
          <span className="font-brand text-[40px] leading-none font-bold tracking-[-0.03em] text-nevo-navy">
            Nevo
          </span>
          <span className="text-sm text-nevo-near-black/60">
            Component Library · Design System v2
          </span>
        </header>

        <Section
          title="Buttons"
          note="Primary, secondary, ghost · 52px, 10px radius · hover and press them."
        >
          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <Button>Start lesson</Button>
              <Button disabled>Start lesson</Button>
              <Button loading>Start lesson</Button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="secondary">Save draft</Button>
              <Button variant="secondary" disabled>
                Save draft
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="ghost">Skip for now</Button>
              <Button variant="ghost" disabled>
                Skip for now
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button size="lg">Large</Button>
              <Button size="md">Medium</Button>
              <Button size="sm">Small</Button>
            </div>
          </Card>
        </Section>

        <Section
          title="Input fields"
          note="52px, cream fill, Level 1 elevation. Violet signals a validation error."
        >
          <Card className="flex flex-wrap gap-6">
            <Input placeholder="Type a name" className="w-64" />
            <Input error placeholder="Required" className="w-64" />
            <Input disabled defaultValue="Locked" className="w-64" />
          </Card>
        </Section>

        <Section
          title="Cards"
          note="Cream Elevated on cream. Elevation is the only difference between levels."
        >
          <div className="flex flex-wrap gap-6">
            <Card className="flex w-80 flex-col gap-2">
              <h3 className="text-lg font-medium">Today&apos;s focus</h3>
              <p className="text-[15px] leading-[1.7]">
                A gentle two-part reading session, paced to how you&apos;re feeling
                today.
              </p>
            </Card>
            <Card elevation={2} className="flex w-80 flex-col gap-2">
              <h3 className="text-lg font-medium">Continue where you left off</h3>
              <p className="text-[15px] leading-[1.7]">
                You paused midway through Fractions. Pick it back up whenever
                you&apos;re ready.
              </p>
            </Card>
          </div>
        </Section>

        <Section
          title="Progress indicators"
          note="Linear line (violet on cream) and the onboarding four-dot indicator."
        >
          <Card className="flex flex-col gap-8">
            <ProgressBar value={0.4} aria-label="40 percent" />
            <ProgressDots total={4} current={2} aria-label="Step 2 of 4" />
          </Card>
        </Section>

        <Section
          title="Pills & switches"
          note="Tap-to-select pills (navy when selected) and immediate-save toggles."
        >
          <Card className="flex flex-wrap items-center gap-8">
            <div className="flex flex-wrap gap-3">
              <Pill selected>All</Pill>
              <Pill>In progress</Pill>
              <Pill>Not started</Pill>
              <Pill>Completed</Pill>
            </div>
            <div className="flex items-center gap-6">
              <Switch checked />
              <Switch />
            </div>
          </Card>
        </Section>

        <Section
          title="Icons"
          note="Line style, 1.75px stroke · sizes 24 / 20 / 32 · navy = active."
        >
          <Card className="flex items-center gap-6">
            <Icon icon={Home} size="dense" />
            <Icon icon={BookOpen} />
            <Icon icon={MessageCircle} size="tablet" />
            <Icon icon={TrendingUp} className="text-nevo-navy" />
          </Card>
        </Section>

        <Section
          title="Adaptive toggle bar"
          note="Lesson pacing. Navy = the student set it; violet = Nevo's density, in force."
        >
          <Card>
            <AdaptiveToggleBar
              segments={[
                { id: "simplify", label: "Simplify", state: "manual" },
                { id: "expand", label: "Expand", state: "system" },
                { id: "slower", label: "Slower", state: "default" },
              ]}
            />
          </Card>
        </Section>

        <Section
          title="Ask Nevo & notifications"
          note="Floating Ask Nevo trigger (56px) and the notification bell with a quiet unread dot."
        >
          <Card className="flex items-center gap-8">
            <AskNevoButton />
            <AskNevoButton state="responding" />
            <NotificationBadge unread />
            <NotificationBadge />
          </Card>
        </Section>

        <Section
          title="Empty & loading states"
          note="Warm empty states; cream-shimmer skeletons instead of spinners."
        >
          <div className="flex flex-wrap gap-6">
            <EmptyState
              className="w-72"
              illustration={
                <IllustrationWrapper
                  src="/illustrations/empty-lessons.png"
                  alt=""
                  width={1024}
                  height={1536}
                  className="w-24"
                />
              }
              title="Your lessons will show up here soon"
            />
            <Card className="flex w-56 flex-col gap-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </Card>
          </div>
        </Section>

        <Section
          title="Illustrations (Section 12)"
          note="Settling (static), Breathing (slow pulse), Stretching (gentle sway) - motion respects reduced-motion."
        >
          <Card className="flex flex-wrap items-end gap-10">
            <div className="flex flex-col items-center gap-2">
              <SettlingCharacter className="w-24" />
              <span className="text-xs text-nevo-near-black/55">Settling</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <BreathingCharacter className="w-24" />
              <span className="text-xs text-nevo-near-black/55">Breathing</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <StretchingCharacter className="w-20" />
              <span className="text-xs text-nevo-near-black/55">Stretching</span>
            </div>
          </Card>
        </Section>

        <Section
          title="12-column grid"
          note="24px gutters, tablet & desktop. Children set width with col-span-*."
        >
          <Grid>
            {[
              "col-span-12",
              "col-span-6",
              "col-span-6",
              "col-span-4",
              "col-span-4",
              "col-span-4",
            ].map((span, i) => (
              <div
                key={i}
                className={`${span} rounded-lg bg-nevo-cream-elevated p-4 text-center text-sm shadow-elevation-1`}
              >
                {span.replace("col-span-", "")}
              </div>
            ))}
          </Grid>
        </Section>

        <Section
          title="Navigation"
          note="Sidebar (chevron to collapse), bottom nav (mobile), top nav (landing/auth)."
        >
          <NavDemo />
        </Section>

        <Section
          title="Charts"
          note="The admin analytics forms. Navy/violet passes CVD separation at ΔE 32; the violet's sub-3:1 contrast is discharged with direct labels and a table view."
        >
          <ChartsDemo />
        </Section>
      </div>
    </main>
  );
}
