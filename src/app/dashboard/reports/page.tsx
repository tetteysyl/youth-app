"use client";
import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { FileText, Download, Plus, Trash2, FileUp, AlignLeft, X, Clock, ThumbsUp, ThumbsDown } from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

type Report = {
  id: string; title: string; description: string;
  type: "pdf" | "text"; content?: string;
  fileUrl?: string | null; fileName?: string | null;
  status: "pending" | "published";
  publishedByName: string; publishedAt: number | null;
  submittedByName?: string; submittedAt?: number | null;
};

export default function ReportsPage() {
  const { user } = useAuthStore();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"text" | "pdf">("text");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canDraft = user && can.draftReport(user.role);
  const canApprove = user && can.approveReport(user.role);
  const canPublishDirectly = user && can.publishReport(user.role);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/reports");
    const data = await res.json();
    if (Array.isArray(data)) setReports(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setTitle(""); setDescription(""); setContent(""); setFile(null);
    setFormType("text"); setShowForm(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;
    setSaving(true);
    try {
      let res: Response;
      if (formType === "pdf") {
        if (!file) { toast.error("Please select a PDF file."); setSaving(false); return; }
        if (file.size > 4 * 1024 * 1024) {
          toast.error("PDF is too large. Please upload a file smaller than 4MB.");
          setSaving(false);
          return;
        }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("title", title.trim());
        fd.append("description", description.trim());
        fd.append("publishedBy", user.uid);
        fd.append("publishedByName", user.displayName || "");
        fd.append("canPublishDirectly", String(canPublishDirectly));
        res = await fetch("/api/reports", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(), description: description.trim(),
            content: content.trim(),
            publishedBy: user.uid, publishedByName: user.displayName || "",
            canPublishDirectly,
          }),
        });
      }
      if (!res.ok) throw new Error((await res.json()).error || "Failed to submit report");
      toast.success(canPublishDirectly ? "Report published!" : "Submitted for approval!");
      resetForm();
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to publish report.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this report?")) return;
    const res = await fetch("/api/reports", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId: id }),
    });
    if (res.ok) { toast.success("Deleted."); load(); }
    else toast.error("Failed to delete.");
  };

  const handleApprove = async (id: string) => {
    if (!user) return;
    setActingOn(id);
    try {
      const res = await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: id, action: "approve", approvedBy: user.uid, approvedByName: user.displayName }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Report approved and published!");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to approve.");
    } finally {
      setActingOn(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm("Reject and discard this draft report?")) return;
    setActingOn(id);
    try {
      const res = await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: id, action: "reject" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Draft rejected.");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to reject.");
    } finally {
      setActingOn(null);
    }
  };

  const published = reports.filter((r) => r.status !== "pending");
  const pending = reports.filter((r) => r.status === "pending");

  return (
    <div className="page-enter space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Reports & Announcements</h1>
          <p className="text-gray-500 text-sm">Official documents and announcements from the secretariat</p>
        </div>
        {canDraft && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#3b1f6e] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#2a1550]">
            <Plus size={16} /> {canPublishDirectly ? "Publish Report" : "Submit Report"}
          </button>
        )}
      </div>

      {/* Pending approval (visible to approvers only) */}
      {canApprove && pending.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-yellow-200 flex items-center gap-2">
            <Clock size={16} className="text-yellow-600" />
            <p className="font-semibold text-yellow-800 text-sm">Awaiting Your Approval ({pending.length})</p>
          </div>
          <div className="divide-y divide-yellow-100">
            {pending.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800">{r.title}</h3>
                    {r.description && <p className="text-sm text-gray-500 mt-0.5">{r.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      Submitted by {r.submittedByName} · {r.submittedAt ? format(new Date(r.submittedAt), "MMM d, yyyy") : "—"}
                    </p>
                    {r.type === "text" && r.content && (
                      <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{r.content}</p>
                    )}
                    {r.type === "pdf" && r.fileUrl && (
                      <a href={r.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-[#3b1f6e] underline mt-2">
                        <FileText size={13} /> Preview {r.fileName}
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleApprove(r.id)} disabled={actingOn === r.id}
                      className="flex items-center gap-1 bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">
                      <ThumbsUp size={12} /> Approve
                    </button>
                    <button onClick={() => handleReject(r.id)} disabled={actingOn === r.id}
                      className="flex items-center gap-1 bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50">
                      <ThumbsDown size={12} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Your own pending submissions (for drafters without approve rights) */}
      {!canApprove && canDraft && pending.filter((r) => r.submittedByName === user?.displayName).length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm text-yellow-800 font-medium flex items-center gap-2">
            <Clock size={14} /> You have {pending.filter((r) => r.submittedByName === user?.displayName).length} report(s) awaiting approval
          </p>
        </div>
      )}

      {/* Publish/Submit Form Modal */}
      {showForm && (
        <div className="modal-overlay fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">
                {canPublishDirectly ? "Publish New Report" : "Submit Report for Approval"}
              </h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={handlePublish} className="p-5 space-y-4">
              {!canPublishDirectly && (
                <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  This report will be sent to the President/General Secretary for approval before it appears here.
                </p>
              )}
              <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
                <button type="button" onClick={() => setFormType("text")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formType === "text" ? "bg-[#3b1f6e] text-white" : "text-gray-600 hover:text-gray-800"
                  }`}>
                  <AlignLeft size={15} /> Text Announcement
                </button>
                <button type="button" onClick={() => setFormType("pdf")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formType === "pdf" ? "bg-[#3b1f6e] text-white" : "text-gray-600 hover:text-gray-800"
                  }`}>
                  <FileUp size={15} /> PDF Document
                </button>
              </div>

              <input required value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Report title *"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />

              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description (optional)"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e] resize-none" />

              {formType === "text" ? (
                <textarea required value={content} onChange={(e) => setContent(e.target.value)}
                  placeholder="Announcement content *"
                  rows={6}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e] resize-none" />
              ) : (
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">PDF File * <span className="text-gray-400 font-normal">(max 4MB)</span></label>
                  <input ref={fileRef} type="file" accept=".pdf,application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#3b1f6e] file:text-white file:text-xs file:cursor-pointer" />
                  {file && (
                    <p className={`text-xs mt-1 ${file.size > 4 * 1024 * 1024 ? "text-red-500" : "text-green-600"}`}>
                      {file.size > 4 * 1024 * 1024 ? "✗" : "✓"} {file.name} ({(file.size / 1024).toFixed(0)} KB)
                      {file.size > 4 * 1024 * 1024 && " — too large"}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={resetForm}
                  className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm text-gray-600">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#3b1f6e] text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                  {saving ? "Saving..." : canPublishDirectly ? "Publish" : "Submit for Approval"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Published Reports List */}
      {loading && <div className="text-center py-12 text-gray-400">Loading reports...</div>}
      {!loading && published.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <p>No reports published yet</p>
        </div>
      )}

      <div className="stagger space-y-4">
        {published.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                r.type === "pdf" ? "bg-red-50" : "bg-[#3b1f6e]/10"
              }`}>
                {r.type === "pdf"
                  ? <FileText size={20} className="text-red-500" />
                  : <AlignLeft size={20} className="text-[#3b1f6e]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-800">{r.title}</h3>
                    {r.description && <p className="text-sm text-gray-500 mt-0.5">{r.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      By {r.publishedByName} · {r.publishedAt ? format(new Date(r.publishedAt), "MMM d, yyyy") : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.type === "pdf" && r.fileUrl && (
                      <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" download={r.fileName ?? undefined}
                        className="flex items-center gap-1.5 bg-[#f0c940] text-[#3b1f6e] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#e0b930]">
                        <Download size={13} /> Download
                      </a>
                    )}
                    {canApprove && (
                      <button onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
                {r.type === "text" && r.content && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.content}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
