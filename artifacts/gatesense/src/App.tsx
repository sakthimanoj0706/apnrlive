import React, { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { Activity, AlertOctagon, AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, BarChart3, Bell, Camera, CheckCircle2, ChevronDown, CircleDot, Clock3, Cpu, Database, FileBarChart, FileSearch, Gauge, LogOut, Menu, Pencil, Plus, Radio, RefreshCw, Search, Settings, ShieldCheck, Siren, SlidersHorizontal, Truck, UserRound, Users, XCircle } from 'lucide-react';
import {
  getGetActiveTripsQueryKey, getGetAlertsQueryKey, getGetCamerasQueryKey, getGetDashboardSummaryQueryKey, getGetEventsQueryKey, getGetReviewQueueQueryKey, getGetTripsQueryKey, getGetVehiclesQueryKey, getGetDriversQueryKey, getGetMeQueryKey,
  useCreateCamera, useCreateDetection, useCreateDriver, useCreateTrip, useCreateVehicle, useCorrectPlate, useDeleteVehicle, useGetActiveTrips, useGetAlerts, useGetCameras, useGetDashboardActivity, useGetDashboardSummary, useGetDrivers, useGetEvents, useGetMe, useGetReportsOverview, useGetReviewQueue, useGetTrips, useGetVehicles, useHealthCheck, useLogin, useMarkAlertRead, useSimulateTraffic, useUpdateTripStatus, useUpdateVehicle,
  type ActivityItem, type Alert, type Camera as CameraRecord, type Driver, type GateEvent, type Trip, type Vehicle,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Busy, Button, Card, DataTable, DetailLink, EmptyState, ErrorState, Field, IconButton, LoadingRows, Logo, Metric, Modal, Notice, PageHeader, SearchBox, SelectField, StatusPill, TinyBar } from '@/components/gatesense-ui';
import NotFound from '@/pages/not-found';
import '@/index.css';

const queryClient = new QueryClient();
const nav = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/live', label: 'Live feed', icon: Radio },
  { href: '/detect', label: 'Detection fusion', icon: Cpu },
  { href: '/trips', label: 'Active trips', icon: Truck },
  { href: '/schedule', label: 'Schedule', icon: Clock3 },
  { href: '/events', label: 'Event register', icon: Database },
  { href: '/vehicles', label: 'Vehicles', icon: Truck },
  { href: '/drivers', label: 'Drivers', icon: Users },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/review', label: 'Manual review', icon: FileSearch },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/cameras', label: 'Cameras', icon: Camera },
];

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{location === '/login' ? <LoginPage /> : <Shell><Switch>
    <Route path="/" component={DashboardPage} />
    <Route path="/live" component={LivePage} />
    <Route path="/detect" component={DetectPage} />
    <Route path="/trips" component={TripsPage} />
    <Route path="/schedule" component={SchedulePage} />
    <Route path="/events" component={EventsPage} />
    <Route path="/vehicles" component={VehiclesPage} />
    <Route path="/drivers" component={DriversPage} />
    <Route path="/alerts" component={AlertsPage} />
    <Route path="/review" component={ReviewPage} />
    <Route path="/reports" component={ReportsPage} />
    <Route path="/cameras" component={CamerasPage} />
    <Route path="/settings" component={SettingsPage} />
    <Route component={NotFound} />
  </Switch></Shell>}</ErrorBoundary>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authed, setAuthed] = useState(() => Boolean(localStorage.getItem('gatesense_session')));
  const me = useGetMe({ query: { enabled: authed, queryKey: getGetMeQueryKey() } });
  const health = useHealthCheck({ query: { refetchInterval: 30000, queryKey: ['/api/healthz'] } });
  useEffect(() => { if (!authed) setLocation('/login'); }, [authed, setLocation]);
  if (!authed) return null;
  const operator = me.data;
  const initials = operator?.name?.split(' ').map(s => s[0]).join('').slice(0, 2) ?? 'OP';
  return <div className="min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[246px] flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[76px] items-center border-b border-sidebar-border px-5"><Logo /></div>
      <div className="px-4 pt-5"><p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[.2em] text-muted-foreground">Control room</p><nav className="space-y-0.5">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase().replace(/ /g, '-')}`} className={`group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${location === href ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}`}><Icon className={`h-4 w-4 ${location === href ? 'text-primary' : 'text-muted-foreground/75'}`} />{label}{label === 'Alerts' && <AlertBadge />}</Link>)}</nav></div>
      <div className="mt-auto border-t border-sidebar-border p-4"><Link href="/settings" data-testid="link-settings" className="mb-3 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><Settings className="h-4 w-4" />Settings</Link><div className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{initials}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{operator?.name ?? 'Gate operator'}</p><p className="truncate text-[10px] text-muted-foreground">{operator?.role ?? 'Security desk'}</p></div><button data-testid="button-sidebar-logout" onClick={() => { localStorage.removeItem('gatesense_session'); setAuthed(false); }} title="Sign out" className="text-muted-foreground hover:text-red-300"><LogOut className="h-3.5 w-3.5" /></button></div></div>
    </aside>
    {mobileOpen && <button aria-label="Close navigation" data-testid="button-close-mobile-nav" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-black/60 lg:hidden" />}
    <main className="min-h-[100dvh] lg:pl-[246px]"><header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-md md:px-8"><div className="flex items-center gap-3"><button data-testid="button-open-mobile-nav" aria-label="Open navigation" onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary lg:hidden"><Menu className="h-5 w-5" /></button><div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />Plant 04 / North gate cluster</div></div><div className="flex items-center gap-4"><div className="hidden items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground sm:flex"><span className={`h-1.5 w-1.5 rounded-full ${health.data?.status === 'ok' ? 'bg-emerald-400' : 'bg-amber-300'} animate-pulse-dot`} />{health.data?.status === 'ok' ? 'API connected' : 'Checking link'}</div><Link href="/alerts" data-testid="link-header-alerts" className="relative rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><Bell className="h-[18px] w-[18px]" /><AlertBadge /></Link><div className="hidden h-6 w-px bg-border sm:block" /><span className="data-text hidden text-[11px] text-muted-foreground sm:block">{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })} IST</span></div></header><div className="mx-auto max-w-[1500px] p-4 md:p-8">{children}</div></main>
  </div>;
}

function AlertBadge() {
  const alerts = useGetAlerts({ query: { staleTime: 30000, queryKey: getGetAlertsQueryKey() } });
  const unread = (alerts.data ?? []).filter(a => !a.isRead).length;
  return unread > 0 ? <span data-testid="badge-unread-alerts" className="absolute right-1 top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-red-400 px-1 text-[8px] font-bold text-red-950">{unread}</span> : null;
}

