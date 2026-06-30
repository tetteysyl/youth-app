"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { Plus, TrendingUp, TrendingDown, DollarSign, FileText, Send } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

type Transaction = {
  id: string; type: "income" | "expense"; amount: number;
  description: string; date: string; category: string; recordedBy: string;
};

export default function FinancePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [statements, setStatements] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showStatementForm, setShowStatementForm] = useState(false);
  const [form, setForm] = useState({ type: "income", amount: "", description: "", date: "", category: "" });
  const [stmtForm, setStmtForm] = useState({ title: "", period: "", summary: "", totalIncome: "", totalExpense: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"transactions" | "statements">("transactions");

  useEffect(() => {
    if (!user || !can.viewFinance(user.role)) { router.replace("/dashboard"); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    const [txSnap, stmtSnap] = await Promise.all([
      getDocs(query(collection(db, "transactions"), orderBy("date", "desc"))),
      getDocs(query(collection(db, "financial_statements"), orderBy("publishedAt", "desc"))),
    ]);
    setTransactions(txSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)));
    setStatements(stmtSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addDoc(collection(db, "transactions"), {
        ...form,
        amount: parseFloat(form.amount),
        recordedBy: user?.displayName,
        createdAt: serverTimestamp(),
      });
      toast.success("Transaction recorded!");
      setForm({ type: "income", amount: "", description: "", date: "", category: "" });
      setShowForm(false);
      loadData();
    } catch { toast.error("Failed to save."); }
    finally { setSaving(false); }
  };

  const handlePublishStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addDoc(collection(db, "financial_statements"), {
        ...stmtForm,
        totalIncome: parseFloat(stmtForm.totalIncome),
        totalExpense: parseFloat(stmtForm.totalExpense),
        publishedBy: user?.displayName,
        publishedRole: user?.role,
        publishedAt: serverTimestamp(),
      });
      toast.success("Financial statement published to all members!");
      setStmtForm({ title: "", period: "", summary: "", totalIncome: "", totalExpense: "", notes: "" });
      setShowStatementForm(false);
      loadData();
    } catch { toast.error("Failed to publish."); }
    finally { setSaving(false); }
  };

  const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;

  const canEdit = user && can.editFinance(user.role);
  const canPublish = user && can.publishFinancialStatement(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Finance</h1>
          <p className="text-gray-500 text-sm">Guild financial records and statements</p>
        </div>
        <div className="flex gap-2">
          {canPublish && (
            <button onClick={() => setShowStatementForm(true)}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">
              <FileText size={16} /> Publish Statement
            </button>
          )}
          {canEdit && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-[#3b1f6e] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#2a1550]">
              <Plus size={16} /> Add Transaction
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-green-600" />
            <span className="text-xs text-green-600 font-medium">Total Income</span>
          </div>
          <p className="text-xl font-bold text-green-700">GH₵ {totalIncome.toLocaleString()}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={16} className="text-red-500" />
            <span className="text-xs text-red-500 font-medium">Total Expenses</span>
          </div>
          <p className="text-xl font-bold text-red-600">GH₵ {totalExpense.toLocaleString()}</p>
        </div>
        <div className={`rounded-xl p-4 border ${balance >= 0 ? "bg-blue-50 border-blue-100" : "bg-red-50 border-red-100"}`}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className={balance >= 0 ? "text-blue-600" : "text-red-500"} />
            <span className={`text-xs font-medium ${balance >= 0 ? "text-blue-600" : "text-red-500"}`}>Balance</span>
          </div>
          <p className={`text-xl font-bold ${balance >= 0 ? "text-blue-700" : "text-red-600"}`}>GH₵ {balance.toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-gray-200 p-1 w-fit">
        {["transactions", "statements"].map((t) => (
          <button key={t} onClick={() => setTab(t as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              tab === t ? "bg-[#3b1f6e] text-white shadow" : "text-gray-500 hover:text-gray-700"
            }`}>{t}</button>
        ))}
      </div>

      {/* Add Transaction Modal */}
      {showForm && (
        <div className="modal-overlay fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-800 mb-4">Record Transaction</h3>
            <form onSubmit={handleAddTransaction} className="space-y-3">
              <div className="flex rounded-lg bg-gray-100 p-1">
                {["income", "expense"].map((t) => (
                  <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                    className={`flex-1 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
                      form.type === t ? "bg-white shadow text-[#3b1f6e]" : "text-gray-500"
                    }`}>{t}</button>
                ))}
              </div>
              <input required type="number" placeholder="Amount (GH₵)" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
              <input required placeholder="Description" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
              <input placeholder="Category (e.g. Dues, Offering)" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
              <input required type="date" value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#3b1f6e] text-white py-2 rounded-lg text-sm disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Publish Statement Modal */}
      {showStatementForm && (
        <div className="modal-overlay fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md max-h-screen overflow-y-auto">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FileText size={18} className="text-green-600" /> Publish Financial Statement
            </h3>
            <form onSubmit={handlePublishStatement} className="space-y-3">
              <input required placeholder="Statement Title (e.g. Q1 2025 Report)" value={stmtForm.title}
                onChange={(e) => setStmtForm({ ...stmtForm, title: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              <input required placeholder="Period (e.g. January - March 2025)" value={stmtForm.period}
                onChange={(e) => setStmtForm({ ...stmtForm, period: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              <div className="grid grid-cols-2 gap-3">
                <input required type="number" placeholder="Total Income (GH₵)" value={stmtForm.totalIncome}
                  onChange={(e) => setStmtForm({ ...stmtForm, totalIncome: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                <input required type="number" placeholder="Total Expense (GH₵)" value={stmtForm.totalExpense}
                  onChange={(e) => setStmtForm({ ...stmtForm, totalExpense: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>
              <textarea required placeholder="Summary / highlights for this period..." value={stmtForm.summary}
                onChange={(e) => setStmtForm({ ...stmtForm, summary: e.target.value })}
                rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              <textarea placeholder="Additional notes (optional)" value={stmtForm.notes}
                onChange={(e) => setStmtForm({ ...stmtForm, notes: e.target.value })}
                rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowStatementForm(false)}
                  className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                  <Send size={14} /> {saving ? "Publishing..." : "Publish to All"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transactions Tab */}
      {tab === "transactions" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Transaction History</h2>
            {!canEdit && <p className="text-xs text-gray-400 mt-0.5">View only</p>}
          </div>
          <div className="divide-y divide-gray-50">
            {transactions.length === 0 && (
              <p className="text-center py-8 text-gray-400 text-sm">No transactions yet</p>
            )}
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-4">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  t.type === "income" ? "bg-green-100" : "bg-red-100"
                }`}>
                  {t.type === "income"
                    ? <TrendingUp size={16} className="text-green-600" />
                    : <TrendingDown size={16} className="text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{t.description}</p>
                  <p className="text-xs text-gray-400">
                    {t.date ? format(new Date(t.date), "MMM d, yyyy") : "—"} · {t.category} · {t.recordedBy}
                  </p>
                </div>
                <p className={`text-sm font-bold ${t.type === "income" ? "text-green-600" : "text-red-500"}`}>
                  {t.type === "income" ? "+" : "-"}GH₵{t.amount?.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statements Tab */}
      {tab === "statements" && (
        <div className="space-y-4">
          {statements.length === 0 && (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-100">
              <FileText size={40} className="mx-auto mb-3 opacity-40" />
              <p>No financial statements published yet</p>
            </div>
          )}
          {statements.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-800">{s.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Period: {s.period}</p>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Published</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-green-600">Income</p>
                  <p className="font-bold text-green-700">GH₵{s.totalIncome?.toLocaleString()}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-red-500">Expense</p>
                  <p className="font-bold text-red-600">GH₵{s.totalExpense?.toLocaleString()}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-blue-600">Balance</p>
                  <p className="font-bold text-blue-700">GH₵{(s.totalIncome - s.totalExpense)?.toLocaleString()}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-2">{s.summary}</p>
              {s.notes && <p className="text-xs text-gray-400 italic">{s.notes}</p>}
              <p className="text-xs text-gray-400 mt-3">Published by {s.publishedBy} ({s.publishedRole?.replace("_", " ")})</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
