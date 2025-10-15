import React, { useEffect, useMemo, useState } from 'react';
import FullCalendar, { DateSelectArg, EventClickArg } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar as CalIcon,
  Plus,
  Trash2,
  Users,
  FileText,
  Clock,
  AlertTriangle,
  Printer,
  CheckCircle2,
  Circle,
  Truck,
  ChefHat,
  Package,
  ShoppingCart,
  UserPlus,
  Minus
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

type DeliveryPlan = {
  date: Date;
  steps: {
    key: string;
    label: string;
    due: Date;
    icon: React.ComponentType<{ className?: string }>;
    task: TaskRow | null;
    status: TaskRow['status'] | 'missing';
    sequence?: number;
  }[];
};

// =====================================
// Helpers & Constants
// =====================================

const HARD_DAILY_MAX = 6; // no more than 6 events of any type per day
const SLOTS_PER_DAY = 3; // Morning / Afternoon / Evening conceptual capacity

type SlotName = 'Morning' | 'Afternoon' | 'Evening';

const SLOT_SEQUENCE: SlotName[] = ['Morning', 'Afternoon', 'Evening'];

const SLOT_TIMES: Record<SlotName, { startHour: number; endHour: number }> = {
  Morning: { startHour: 9, endHour: 12 },
  Afternoon: { startHour: 13, endHour: 16 },
  Evening: { startHour: 17, endHour: 20 },
};

const WEEKEND_REQUIREMENT: Record<number, number> = {
  4: 1, // Thursday
  5: 1, // Friday
  6: 2, // Saturday
  0: 2, // Sunday
};

const slotOf = (dateIso: string): SlotName => {
  const h = new Date(dateIso).getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
};

const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '');
const fmtMoney = (n?: number | null) => (typeof n === 'number' ? `$${n.toLocaleString()}` : '—');
const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const sameDay = (a: Date | string, b: Date | string) => {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
};

const previousWeekday = (date: Date, weekday: number) => {
  const result = new Date(date);
  while (result.getDay() !== weekday) {
    result.setDate(result.getDate() - 1);
  }
  return result;
};