function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('operator@gatesense.in');
  const [role, setRole] = useState('Gate supervisor');
  const [notice, setNotice] = useState('');
  const login = useLogin();
  const submit = (e: React.FormEvent) => { e.preventDefault(); setNotice(''); login.mutate({ data: { email, role } }, { onSuccess: (session) => { localStorage.setItem('gatesense_session', session.token); setLocation('/'); }, onError: () => setNotice('Unable to establish operator session. Check the API link and try again.') }); };
  return <div className="panel-grid flex min-h-[100dvh] items-center justify-center bg-background p-5"><div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:grid-cols-[1fr_410px]"><div className="relative hidden min-h-[570px] overflow-hidden border-r border-border bg-[radial-gradient(circle_at_28%_20%,hsl(var(--primary)/.16),transparent_32%),linear-gradient(150deg,hsl(var(--sidebar)),hsl(var(--background)))] p-10 md:block"><div className="absolute right-10 top-10 h-32 w-32 rounded-full border border-primary/20" /><div className="absolute right-[72px] top-[42px] h-16 w-16 rounded-full border border-primary/30" /><Logo /><div className="absolute bottom-12 left-10 right-10"><p className="mb-4 text-[10px] font-bold uppercase tracking-[.25em] text-primary">North gate / 04</p><h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight">Every movement,<br /><span className="text-primary">accounted for.</span></h1><p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">A quiet, alert workspace for the people who keep plant traffic moving and safe.</p><div className="mt-10 flex items-center gap-6 text-[10px] uppercase tracking-[.15em] text-muted-foreground"><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Gates online</span><span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-primary" />Audit ready</span></div></div></div><div className="p-7 md:p-10"><div className="mb-9 md:hidden"><Logo /></div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-primary">Operator entry</p><h2 className="mt-3 text-2xl font-bold">Open the console</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Use a role-based demo identity to continue.</p>{notice && <Notice kind="bad">{notice}</Notice>}<form onSubmit={submit} className="mt-8 space-y-5"><Field label="Operator email" value={email} onChange={setEmail} type="email" required placeholder="name@plant.in" /><SelectField label="Access role" value={role} onChange={setRole} options={['Gate supervisor', 'Security operator', 'Plant administrator', 'Audit viewer']} /><Button type="submit" disabled={login.isPending} className="mt-3 w-full" testId="button-login">{login.isPending ? <Busy label="Opening console" /> : <>Enter operations console <ArrowUpRight className="h-4 w-4" /></>}</Button></form><p className="mt-8 text-center text-[10px] leading-5 text-muted-foreground">Demo mode uses your selected role.<br />No credentials are stored in this browser.</p></div></div></div>;
}

function DashboardPage() {
  const summary = useGetDashboardSummary({ query: { refetchInterval: 30000, queryKey: getGetDashboardSummaryQueryKey() } });
  const activity = useGetDashboardActivity();
  const events = useGetEvents(undefined, { query: { queryKey: getGetEventsQueryKey(), staleTime: 30000 } });
  const s = summary.data;
  return <><PageHeader eyebrow="Operations / overview" title="Good shift, operator." description="North gate cluster is quiet, legible, and ready for the next movement."><Link href="/live" data-testid="link-open-live" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-110"><Radio className="h-4 w-4" />Open live feed</Link></PageHeader>
    {summary.isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-card" />)}</div> : summary.isError ? <Card><ErrorState message="Dashboard summary is unavailable." retry={() => summary.refetch()} /></Card> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Vehicles inside" value={s?.vehiclesInside ?? 0} detail="Across all active trips" accent="accent" /><Metric label="Entries today" value={s?.entriesToday ?? 0} detail="Since 00:00 IST" /><Metric label="Exits today" value={s?.exitsToday ?? 0} detail="Movement reconciled" accent="good" /><Metric label="Active alerts" value={s?.activeAlerts ?? 0} detail="Needs operator attention" accent="danger" /></div>}
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_.75fr]"><Card title="Gate pulse" action={<Link href="/events" data-testid="link-view-event-register" className="text-xs font-semibold text-primary hover:underline">View register</Link>}><div className="grid gap-4 p-5 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Recognition accuracy</p><p className="data-text mt-2 text-3xl font-bold text-primary">{s?.recognitionAccuracy ?? '—'}<span className="text-sm">%</span></p><TinyBar value={Number(s?.recognitionAccuracy ?? 0)} max={100} /></div><div><p className="text-xs text-muted-foreground">Avg. dwell time</p><p className="data-text mt-2 text-3xl font-bold">{s?.avgDwellMinutes ?? '—'}<span className="text-sm text-muted-foreground"> min</span></p><p className="mt-2 text-[10px] text-muted-foreground">Rolling 24 hour window</p></div><div><p className="text-xs text-muted-foreground">Gate availability</p><p className="data-text mt-2 text-3xl font-bold text-accent">{s?.gatesOnline ?? 0}<span className="text-sm text-muted-foreground"> / {s?.totalGates ?? 0}</span></p><p className="mt-2 text-[10px] text-emerald-300">All critical lanes monitored</p></div></div><div className="border-t border-border/70 px-5 py-4"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />Latest movements</div>{events.isLoading ? <LoadingRows count={3} /> : events.isError ? <ErrorState retry={() => events.refetch()} /> : (events.data ?? []).length === 0 ? <EmptyState title="No movements recorded" detail="Gate events will appear here as cameras begin reading plates." /> : <div className="mt-3 divide-y divide-border/60">{(events.data ?? []).slice(0, 4).map((e) => <EventRow key={e.id} event={e} />)}</div>}</div></Card><Card title="Operator activity" action={<Activity className="h-4 w-4 text-muted-foreground" />}><div className="divide-y divide-border/60">{activity.isLoading ? <LoadingRows count={4} /> : activity.isError ? <ErrorState retry={() => activity.refetch()} /> : (activity.data ?? []).length ? (activity.data ?? []).slice(0, 6).map((item) => <ActivityRow key={item.id} item={item} />) : <EmptyState title="No activity yet" detail="Your shift actions will be tracked here." />}</div></Card></div>
    <div className="mt-6 grid gap-6 md:grid-cols-3"><Card className="md:col-span-2" title="Shift checklist"><div className="grid gap-3 p-5 sm:grid-cols-3"><Checklist icon={<ShieldCheck />} label="Lane health" detail={`${s?.gatesOnline ?? 0} of ${s?.totalGates ?? 0} online`} done={Boolean(s?.gatesOnline === s?.totalGates)} /><Checklist icon={<FileSearch />} label="Review queue" detail="Keep uncertain reads moving" href="/review" /><Checklist icon={<Bell />} label="Alert inbox" detail={`${s?.activeAlerts ?? 0} active items`} href="/alerts" /></div></Card><Card className="panel-grid" title="Console note"><div className="p-5"><p className="text-sm leading-6 text-muted-foreground">Treat every low-confidence read as a question, not a verdict. Fusion keeps the plate legible; you keep the gate safe.</p><Link href="/detect" data-testid="link-open-fusion" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary">Open fusion workspace <ArrowUpRight className="h-3.5 w-3.5" /></Link></div></Card></div>
  </>;
}

