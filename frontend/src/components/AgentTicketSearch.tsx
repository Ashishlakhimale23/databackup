// Key/value filter search engine for tickets - AGENT.
//
// AGENT access: only tickets assigned to them, or raised by them - never
// the full department queue. GET /tickets already enforces this
// server-side (see the AGENT branch in ticket.controller.ts's list()),
// and AdvancedTicketFilters mirrors it client-side as a second, cheap
// safety net. Same "fetch once, filter client-side" shape as the
// GLOBAL_ADMIN (GlobalAdminTicketSearch.tsx), HOD (ManagerDashboard.tsx),
// and CXO (CxoDashboard.tsx) searches - just scoped to one person's queue
// instead of a department or the whole company.
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, Search } from "lucide-react";
import { Department, Ticket as TicketType, PAGES } from "../types";
import { AdvancedTicketFilters, FilterOption } from "./AdvancedTicketFilters";
import TicketsTable from "./TicketsTable";

interface AgentTicketSearchProps {
  token: string;
  currentUser: { id: string; fullName: string };
  setSelectedTicketId: (id: string) => void;
  setCurrentView: (view: string) => void;
  apiFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const API_BASE = "http://localhost:3000";

export const AgentTicketSearch: React.FC<AgentTicketSearchProps> = ({
  token,
  currentUser,
  setSelectedTicketId,
  setCurrentView,
  apiFetch,
}) => {
  const requestFn = apiFetch || window.fetch;

  const [myTickets, setMyTickets] = useState<TicketType[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<TicketType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // GET /tickets for an AGENT is already scoped server-side to
  // { assigneeId: me } OR { requesterId: me } - no departmentId param
  // needed/allowed, the agent doesn't get to browse other people's queues.
  const fetchMyTickets = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await requestFn(`${API_BASE}/tickets?limit=500`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMyTickets(data.items || []);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to load your tickets");
      }
    } catch {
      setError("Failed to load your tickets");
    } finally {
      setLoading(false);
    }
  };

  // Department names for the filter dropdown - fetched here rather than
  // relying on a parent that may not have loaded the list yet for this
  // view. An agent only ever has one department in practice, but the
  // dropdown itself is still narrowed to whatever appears on their own
  // tickets (see availableDepartments in AdvancedTicketFilters).
  const fetchDepartments = async () => {
    try {
      const res = await requestFn(`${API_BASE}/departments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data || []);
      }
    } catch {
      // Non-fatal - department filter options just fall back to "not yet loaded".
    }
  };

  useEffect(() => {
    fetchMyTickets();
    fetchDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Category/department options for the filter dropdowns - derived from
  // whatever actually shows up on this agent's own tickets, not a
  // separate master-list fetch.
  const categoryOptions: FilterOption[] = useMemo(() => {
    const map = new Map<string, string>();
    myTickets.forEach((t) => {
      if (t.categoryId && t.category?.name) map.set(t.categoryId, t.category.name);
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [myTickets]);

  const departmentOptions: FilterOption[] = useMemo(
    () => departments.map((d) => ({ id: d.id, name: d.name })),
    [departments]
  );

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-slate-900 text-white rounded-xl">
              <Search size={16} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">My Tickets</h1>
              <p className="text-sm text-slate-500 mt-1">
                Search and filter tickets assigned to you, or raised by you.
              </p>
            </div>
          </div>

          <button
            onClick={fetchMyTickets}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer flex items-center gap-1.5 transition-all bg-white shrink-0"
          >
            <RotateCcw size={14} /> Refresh
          </button>
        </div>
      </div>

      <AdvancedTicketFilters
        tickets={myTickets}
        departments={departmentOptions}
        categories={categoryOptions}
        onFilteredTicketsChange={setFilteredTickets}
        userRole="AGENT"
        userId={currentUser.id}
      />

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2 rounded-xl">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-400">
          Loading your tickets...
        </div>
      ) : (
        <TicketsTable
          tickets={filteredTickets}
          currentView={PAGES.AGENT_TICKET_SEARCH}
          setSelectedTicketId={setSelectedTicketId as any}
          setCurrentView={setCurrentView as any}
        />
      )}
    </div>
  );
};

export default AgentTicketSearch;