const weekKey = (date: Date) => {
  const x = new Date(date);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
};

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
    const problems: string[] = [];
    const activeEvents = events.filter(ev => ev.status !== 'canceled');
    const now = startOfDay(new Date());

    const byDay = new Map<string, number>();
    const slotUsage = new Map<string, Set<SlotName>>();
    const tier2Weekend = new Map<string, Map<number, number>>();
    const tier3Monthly = new Map<string, number>();

    activeEvents.forEach(ev => {
      const start = new Date(ev.start_at);
      const dayKey = start.toISOString().slice(0, 10);
      byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1);

      if (!slotUsage.has(dayKey)) slotUsage.set(dayKey, new Set());
      slotUsage.get(dayKey)!.add(slotOf(ev.start_at));

      const et = eventTypes.find(t => t.id === ev.type_id);
      if (!et) return;

      if (et.tier === 2) {
        const wk = weekKey(start);
        if (!tier2Weekend.has(wk)) tier2Weekend.set(wk, new Map());
        const bucket = tier2Weekend.get(wk)!;
        const day = start.getDay();
        bucket.set(day, (bucket.get(day) || 0) + 1);
      }

      if (et.tier === 3) {
        const mk = `${start.getFullYear()}-${start.getMonth() + 1}`;
        tier3Monthly.set(mk, (tier3Monthly.get(mk) || 0) + 1);
      }
    });

    for (const [day, count] of byDay) {
      if (count > HARD_DAILY_MAX) problems.push(`Over daily max (${count}/${HARD_DAILY_MAX}) on ${day}`);
    }

    for (let offset = 0; offset < 30; offset++) {
      const date = addDays(now, offset);
      const key = date.toISOString().slice(0, 10);
      const filled = slotUsage.get(key)?.size || 0;
      if (date >= now && filled > 0 && filled < SLOTS_PER_DAY) {
        problems.push(`${SLOTS_PER_DAY - filled} open slot(s) remaining on ${key}`);
      }
    }

    const tier2Horizon = addDays(now, 35);
    const requirementEntries = Object.entries(WEEKEND_REQUIREMENT).map(([day, qty]) => [Number(day), qty] as [number, number]);
    const requiredTotal = requirementEntries.reduce((sum, [, qty]) => sum + qty, 0);

    for (let weekOffset = 0; weekOffset < 6; weekOffset++) {
      const weekStart = addDays(now, weekOffset * 7);
      if (weekStart > tier2Horizon) break;
      const wk = weekKey(weekStart);
      const counts = tier2Weekend.get(wk) || new Map();
      const haveTotal = requirementEntries.reduce((sum, [day]) => sum + (counts.get(day) || 0), 0);

      if (haveTotal < requiredTotal) {
        problems.push(`Tier-2 weekend plan short ${requiredTotal - haveTotal} event(s) for week of ${weekStart.toLocaleDateString()}`);
      }

      requirementEntries.forEach(([day, required]) => {
        const have = counts.get(day) || 0;
        if (have < required) {
          const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          problems.push(`Need ${required - have} more tier-2 event(s) on ${labels[day]} for week of ${weekStart.toLocaleDateString()}`);
        }
      });
    }

    for (let m = 0; m < 3; m++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const key = `${monthDate.getFullYear()}-${monthDate.getMonth() + 1}`;
      const count = tier3Monthly.get(key) || 0;
      if (count === 0) {
        problems.push(`No tier-3 event scheduled for ${monthDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}`);
      }
      if (count > 1) {
        problems.push(`Tier-3 over monthly quota (${count}/1) in ${monthDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}`);
      }
    }

    return problems;
  }, [events, eventTypes]);

  const openSlots = useMemo(() => {
    const now = startOfDay(new Date());
    const slots: {
      dateIso: string;
      slot: SlotName;
      blocked: boolean;
      reason?: string;
      dayLabel: string;
    }[] = [];

    for (let offset = 0; offset < 30; offset++) {
      const date = addDays(now, offset);
      const dayKey = date.toISOString().slice(0, 10);
      const dayEvents = events.filter(ev => ev.status !== 'canceled' && ev.start_at.slice(0, 10) === dayKey);
      const filled = new Set<SlotName>();
      dayEvents.forEach(ev => filled.add(slotOf(ev.start_at)));
      const hasHigherTier = dayEvents.some(ev => {
        const et = eventTypes.find(t => t.id === ev.type_id);
        return et ? et.tier >= 2 : false;
      });

      SLOT_SEQUENCE.forEach(slot => {
        if (!filled.has(slot)) {
          slots.push({
            dateIso: startOfDay(date).toISOString(),
            slot,
            blocked: hasHigherTier,
            reason: hasHigherTier ? 'Higher tier event scheduled' : undefined,
            dayLabel: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
          });
        }
      });
    }

    return slots;
  }, [events, eventTypes]);

  const tasksByDate = useMemo(() => {
    const sorted = [...tasks].sort(
      (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
    );
    const map = new Map<string, TaskRow[]>();
    sorted.forEach(task => {
      const key = new Date(task.due_at).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    });
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
  }, [tasks]);

  const deliveryPlans = useMemo<DeliveryPlan[]>(() => {
    const now = startOfDay(new Date());
    const deliveries = tasks
      .filter(t => t.metadata?.kind === 'delivery')
      .map(task => ({ task, dueDate: startOfDay(new Date(task.due_at)) }))
      .filter(({ dueDate }) => dueDate >= addDays(now, -1))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    const deliveryMap = new Map<string, TaskRow>();
    deliveries.forEach(({ task, dueDate }) => {
      deliveryMap.set(dueDate.toISOString(), task);
    });

    const dateCandidates: Date[] = [];
    const monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
    while (dateCandidates.length < 6) {
      const d13 = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 13);
      if (d13 >= now) dateCandidates.push(d13);
      const d28 = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 28);
      if (d28 >= now) dateCandidates.push(d28);
      monthCursor.setMonth(monthCursor.getMonth() + 1);
    }
    dateCandidates.sort((a, b) => a.getTime() - b.getTime());

    const findTask = (kind: string, due: Date, sequence?: number) => {
      return (
        tasks.find(t => {
          const dueDate = startOfDay(new Date(t.due_at));
          if (!sameDay(dueDate, due)) return false;
          if (t.metadata?.kind === kind) {
            if (sequence != null) {
              return (
                t.metadata?.sequence === sequence ||
                t.metadata?.day === sequence ||
                t.metadata?.batch === sequence
              );
            }
            return true;
          }
          const title = (t.title || '').toLowerCase();
          switch (kind) {
            case 'order-ice-cream':
              return title.includes('order') && title.includes('ice');
            case 'order-fudge':
              return title.includes('order') && title.includes('fudge');
            case 'cook-fudge':
              if (!(title.includes('cook') || title.includes('make'))) return false;
              if (!title.includes('fudge')) return false;
              if (sequence != null) {
                return title.includes(`day ${sequence}`) || title.includes(`batch ${sequence}`);
              }
              return true;
            case 'package-fudge':
              return title.includes('package') && title.includes('fudge');
            case 'delivery':
              return title.includes('delivery');
            default:
              return false;
          }
        }) || null
      );
    };

    return dateCandidates.slice(0, 4).map(date => {
      const dayIso = startOfDay(date).toISOString();
      const deliveryTask = deliveryMap.get(dayIso) || findTask('delivery', date);
      const packageDate = addDays(date, -1);
      const cookDay2 = addDays(packageDate, -2);
      const cookDay1 = addDays(cookDay2, -1);
      const orderDate = previousWeekday(addDays(date, -1), 2);

      const steps: DeliveryPlan['steps'] = [
        {
          key: 'order-ice-cream',
          label: 'Order Ice Cream',
          due: orderDate,
          icon: ShoppingCart,
          task: findTask('order-ice-cream', orderDate),
          status: 'missing',
        },
        {
          key: 'order-fudge',
          label: 'Order Fudge',
          due: orderDate,
          icon: ShoppingCart,
          task: findTask('order-fudge', orderDate),
          status: 'missing',
        },
        {
          key: 'cook-fudge-1',
          label: 'Cook Fudge Day 1',
          due: cookDay1,
          icon: ChefHat,
          task: findTask('cook-fudge', cookDay1, 1),
          status: 'missing',
          sequence: 1,
        },
        {
          key: 'cook-fudge-2',
          label: 'Cook Fudge Day 2',
          due: cookDay2,
          icon: ChefHat,
          task: findTask('cook-fudge', cookDay2, 2),
          status: 'missing',
          sequence: 2,
        },
        {
          key: 'package-fudge',
          label: 'Package & Box',
          due: packageDate,
          icon: Package,
          task: findTask('package-fudge', packageDate),
          status: 'missing',
        },
        {
          key: 'delivery',
          label: 'Delivery Run',
          due: date,
          icon: Truck,
          task: deliveryTask || findTask('delivery', date),
          status: 'missing',
        },
      ].map(step => ({
        ...step,
        status: step.task ? step.task.status : 'missing',
      }));

      return { date, steps };
    });
  }, [tasks]);

  // -------------------------------------
  // Form helpers
  // -------------------------------------
  const resetForm = (startISO?: string, endISO?: string) => {
    setForm({
      type_id: defaultTypeId,
      title: '',
      description: '',
      start_at: startISO || '',
      end_at: endISO || '',
      location: '',
      status: 'planned',
      staff_needed: 1,
      entry_fee: 0,
    });
    setEditing(null);
  };

  const openCreateAt = (dateStr?: string, slot?: SlotName) => {
    if (dateStr) {
      const base = new Date(dateStr);
      if (slot) {
        const cfg = SLOT_TIMES[slot];
        base.setHours(cfg.startHour, 0, 0, 0);
        const end = new Date(base);
        end.setHours(cfg.endHour, 0, 0, 0);
        resetForm(base.toISOString(), end.toISOString());
      } else {
        base.setHours(9, 0, 0, 0);
        const end = new Date(base);
        end.setHours(12, 0, 0, 0);
        resetForm(base.toISOString(), end.toISOString());
      }
    } else {
      const now = new Date();
      now.setMinutes(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(now.getHours() + 3);
      resetForm(now.toISOString(), end.toISOString());
    }
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

  const updateTaskRow = async (taskId: UUID, patch: Partial<TaskRow>) => {
    await supabase.from('tasks').update(patch).eq('id', taskId);
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, ...patch } : t)));
  };

  const toggleTaskStatus = async (task: TaskRow) => {
    const nextStatus = task.status === 'done' ? 'open' : 'done';
    await updateTaskRow(task.id, { status: nextStatus });
  };

  const toggleTaskChecklist = async (task: TaskRow, idx: number) => {
    const next = (task.checklist || []).map((item, i) =>
      i === idx ? { ...item, checked: !item.checked } : item
    );
    await updateTaskRow(task.id, { checklist: next } as any);
  };

  const assignTaskOwner = async (task: TaskRow, staffId: UUID | null) => {
    await updateTaskRow(task.id, { assigned_to: staffId });
  };

  const updateTaskMetadata = async (task: TaskRow, patch: Record<string, any>) => {
    const next = { ...(task.metadata || {}), ...patch };
    await updateTaskRow(task.id, { metadata: next } as any);
  };

  const adjustTaskBoxes = async (task: TaskRow, delta: number) => {
    const required = task.metadata?.boxes_required ?? 0;
    if (!required) return;
    const current = task.metadata?.boxes_packed ?? 0;
    const next = clamp(current + delta, 0, required);
    await updateTaskMetadata(task, { boxes_packed: next });
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
    info.el.style.position = 'relative';

    const existingBadge = info.el.querySelector('[data-slot-badge]');
    if (existingBadge) existingBadge.remove();
    info.el.querySelectorAll('[data-slot-row]').forEach((el: Element) => el.remove());

    const badge = document.createElement('div');
    badge.setAttribute('data-slot-badge', 'true');
    badge.className = 'absolute top-1 right-1 text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-gray-700 shadow-sm';
    badge.innerText = `${count}/${HARD_DAILY_MAX}`;
    info.el.appendChild(badge);

    const slotWrapper = document.createElement('div');
    slotWrapper.className = 'mt-5 space-y-1 text-[10px] flex flex-col';

    const hasHigherTier = dayEvents.some(ev => {
      const et = eventTypes.find(t => t.id === ev.type_id);
      return et ? et.tier >= 2 : false;
    });

    SLOT_SEQUENCE.forEach(slot => {
      const row = document.createElement('div');
      row.setAttribute('data-slot-row', 'true');
      row.className = 'flex items-center justify-between gap-1 rounded-md bg-white/60 px-2 py-1 shadow-sm';

      const label = document.createElement('span');
      label.className = 'font-semibold text-gray-700';
      label.innerText = slot;
      row.appendChild(label);

      const occupying = dayEvents.filter(ev => slotOf(ev.start_at) === slot);
      if (occupying.length > 0) {
        const sorted = occupying
          .slice()
          .sort((a, b) => {
            const tierA = eventTypes.find(t => t.id === a.type_id)?.tier || 0;
            const tierB = eventTypes.find(t => t.id === b.type_id)?.tier || 0;
            return tierB - tierA;
          });
        const primary = sorted[0];
        const et = eventTypes.find(t => t.id === primary.type_id);
        const tag = document.createElement('span');
        tag.className = 'truncate text-[10px] text-gray-700 font-medium';
        tag.innerText = `${primary.title}${et ? ` • ${et.name}` : ''}`;
        row.appendChild(tag);
      } else if (hasHigherTier) {
        const hold = document.createElement('span');
        hold.className = 'text-[10px] text-rose-600 font-medium';
        hold.innerText = 'Hold for high-tier event';
        row.appendChild(hold);
      } else if (count >= HARD_DAILY_MAX) {
        const full = document.createElement('span');
        full.className = 'text-[10px] text-gray-500';
        full.innerText = 'Daily max reached';
        row.appendChild(full);
      } else {
        const btn = document.createElement('button');
        btn.className = 'text-[10px] text-blue-600 hover:underline';
        btn.innerText = 'Book';
        btn.onclick = (e: any) => {
          e.preventDefault();
          e.stopPropagation();
          openCreateAt(info.date.toISOString(), slot);
        };
        row.appendChild(btn);
      }

      slotWrapper.appendChild(row);
    });

    info.el.appendChild(slotWrapper);
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

      {/* Capacity & Tasks */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 space-y-4">
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-800">Open Slots (next 30 days)</h3>
              </div>
              {openSlots.length > 9 && (
                <span className="text-xs text-gray-500">Showing first 9 of {openSlots.length} opportunities</span>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {openSlots.length === 0 ? (
                <div className="rounded-xl bg-white/60 px-4 py-3 text-sm text-gray-500">
                  All future slots are currently booked.
                </div>
              ) : (
                openSlots.slice(0, 9).map(slot => (
                  <div
                    key={`${slot.dateIso}-${slot.slot}`}
                    className="rounded-xl bg-white/60 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{slot.dayLabel}</div>
                      <div className="text-xs text-gray-600">{slot.slot} window</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {slot.blocked && (
                        <span className="text-xs text-rose-600 font-medium">{slot.reason}</span>
                      )}
                      <button
                        className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                          slot.blocked
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'glass-button'
                        }`}
                        disabled={slot.blocked}
                        onClick={() => openCreateAt(slot.dateIso, slot.slot)}
                      >
                        Schedule
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-800">Delivery & Production Planner</h3>
            </div>
            <div className="space-y-3">
              {deliveryPlans.length === 0 ? (
                <div className="rounded-xl bg-white/60 px-4 py-3 text-sm text-gray-500">
                  No upcoming delivery milestones scheduled.
                </div>
              ) : (
                deliveryPlans.map(plan => (
                  <div key={plan.date.toISOString()} className="rounded-xl border border-white/60 bg-white/60 p-4 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-gray-800">
                          Delivery on {plan.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-xs text-gray-600">
                          Two cook days + packaging must be completed before this run.
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {plan.steps.map(step => {
                        const Icon = step.icon;
                        const status = step.status;
                        const isLate = status !== 'done' && step.due < new Date();
                        const statusClasses =
                          status === 'done'
                            ? 'bg-emerald-100/80 border border-emerald-200 text-emerald-700'
                            : status === 'missing'
                            ? 'bg-rose-100/80 border border-rose-200 text-rose-700'
                            : status === 'skipped'
                            ? 'bg-gray-200 border border-gray-300 text-gray-600'
                            : 'bg-sky-100/80 border border-sky-200 text-sky-700';
                        const assignedName = step.task?.assigned_to
                          ? staff.find(s => s.id === step.task?.assigned_to)?.display_name
                          : null;
                        const boxesRequired = step.task?.metadata?.boxes_required;
                        const boxesPacked = step.task?.metadata?.boxes_packed ?? 0;
                        return (
                          <div
                            key={`${plan.date.toISOString()}-${step.key}`}
                            className={`rounded-xl px-3 py-2 flex flex-col gap-2 ${statusClasses}`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4" />
                              <div className="flex-1">
                                <div className="text-sm font-semibold">
                                  {step.label}
                                  {step.sequence ? ` (Day ${step.sequence})` : ''}
                                </div>
                                <div className="text-[11px] text-gray-700/80">
                                  Due {step.due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                  {isLate ? ' • overdue' : ''}
                                </div>
                                {assignedName && (
                                  <div className="text-[11px] text-gray-700/80">Assigned to {assignedName}</div>
                                )}
                              </div>
                              {step.task ? (
                                <button
                                  onClick={() => toggleTaskStatus(step.task!)}
                                  className="text-[11px] px-2 py-1 rounded-lg bg-white/60 text-gray-700 hover:bg-white"
                                >
                                  {step.task.status === 'done' ? 'Mark Open' : 'Mark Done'}
                                </button>
                              ) : (
                                <span className="text-[11px] font-medium">No task scheduled</span>
                              )}
                            </div>
                            {boxesRequired ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-[11px]">
                                  <Package className="w-3 h-3" />
                                  <span>
                                    {boxesPacked}/{boxesRequired} boxes packed
                                  </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-white/40 overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-500"
                                    style={{ width: `${Math.round((boxesPacked / boxesRequired) * 100)}%` }}
                                  />
                                </div>
                                {step.task && (
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => adjustTaskBoxes(step.task!, -1)}
                                      className="px-2 py-1 rounded-lg bg-white/60 text-gray-700 hover:bg-white"
                                      disabled={boxesPacked <= 0}
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => adjustTaskBoxes(step.task!, 1)}
                                      className="px-2 py-1 rounded-lg bg-white/60 text-gray-700 hover:bg-white"
                                      disabled={boxesPacked >= boxesRequired}
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-800">Task Queue</h3>
          </div>
          {tasksByDate.length === 0 ? (
            <div className="glass-card rounded-xl p-4 text-gray-500">No open tasks.</div>
          ) : (
            <div className="space-y-4">
              {tasksByDate.map(group => (
                <div key={group.date} className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    {new Date(group.date).toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                  <div className="space-y-2">
                    {group.items.map(task => {
                      const assignedName = task.assigned_to
                        ? staff.find(s => s.id === task.assigned_to)?.display_name
                        : null;
                      const boxesRequired = task.metadata?.boxes_required;
                      const boxesPacked = task.metadata?.boxes_packed ?? 0;
                      return (
                        <div
                          key={task.id}
                          className={`glass-card rounded-xl p-4 space-y-2 ${
                            task.status === 'done' ? 'opacity-75' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <button onClick={() => toggleTaskStatus(task)} className="mt-1">
                              {task.status === 'done' ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                              ) : (
                                <Circle className="w-5 h-5 text-gray-400" />
                              )}
                            </button>
                            <div className="flex-1 space-y-2">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-sm font-semibold text-gray-900">{task.title}</div>
                                    <div className="text-xs text-gray-600">
                                      Due {fmtDateTime(task.due_at)}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 text-xs">
                                    <UserPlus className="w-3 h-3 text-gray-500" />
                                    <select
                                      value={task.assigned_to || ''}
                                      onChange={e => assignTaskOwner(task, e.target.value ? (e.target.value as UUID) : null)}
                                      className="glass-input px-2 py-1 text-xs rounded-lg"
                                    >
                                      <option value="">Unassigned</option>
                                      {staff.map(member => (
                                        <option key={member.id} value={member.id}>
                                          {member.display_name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                {assignedName && (
                                  <div className="text-xs text-gray-600">Assigned to {assignedName}</div>
                                )}
                              </div>

                              {task.details && (
                                <div className="text-xs text-gray-600 leading-snug">{task.details}</div>
                              )}

                              {boxesRequired ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-xs text-gray-700">
                                    <Package className="w-4 h-4" />
                                    <span>
                                      {boxesPacked}/{boxesRequired} boxes packed
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-500"
                                      style={{ width: `${Math.round((boxesPacked / boxesRequired) * 100)}%` }}
                                    />
                                  </div>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => adjustTaskBoxes(task, -1)}
                                      className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                                      disabled={boxesPacked <= 0}
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => adjustTaskBoxes(task, 1)}
                                      className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                                      disabled={boxesPacked >= boxesRequired}
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ) : null}

                              {task.checklist && task.checklist.length > 0 && (
                                <div className="space-y-1">
                                  <div className="text-xs font-semibold text-gray-700">Checklist</div>
                                  {task.checklist.map((item, idx) => (
                                    <label key={idx} className="flex items-center gap-2 text-xs text-gray-700">
                                      <input
                                        type="checkbox"
                                        checked={!!item.checked}
                                        onChange={() => toggleTaskChecklist(task, idx)}
                                      />
                                      <span>
                                        {item.item}
                                        {item.qty ? ` ×${item.qty}` : ''}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
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