function EventRow({ event }: { event: GateEvent }) { return <div className="flex items-center gap-3 py-3"><span className={`grid h-8 w-8 place-items-center rounded-md ${event.eventType.toLowerCase().includes('entry') ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary'}`}>{event.eventType.toLowerCase().includes('entry') ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="plate-text text-sm font-bold">{event.plate}</span><StatusPill value={event.decision} /></div><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{event.gate} · {event.camera} · {event.vehicleType}</p></div><div className="text-right"><p className="data-text text-[11px] text-foreground">{formatTime(event.timestamp)}</p><p className="data-text text-[10px] text-muted-foreground">{Math.round(event.confidence)}% conf.</p></div></div>; }
function ActivityRow({ item }: { item: ActivityItem }) { return <div className="flex gap-3 px-5 py-3.5"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.tone === 'danger' ? 'bg-red-400' : item.tone === 'warning' ? 'bg-amber-300' : 'bg-accent'}`} /><div><p className="text-xs font-semibold">{item.title}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{item.detail}</p><p className="data-text mt-1 text-[9px] uppercase text-muted-foreground/70">{formatTime(item.time)}</p></div></div>; }
function Checklist({ icon, label, detail, href, done }: { icon: ReactNode; label: string; detail: string; href?: string; done?: boolean }) { const content = <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/30 p-3"><span className={`mt-0.5 ${done ? 'text-emerald-300' : 'text-primary'}`}>{done ? <CheckCircle2 className="h-4 w-4" /> : icon}</span><div><p className="text-xs font-semibold">{label}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p></div></div>; return href ? <Link href={href} data-testid={`link-check-${label.toLowerCase().replace(/ /g, '-')}`}>{content}</Link> : content; }

function LivePage() {
  const qc = useQueryClient(); const events = useGetEvents(undefined, { query: { refetchInterval: 12000, queryKey: getGetEventsQueryKey() } }); const simulate = useSimulateTraffic(); const [last, setLast] = useState<any>(null); const [notice, setNotice] = useState('');
  const run = () => { setNotice(''); simulate.mutate(undefined, { onSuccess: (result) => { setLast(result); setNotice(`${result.event.plate} processed at ${result.event.gate}.`); qc.invalidateQueries({ queryKey: getGetEventsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); qc.invalidateQueries({ queryKey: getGetActiveTripsQueryKey() }); }, onError: () => setNotice('Traffic simulation failed.') }); };
  return <><PageHeader eyebrow="Operations / live" title="Live gate feed" description="A rolling view of the movement decisions reaching your gates."><Button onClick={run} disabled={simulate.isPending} testId="button-simulate-traffic">{simulate.isPending ? <Busy label="Simulating" /> : <><CircleDot className="h-4 w-4" />Simulate traffic</>}</Button></PageHeader>{notice && <Notice kind={notice.includes('failed') ? 'bad' : 'good'}>{notice}</Notice>}<div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><Card className="overflow-hidden" title="North gate · lane activity" action={<span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse-dot" />Live</span>}>{events.isLoading ? <LoadingRows count={7} /> : events.isError ? <ErrorState message="Live feed is not responding." retry={() => events.refetch()} /> : <div className="divide-y divide-border/60">{(events.data ?? []).slice(0, 9).map(e => <EventRow key={e.id} event={e} />)}</div>}</Card><Card title="Last fusion decision"><div className="p-5">{last ? <div className="animate-slide-in"><div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[.16em] text-muted-foreground">Resolved plate</p><p className="plate-text mt-2 text-3xl font-bold text-primary">{last.event.plate}</p></div><StatusPill value={last.event.decision} /></div><div className="grid grid-cols-2 gap-3"><Info label="Event" value={last.event.eventType} /><Info label="Gate" value={last.event.gate} /><Info label="Confidence" value={`${Math.round(last.event.confidence)}%`} /><Info label="Trip status" value={last.trip.status} /></div>{last.alert && <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Alert raised</div><p className="mt-1 text-amber-100/70">{last.alert.message}</p></div>}</div> : <EmptyState title="No simulated event" detail="Run a traffic simulation to preview the complete event, trip, and alert response." action={<Button onClick={run} variant="secondary" testId="button-simulate-empty">Simulate one</Button>} />}</div></Card></div></>;
}

function DetectPage() {
  const qc = useQueryClient();
  const create = useCreateDetection();
  const [frames, setFrames] = useState(['MH12AB1234', 'MH12AB1234', 'MH12A81234']);
  const [gate, setGate] = useState('North Gate');
  const [result, setResult] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState('');
  const [processingVideo, setProcessingVideo] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const recordedVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
      setNotice('');
    } catch (err) {
      setNotice('Unable to access laptop webcam. Please grant camera permissions.');
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFileName(file.name);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setNotice(`Loaded video file: ${file.name}. Ready for ANPR extraction.`);
  };

  // ── OCR helper ────────────────────────────────────────────────────────────
  //  1. Crop to candidate plate region (passed as sx,sy,sw,sh in source coords)
  //  2. Scale up 3× so characters are bigger
  //  3. Binary-threshold: every pixel above mid-grey → white, else → black
  //  4. Run Tesseract with alphanumeric-only whitelist
  const ocrRegion = async (
    source: HTMLCanvasElement | HTMLVideoElement,
    sx: number, sy: number, sw: number, sh: number
  ): Promise<string> => {
    const SCALE = 3;
    const out = document.createElement('canvas');
    out.width  = sw * SCALE;
    out.height = sh * SCALE;
    const ctx = out.getContext('2d')!;

    // Draw scaled crop
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);

    // Binary threshold (grayscale → black or white)
    const img = ctx.getImageData(0, 0, out.width, out.height);
    const d   = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const bin  = gray > 128 ? 255 : 0;   // hard binary threshold
      d[i] = d[i + 1] = d[i + 2] = bin;
    }
    ctx.putImageData(img, 0, 0);

    const worker = await createWorker('eng');
    try {
      // Restrict Tesseract to plate chars only — kills background word noise
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        tessedit_pageseg_mode: '7' as any, // treat as single text line
      });
      const { data: { text } } = await worker.recognize(out);
      return text.trim();
    } finally {
      await worker.terminate();
    }
  };

  // Try multiple horizontal/vertical crop bands and return the best plate hit
  const ocrFrame = async (source: HTMLCanvasElement | HTMLVideoElement, w: number, h: number): Promise<string[]> => {
    // Indian plates appear roughly in the lower 45% of a front-facing shot
    // We try three bands: full bottom strip, tighter bottom-centre, and full frame
    const bands = [
      { sx: 0,          sy: Math.floor(h * 0.55), sw: w,                sh: Math.floor(h * 0.45) }, // bottom 45%
      { sx: Math.floor(w * 0.1), sy: Math.floor(h * 0.6),  sw: Math.floor(w * 0.8), sh: Math.floor(h * 0.35) }, // centre-bottom
      { sx: 0,          sy: Math.floor(h * 0.70), sw: w,                sh: Math.floor(h * 0.30) }, // bottom 30%
      { sx: 0,          sy: 0,                    sw: w,                sh: h                    }, // full frame fallback
    ];

    // Indian plate pattern — also match common OCR confusions:
    //   K↔A, O↔0, Q↔0, I↔1, B↔8
    const PLATE_RE = /[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}/;

    const hits: string[] = [];
    for (const { sx, sy, sw, sh } of bands) {
      if (sw <= 0 || sh <= 0) continue;
      const raw = await ocrRegion(source, sx, sy, sw, sh);
      const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (PLATE_RE.test(cleaned)) {
        hits.push(cleaned);
        break; // found a good match — no need to try more bands
      }
      if (cleaned.length >= 6) hits.push(cleaned); // keep partial for fusion
    }
    return hits.length > 0 ? hits : ['UNREADABLE'];
  };

  // ── Extract plates from uploaded video ────────────────────────────────────
  const extractPlatesFromVideo = async () => {
    if (!videoUrl || !recordedVideoRef.current) return;
    setProcessingVideo(true);
    setNotice('Sampling video frames & running real OCR via Tesseract.js...');

    try {
      const video = recordedVideoRef.current;
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) { resolve(); return; }
        video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      });

      const duration = video.duration || 10;
      const w = video.videoWidth  || 640;
      const h = video.videoHeight || 480;
      const numFrames = Math.min(5, Math.max(1, Math.floor(duration)));
      const timestamps = Array.from({ length: numFrames }, (_, i) =>
        (i / Math.max(numFrames - 1, 1)) * (duration - 0.5)
      );

      const allResults: string[] = [];

      for (const ts of timestamps) {
        await new Promise<void>((resolve) => {
          video.currentTime = ts;
          video.addEventListener('seeked', () => resolve(), { once: true });
        });
        const frameHits = await ocrFrame(video, w, h);
        allResults.push(...frameHits);
        setNotice(`Frame ${ts.toFixed(1)}s → ${frameHits.join(', ')}`);
      }

      // De-duplicate and prefer results that look like a plate
      const PLATE_RE = /[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}/;
      const sorted = [...new Set(allResults)].sort((a, b) =>
        (PLATE_RE.test(b) ? 1 : 0) - (PLATE_RE.test(a) ? 1 : 0)
      );
      const finalFrames = sorted.slice(0, 5);
      setFrames(finalFrames);

      create.mutate({ data: { frames: finalFrames, gate } }, {
        onSuccess: (res) => {
          setResult(res);
          setProcessingVideo(false);
          setNotice(`OCR complete — plate ${res.finalPlate} extracted from ${videoFileName}`);
          qc.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetEventsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          qc.invalidateQueries({ queryKey: getGetActiveTripsQueryKey() });
          document.getElementById('fusion-result-card')?.scrollIntoView({ behavior: 'smooth' });
        },
        onError: () => {
          setProcessingVideo(false);
          setNotice('Fusion failed after real OCR extraction.');
        }
      });
    } catch (err) {
      setProcessingVideo(false);
      setNotice(`OCR error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ── Webcam capture ────────────────────────────────────────────────────────
  const captureFrame = async () => {
    if (!videoRef.current) return;
    setCapturing(true);
    setNotice('Running real OCR on webcam frame...');

    try {
      const video = videoRef.current;
      const w = video.videoWidth  || 640;
      const h = video.videoHeight || 480;
      const frameHits = await ocrFrame(video, w, h);
      const newFrames = frameHits.length > 0 ? frameHits : ['UNREADABLE'];
      setFrames(newFrames);

      create.mutate({ data: { frames: newFrames, gate } }, {
        onSuccess: (res) => {
          setResult(res);
          setCapturing(false);
          setNotice(`Webcam OCR complete — plate ${res.finalPlate} at ${gate}.`);
        },
        onError: () => {
          setCapturing(false);
          setNotice('Fusion failed after webcam OCR.');
        }
      });
    } catch (err) {
      setCapturing(false);
      setNotice(`Webcam OCR error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  useEffect(() => {
    return () => {
      stopWebcam();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const run = () => {
    setNotice('');
    create.mutate({ data: { frames, gate } }, { onSuccess: setResult, onError: () => setNotice('Fusion could not resolve these frames.') });
  };

  return <><PageHeader eyebrow="Vision / camera & video detection" title="Detection workspace" description="Use your laptop webcam, upload a recorded vehicle video file, or enter raw frames to extract number plates and make gate decisions.">
    <input type="file" ref={fileInputRef} accept="video/*" className="hidden" onChange={handleVideoUpload} />
    <Button variant="secondary" onClick={() => fileInputRef.current?.click()} testId="button-upload-video"><FileSearch className="h-4 w-4" />Upload recorded video</Button>
    {!cameraActive ? (
      <Button onClick={startWebcam} testId="button-start-webcam"><Camera className="h-4 w-4" />Open laptop camera</Button>
    ) : (
      <Button variant="secondary" onClick={stopWebcam} testId="button-stop-webcam"><XCircle className="h-4 w-4" />Close camera</Button>
    )}
  </PageHeader>
  {videoUrl && <div className="mb-6 rounded-xl border border-primary/40 bg-card p-5 shadow-2xl">
    <div className="mb-3 flex items-center justify-between">
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />Recorded vehicle video · {videoFileName}
      </span>
      <Button variant="ghost" className="h-7 text-xs" onClick={() => { setVideoUrl(null); setVideoFileName(''); }}>Remove video</Button>
    </div>
    <div className="relative overflow-hidden rounded-lg border border-border bg-black aspect-video max-h-[360px] flex items-center justify-center">
      <video ref={recordedVideoRef} src={videoUrl} controls autoPlay muted loop className="h-full w-full object-contain" />
      <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-primary/60 m-8 rounded-lg flex items-center justify-center">
        <span className="bg-black/60 px-3 py-1 text-xs text-primary rounded-md font-mono border border-primary/40">VIDEO ANPR EXTRACT ZONE</span>
      </div>
    </div>
    <div className="mt-4 flex items-center justify-between">
      <p className="text-xs text-muted-foreground">Extract number plate frames automatically from recorded vehicle entry/exit footage.</p>
      <Button onClick={extractPlatesFromVideo} disabled={processingVideo} testId="button-extract-video-plate">
        {processingVideo ? <Busy label="Sampling video & extracting plate" /> : <><Cpu className="h-4 w-4" />Extract Plate from Video</>}
      </Button>
    </div>
  </div>}
  {cameraActive && <div className="mb-6 rounded-xl border border-primary/40 bg-card p-5 shadow-2xl">
    <div className="mb-3 flex items-center justify-between">
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />Live webcam stream
      </span>
      <span className="text-[10px] text-muted-foreground">Align vehicle number plate inside frame</span>
    </div>
    <div className="relative overflow-hidden rounded-lg border border-border bg-black aspect-video max-h-[360px] flex items-center justify-center">
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-primary/60 m-8 rounded-lg flex items-center justify-center">
        <span className="bg-black/60 px-3 py-1 text-xs text-primary rounded-md font-mono border border-primary/40">NUMBER PLATE SCAN ZONE</span>
      </div>
    </div>
    <div className="mt-4 flex items-center justify-between">
      <p className="text-xs text-muted-foreground">Point your webcam at a vehicle plate or held text to simulate ANPR detection.</p>
      <Button onClick={captureFrame} disabled={capturing} testId="button-capture-plate">
        {capturing ? <Busy label="Scanning plate" /> : <><Camera className="h-4 w-4" />Capture & Detect Plate</>}
      </Button>
    </div>
  </div>}
  <div className="grid gap-6 xl:grid-cols-[.95fr_1.05fr]">
    <Card title="Input frames" action={<span className="data-text text-[10px] text-muted-foreground">{frames.length} / 5 frames</span>}>
      <div className="p-5">
        <div className="mb-5 rounded-lg border border-dashed border-border bg-background/35 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold">Frame metadata</p>
            <span className="text-[10px] text-muted-foreground">Live OCR strings</span>
          </div>
          <div className="space-y-2">
            {frames.map((frame, i) => <div key={i} className="flex items-center gap-2">
              <span className="data-text w-5 text-[10px] text-muted-foreground">0{i + 1}</span>
              <input data-testid={`input-frame-${i}`} value={frame} onChange={e => setFrames(frames.map((x, j) => j === i ? e.target.value.toUpperCase() : x))} className="plate-text h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary/60" />
              <IconButton label="Remove frame" testId={`button-remove-frame-${i}`} onClick={() => setFrames(frames.filter((_, j) => j !== i))}><XCircle className="h-4 w-4" /></IconButton>
            </div>)}
          </div>
          <Button variant="ghost" className="mt-3" disabled={frames.length >= 5} onClick={() => setFrames([...frames, ''])} testId="button-add-frame"><Plus className="h-4 w-4" />Add frame</Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Gate context" value={gate} onChange={setGate} options={['North Gate', 'South Gate', 'Warehouse Gate']} />
          <div className="flex items-end">
            <Button onClick={run} disabled={create.isPending || frames.length === 0} className="w-full" testId="button-run-fusion">{create.isPending ? <Busy label="Fusing reads" /> : <><Cpu className="h-4 w-4" />Run plate fusion</>}</Button>
          </div>
        </div>
        {notice && <div className="mt-4"><Notice kind={notice.includes('failed') || notice.includes('Unable') ? 'bad' : 'good'}>{notice}</Notice></div>}
      </div>
    </Card>
    <Card className="panel-grid" title="Fusion result">
      <div id="fusion-result-card" className="min-h-[315px] p-5">
        {result ? <div className="animate-slide-in">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Final plate</p>
              <p className="plate-text mt-2 text-4xl font-bold text-primary">{result.finalPlate}</p>
              <p className="mt-2 text-xs text-muted-foreground">Raw consensus <span className="plate-text text-foreground">{result.rawPlate}</span></p>
            </div>
            <StatusPill value={result.decision} />
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3">
            <Info label="Fusion confidence" value={`${Math.round(result.confidence)}%`} />
            <Info label="Correction" value={result.isCorrected ? 'Applied' : 'Not needed'} />
          </div>
          <div className="mt-6">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Frame agreement</p>
            {result.frames?.map((f: any) => <div key={f.index} className="mb-2 flex items-center gap-3">
              <span className="data-text w-5 text-[10px] text-muted-foreground">0{f.index}</span>
              <span className="plate-text w-28 text-xs">{f.rawText}</span>
              <TinyBar value={f.confidence * 100} max={100} color="bg-accent" />
              <span className="data-text w-10 text-right text-[10px] text-muted-foreground">{Math.round(f.confidence * 100)}%</span>
            </div>)}
          </div>
        </div> : <EmptyState title="Waiting for detection" detail="Upload a recorded video, use your laptop camera, or click 'Extract Plate from Video'." />}
      </div>
    </Card>
  </div></>;
}

function TripsPage() {
  const qc = useQueryClient(); const active = useGetActiveTrips({ query: { refetchInterval: 20000, queryKey: getGetActiveTripsQueryKey() } }); const update = useUpdateTripStatus(); const [notice, setNotice] = useState('');
  const exit = (id: number) => { update.mutate({ id, data: { status: 'exited' } }, { onSuccess: () => { setNotice('Trip marked exited and active count refreshed.'); qc.invalidateQueries({ queryKey: getGetActiveTripsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); }, onError: () => setNotice('Unable to update trip status.') }); };
  return <><PageHeader eyebrow="Trips / inside now" title="Vehicles inside" description="Reconcile every open trip before it becomes an overstay." />{notice && <Notice kind={notice.includes('Unable') ? 'bad' : 'good'}>{notice}</Notice>}<Card title="Active trip register" action={<span className="data-text text-xs text-muted-foreground">{active.data?.length ?? 0} open trips</span>}>{active.isLoading ? <LoadingRows count={6} /> : active.isError ? <ErrorState retry={() => active.refetch()} /> : !(active.data ?? []).length ? <EmptyState title="No vehicles inside" detail="The facility is clear. New entries will appear here in real time." /> : <DataTable headers={['Plate', 'Driver / transporter', 'Gate', 'Vehicle', 'Dwell', 'Last event', 'Action']}><tbody>{(active.data ?? []).map(t => <tr key={t.id} className="border-b border-border/50 transition hover:bg-secondary/30"><td className="px-5 py-4"><span className="plate-text text-sm font-bold">{t.plate}</span><p className="mt-1 text-[10px] text-muted-foreground">{t.purpose}</p></td><td className="px-5 py-4"><p className="text-xs">{t.driver}</p><p className="text-[10px] text-muted-foreground">{t.transporter}</p></td><td className="px-5 py-4 text-xs">{t.gate}</td><td className="px-5 py-4 text-xs">{t.vehicleType}</td><td className="data-text px-5 py-4 text-xs text-primary">{t.dwellMinutes ?? 0} min</td><td className="data-text px-5 py-4 text-[10px] text-muted-foreground">{formatTime(t.lastEvent)}</td><td className="px-5 py-4"><Button variant="secondary" onClick={() => exit(t.id)} disabled={update.isPending} testId={`button-exit-trip-${t.id}`}><ArrowUpRight className="h-3.5 w-3.5" />Mark exit</Button></td></tr>)}</tbody></DataTable>}</Card></>;
}

function SchedulePage() {
  const qc = useQueryClient(); const trips = useGetTrips({ query: { queryKey: getGetTripsQueryKey() } }); const create = useCreateTrip(); const [open, setOpen] = useState(false); const [notice, setNotice] = useState(''); const [form, setForm] = useState({ plate: '', driver: '', transporter: '', gate: 'North Gate', purpose: 'Delivery', expectedArrival: '', expectedDeparture: '' }); const update = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });
  const submit = (e: React.FormEvent) => { e.preventDefault(); create.mutate({ data: form }, { onSuccess: () => { setOpen(false); setForm({ plate: '', driver: '', transporter: '', gate: 'North Gate', purpose: 'Delivery', expectedArrival: '', expectedDeparture: '' }); setNotice('Trip scheduled.'); qc.invalidateQueries({ queryKey: getGetTripsQueryKey() }); }, onError: () => setNotice('Trip could not be scheduled.') }); };
  return <><PageHeader eyebrow="Trips / planning" title="Schedule" description="Put expected movements on the board before the vehicle reaches the lane."><Button onClick={() => setOpen(true)} testId="button-create-trip"><Plus className="h-4 w-4" />Schedule trip</Button></PageHeader>{notice && <Notice kind={notice.includes('could') ? 'bad' : 'good'}>{notice}</Notice>}<Card title="Scheduled movements" action={<span className="data-text text-xs text-muted-foreground">{trips.data?.length ?? 0} records</span>}>{trips.isLoading ? <LoadingRows count={6} /> : trips.isError ? <ErrorState retry={() => trips.refetch()} /> : !(trips.data ?? []).length ? <EmptyState title="Schedule is clear" detail="Create an expected movement to give the gate a head start." action={<Button onClick={() => setOpen(true)} variant="secondary" testId="button-create-empty-trip"><Plus className="h-4 w-4" />Create first trip</Button>} /> : <DataTable headers={['Plate', 'Driver', 'Purpose', 'Gate', 'Expected arrival', 'Expected departure', 'Status']}><tbody>{(trips.data ?? []).map(t => <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/30"><td className="plate-text px-5 py-4 text-sm font-bold">{t.plate}</td><td className="px-5 py-4 text-xs">{t.driver}</td><td className="px-5 py-4 text-xs text-muted-foreground">{t.purpose}</td><td className="px-5 py-4 text-xs">{t.gate}</td><td className="data-text px-5 py-4 text-[10px]">{formatTime(t.expectedArrival)}</td><td className="data-text px-5 py-4 text-[10px]">{formatTime(t.expectedDeparture)}</td><td className="px-5 py-4"><StatusPill value={t.status} /></td></tr>)}</tbody></DataTable>}</Card>{open && <Modal title="Schedule a trip" onClose={() => setOpen(false)}><form className="space-y-4" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><Field label="Plate" value={form.plate} onChange={v => update('plate', v.toUpperCase())} placeholder="MH12AB1234" required /><Field label="Driver" value={form.driver} onChange={v => update('driver', v)} required /></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Transporter" value={form.transporter} onChange={v => update('transporter', v)} required /><SelectField label="Gate" value={form.gate} onChange={v => update('gate', v)} options={['North Gate', 'South Gate', 'Warehouse Gate']} /></div><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Purpose" value={form.purpose} onChange={v => update('purpose', v)} options={['Delivery', 'Pickup', 'Contractor', 'Visitor']} /><Field label="Expected arrival" value={form.expectedArrival} onChange={v => update('expectedArrival', v)} type="datetime-local" required /></div><Field label="Expected departure" value={form.expectedDeparture} onChange={v => update('expectedDeparture', v)} type="datetime-local" required /><div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending} testId="button-submit-trip">{create.isPending ? <Busy label="Scheduling" /> : 'Schedule trip'}</Button></div></form></Modal>}</>;
}

function EventsPage() {
  const [search, setSearch] = useState(''); const [decision, setDecision] = useState(''); const [eventType, setEventType] = useState(''); const params = useMemo(() => ({ search: search || undefined, decision: decision || undefined, eventType: eventType || undefined }), [search, decision, eventType]); const events = useGetEvents(params, { query: { queryKey: getGetEventsQueryKey(params) } });
  return <><PageHeader eyebrow="Audit / events" title="Event register" description="Searchable entry and exit history with the read that made the decision." /><Card><div className="flex flex-col gap-3 border-b border-border/70 p-5 md:flex-row"><SearchBox value={search} onChange={setSearch} placeholder="Plate, gate, transporter" /><SelectField label="" value={decision} onChange={setDecision} options={['', 'allowed', 'denied', 'manual review']} /><SelectField label="" value={eventType} onChange={setEventType} options={['', 'entry', 'exit']} /></div>{events.isLoading ? <LoadingRows count={8} /> : events.isError ? <ErrorState retry={() => events.refetch()} /> : !(events.data ?? []).length ? <EmptyState title="No matching events" detail="Try a wider search or clear the decision filters." /> : <DataTable headers={['Timestamp', 'Plate', 'Movement', 'Gate / camera', 'Decision', 'Confidence', 'Vehicle']}><tbody>{(events.data ?? []).map(e => <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/30"><td className="data-text px-5 py-4 text-[10px] text-muted-foreground">{formatTime(e.timestamp)}</td><td className="px-5 py-4"><span className="plate-text text-sm font-bold">{e.plate}</span>{e.isCorrected && <span className="ml-2 text-[9px] uppercase tracking-wider text-primary">corrected</span>}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1 text-xs ${e.eventType.toLowerCase().includes('entry') ? 'text-accent' : 'text-primary'}`}>{e.eventType.toLowerCase().includes('entry') ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}{e.eventType}</span></td><td className="px-5 py-4"><p className="text-xs">{e.gate}</p><p className="text-[10px] text-muted-foreground">{e.camera}</p></td><td className="px-5 py-4"><StatusPill value={e.decision} /></td><td className="data-text px-5 py-4 text-xs">{Math.round(e.confidence)}%</td><td className="px-5 py-4 text-xs text-muted-foreground">{e.vehicleType}</td></tr>)}</tbody></DataTable>}</Card></>;
}

