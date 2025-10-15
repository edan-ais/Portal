// =============================
// 1) SUPABASE SQL — schema.sql
// =============================
/*
-- EVENT TYPES (tiers + rules)
create table if not exists event_types (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tier int not null check (tier in (1,2,3)),
  target_net_min int not null,
  target_net_max int not null,
  staff_required int not null default 1,
  donation_pct numeric not null default 0,
  donation_cap int not null default 0,
  monthly_quota int,          -- e.g., tier 3 => 1 per month
  weekend_quota int,          -- e.g., tier 2 => 6 per weekend
  daily_max int,              -- e.g., <=6 events of any type per day (use on app side or per-type)
  preferred_days text[],      -- e.g., '{Thursday,Friday,Saturday,Sunday}'
  margin_pct numeric,         -- optional: for supply budget suggestion
  menu_public_url text,       -- optional: link to a printable PDF/menu per type
  checklist_default jsonb,    -- array of {item: text, qty?: number}
  inserted_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- EVENTS
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  type_id uuid references event_types(id) on delete restrict,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  status text not null default 'planned', -- planned | confirmed | completed | canceled
  staff_needed int not null default 1,
  staff_assigned uuid[] default '{}', -- references staff.id (below)
  estimated_gross int,
  target_net int,      -- set automatically to event_type target range midpoint, editable
  supply_budget int,   -- suggested via margin or manual override
  entry_fee int default 0,
  notes text,
  checklist jsonb,     -- array of {item, qty, checked}
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- STAFF
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text,
  phone text,
  is_active boolean default true,
  inserted_at timestamptz default now()
);

-- TASK TEMPLATES (recurring rules)
create table if not exists task_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, -- e.g., deliveries, order_ice_cream, order_fudge, cook_fudge, package_fudge
  name text not null,
  rule jsonb not null,       -- see comments below
  default_assignee uuid references staff(id),
  checklist_default jsonb,
  active boolean default true,
  inserted_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- TASK INSTANCES (generated from templates or ad-hoc)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references task_templates(id) on delete set null,
  title text not null,
  details text,
  due_at timestamptz not null,
  assigned_to uuid references staff(id),
  status text not null default 'open',  -- open | done | skipped
  checklist jsonb,                     -- array of {item, qty, checked}
  metadata jsonb,                      -- e.g., {delivery_date: ..., boxes_required: N}
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Example task_templates.rule JSON shapes:
-- 1) Deliveries on the 13th and 28th of every month:
--    {"type":"monthly_days","days":[13,28],"time":"10:00"}
-- 2) Order Ice Cream: every Tuesday (cash hits Tuesday) or conditional on weekend events > 0
--    {"type":"weekly","weekday":"Tuesday","time":"09:00"}
-- 3) Order Fudge: every Tuesday 11:00
--    {"type":"weekly","weekday":"Tuesday","time":"11:00"}
-- 4) Cook Fudge (two cooking days): schedule Mon & Tue following order Tuesday
--    {"type":"relative","base":"order_fudge","offset_days":[-1,0],"weekday":"MonTue","time":"08:00"}
-- 5) Package Fudge after 2-day set: Wed & Thu after Monday/Tuesday cook
--    {"type":"relative","base":"cook_fudge","offset_days":[2,2],"time":"09:00"}

-- Helpful materialized views/indexes can be added later.
*/

