import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function TransportCalendarRedirect({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams({ tab: 'transport' });
  if (params.month) qs.set('month', params.month);
  if (params.day) qs.set('day', params.day);
  redirect(`/calendar?${qs.toString()}`);
}
