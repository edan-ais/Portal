import React, { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar, { DateSelectArg, EventClickArg } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar as CalIcon,
  Plus,
  Pencil,
  Trash2,
  Users,
  MapPin,
  FileText,
  Clock,
  AlertTriangle,
  Printer
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// =====================================
// Types (keep in sync with DB schema)
// =====================================

type UUID = string;

export type EventType = {
  id: UUID;
  slug: string;
  name: string;
  tier: 1 | 2 | 3;
  target_net_min: number;
  target_net_max: number;
  staff_required: number;
  donation_pct: number; // 0..1
  donation_cap: number; // dollars
  monthly_quota: number | null;
  weekend_quota: number | null;
  daily_max: number | null;
  preferred_days: string[] | null;
  margin_pct: number | null; // 0..1 (COGS as % of gross)
  menu_public_url: string | null;
  checklist_default: { item: string; qty?: number }[] | null;
};

export type Staff = {
  id: UUID;
  display_name: string;
};

export type EventRow = {
  id: UUID;
  type_id: UUID | null;
  title: string;
  description: string | null;
  start_at: string; // ISO
  end_at: string | null;
  location: string | null;
  status: 'planned' | 'confirmed' | 'completed' | 'canceled';
  staff_needed: number;
  staff_assigned: UUID[] | null;
  estimated_gross: number | null;
  target_net: number | null;
  supply_budget: number | null;
  entry_fee: number | null;
  notes: string | null;
  checklist: { item: string; qty?: number; checked?: boolean }[] | null;
  created_at?: string;
  updated_at?: string;
};

export type TaskRow = {
  id: UUID;
  title: string;
  details: string | null;
  due_at: string;
  assigned_to: UUID | null;
  status: 'open' | 'done' | 'skipped';
  checklist: { item: string; qty?: number; checked?: boolean }[] | null;
  metadata: Record<string, any> | null;
};

// =====================================
// Helpers & Constants
// =====================================

const HARD_DAILY_MAX = 6; // no more than 6 events of any type per day
const SLOTS_PER_DAY = 3; // Morning / Afternoon / Evening conceptual capacity

const slotOf = (dateIso: string) => {
  const h = new Date(dateIso).getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
};

const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '');
const fmtMoney = (n?: number | null) => (typeof n === 'number' ? `$${n.toLocaleString()}` : '—');