// =====================================
// 2) REACT — EventsTab.tsx (functional)
// =====================================
import React, { useEffect, useMemo, useState } from 'react';
import { Calendar as CalIcon, Plus, Trash2, Pencil, MapPin, FileText, Users, Printer, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

// ---- Types (keep in sync with DB)
type UUID = string;

type EventType = {
  id: UUID;
  slug: string;
  name: string;
  tier: 1 | 2 | 3;
  target_net_min: number;
  target_net_max: number;
  staff_required: number;
  donation_pct: number; // 0..1
  donation_cap: number; // $ amount
  monthly_quota: number | null;
  weekend_quota: number | null;
  daily_max: number | null;
  preferred_days: string[] | null; // e.g., ['Thursday','Friday','Saturday','Sunday']
  margin_pct: number | null; // 0..1
  menu_public_url: string | null;
  checklist_default: any[] | null; // [{item, qty?}]
};

type Staff = { id: UUID; display_name: string };

type EventRow = {
  id: UUID;
  type_id: UUID;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  status: 'planned'|'confirmed'|'completed'|'canceled';
  staff_needed: number;
  staff_assigned: UUID[] | null;
  estimated_gross: number | null;
  target_net: number | null;
  supply_budget: number | null;
  entry_fee: number | null;
  notes: string | null;
  checklist: { item: string; qty?: number; checked?: boolean }[] | null;
};

type TaskRow = {
  id: UUID;
  title: string;
  details: string | null;
  due_at: string; // ISO
  assigned_to: UUID | null;
  status: 'open'|'done'|'skipped';
  checklist: { item: string; qty?: number; checked?: boolean }[] | null;
  metadata: Record<string, any> | null;
};

// ---- Helpers
const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleString() : '';
const startOfWeek = (d: Date) => { const x = new Date(d); const day = (x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; };
const endOfWeek = (d: Date) => { const s = startOfWeek(d); const e = new Date(s); e.setDate(e.getDate()+7); return e; };
const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

// business constraints
const HARD_DAILY_MAX = 6; // no more than 6 events of any kind per day

// preferred slot buckets per day (you can tweak)
const SLOTS = ['Morning','Afternoon','Evening'] as const;

type SlotKey = typeof SLOTS[number];

function slotOf(dateIso: string): SlotKey {
  const h = new Date(dateIso).getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

export default function EventsTab() {
  const [loading, setLoading] = useState(true);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);

  const defaultTypeId = eventTypes.find(t=>t.tier===1)?.id;

  const [eventForm, setEventForm] = useState<Partial<EventRow & { type_id: UUID }>>({
    type_id: undefined,
    title: '',
    start_at: '',
    end_at: '',
    location: '',
    status: 'planned',
  });

  // -------- Fetch
  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: e }, { data: s }, { data: tk }] = await Promise.all([
        supabase.from('event_types').select('*').order('tier'),
        supabase.from('events').select('*').order('start_at', { ascending: true }),
        supabase.from('staff').select('id, display_name').order('display_name'),
        supabase.from('tasks').select('*').gte('due_at', new Date(Date.now()-86400000).toISOString()).order('due_at')
      ]);
      if (t) setEventTypes(t as EventType[]);
      if (e) setEvents(e as EventRow[]);
      if (s) setStaff(s as Staff[]);
      if (tk) setTasks(tk as TaskRow[]);
      setLoading(false);
    })();
  }, []);

  // -------- Derived: quotas & warnings
  const violations = useMemo(() => {
    const map = { daily: new Map<string, number>(), weekendTier2: new Map<string, number>(), monthlyTier3: new Map<string, number>() };
    const probs: string[] = [];

    events.filter(ev => ev.status !== 'canceled').forEach(ev => {
      const d = new Date(ev.start_at);
      const keyDay = d.toISOString().slice(0,10);
      map.daily.set(keyDay, (map.daily.get(keyDay) || 0)+1);

      const et = eventTypes.find(t => t.id === ev.type_id);
      if (!et) return;
      if (et.tier === 2) {
        // weekend bucket key (Thu..Sun of same week)
        const wkStart = startOfWeek(d); // Mon start
        // force bucket Thu-Sun: we’ll still count inside week for simplicity
        const keyW = wkStart.toISOString().slice(0,10);
        map.weekendTier2.set(keyW, (map.weekendTier2.get(keyW)||0)+1);
      }
      if (et.tier === 3) {
        const keyM = `${d.getFullYear()}-${d.getMonth()+1}`;
        map.monthlyTier3.set(keyM, (map.monthlyTier3.get(keyM)||0)+1);
      }
    });

    // daily max any type
    for (const [day, count] of map.daily.entries()) {
      if (count > HARD_DAILY_MAX) probs.push(`Over daily max (${count}/${HARD_DAILY_MAX}) on ${day}`);
    }

    // tier2 weekend quota (target 6 per weekend: Thu 1, Fri 1, Sat 2, Sun 2) — we enforce 6/weekend overall
    for (const [wk, count] of map.weekendTier2.entries()) {
      if (count > 6) probs.push(`Tier-2 over weekend quota (${count}/6) for week starting ${wk}`);
    }

    // tier3 monthly quota 1
    for (const [m, count] of map.monthlyTier3.entries()) {
      if (count > 1) probs.push(`Tier-3 over monthly quota (${count}/1) in ${m}`);
    }

    return probs;
  }, [events, eventTypes]);

  // -------- Handlers
  const resetEventForm = () => {
    setEventForm({ type_id: defaultTypeId, title: '', start_at: '', end_at: '', location: '', status: 'planned' });
    setEditingEvent(null);
  };

  const openCreate = () => { resetEventForm(); setShowEventForm(true); };
  const openEdit = (ev: EventRow) => { setEditingEvent(ev); setEventForm({ ...ev }); setShowEventForm(true); };

  const saveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...eventForm } as EventRow;
    // enrich budgets if missing
    const et = eventTypes.find(t => t.id === payload.type_id);
    if (et) {
      if (payload.target_net == null) payload.target_net = Math.round((et.target_net_min + et.target_net_max)/2);
      if (payload.supply_budget == null && et.margin_pct != null && payload.estimated_gross != null) {
        const targetCOGS = Math.round(payload.estimated_gross * (et.margin_pct));
        payload.supply_budget = targetCOGS;
      }
      if (!payload.checklist) payload.checklist = (et.checklist_default || []).map((c:any)=>({ ...c, checked:false }));
    }

    if (editingEvent) {
      const { error } = await supabase.from('events').update(payload).eq('id', editingEvent.id);
      if (!error) setEvents(prev => prev.map(x => x.id === editingEvent.id ? { ...x, ...payload } : x));
    } else {
      const { data, error } = await supabase.from('events').insert(payload).select('*').single();
      if (!error && data) setEvents(prev => [...prev, data as EventRow]);
    }
    setShowEventForm(false);
  };

  const deleteEvent = async (id: UUID) => {
    await supabase.from('events').delete().eq('id', id);
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const toggleChecklistItem = async (ev: EventRow, idx: number) => {
    const next = (ev.checklist || []).map((c,i)=> i===idx ? { ...c, checked: !c.checked } : c);
    await supabase.from('events').update({ checklist: next }).eq('id', ev.id);
    setEvents(prev => prev.map(e => e.id===ev.id ? { ...e, checklist: next } : e));
  };

  const assignStaff = async (ev: EventRow, staffId: UUID) => {
    const current = ev.staff_assigned || [];
    if (current.includes(staffId)) return;
    const next = [...current, staffId];
    await supabase.from('events').update({ staff_assigned: next }).eq('id', ev.id);
    setEvents(prev => prev.map(e => e.id===ev.id ? { ...e, staff_assigned: next } : e));
  };

  const toggleTask = async (task: TaskRow) => {
    const next = task.status === 'done' ? 'open' : 'done';
    await supabase.from('tasks').update({ status: next }).eq('id', task.id);
    setTasks(prev => prev.map(t => t.id===task.id ? { ...t, status: next } : t));
  };

  // -------- Calendar grouping (by day + slot)
  const days = useMemo(() => {
    const map: Record<string, { date: Date; slots: Record<SlotKey, EventRow[]> }> = {};
    events.forEach(ev => {
      const d = new Date(ev.start_at);
      const key = d.toISOString().slice(0,10);
      const slot = slotOf(ev.start_at);
      if (!map[key]) map[key] = { date: new Date(key), slots: { Morning: [], Afternoon: [], Evening: [] } };
      map[key].slots[slot].push(ev);
    });
    return Object.values(map).sort((a,b)=>a.date.getTime()-b.date.getTime());
  }, [events]);

  // -------- UI
  if (loading) return <div className="p-6 text-gray-600">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalIcon className="w-8 h-8 text-gray-500" />
          <h2 className="text-3xl font-bold text-gray-800 font-quicksand">Events</h2>
        </div>
        <div className="flex items-center gap-3">
          {violations.length>0 && (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-100/70 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">{violations[0]}{violations.length>1?` +${violations.length-1} more`:''}</span>
            </div>
          )}
          <motion.button onClick={openCreate} className="glass-button px-6 py-3 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2" whileHover={{scale:1.05}} whileTap={{scale:0.95}}>
            <Plus className="w-5 h-5"/> New Event
          </motion.button>
        </div>
      </div>

      {/* Task rail */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-4">
          {/* Calendar days */}
          {days.length===0 ? (
            <div className="glass-card rounded-2xl p-6 text-gray-500">No events yet. Fill your calendar.</div>
          ) : days.map(({date, slots}) => (
            <div key={date.toISOString()} className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                <div className="font-semibold text-gray-800">{date.toLocaleDateString(undefined,{weekday:'long', month:'short', day:'numeric'})}</div>
                <div className="text-sm text-gray-500 flex items-center gap-2"><Clock className="w-4 h-4"/> {Object.values(slots).reduce((a,b)=>a+b.length,0)} / {HARD_DAILY_MAX} booked</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {SLOTS.map(sk => (
                  <div key={sk} className="rounded-xl border border-white/10 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">{sk}</div>
                    <div className="space-y-2">
                      {slots[sk].map(ev => (
                        <div key={ev.id} className="rounded-lg p-3 bg-white/40 hover:bg-white/60 transition">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium text-gray-900">{ev.title}</div>
                              <div className="text-xs text-gray-600">{new Date(ev.start_at).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}{ev.end_at?` – ${new Date(ev.end_at).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}`:''}</div>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={()=>openEdit(ev)} className="p-2 hover:bg-black/5 rounded-md"><Pencil className="w-4 h-4"/></button>
                              <button onClick={()=>deleteEvent(ev.id)} className="p-2 hover:bg-red-500/10 rounded-md"><Trash2 className="w-4 h-4 text-red-500"/></button>
                            </div>
                          </div>
                          {ev.location && <div className="mt-1 text-xs text-gray-700 flex items-center gap-1"><MapPin className="w-3 h-3"/>{ev.location}</div>}
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-900">{(eventTypes.find(t=>t.id===ev.type_id)?.name)||'Type'}</span>
                            <span className="px-2 py-0.5 rounded-full bg-gray-900/10">{ev.status}</span>
                          </div>
                        </div>
                      ))}
                      <button onClick={openCreate} className="w-full text-sm py-2 rounded-lg border border-dashed border-gray-400/50 hover:bg-white/30">Add event to {sk}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Tasks */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-gray-600"/><h3 className="font-semibold text-gray-800">Tasks</h3></div>
          <div className="space-y-2">
            {tasks.length===0 ? (
              <div className="glass-card rounded-xl p-4 text-gray-500">No open tasks.</div>
            ) : tasks.map(t => (
              <div key={t.id} className="glass-card rounded-xl p-3">
                <div className="text-sm font-medium text-gray-900">{t.title}</div>
                <div className="text-xs text-gray-600">Due {fmtDate(t.due_at)}</div>
                {t.metadata?.boxes_required && (
                  <div className="mt-1 text-xs">Boxes required: <strong>{t.metadata.boxes_required}</strong></div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-xs text-gray-600">{t.status==='done'?'Completed':'Open'}</div>
                  <button onClick={()=>toggleTask(t)} className={`text-xs px-2 py-1 rounded ${t.status==='done'?'bg-emerald-500/20':'bg-gray-900/10'}`}>{t.status==='done'?'Undo':'Mark done'}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create/Edit modal */}
      <AnimatePresence>
        {showEventForm && (
          <motion.div initial={{opacity:0, y:-20}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-20}} className="glass-card rounded-2xl p-6">
            <form onSubmit={saveEvent} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Event Type</label>
                  <select value={eventForm.type_id||''} onChange={e=>setEventForm(prev=>({...prev, type_id: e.target.value as UUID}))} className="glass-input w-full rounded-lg px-3 py-2">
                    <option value="" disabled>Select a type</option>
                    {eventTypes.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm text-gray-600 mb-1">Title</label>
                  <input value={eventForm.title||''} onChange={e=>setEventForm(prev=>({...prev, title:e.target.value}))} required className="glass-input w-full rounded-lg px-3 py-2" placeholder="e.g., AYSO Saturday Field 3"/>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Start</label>
                <input type="datetime-local" value={eventForm.start_at||''} onChange={e=>setEventForm(prev=>({...prev, start_at:e.target.value}))} required className="glass-input w-full rounded-lg px-3 py-2"/>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">End</label>
                <input type="datetime-local" value={eventForm.end_at||''} onChange={e=>setEventForm(prev=>({...prev, end_at:e.target.value}))} className="glass-input w-full rounded-lg px-3 py-2"/>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Location</label>
                <input value={eventForm.location||''} onChange={e=>setEventForm(prev=>({...prev, location:e.target.value}))} className="glass-input w-full rounded-lg px-3 py-2" placeholder="Field, address, booth #"/>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Status</label>
                <select value={eventForm.status||'planned'} onChange={e=>setEventForm(prev=>({...prev, status:e.target.value as any}))} className="glass-input w-full rounded-lg px-3 py-2">
                  <option value="planned">Planned</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Estimated Gross ($)</label>
                <input type="number" value={eventForm.estimated_gross||''} onChange={e=>setEventForm(prev=>({...prev, estimated_gross:Number(e.target.value)}))} className="glass-input w-full rounded-lg px-3 py-2"/>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Target Net ($)</label>
                <input type="number" value={eventForm.target_net||''} onChange={e=>setEventForm(prev=>({...prev, target_net:Number(e.target.value)}))} className="glass-input w-full rounded-lg px-3 py-2" placeholder="auto from type"/>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Supply Budget ($)</label>
                <input type="number" value={eventForm.supply_budget||''} onChange={e=>setEventForm(prev=>({...prev, supply_budget:Number(e.target.value)}))} className="glass-input w-full rounded-lg px-3 py-2" placeholder="suggested from margin"/>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Entry Fee ($)</label>
                <input type="number" value={eventForm.entry_fee||''} onChange={e=>setEventForm(prev=>({...prev, entry_fee:Number(e.target.value)}))} className="glass-input w-full rounded-lg px-3 py-2"/>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Description / Notes</label>
                <textarea value={eventForm.description||''} onChange={e=>setEventForm(prev=>({...prev, description:e.target.value}))} className="glass-input w-full rounded-lg px-3 py-2 h-24"/>
              </div>

              <div className="md:col-span-2 flex items-center justify-between gap-2">
                {/* Menu link from event type */}
                {eventForm.type_id && (eventTypes.find(t=>t.id===eventForm.type_id)?.menu_public_url) && (
                  <a href={eventTypes.find(t=>t.id===eventForm.type_id)!.menu_public_url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-gray-900/5 hover:bg-gray-900/10">
                    <FileText className="w-4 h-4"/> Open Menu / Print
                  </a>
                )}
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={()=>{setShowEventForm(false); resetEventForm();}} className="px-4 py-2 rounded-lg text-gray-600 hover:bg-white/5">Cancel</button>
                  <button type="submit" className="glass-button px-4 py-2 rounded-lg">{editingEvent?'Save Changes':'Create Event'}</button>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event drawer (quick checklist + staffing) */}
      {editingEvent && !showEventForm && (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-600"/>
              <div className="font-semibold">{editingEvent.title}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setShowEventForm(true)} className="px-3 py-2 rounded-lg bg-gray-900/5 hover:bg-gray-900/10"><Pencil className="w-4 h-4"/></button>
              <button onClick={()=>setEditingEvent(null)} className="px-3 py-2 rounded-lg">Close</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="md:col-span-2 space-y-3">
              <div className="text-sm text-gray-600">{fmtDate(editingEvent.start_at)} {editingEvent.location?`• ${editingEvent.location}`:''}</div>

              <div className="rounded-xl bg-white/50 p-3">
                <div className="text-sm font-medium mb-2">Checklist</div>
                <div className="space-y-2">
                  {(editingEvent.checklist||[]).map((c, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!!c.checked} onChange={()=>toggleChecklistItem(editingEvent, i)} />
                      <span>{c.item}{c.qty?` ×${c.qty}`:''}</span>
                    </label>
                  ))}
                  {(editingEvent.checklist||[]).length===0 && <div className="text-xs text-gray-500">No checklist items for this type.</div>}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl bg-white/50 p-3">
                <div className="text-sm font-medium mb-1">Budget</div>
                <div className="text-xs text-gray-600">Target Net: <strong>${editingEvent.target_net||'-'}</strong></div>
                <div className="text-xs text-gray-600">Supply Budget: <strong>${editingEvent.supply_budget||'-'}</strong></div>
                <div className="text-xs text-gray-600">Entry Fee: <strong>${editingEvent.entry_fee||0}</strong></div>
              </div>

              <div className="rounded-xl bg-white/50 p-3">
                <div className="text-sm font-medium mb-2">Assign Staff</div>
                <div className="flex flex-wrap gap-2">
                  {staff.map(s => (
                    <button key={s.id} onClick={()=>assignStaff(editingEvent, s.id)} className={`px-3 py-1 rounded-full text-xs ${editingEvent.staff_assigned?.includes(s.id)?'bg-emerald-500/30':'bg-gray-900/10'}`}>{s.display_name}</button>
                  ))}
                </div>
              </div>

              {eventTypes.find(t=>t.id===editingEvent.type_id)?.menu_public_url && (
                <a href={eventTypes.find(t=>t.id===editingEvent.type_id)!.menu_public_url!} target="_blank" rel="noreferrer" className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-900/5 hover:bg-gray-900/10"><Printer className="w-4 h-4"/> Print Menu</a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================
// 3) SEED DATA — event_types (SQL)
// =============================
/*
insert into event_types (slug, name, tier, target_net_min, target_net_max, staff_required, donation_pct, donation_cap, monthly_quota, weekend_quota, daily_max, preferred_days, margin_pct, menu_public_url, checklist_default)
values
('tier1', 'Tier 1 — Small / In‑Store / One‑Staff', 1, 300, 400, 1, 0, 0, null, null, 6, '{Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday}', 0.30, null,
  '[{"item":"Scoop utensils"},{"item":"Single-scoop cups","qty":40},{"item":"Tokens (Golden Gumball)","qty":10}]'::jsonb),
('tier2', 'Tier 2 — Sports / Small Markets (Donate 30% up to $100)', 2, 700, 900, 1, 0.30, 100, null, 6, 6, '{Thursday,Friday,Saturday,Sunday}', 0.35, null,
  '[{"item":"Cotton candy bags","qty":50},{"item":"Freeze-dried packs","qty":30},{"item":"Table + cloth"}]'::jsonb),
('tier3', 'Tier 3 — Major Festivals / Farmers (Two Staff)', 3, 1500, 1800, 2, 0, 0, 1, null, 6, '{Thursday,Friday,Saturday,Sunday}', 0.40, null,
  '[{"item":"Full menu kit"},{"item":"Specialty items","qty":20},{"item":"Extra change float"}]'::jsonb);
*/

// ========================================
// 4) NOTES — Scheduling & generation logic
// ========================================
/*
This v0.1 enforces constraints in the UI layer and surfaces warnings:
- Max 6 events per day (hard cap)
- Tier 2: warns when >6 booked in same (Mon‑start) week (maps to Thu‑Sun pattern you want)
- Tier 3: warns when >1 booked per calendar month

Next steps to automate slot‑filling and task generation:
A) Create a Postgres function or edge function to "propose" open slots based on quotas (Thu=1,Fri=1,Sat=2,Sun=2 for tier2; monthly=1 for tier3; any day for tier1 until daily cap).
   - The function returns candidate start_at per slot bucket (Morning/Afternoon/Evening) and type.
B) Add a button "Auto‑fill open slots" that inserts placeholder planned events for each suggested slot.
C) Task generation service (cron) reads task_templates and injects tasks for upcoming weeks:
   - Deliveries on 13th & 28th (10:00)
   - Order Ice Cream (Tue 09:00)
   - Order Fudge (Tue 11:00)
   - Cook Fudge (Mon & Tue following the Order week)
   - Package Fudge (2 days after each Cook day)
   - For each delivery, compute boxes_required from your delivery schedule (join against wholesale orders or a manual "deliveries" table). Store in tasks.metadata.boxes_required. As you package, check off until target is met.

Printing menus:
- Upload PDFs to Supabase Storage and set event_types.menu_public_url.
- The button opens the file in a new tab for printing.

Assignments:
- Click staff chips to assign. Two staff minimum is expressed by event_types.staff_required; we can block saving if assigned < required.
*/