function VehiclesPage() {
  const qc = useQueryClient(); const vehicles = useGetVehicles({ query: { queryKey: getGetVehiclesQueryKey() } }); const create = useCreateVehicle(); const updateVehicle = useUpdateVehicle(); const remove = useDeleteVehicle(); const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Vehicle | null>(null); const [search, setSearch] = useState(''); const [notice, setNotice] = useState(''); const [form, setForm] = useState({ plate: '', type: 'Truck', owner: '', transporter: '', authorized: true }); const filtered = (vehicles.data ?? []).filter(v => `${v.plate} ${v.owner} ${v.transporter}`.toLowerCase().includes(search.toLowerCase()));
  const start = (vehicle?: Vehicle) => { setEditing(vehicle ?? null); setForm(vehicle ? { plate: vehicle.plate, type: vehicle.type, owner: vehicle.owner, transporter: vehicle.transporter, authorized: vehicle.authorized } : { plate: '', type: 'Truck', owner: '', transporter: '', authorized: true }); setOpen(true); };
  const submit = (e: React.FormEvent) => { e.preventDefault(); const done = () => { setOpen(false); setNotice(editing ? 'Vehicle updated.' : 'Vehicle added to master.'); qc.invalidateQueries({ queryKey: getGetVehiclesQueryKey() }); }; editing ? updateVehicle.mutate({ id: editing.id, data: form }, { onSuccess: done, onError: () => setNotice('Vehicle update failed.') }) : create.mutate({ data: form }, { onSuccess: done, onError: () => setNotice('Vehicle creation failed.') }); };
  const destroy = (id: number) => { if (confirm('Delete this vehicle from the master?')) remove.mutate({ id }, { onSuccess: () => { setNotice('Vehicle deleted.'); qc.invalidateQueries({ queryKey: getGetVehiclesQueryKey() }); } }); };
  return <><PageHeader eyebrow="Master data / vehicles" title="Vehicles" description="Authorised plates and their operating context."><Button onClick={() => start()} testId="button-create-vehicle"><Plus className="h-4 w-4" />Add vehicle</Button></PageHeader>{notice && <Notice>{notice}</Notice>}<Card><div className="border-b border-border/70 p-5"><SearchBox value={search} onChange={setSearch} placeholder="Search plate, owner, transporter" /></div>{vehicles.isLoading ? <LoadingRows /> : vehicles.isError ? <ErrorState retry={() => vehicles.refetch()} /> : !filtered.length ? <EmptyState title="No vehicles found" detail={search ? 'Try a different plate or owner.' : 'Add the first authorised vehicle to begin.'} /> : <DataTable headers={['Plate', 'Type', 'Owner', 'Transporter', 'Authorisation', 'Status', 'Actions']}><tbody>{filtered.map(v => <tr key={v.id} className="border-b border-border/50 hover:bg-secondary/30"><td className="plate-text px-5 py-4 text-sm font-bold">{v.plate}</td><td className="px-5 py-4 text-xs">{v.type}</td><td className="px-5 py-4 text-xs">{v.owner}</td><td className="px-5 py-4 text-xs text-muted-foreground">{v.transporter}</td><td className="px-5 py-4"><StatusPill value={v.authorized ? 'Authorized' : 'Blocked'} /></td><td className="px-5 py-4"><StatusPill value={v.status} /></td><td className="px-5 py-4"><div className="flex gap-1"><IconButton label="Edit vehicle" testId={`button-edit-vehicle-${v.id}`} onClick={() => start(v)}><Pencil className="h-3.5 w-3.5" /></IconButton><IconButton label="Delete vehicle" testId={`button-delete-vehicle-${v.id}`} onClick={() => destroy(v.id)}><XCircle className="h-3.5 w-3.5 text-red-300" /></IconButton></div></td></tr>)}</tbody></DataTable>}</Card>{open && <Modal title={editing ? 'Edit vehicle' : 'Add vehicle'} onClose={() => setOpen(false)}><form className="space-y-4" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><Field label="Plate" value={form.plate} onChange={v => setForm({ ...form, plate: v.toUpperCase() })} required /><SelectField label="Vehicle type" value={form.type} onChange={v => setForm({ ...form, type: v })} options={['Truck', 'Tanker', 'Trailer', 'Car', 'Bus']} /></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Owner" value={form.owner} onChange={v => setForm({ ...form, owner: v })} required /><Field label="Transporter" value={form.transporter} onChange={v => setForm({ ...form, transporter: v })} required /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.authorized} onChange={e => setForm({ ...form, authorized: e.target.checked })} />Authorised for entry</label><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending || updateVehicle.isPending} testId="button-submit-vehicle">{create.isPending || updateVehicle.isPending ? <Busy label="Saving" /> : 'Save vehicle'}</Button></div></form></Modal>}</>;
}

function DriversPage() {
  const qc = useQueryClient(); const drivers = useGetDrivers({ query: { queryKey: getGetDriversQueryKey() } }); const create = useCreateDriver(); const [open, setOpen] = useState(false); const [notice, setNotice] = useState(''); const [form, setForm] = useState({ name: '', license: '', phone: '', vehicle: '' }); const [search, setSearch] = useState(''); const filtered = (drivers.data ?? []).filter(d => `${d.name} ${d.license} ${d.vehicle}`.toLowerCase().includes(search.toLowerCase()));
  const submit = (e: React.FormEvent) => { e.preventDefault(); create.mutate({ data: form }, { onSuccess: () => { setOpen(false); setForm({ name: '', license: '', phone: '', vehicle: '' }); setNotice('Driver added to master.'); qc.invalidateQueries({ queryKey: getGetDriversQueryKey() }); }, onError: () => setNotice('Driver creation failed.') }); };
  return <><PageHeader eyebrow="Master data / people" title="Drivers" description="Keep the person behind the plate visible at every gate."><Button onClick={() => setOpen(true)} testId="button-create-driver"><Plus className="h-4 w-4" />Add driver</Button></PageHeader>{notice && <Notice>{notice}</Notice>}<Card><div className="border-b border-border/70 p-5"><SearchBox value={search} onChange={setSearch} placeholder="Search name, licence, vehicle" /></div>{drivers.isLoading ? <LoadingRows /> : drivers.isError ? <ErrorState retry={() => drivers.refetch()} /> : !filtered.length ? <EmptyState title="No drivers found" detail="Create a driver record to connect people with gate movements." /> : <DataTable headers={['Driver', 'Licence', 'Phone', 'Assigned vehicle', 'Status']}><tbody>{filtered.map(d => <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30"><td className="px-5 py-4"><p className="text-sm font-semibold">{d.name}</p><p className="text-[10px] text-muted-foreground">ID {String(d.id).padStart(4, '0')}</p></td><td className="data-text px-5 py-4 text-xs">{d.license}</td><td className="data-text px-5 py-4 text-xs text-muted-foreground">{d.phone}</td><td className="plate-text px-5 py-4 text-xs">{d.vehicle || 'Unassigned'}</td><td className="px-5 py-4"><StatusPill value={d.status} /></td></tr>)}</tbody></DataTable>}</Card>{open && <Modal title="Add driver" onClose={() => setOpen(false)}><form className="space-y-4" onSubmit={submit}><Field label="Full name" value={form.name} onChange={v => setForm({ ...form, name: v })} required /><div className="grid gap-4 sm:grid-cols-2"><Field label="Licence number" value={form.license} onChange={v => setForm({ ...form, license: v.toUpperCase() })} required /><Field label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} required /></div><Field label="Assigned vehicle plate" value={form.vehicle} onChange={v => setForm({ ...form, vehicle: v.toUpperCase() })} placeholder="Optional" /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending} testId="button-submit-driver">{create.isPending ? <Busy label="Saving" /> : 'Add driver'}</Button></div></form></Modal>}</>;
}

function AlertsPage() {
  const qc = useQueryClient(); const alerts = useGetAlerts({ query: { queryKey: getGetAlertsQueryKey() } }); const mark = useMarkAlertRead(); const [filter, setFilter] = useState('All'); const items = (alerts.data ?? []).filter(a => filter === 'All' || (filter === 'Unread' ? !a.isRead : a.severity === filter.toLowerCase()));
  const read = (id: number) => mark.mutate({ id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetAlertsQueryKey() }) });
  return <><PageHeader eyebrow="Signals / inbox" title="Alerts" description="Exceptions that need an operator decision, not background noise."><div className="flex rounded-md border border-border p-0.5">{['All', 'Unread', 'Critical', 'Warning'].map(x => <button key={x} data-testid={`button-filter-alert-${x.toLowerCase()}`} onClick={() => setFilter(x)} className={`rounded px-3 py-1.5 text-xs font-semibold ${filter === x ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{x}</button>)}</div></PageHeader><Card>{alerts.isLoading ? <LoadingRows count={6} /> : alerts.isError ? <ErrorState retry={() => alerts.refetch()} /> : !items.length ? <EmptyState title="Inbox clear" detail="No alerts match this view. Keep the lanes moving." /> : <div className="divide-y divide-border/60">{items.map(a => <AlertRow key={a.id} alert={a} onRead={() => read(a.id)} busy={mark.isPending} />)}</div>}</Card></>;
}
function AlertRow({ alert, onRead, busy }: { alert: Alert; onRead: () => void; busy: boolean }) { return <div className={`flex items-start gap-4 p-5 ${!alert.isRead ? 'bg-primary/[.025]' : ''}`}><span className={`mt-0.5 grid h-9 w-9 place-items-center rounded-lg ${alert.severity.toLowerCase() === 'critical' ? 'bg-red-400/12 text-red-300' : 'bg-amber-300/12 text-amber-200'}`}>{alert.severity.toLowerCase() === 'critical' ? <Siren className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><StatusPill value={alert.severity} /><span className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">{alert.type}</span>{!alert.isRead && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}</div><p className="mt-2 text-sm font-semibold">{alert.message}</p><p className="mt-1 text-xs text-muted-foreground"><span className="plate-text text-foreground">{alert.plate}</span> · {alert.gate} · <span className="data-text">{formatTime(alert.time)}</span></p></div>{!alert.isRead && <Button variant="secondary" onClick={onRead} disabled={busy} testId={`button-mark-alert-read-${alert.id}`}>Mark read</Button>}</div>; }

function ReviewPage() {
  const qc = useQueryClient(); const queue = useGetReviewQueue({ query: { queryKey: getGetReviewQueueQueryKey() } }); const correct = useCorrectPlate(); const [selected, setSelected] = useState<any>(null); const [plate, setPlate] = useState(''); const [notice, setNotice] = useState('');
  const open = (item: any) => { setSelected(item); setPlate(item.plate || item.rawText); };
  const submit = () => { if (!selected) return; correct.mutate({ id: selected.id, data: { correctedPlate: plate.toUpperCase() } }, { onSuccess: () => { setSelected(null); setNotice('Plate correction saved to the audit trail.'); qc.invalidateQueries({ queryKey: getGetReviewQueueQueryKey() }); qc.invalidateQueries({ queryKey: getGetEventsQueryKey() }); }, onError: () => setNotice('Correction could not be saved.') }); };
  return <><PageHeader eyebrow="Exceptions / review" title="Manual review" description="Resolve uncertain reads with an explicit correction before the record leaves the queue." />{notice && <Notice kind={notice.includes('could') ? 'bad' : 'good'}>{notice}</Notice>}<Card title="Review queue" action={<span className="data-text text-xs text-muted-foreground">{queue.data?.length ?? 0} pending</span>}>{queue.isLoading ? <LoadingRows count={5} /> : queue.isError ? <ErrorState retry={() => queue.refetch()} /> : !(queue.data ?? []).length ? <EmptyState title="Queue is clear" detail="No uncertain reads are waiting for an operator." /> : <DataTable headers={['Captured plate', 'Confidence', 'Gate', 'Timestamp', 'Reason', 'Status', 'Action']}><tbody>{(queue.data ?? []).map(item => <tr key={item.id} className="border-b border-border/50 hover:bg-secondary/30"><td className="px-5 py-4"><p className="plate-text text-sm font-bold">{item.plate}</p><p className="plate-text mt-1 text-[10px] text-muted-foreground">raw {item.rawText}</p></td><td className="data-text px-5 py-4 text-xs text-amber-200">{Math.round(item.confidence)}%</td><td className="px-5 py-4 text-xs">{item.gate}</td><td className="data-text px-5 py-4 text-[10px] text-muted-foreground">{formatTime(item.timestamp)}</td><td className="px-5 py-4 text-xs text-muted-foreground">{item.reason}</td><td className="px-5 py-4"><StatusPill value={item.status} /></td><td className="px-5 py-4"><Button variant="secondary" onClick={() => open(item)} testId={`button-review-item-${item.id}`}><Pencil className="h-3.5 w-3.5" />Review</Button></td></tr>)}</tbody></DataTable>}</Card>{selected && <Modal title="Resolve plate read" onClose={() => setSelected(null)}><div className="rounded-lg border border-border bg-background/35 p-4"><p className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">Frame consensus</p><p className="plate-text mt-2 text-2xl font-bold text-amber-200">{selected.rawText}</p><p className="mt-1 text-xs text-muted-foreground">{selected.reason} · {Math.round(selected.confidence)}% confidence</p></div><div className="mt-5"><Field label="Corrected plate" value={plate} onChange={v => setPlate(v.toUpperCase())} required /></div><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setSelected(null)}>Cancel</Button><Button onClick={submit} disabled={correct.isPending || !plate} testId="button-save-correction">{correct.isPending ? <Busy label="Saving" /> : 'Save correction'}</Button></div></Modal>}</>;
}

function ReportsPage() {
  const reports = useGetReportsOverview(); const r = reports.data;
  return <><PageHeader eyebrow="Intelligence / reports" title="Operational reports" description="A compact read on volume, decisions, dwell, and recognition quality." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Repeat visitors" value={r?.repeatVisitors ?? '—'} detail="Returning plates" accent="accent" /><Metric label="Overstays" value={r?.overstays ?? '—'} detail="Past expected departure" accent="danger" /><Metric label="Corrected reads" value={r?.correctedReads ?? '—'} detail="Manual intervention" /><Metric label="Total reads" value={r?.totalReads ?? '—'} detail="Selected period" accent="good" /></div>{reports.isLoading ? <div className="mt-6 grid gap-6 md:grid-cols-2">{[1,2].map(i => <div key={i} className="h-72 animate-pulse rounded-xl bg-card" />)}</div> : reports.isError ? <Card className="mt-6"><ErrorState retry={() => reports.refetch()} /></Card> : <div className="mt-6 grid gap-6 md:grid-cols-2"><ChartCard title="Gate volume" points={r?.gateVolume ?? []} color="bg-primary" /><ChartCard title="Transporter volume" points={r?.transporterVolume ?? []} color="bg-accent" /><ChartCard title="Dwell trend" points={r?.dwellTrend ?? []} color="bg-amber-300" /><ChartCard title="Decisions" points={r?.decisions ?? []} color="bg-emerald-300" /></div>}</>;
}
function ChartCard({ title, points, color }: { title: string; points: { label: string; value: number; secondary: number | null }[]; color: string }) { const max = Math.max(...points.map(p => p.value), 1); return <Card title={title}><div className="space-y-4 p-5">{points.length ? points.map(p => <div key={p.label}><div className="mb-1.5 flex justify-between text-xs"><span className="text-muted-foreground">{p.label}</span><span className="data-text font-bold">{p.value}</span></div><TinyBar value={p.value} max={max} color={color} /></div>) : <EmptyState title="No report points" detail="Aggregates will appear once data is available." />}</div></Card>; }

function CamerasPage() {
  const qc = useQueryClient(); const cameras = useGetCameras({ query: { queryKey: getGetCamerasQueryKey() } }); const create = useCreateCamera(); const [open, setOpen] = useState(false); const [notice, setNotice] = useState(''); const [form, setForm] = useState({ name: '', gate: 'North Gate', direction: 'Entry' });
  const submit = (e: React.FormEvent) => { e.preventDefault(); create.mutate({ data: form }, { onSuccess: () => { setOpen(false); setForm({ name: '', gate: 'North Gate', direction: 'Entry' }); setNotice('Camera registered.'); qc.invalidateQueries({ queryKey: getGetCamerasQueryKey() }); }, onError: () => setNotice('Camera registration failed.') }); };
  return <><PageHeader eyebrow="Infrastructure / cameras" title="Cameras" description="Registry and heartbeat status for every plate-reading lane."><Button onClick={() => setOpen(true)} testId="button-create-camera"><Plus className="h-4 w-4" />Register camera</Button></PageHeader>{notice && <Notice>{notice}</Notice>}<Card title="Camera registry">{cameras.isLoading ? <LoadingRows count={5} /> : cameras.isError ? <ErrorState retry={() => cameras.refetch()} /> : !(cameras.data ?? []).length ? <EmptyState title="No cameras registered" detail="Register a camera to start monitoring lane health." action={<Button onClick={() => setOpen(true)} variant="secondary" testId="button-register-empty-camera">Register camera</Button>} /> : <DataTable headers={['Camera', 'Gate', 'Direction', 'Status', 'Last seen']}><tbody>{(cameras.data ?? []).map(c => <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/30"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-md bg-accent/10 text-accent"><Camera className="h-4 w-4" /></span><div><p className="text-sm font-semibold">{c.name}</p><p className="data-text text-[10px] text-muted-foreground">CAM-{String(c.id).padStart(3, '0')}</p></div></div></td><td className="px-5 py-4 text-xs">{c.gate}</td><td className="px-5 py-4 text-xs">{c.direction}</td><td className="px-5 py-4"><StatusPill value={c.status} /></td><td className="data-text px-5 py-4 text-[10px] text-muted-foreground">{formatTime(c.lastSeen)}</td></tr>)}</tbody></DataTable>}</Card>{open && <Modal title="Register camera" onClose={() => setOpen(false)}><form className="space-y-4" onSubmit={submit}><Field label="Camera name" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="North lane camera 01" required /><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Gate" value={form.gate} onChange={v => setForm({ ...form, gate: v })} options={['North Gate', 'South Gate', 'Warehouse Gate']} /><SelectField label="Direction" value={form.direction} onChange={v => setForm({ ...form, direction: v })} options={['Entry', 'Exit', 'Both']} /></div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending} testId="button-submit-camera">{create.isPending ? <Busy label="Registering" /> : 'Register camera'}</Button></div></form></Modal>}</>;
}

function SettingsPage() {
  const me = useGetMe({ query: { queryKey: getGetMeQueryKey() } }); const [saved, setSaved] = useState(false); const [operatorName, setOperatorName] = useState(''); useEffect(() => { if (me.data?.name) setOperatorName(me.data.name); }, [me.data?.name]);
  return <><PageHeader eyebrow="Console / settings" title="Settings" description="Operator identity and the small controls that shape this desk." /><div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]"><Card title="Operator profile"><div className="space-y-5 p-5">{me.isLoading ? <LoadingRows count={3} /> : me.isError ? <ErrorState message="Operator profile is unavailable." retry={() => me.refetch()} /> : <><div className="flex items-center gap-4 rounded-lg border border-border bg-background/30 p-4"><span className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-lg font-bold text-primary">{me.data?.name?.slice(0, 1) ?? 'O'}</span><div><p className="font-semibold">{me.data?.name}</p><p className="text-xs text-muted-foreground">{me.data?.email}</p><StatusPill value={me.data?.role ?? 'operator'} /></div></div><Field label="Display name" value={operatorName} onChange={setOperatorName} /><Button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2400); }} testId="button-save-profile">{saved ? <><CheckCircle2 className="h-4 w-4" />Saved</> : 'Save profile'}</Button></>}</div></Card><Card title="Console preferences"><div className="space-y-4 p-5"><Preference label="Live refresh interval" detail="Keep event feed close to real time" value="12 seconds" /><Preference label="Confidence threshold" detail="Reads below this enter review" value="78%" /><Preference label="Desk timezone" detail="All event timestamps" value="IST · UTC+05:30" /><div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-primary"><SlidersHorizontal className="h-4 w-4" />Control room defaults</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Dark console mode, mono plate labels, and alert-first sorting are active for this station.</p></div></div></Card></div></>;
}
function Preference({ label, detail, value }: { label: string; detail: string; value: string }) { return <div className="flex items-center justify-between border-b border-border/60 pb-4"><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div><span className="data-text rounded-md bg-secondary px-2.5 py-1.5 text-[10px] text-primary">{value}</span></div>; }

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border/70 bg-background/35 p-3"><p className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">{label}</p><p className="data-text mt-1 text-xs font-semibold">{value}</p></div>; }
function formatTime(value?: string | null) { if (!value) return '—'; const date = new Date(value); if (Number.isNaN(date.getTime())) return value; return `${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}`; }

export default App;