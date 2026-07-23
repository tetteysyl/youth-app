"use client";
import { authFetch } from "@/lib/auth-fetch";
import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/lib/store";
import { can, ROLE_LABELS, Role } from "@/lib/roles";
import { ELECTABLE_POSITIONS, MONTH_NAMES, STATUS_LABELS, ElectionStatus } from "@/lib/elections";
import {
  Vote, Plus, Trash2, X, Check, Loader2, AlertTriangle, Play, Square,
  Trophy, Users, ChevronRight, BarChart3,
} from "lucide-react";
import toast from "react-hot-toast";

type Election = { id: string; title: string; year: number; status: ElectionStatus; positions: Role[]; createdAt?: number | null };
type Candidate = { id: string; memberId: string; memberName: string; photoURL?: string | null; position: Role };
type Eligibility = { eligible: boolean; unpaidMonths: number[]; monthsChecked: number };
type Member = { id: string; displayName?: string; role?: Role };

const STATUS_STYLE: Record<ElectionStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  open: "bg-green-100 text-green-700",
  closed: "bg-purple-100 text-purple-700",
};

export default function ElectionsPage() {
  const { user } = useAuthStore();
  const [elections, setElections] = useState<Election[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ election: Election; candidates: Candidate[]; votedPositions: Role[]; eligibility: Eligibility; isVoter: boolean } | null>(null);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddCand, setShowAddCand] = useState<Role | null>(null);

  const isManager = user ? can.manageElections(user.role) : false;

  const loadList = useCallback(async () => {
    const list = await authFetch("/api/elections", { cache: "no-store" }).then((r) => r.json());
    const arr: Election[] = Array.isArray(list) ? list : [];
    setElections(arr);
    setLoading(false);
    // default to the open one, else the newest
    setSelected((cur) => cur ?? (arr.find((e) => e.status === "open")?.id ?? arr[0]?.id ?? null));
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const d = await authFetch(`/api/elections?id=${id}`, { cache: "no-store" }).then((r) => r.json());
    if (!d?.error) setDetail(d);
    const r = await authFetch(`/api/elections/results?id=${id}`, { cache: "no-store" }).then((x) => x.json());
    setResults(r?.error ? null : r);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (selected) loadDetail(selected); }, [selected, loadDetail]);

  const refresh = async () => { await loadList(); if (selected) await loadDetail(selected); };

  const setStatus = async (id: string, action: "open" | "close") => {
    setBusy(true);
    try {
      const res = await authFetch("/api/elections", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(action === "open" ? "Voting is now open" : "Election closed");
      await refresh();
    } catch (e: any) { toast.error(e.message || "Failed"); } finally { setBusy(false); }
  };

  const removeElection = async (id: string) => {
    if (!confirm("Delete this draft election?")) return;
    try {
      const res = await authFetch("/api/elections", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Draft deleted");
      setSelected(null); setDetail(null);
      await loadList();
    } catch (e: any) { toast.error(e.message || "Failed"); }
  };

  const castVote = async (position: Role, candidateId: string) => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await authFetch("/api/elections/vote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electionId: detail.election.id, position, candidateId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Vote recorded for ${ROLE_LABELS[position]}`);
      await loadDetail(detail.election.id);
    } catch (e: any) { toast.error(e.message || "Failed to vote"); } finally { setBusy(false); }
  };

  const removeCandidate = async (candidateId: string) => {
    if (!detail) return;
    try {
      const res = await authFetch("/api/elections/candidates", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electionId: detail.election.id, candidateId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await loadDetail(detail.election.id);
    } catch (e: any) { toast.error(e.message || "Failed"); }
  };

  if (loading) return <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin mx-auto mb-2" /> Loading elections…</div>;

  const el = detail?.election;
  const votesByPosition = (p: Role) => (detail?.candidates ?? []).filter((c) => c.position === p);
  const hasVoted = (p: Role) => (detail?.votedPositions ?? []).includes(p);

  return (
    <div className="page-enter space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #3b1f6e, #2a1550)" }}>
            <Vote size={22} className="text-[#f0c940]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Elections</h1>
            <p className="text-gray-500 text-sm">Elect the guild executives</p>
          </div>
        </div>
        {isManager && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-[#3b1f6e] text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#2a1550] shrink-0">
            <Plus size={15} /> New Election
          </button>
        )}
      </div>

      {elections.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
          <Vote size={38} className="mx-auto mb-3 text-gray-200" />
          <p className="text-gray-500 text-sm">No elections yet.</p>
          {isManager && <p className="text-gray-400 text-xs mt-1">Create one to get started.</p>}
        </div>
      )}

      {/* Election selector */}
      {elections.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {elections.map((e) => (
            <button key={e.id} onClick={() => { setSelected(e.id); setDetail(null); setResults(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                selected === e.id ? "border-[#3b1f6e] bg-[#3b1f6e] text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}>
              {e.title} <span className="opacity-70">· {e.year}</span>
            </button>
          ))}
        </div>
      )}

      {el && (
        <>
          {/* Election header card */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-semibold text-gray-800">{el.title}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[el.status]}`}>
                    {STATUS_LABELS[el.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Dues year {el.year} · {el.positions.length} position{el.positions.length !== 1 ? "s" : ""}
                  {results?.ballotsCast != null && <> · {results.ballotsCast} ballot{results.ballotsCast !== 1 ? "s" : ""} cast</>}
                </p>
              </div>
              {isManager && (
                <div className="flex gap-2">
                  {el.status === "draft" && (
                    <>
                      <button onClick={() => setStatus(el.id, "open")} disabled={busy}
                        className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                        <Play size={13} /> Open voting
                      </button>
                      <button onClick={() => removeElection(el.id)}
                        className="flex items-center gap-1.5 text-red-500 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50">
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  )}
                  {el.status === "open" && (
                    <button onClick={() => setStatus(el.id, "close")} disabled={busy}
                      className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50">
                      <Square size={13} /> Close election
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Eligibility banner (voters only, while open) */}
          {el.status === "open" && detail?.isVoter && !detail.eligibility.eligible && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">You cannot vote in this election</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  You are owing {el.year} dues for{" "}
                  <strong>{detail.eligibility.unpaidMonths.map((m) => MONTH_NAMES[m - 1]).join(", ")}</strong>.
                  Settle your dues with the Financial Secretary to become eligible.
                </p>
              </div>
            </div>
          )}
          {el.status === "open" && detail?.isVoter && detail.eligibility.eligible && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
              <Check size={16} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-800">You are eligible to vote — one vote per position.</p>
            </div>
          )}
          {el.status === "open" && detail && !detail.isVoter && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-500">
              This account does not cast votes — it organises the election.
            </div>
          )}

          {/* Ballot / candidate list per position */}
          <div className="space-y-4">
            {el.positions.map((position) => {
              const cands = votesByPosition(position);
              const voted = hasVoted(position);
              const res = results?.positions?.find((p: any) => p.position === position);
              const showCounts = el.status === "closed" || (isManager && el.status === "open");

              return (
                <div key={position} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-gray-800 text-sm">{ROLE_LABELS[position]}</h3>
                    <div className="flex items-center gap-2">
                      {voted && el.status === "open" && (
                        <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <Check size={11} /> Voted
                        </span>
                      )}
                      {el.status === "closed" && res?.winner && (
                        <span className="text-xs bg-[#f0c940] text-[#3b1f6e] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                          <Trophy size={11} /> {res.winner.memberName}
                        </span>
                      )}
                      {el.status === "closed" && res?.tied && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Tie</span>
                      )}
                      {isManager && el.status === "draft" && (
                        <button onClick={() => setShowAddCand(position)}
                          className="text-xs text-[#3b1f6e] hover:underline flex items-center gap-1">
                          <Plus size={12} /> Add candidate
                        </button>
                      )}
                    </div>
                  </div>

                  {cands.length === 0 ? (
                    <p className="text-center py-6 text-gray-400 text-sm">No candidates yet</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {cands.map((c) => {
                        const cRes = res?.candidates?.find((x: any) => x.candidateId === c.id);
                        const total = res?.totalVotes ?? 0;
                        const pct = showCounts && total > 0 ? Math.round(((cRes?.votes ?? 0) / total) * 100) : 0;
                        const canVote = el.status === "open" && detail?.isVoter && detail.eligibility.eligible && !voted;

                        return (
                          <div key={c.id} className="p-3 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#3b1f6e] flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden">
                              {c.photoURL ? <img src={c.photoURL} alt="" className="w-full h-full object-cover" /> : c.memberName?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{c.memberName}</p>
                              {showCounts && (
                                <div className="mt-1">
                                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div className="h-full bg-[#3b1f6e]" style={{ width: `${pct}%` }} />
                                  </div>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {cRes?.votes ?? 0} vote{(cRes?.votes ?? 0) !== 1 ? "s" : ""} · {pct}%
                                  </p>
                                </div>
                              )}
                            </div>
                            {canVote && (
                              <button onClick={() => castVote(position, c.id)} disabled={busy}
                                className="bg-[#3b1f6e] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#2a1550] disabled:opacity-50 shrink-0">
                                Vote
                              </button>
                            )}
                            {isManager && el.status === "draft" && (
                              <button onClick={() => removeCandidate(c.id)} className="p-1.5 text-gray-300 hover:text-red-500 shrink-0">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {el.status === "open" && isManager && (
            <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
              <BarChart3 size={12} /> Live counts are visible to organisers only — members see results after closing.
            </p>
          )}
        </>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={async (id) => { setShowCreate(false); await loadList(); setSelected(id); }} />}
      {showAddCand && detail && (
        <AddCandidateModal
          electionId={detail.election.id}
          position={showAddCand}
          existing={detail.candidates.filter((c) => c.position === showAddCand).map((c) => c.memberId)}
          onClose={() => setShowAddCand(null)}
          onAdded={async () => { setShowAddCand(null); await loadDetail(detail.election.id); }}
        />
      )}
    </div>
  );
}

/* ── Create election ── */
function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const year = new Date().getFullYear();
  const [title, setTitle] = useState(`${year} Executive Elections`);
  const [yr, setYr] = useState(year);
  const [positions, setPositions] = useState<Role[]>([...ELECTABLE_POSITIONS]);
  const [saving, setSaving] = useState(false);

  const toggle = (p: Role) => setPositions((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const save = async () => {
    if (!title.trim() || positions.length === 0) { toast.error("Title and at least one position are required"); return; }
    setSaving(true);
    try {
      const res = await authFetch("/api/elections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, year: yr, positions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Election created as a draft");
      onCreated(data.id);
    } catch (e: any) { toast.error(e.message || "Failed"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">New Election</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dues year (decides who may vote)</label>
            <select value={yr} onChange={(e) => setYr(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]">
              {[year, year - 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Members owing any elapsed month of this year cannot vote.</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Positions being contested</p>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-50 max-h-52 overflow-y-auto">
              {ELECTABLE_POSITIONS.map((p) => (
                <label key={p} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={positions.includes(p)} onChange={() => toggle(p)} className="accent-[#3b1f6e]" />
                  <span className="text-sm text-gray-700">{ROLE_LABELS[p]}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Evangelism Coordinator is appointed, not elected, so it is not listed.</p>
          </div>
        </div>
        <div className="p-4 border-t border-gray-100">
          <button onClick={save} disabled={saving}
            className="w-full bg-[#3b1f6e] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#2a1550] disabled:opacity-50">
            {saving ? "Creating…" : "Create draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add candidate ── */
function AddCandidateModal({ electionId, position, existing, onClose, onAdded }: {
  electionId: string; position: Role; existing: string[]; onClose: () => void; onAdded: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/get-members").then((r) => r.json()).then((m) => setMembers(Array.isArray(m) ? m : []));
  }, []);

  const add = async (memberId: string) => {
    setSaving(memberId);
    try {
      const res = await authFetch("/api/elections/candidates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electionId, memberId, position }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Candidate added");
      onAdded();
    } catch (e: any) { toast.error(e.message || "Failed"); } finally { setSaving(null); }
  };

  const list = members.filter((m) =>
    !existing.includes(m.id) &&
    (!q || (m.displayName ?? "").toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Add candidate</h3>
            <p className="text-xs text-gray-400">{ROLE_LABELS[position]}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-3 border-b border-gray-100">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {list.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">No members available</p>}
          {list.map((m) => (
            <button key={m.id} onClick={() => add(m.id)} disabled={saving === m.id}
              className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left disabled:opacity-50">
              <div className="w-8 h-8 rounded-full bg-[#3b1f6e] flex items-center justify-center text-white font-bold text-xs shrink-0">
                {m.displayName?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{m.displayName}</p>
                <p className="text-xs text-gray-400">{m.role ? ROLE_LABELS[m.role] : "Member"}</p>
              </div>
              <ChevronRight size={15} className="text-gray-300 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
