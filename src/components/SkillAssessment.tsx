'use client';

import { useMemo, useState } from 'react';
import {
  SKILL_TIERS,
  MAX_CLINICAL,
  MAX_QUALITY,
  clinicalCategory,
  clinicalCategoryTone,
  qualityCategory,
  qualityCategoryTone,
} from '@/lib/constants';
import { Pill } from '@/components/ui';

/**
 * SkillAssessment — live-updating tiered checklist + dual scoreboard.
 *
 * Renders the 5 tiers (Basic / Intermediate / Advanced / Critical Care /
 * Quality of Care) as checkbox grids, recomputes both scores in client
 * state on every toggle, and shows the matching category badge above.
 *
 * The checkboxes' `name` attributes are still the underlying skill keys,
 * so a parent <form action={serverAction}> picks them up unchanged on
 * submit. This component does NOT submit anything itself — it's a thin
 * presentational wrapper around <input type="checkbox" name="...">.
 */
export function SkillAssessment({
  initial = {},
}: {
  initial?: Record<string, boolean | null | undefined>;
}) {
  // Single source of truth: a map of skillKey -> checked. Initialized from
  // server-provided values so edit mode shows the correct state.
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const tier of SKILL_TIERS) {
      for (const item of tier.items) out[item.key] = !!initial[item.key];
    }
    return out;
  });

  const { clinical, quality, perTier } = useMemo(() => {
    let clinical = 0;
    let quality = 0;
    const perTier: Record<string, { count: number; points: number }> = {};
    for (const tier of SKILL_TIERS) {
      let count = 0;
      for (const item of tier.items) if (checked[item.key]) count++;
      const points = count * tier.pointsPer;
      perTier[tier.id] = { count, points };
      if (tier.scoreCategory === 'clinical') clinical += points;
      else quality += points;
    }
    return { clinical, quality, perTier };
  }, [checked]);

  function toggle(key: string) {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-4">
      {/* Scoreboards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ScoreCard
          title="Clinical Competency"
          score={clinical}
          max={MAX_CLINICAL}
          category={clinicalCategory(clinical)}
          tone={clinicalCategoryTone(clinical)}
          bands={[
            '0–10 Basic Foster',
            '11–24 Medical Foster',
            '25–40 Advanced Rehab Foster',
            '41+ Critical Care Foster',
          ]}
        />
        <ScoreCard
          title="Quality of Care"
          score={quality}
          max={MAX_QUALITY}
          category={qualityCategory(quality)}
          tone={qualityCategoryTone(quality)}
          bands={['0–2 Minimal', '4–6 Good', '8 Excellent']}
        />
      </div>

      {/* Tiers */}
      {SKILL_TIERS.map(tier => {
        const tier_total = tier.items.length * tier.pointsPer;
        const tier_score = perTier[tier.id].points;
        return (
          <div
            key={tier.id}
            className="rounded-2xl bg-white shadow-sm border border-gray-200 p-4 md:p-5"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <h3 className="font-semibold">{tier.title}</h3>
                <p className="text-xs text-gray-500">
                  {tier.pointsPer} {tier.pointsPer === 1 ? 'point' : 'points'} each
                  {' · '}
                  <span
                    className={
                      tier.scoreCategory === 'clinical'
                        ? 'text-sky-700'
                        : 'text-violet-700'
                    }
                  >
                    {tier.scoreCategory === 'clinical' ? 'Clinical' : 'Quality of Care'}
                  </span>
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-gray-700">
                {tier_score}
                <span className="text-gray-400 font-normal"> / {tier_total}</span>
              </span>
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {tier.items.map(item => {
                const isChecked = !!checked[item.key];
                return (
                  <label
                    key={item.key}
                    className={`flex items-start gap-2 text-sm rounded-lg p-2 cursor-pointer transition ${
                      isChecked ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name={item.key}
                      checked={isChecked}
                      onChange={() => toggle(item.key)}
                      className="h-4 w-4 mt-0.5 rounded border-gray-300"
                    />
                    <span className="flex-1">{item.label}</span>
                    {isChecked && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        +{tier.pointsPer}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreCard({
  title,
  score,
  max,
  category,
  tone,
  bands,
}: {
  title: string;
  score: number;
  max: number;
  category: string;
  tone: string;
  bands: string[];
}) {
  const pct = max ? Math.min(100, (score / max) * 100) : 0;
  const ring =
    tone === 'purple'
      ? 'ring-violet-200 bg-violet-50 text-violet-900'
      : tone === 'green'
      ? 'ring-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'blue'
      ? 'ring-sky-200 bg-sky-50 text-sky-900'
      : tone === 'yellow'
      ? 'ring-yellow-200 bg-yellow-50 text-yellow-900'
      : 'ring-gray-200 bg-gray-50 text-gray-700';
  const bar =
    tone === 'purple'
      ? 'bg-violet-500'
      : tone === 'green'
      ? 'bg-emerald-500'
      : tone === 'blue'
      ? 'bg-sky-500'
      : tone === 'yellow'
      ? 'bg-yellow-500'
      : 'bg-gray-400';
  return (
    <div className={`rounded-2xl border ring-1 ${ring} p-4`}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</h4>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {score}
            <span className="text-base font-normal opacity-50"> / {max}</span>
          </div>
        </div>
        <Pill tone={tone}>{category}</Pill>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/60 overflow-hidden">
        <div className={`h-full ${bar} transition-all duration-200`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wide opacity-70">
        {bands.map(b => (
          <span key={b} className="rounded-full bg-white/60 px-2 py-0.5">{b}</span>
        ))}
      </div>
    </div>
  );
}