function tierColor(tier?: 1 | 2 | 3) {
  switch (tier) {
    case 1:
      return '#93c5fd'; // blue-300
    case 2:
      return '#fcd34d'; // amber-300
    case 3:
      return '#c4b5fd'; // violet-300
    default:
      return '#e5e7eb'; // gray-200
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// =====================================
// Component
// =====================================

export default function EventsTab() {
  const [loading, setLoading] = useState(true);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);

  const defaultTypeId = useMemo(() => eventTypes.find(t => t.tier === 1)?.id, [eventTypes]);

  const [form, setForm] = useState<Partial<EventRow & { type_id: UUID }>>({
    type_id: undefined,
    title: '',
    description: '',
    start_at: '',
    end_at: '',
    location: '',
    status: 'planned',
    staff_needed: 1,
    estimated_gross: undefined,
    target_net: undefined,
    supply_budget: undefined,
    entry_fee: 0,
  });

  // -------------------------------------
  // Fetch
  // -------------------------------------
  useEffect(() => {
    (async () => {
      const [tRes, eRes, sRes, tkRes] = await Promise.all([
        supabase.from('event_types').select('*').order('tier', { ascending: true }),
        supabase.from('events').select('*').order('start_at', { ascending: true }),
        supabase.from('staff').select('id, display_name').order('display_name'),
        supabase
          .from('tasks')
          .select('*')
          .gte('due_at', new Date(Date.now() - 86400000).toISOString())
          .order('due_at'),
      ]);
      if (tRes.data) setEventTypes(tRes.data as EventType[]);
      if (eRes.data) setEvents(eRes.data as EventRow[]);
      if (sRes.data) setStaff(sRes.data as Staff[]);
      if (tkRes.data) setTasks(tkRes.data as TaskRow[]);
      setLoading(false);
    })();
  }, []);

  // -------------------------------------
  // Derived: constraint warnings
  // -------------------------------------
  const warnings = useMemo(() => {
    const byDay = new Map<string, number>();
    const byMonthTier3 = new Map<string, number>();
    const byWeekTier2 = new Map<string, number>(); // Mon-start week bucket key

    const weekKey = (d: Date) => {
      const x = new Date(d);
      const day = (x.getDay() + 6) % 7; // Mon=0
      x.setDate(x.getDate() - day);
      x.setHours(0, 0, 0, 0);
      return x.toISOString().slice(0, 10);
    };

    const probs: string[] = [];
    events.filter(ev => ev.status !== 'canceled').forEach(ev => {
      const d = new Date(ev.start_at);
      const keyDay = d.toISOString().slice(0, 10);
      byDay.set(keyDay, (byDay.get(keyDay) || 0) + 1);

      const et = eventTypes.find(t => t.id === ev.type_id);
      if (!et) return;
      if (et.tier === 2) {
        const wk = weekKey(d);
        byWeekTier2.set(wk, (byWeekTier2.get(wk) || 0) + 1);
      }
      if (et.tier === 3) {
        const mk = `${d.getFullYear()}-${d.getMonth() + 1}`;
        byMonthTier3.set(mk, (byMonthTier3.get(mk) || 0) + 1);
      }
    });

    for (const [day, count] of byDay) {
      if (count > HARD_DAILY_MAX) probs.push(`Over daily max (${count}/${HARD_DAILY_MAX}) on ${day}`);
    }
    for (const [wk, count] of byWeekTier2) {
      if (count > 6) probs.push(`Tier-2 over weekend quota (${count}/6) for week starting ${wk}`);
    }
    for (const [m, count] of byMonthTier3) {
      if (count > 1) probs.push(`Tier-3 over monthly quota (${count}/1) in ${m}`);
    }

    return probs;
  }, [events, eventTypes]);

  // -------------------------------------
  // Form helpers
  // -------------------------------------
  const resetForm = (startISO?: string) => {
    setForm({
      type_id: defaultTypeId,
      title: '',
      description: '',
      start_at: startISO || '',
      end_at: '',
      location: '',
      status: 'planned',
      staff_needed: 1,
      entry_fee: 0,
    });
    setEditing(null);
  };

  const openCreateAt = (dateStr?: string) => {
    resetForm(dateStr ? new Date(dateStr).toISOString() : undefined);
    setShowForm(true);
  };

  const openEdit = (ev: EventRow) => {
    setEditing(ev);
    setForm({ ...ev });
    setShowForm(true);
  };

  // -------------------------------------
  // Auto-calculations
  // -------------------------------------
  const computeFinancials = (payload: Partial<EventRow>) => {
    if (!payload.type_id) return payload;
    const et = eventTypes.find(t => t.id === payload.type_id);
    if (!et) return payload;

    const targetNet =
      typeof payload.target_net === 'number'
        ? payload.target_net
        : Math.round((et.target_net_min + et.target_net_max) / 2);

    const margin = et.margin_pct ?? 0.35; // default COGS as % of gross if missing
    const estimatedGross =
      typeof payload.estimated_gross === 'number'
        ? payload.estimated_gross
        : Math.round(targetNet / (1 - margin));

    const supplyBudget =
      typeof payload.supply_budget === 'number'
        ? payload.supply_budget
        : Math.round(estimatedGross * margin);

    // Donation logic (Tier 2)
    const donation = Math.min(estimatedGross * (et.donation_pct ?? 0), et.donation_cap ?? 0);
    const netAfterDonation = estimatedGross - donation - (payload.entry_fee || 0);

    let checklist = payload.checklist;
    if (!checklist || checklist.length === 0) {
      checklist = (et.checklist_default || []).map((c: any) => ({ ...c, checked: false }));
    }

    return {
      ...payload,
      target_net: targetNet,
      estimated_gross: estimatedGross,
      supply_budget: supplyBudget,
      notes: payload.notes ?? `Est. donation ${fmtMoney(Math.round(donation))}; Est. net after donation/fees ${fmtMoney(Math.round(netAfterDonation))}`,
      checklist,
    } as Partial<EventRow>;
  };

  // -------------------------------------
  // Save / Delete
  // -------------------------------------
  const saveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.start_at) return;

    // Enforce daily hard cap
    const dayKey = new Date(form.start_at).toISOString().slice(0, 10);
    const dayCount = events.filter(ev => ev.start_at.slice(0, 10) === dayKey && ev.status !== 'canceled').length;
    if (!editing && dayCount >= HARD_DAILY_MAX) {
      alert(`Daily maximum of ${HARD_DAILY_MAX} events is reached for ${dayKey}.`);
      return;
    }

    // Financials & defaults
    const enriched = computeFinancials(form);

    if (editing) {
      const { error } = await supabase.from('events').update(enriched).eq('id', editing.id);
      if (!error) {
        setEvents(prev => prev.map(e => (e.id === editing.id ? { ...e, ...(enriched as any) } : e)));
      }
    } else {
      const { data, error } = await supabase.from('events').insert(enriched).select('*').single();
      if (!error && data) setEvents(prev => [...prev, data as EventRow]);
    }
    setShowForm(false);
    setEditing(null);
  };

  const deleteEvent = async (id: UUID) => {
    await supabase.from('events').delete().eq('id', id);
    setEvents(prev => prev.filter(e => e.id !== id));
    setShowForm(false);
    setEditing(null);
  };

  // -------------------------------------
  // Checklist & Staff
  // -------------------------------------
  const toggleChecklistItem = async (ev: EventRow, idx: number) => {
    const next = (ev.checklist || []).map((c, i) => (i === idx ? { ...c, checked: !c.checked } : c));
    await supabase.from('events').update({ checklist: next }).eq('id', ev.id);
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, checklist: next } : e)));
  };

  const assignStaff = async (ev: EventRow, staffId: UUID) => {
    const current = ev.staff_assigned || [];
    if (current.includes(staffId)) return;
    const next = [...current, staffId];
    await supabase.from('events').update({ staff_assigned: next }).eq('id', ev.id);
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, staff_assigned: next } : e)));
  };

  // -------------------------------------
  // FullCalendar bindings
  // -------------------------------------
  const fcEvents = useMemo(() => {
    return events.map(ev => {
      const et = eventTypes.find(t => t.id === ev.type_id);
      return {
        id: ev.id,
        title: ev.title,
        start: ev.start_at,
        end: ev.end_at || undefined,
        color: tierColor(et?.tier as any),
        extendedProps: {
          tier: et?.tier,
          typeName: et?.name,
          location: ev.location,
          status: ev.status,
          estimated_gross: ev.estimated_gross,
          target_net: ev.target_net,
          supply_budget: ev.supply_budget,
        },
      } as any;
    });
  }, [events, eventTypes]);

  const handleDateClick = (arg: DateSelectArg | { dateStr: string }) => {
    const dateStr = 'date' in arg ? arg.date.toISOString() : new Date(arg.dateStr).toISOString();
    openCreateAt(dateStr);
  };

  const handleEventClick = (arg: EventClickArg) => {
    const ev = events.find(e => e.id === (arg.event.id as string));
    if (ev) openEdit(ev);
  };

  // Day cell: show capacity chips
  const dayCellDidMount = (info: any) => {
    const dateIso = info.date.toISOString().slice(0, 10);
    const dayEvents = events.filter(e => e.start_at.slice(0, 10) === dateIso && e.status !== 'canceled');
    const count = dayEvents.length;
    const remaining = clamp(HARD_DAILY_MAX - count, 0, HARD_DAILY_MAX);
    const badge = document.createElement('div');
    badge.className = 'absolute top-1 right-1 text-[10px] px-2 py-0.5 rounded-full bg-white/60 text-gray-700';
    badge.innerText = `${count}/${HARD_DAILY_MAX}`;
    info.el.style.position = 'relative';
    info.el.appendChild(badge);

    if (remaining > 0) {
      const add = document.createElement('button');
      add.className = 'mt-1 text-[10px] px-2 py-0.5 rounded border border-dashed border-gray-400/70 hover:bg-white/50';
      add.innerText = 'Add Event';
      add.onclick = () => openCreateAt(info.date.toISOString());
      info.el.appendChild(add);
    }
  };

  // -------------------------------------
  // UI
  // -------------------------------------
  if (loading) return <div className="p-6 text-gray-600">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalIcon className="w-8 h-8 text-gray-500" />
          <h2 className="text-3xl font-bold text-gray-800 font-quicksand">Events Calendar</h2>
        </div>
        <div className="flex items-center gap-3">
          {warnings.length > 0 && (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-100/70 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">
                {warnings[0]}
                {warnings.length > 1 ? ` +${warnings.length - 1} more` : ''}
              </span>
            </div>
          )}
          <motion.button
            onClick={() => openCreateAt()}
            className="glass-button px-6 py-3 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Plus className="w-5 h-5" /> New Event
          </motion.button>
        </div>
      </div>

      {/* Calendar */}
      <div className="glass-card rounded-2xl p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          selectable
          selectMirror
          dayMaxEvents={4}
          events={fcEvents}
          dateClick={(info: any) => handleDateClick(info)}
          eventClick={handleEventClick}
          dayCellDidMount={dayCellDidMount}
          height="auto"
        />
      </div>

      {/* Tasks rail */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3" />
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-800">Tasks</h3>
          </div>
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="glass-card rounded-xl p-4 text-gray-500">No open tasks.</div>
            ) : (
              tasks.map(t => (
                <div key={t.id} className="glass-card rounded-xl p-3">
                  <div className="text-sm font-medium text-gray-900">{t.title}</div>
                  <div className="text-xs text-gray-600">Due {fmtDateTime(t.due_at)}</div>
                  {t.metadata?.boxes_required && (
                    <div className="mt-1 text-xs">Boxes required: <strong>{t.metadata.boxes_required}</strong></div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-card rounded-2xl p-6"
          >
            <form onSubmit={saveEvent} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Row: Type + Title */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Event Type</label>
                  <select
                    value={(form.type_id as string) || ''}
                    onChange={e => setForm(prev => ({ ...prev, type_id: e.target.value as UUID }))}
                    className="glass-input w-full rounded-lg px-3 py-2"
                    required
                  >
                    <option value="" disabled>
                      Select a type
                    </option>
                    {eventTypes.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm text-gray-600 mb-1">Title</label>
                  <input
                    value={form.title || ''}
                    onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                    required
                    className="glass-input w-full rounded-lg px-3 py-2"
                    placeholder="e.g., AYSO Saturday Field 3"
                  />
                </div>
              </div>

              {/* Row: Start/End */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Start</label>
                <input
                  type="datetime-local"
                  value={form.start_at ? new Date(form.start_at).toISOString().slice(0, 16) : ''}
                  onChange={e => setForm(prev => ({ ...prev, start_at: new Date(e.target.value).toISOString() }))}
                  required
                  className="glass-input w-full rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">End</label>
                <input
                  type="datetime-local"
                  value={form.end_at ? new Date(form.end_at).toISOString().slice(0, 16) : ''}
                  onChange={e => setForm(prev => ({ ...prev, end_at: new Date(e.target.value).toISOString() }))}
                  className="glass-input w-full rounded-lg px-3 py-2"
                />
              </div>

              {/* Row: Location + Status */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Location</label>
                <input
                  value={form.location || ''}
                  onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
                  className="glass-input w-full rounded-lg px-3 py-2"
                  placeholder="Field, address, booth #"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Status</label>
                <select
                  value={(form.status as any) || 'planned'}
                  onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                  className="glass-input w-full rounded-lg px-3 py-2"
                >
                  <option value="planned">Planned</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>

              {/* Row: Financials */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Estimated Gross ($)</label>
                <input
                  type="number"
                  value={form.estimated_gross ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, estimated_gross: Number(e.target.value) }))}
                  className="glass-input w-full rounded-lg px-3 py-2"
                  placeholder="auto-calculated if blank"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Target Net ($)</label>
                <input
                  type="number"
                  value={form.target_net ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, target_net: Number(e.target.value) }))}
                  className="glass-input w-full rounded-lg px-3 py-2"
                  placeholder="auto from type"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Supply Budget ($)</label>
                <input
                  type="number"
                  value={form.supply_budget ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, supply_budget: Number(e.target.value) }))}
                  className="glass-input w-full rounded-lg px-3 py-2"
                  placeholder="auto from margin"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Entry Fee ($)</label>
                <input
                  type="number"
                  value={form.entry_fee ?? 0}
                  onChange={e => setForm(prev => ({ ...prev, entry_fee: Number(e.target.value) }))}
                  className="glass-input w-full rounded-lg px-3 py-2"
                />
              </div>

              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Description / Notes</label>
                <textarea
                  value={form.description || ''}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  className="glass-input w-full rounded-lg px-3 py-2 h-24"
                />
              </div>

              {/* Footer actions + Menu link */}
              <div className="md:col-span-2 flex items-center justify-between gap-2">
                {form.type_id && (eventTypes.find(t => t.id === form.type_id)?.menu_public_url) && (
                  <a
                    href={eventTypes.find(t => t.id === form.type_id)!.menu_public_url!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-gray-900/5 hover:bg-gray-900/10"
                  >
                    <FileText className="w-4 h-4" /> Open Menu / Print
                  </a>
                )}
                <div className="ml-auto flex gap-2">
                  {editing && (
                    <button
                      type="button"
                      onClick={() => deleteEvent(editing.id)}
                      className="px-4 py-2 rounded-lg text-red-700 hover:bg-red-100/60 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditing(null);
                    }}
                    className="px-4 py-2 rounded-lg text-gray-600 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="glass-button px-4 py-2 rounded-lg">
                    {editing ? 'Save Changes' : 'Create Event'}
                  </button>
                </div>
              </div>
            </form>

            {/* Quick details & checklist (if editing) */}
            {editing && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="md:col-span-2">
                  <div className="rounded-xl bg-white/50 p-3">
                    <div className="text-sm font-medium mb-2">Checklist</div>
                    <div className="space-y-2">
                      {(editing.checklist || []).map((c, i) => (
                        <label key={i} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!c.checked}
                            onChange={() => toggleChecklistItem(editing, i)}
                          />
                          <span>
                            {c.item}
                            {c.qty ? ` ×${c.qty}` : ''}
                          </span>
                        </label>
                      ))}
                      {(editing.checklist || []).length === 0 && (
                        <div className="text-xs text-gray-500">No checklist items for this type.</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl bg-white/50 p-3">
                    <div className="text-sm font-medium mb-1">Budget</div>
                    <div className="text-xs text-gray-600">Target Net: <strong>{fmtMoney(editing.target_net)}</strong></div>
                    <div className="text-xs text-gray-600">Supply Budget: <strong>{fmtMoney(editing.supply_budget)}</strong></div>
                    <div className="text-xs text-gray-600">Entry Fee: <strong>{fmtMoney(editing.entry_fee || 0)}</strong></div>
                  </div>
                  {eventTypes.find(t => t.id === editing.type_id)?.menu_public_url && (
                    <a
                      href={eventTypes.find(t => t.id === editing.type_id)!.menu_public_url!}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-900/5 hover:bg-gray-900/10"
                    >
                      <Printer className="w-4 h-4" /> Print Menu
                    </a>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
