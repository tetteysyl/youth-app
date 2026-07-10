"use client";
import { authFetch } from "@/lib/auth-fetch";
import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/lib/store";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/roles";
import { Send, Users, User, Plus, ArrowLeft, Search, Camera } from "lucide-react";
import toast from "react-hot-toast";

type Member = { id: string; displayName: string; email: string; role: string; photoURL?: string };
type Message = {
  id: string; senderId: string; senderName: string;
  content: string; createdAt: number | null;
  type: "direct" | "group" | "cell"; conversationId?: string; cellId?: string;
};
type Cell = { id: string; name: string; leaderId: string; leaderName: string; memberIds: string[]; photoURL?: string };
type InboxSummary = Record<string, { unread: number; lastAt: number }>;

function getConversationId(uid1: string, uid2: string) {
  return [uid1, uid2].sort().join("__");
}

export default function MessagesPage() {
  const { user } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [view, setView] = useState<"inbox" | "chat">("inbox");
  const [inboxTab, setInboxTab] = useState<"direct" | "cells">("direct");
  const [activeChat, setActiveChat] = useState<{
    type: "direct" | "group" | "cell";
    peerId?: string;
    peerName?: string;
    peerRole?: string;
    peerPhotoURL?: string;
    convId?: string;
    cellId?: string;
  } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [inboxSummary, setInboxSummary] = useState<InboxSummary>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const inboxPollRef = useRef<NodeJS.Timeout | null>(null);
  const cellPhotoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCellPhoto, setUploadingCellPhoto] = useState(false);

  // Load members via Admin SDK API
  useEffect(() => {
    if (!user) return;
    authFetch("/api/get-members")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMembers(data.filter((m: Member) => m.id !== user.uid));
        }
      })
      .catch(console.error);
  }, [user]);

  // Load user's cells
  useEffect(() => {
    if (!user) return;
    authFetch(`/api/cells?userId=${user.uid}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCells(data);
      })
      .catch(console.error);
  }, [user]);

  // Poll inbox summary (unread counts + last message times) every 5s
  useEffect(() => {
    if (!user) return;
    const fetchInbox = () => {
      authFetch(`/api/messages?inbox=${user.uid}`)
        .then((r) => r.json())
        .then((data) => { if (data && typeof data === "object") setInboxSummary(data); })
        .catch(() => {});
    };
    fetchInbox();
    inboxPollRef.current = setInterval(fetchInbox, 15000);
    return () => { if (inboxPollRef.current) clearInterval(inboxPollRef.current); };
  }, [user]);

  // Poll messages every 3 seconds
  const fetchMessages = useCallback(async () => {
    if (!activeChat || !user) return;
    let url: string;
    if (activeChat.type === "group") {
      url = `/api/messages?type=group&viewerId=${user.uid}`;
    } else if (activeChat.type === "cell") {
      url = `/api/messages?cellId=${activeChat.cellId}&viewerId=${user.uid}`;
    } else {
      url = `/api/messages?conversationId=${activeChat.convId}`;
    }
    try {
      const res = await authFetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch (e) { console.error(e); }
  }, [activeChat, user]);

  useEffect(() => {
    if (!activeChat || !user) return;
    fetchMessages();
    // Mark messages as read when chat is opened
    authFetch("/api/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: activeChat.convId,
        cellId: activeChat.cellId,
        userId: user.uid,
        type: activeChat.type,
      }),
    }).catch(() => {});
    pollRef.current = setInterval(fetchMessages, 6000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeChat, fetchMessages, user]);

  const send = async () => {
    if (!text.trim() || !user || !activeChat || sending) return;
    setSending(true);
    try {
      const body: any = {
        senderId: user.uid,
        senderName: user.displayName,
        content: text.trim(),
        type: activeChat.type,
      };
      if (activeChat.type === "direct") {
        body.conversationId = activeChat.convId;
        body.recipientId = activeChat.peerId;
      }
      if (activeChat.type === "cell") {
        body.cellId = activeChat.cellId;
      }
      const res = await authFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to send");
      setText("");
      fetchMessages();
    } catch {
      toast.error("Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleCellPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat?.cellId) return;
    setUploadingCellPhoto(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("cellId", activeChat.cellId);
      const res = await authFetch("/api/cells/photo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActiveChat((prev) => prev ? { ...prev, peerPhotoURL: data.photoURL } : prev);
      setCells((prev) => prev.map((c) => c.id === activeChat.cellId ? { ...c, photoURL: data.photoURL } : c));
      toast.success("Cell photo updated!");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingCellPhoto(false);
      if (cellPhotoInputRef.current) cellPhotoInputRef.current.value = "";
    }
  };

  const openDirect = (member: Member) => {
    if (!user) return;
    setMessages([]);
    setActiveChat({
      type: "direct",
      peerId: member.id,
      peerName: member.displayName,
      peerRole: member.role,
      peerPhotoURL: member.photoURL,
      convId: getConversationId(user.uid, member.id),
    });
    setView("chat");
    setShowNewChat(false);
    setSearch("");
  };

  const openGroup = () => {
    setMessages([]);
    setActiveChat({ type: "group", peerName: "Everyone" });
    setView("chat");
    setShowNewChat(false);
  };

  const openCellChat = (cell: Cell) => {
    setMessages([]);
    setActiveChat({ type: "cell", peerName: cell.name, cellId: cell.id, peerPhotoURL: cell.photoURL });
    setView("chat");
  };

  const filteredMembers = members.filter((m) =>
    m.displayName?.toLowerCase().includes(search.toLowerCase())
  );

  const formatTime = (ts: number | null) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // ── Chat View ──────────────────────────────────────────────────────────────
  if (view === "chat" && activeChat) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] max-w-2xl mx-auto">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-200 mb-2">
          <button onClick={() => {
            setView("inbox"); setMessages([]);
            if (pollRef.current) clearInterval(pollRef.current);
            // Refresh inbox summary so badges update after reading
            if (user) authFetch(`/api/messages?inbox=${user.uid}`)
              .then((r) => r.json()).then((d) => { if (d && typeof d === "object") setInboxSummary(d); }).catch(() => {});
          }}
            className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="relative shrink-0">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${
              activeChat.type === "group" || activeChat.type === "cell" ? "bg-[#3b1f6e]" : "bg-[#f0c940]"
            }`}>
              {activeChat.type === "cell"
                ? activeChat.peerPhotoURL
                  ? <img src={activeChat.peerPhotoURL} alt="" className="w-full h-full object-cover" />
                  : <Users size={16} className="text-white" />
                : activeChat.type === "group"
                  ? <Users size={16} className="text-white" />
                  : activeChat.peerPhotoURL
                    ? <img src={activeChat.peerPhotoURL} alt="" className="w-full h-full object-cover" />
                    : <span className="text-[#3b1f6e] font-bold text-sm">{activeChat.peerName?.charAt(0)}</span>}
            </div>
            {activeChat.type === "cell" && cells.find((c) => c.id === activeChat.cellId)?.leaderId === user?.uid && (
              <>
                <button
                  onClick={() => cellPhotoInputRef.current?.click()}
                  disabled={uploadingCellPhoto}
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#f0c940] flex items-center justify-center shadow disabled:opacity-50"
                  title="Update cell photo"
                >
                  <Camera size={8} className="text-[#3b1f6e]" />
                </button>
                <input ref={cellPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleCellPhotoUpload} />
              </>
            )}
          </div>
          <div>
            <p className="font-semibold text-gray-800">{activeChat.peerName}</p>
            {activeChat.type === "direct" && activeChat.peerRole ? (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(ROLE_COLORS as Record<string, string>)[activeChat.peerRole] || "bg-gray-100 text-gray-600"}`}>
                {(ROLE_LABELS as Record<string, string>)[activeChat.peerRole] || activeChat.peerRole}
              </span>
            ) : (
              <p className="text-xs text-gray-400">
                {activeChat.type === "group" ? "All members" : "Cell chat"}
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
          {messages.length === 0 && (
            <p className="text-center text-gray-400 text-sm pt-8">No messages yet. Say hello!</p>
          )}
          {messages.map((m) => {
            const isMine = m.senderId === user?.uid;
            return (
              <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                  {!isMine && <p className="text-xs text-gray-400 mb-1 px-1">{m.senderName}</p>}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm break-words ${
                    isMine
                      ? "bg-[#3b1f6e] text-white rounded-br-sm"
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
                  }`}>{m.content}</div>
                  <p className="text-xs text-gray-400 mt-1 px-1">{formatTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 pt-3 border-t border-gray-200 mt-2">
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message..."
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e] bg-white" />
          <button onClick={send} disabled={!text.trim() || sending}
            className="bg-[#3b1f6e] text-white px-4 py-2.5 rounded-xl disabled:opacity-40 hover:bg-[#2a1550] transition-colors">
            <Send size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── Inbox View ─────────────────────────────────────────────────────────────
  return (
    <div className="page-enter space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Messages</h1>
          <p className="text-gray-500 text-sm">Chat with members or everyone</p>
        </div>
        <button onClick={() => setShowNewChat(true)}
          className="flex items-center gap-2 bg-[#3b1f6e] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#2a1550]">
          <Plus size={16} /> New Message
        </button>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={openGroup}
          className="bg-[#3b1f6e] text-white rounded-xl p-4 flex items-center gap-3 hover:bg-[#2a1550] transition-colors">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm">Everyone</p>
            <p className="text-xs text-white/60">Message all members</p>
          </div>
        </button>
        <button onClick={() => setShowNewChat(true)}
          className="bg-[#f0c940] text-[#3b1f6e] rounded-xl p-4 flex items-center gap-3 hover:bg-[#e0b930] transition-colors">
          <div className="w-10 h-10 rounded-full bg-[#3b1f6e]/10 flex items-center justify-center shrink-0">
            <User size={20} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm">Direct Message</p>
            <p className="text-xs text-[#3b1f6e]/60">Message one member</p>
          </div>
        </button>
      </div>

      {/* Inbox tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setInboxTab("direct")}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            inboxTab === "direct" ? "bg-[#3b1f6e] text-white shadow-sm" : "text-gray-600 hover:text-gray-800"
          }`}
        >
          Members
        </button>
        <button
          onClick={() => setInboxTab("cells")}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            inboxTab === "cells" ? "bg-[#3b1f6e] text-white shadow-sm" : "text-gray-600 hover:text-gray-800"
          }`}
        >
          Cells
        </button>
      </div>

      {/* Members tab */}
      {inboxTab === "direct" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <p className="font-semibold text-gray-800 text-sm">Members ({members.length})</p>
          </div>
          <div className="divide-y divide-gray-50">
            {members.length === 0 && (
              <p className="text-center py-8 text-gray-400 text-sm">Loading members...</p>
            )}
            {[...members]
              .sort((a, b) => {
                const aLast = inboxSummary[a.id]?.lastAt ?? 0;
                const bLast = inboxSummary[b.id]?.lastAt ?? 0;
                return bLast - aLast;
              })
              .map((m) => {
                const summary = inboxSummary[m.id];
                const unread = summary?.unread ?? 0;
                return (
                  <button key={m.id} onClick={() => openDirect(m)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full bg-[#f0c940] flex items-center justify-center font-bold text-[#3b1f6e] text-sm overflow-hidden">
                        {m.photoURL
                          ? <img src={m.photoURL} alt="" className="w-full h-full object-cover" />
                          : m.displayName?.charAt(0).toUpperCase()}
                      </div>
                      {unread > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${unread > 0 ? "font-bold text-gray-900" : "font-medium text-gray-800"}`}>
                        {m.displayName}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(ROLE_COLORS as Record<string, string>)[m.role] || "bg-gray-100 text-gray-600"}`}>
                        {(ROLE_LABELS as Record<string, string>)[m.role] || m.role}
                      </span>
                    </div>
                    {unread > 0
                      ? <span className="text-xs text-red-500 font-semibold shrink-0">{unread} new</span>
                      : <Send size={14} className="text-gray-300 shrink-0" />}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Cells tab */}
      {inboxTab === "cells" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <p className="font-semibold text-gray-800 text-sm">My Cells ({cells.length})</p>
          </div>
          <div className="divide-y divide-gray-50">
            {cells.length === 0 && (
              <p className="text-center py-8 text-gray-400 text-sm">You are not in any cell yet</p>
            )}
            {cells.map((cell) => (
              <button
                key={cell.id}
                onClick={() => openCellChat(cell)}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-[#3b1f6e] flex items-center justify-center shrink-0 overflow-hidden">
                  {cell.photoURL
                    ? <img src={cell.photoURL} alt="" className="w-full h-full object-cover" />
                    : <Users size={18} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-800">{cell.name}</p>
                  <p className="text-xs text-gray-400">
                    Leader: {cell.leaderName} &bull; {cell.memberIds.length} member{cell.memberIds.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <Send size={14} className="text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {showNewChat && (
        <div className="modal-overlay fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">New Message</h3>
              <button onClick={() => { setShowNewChat(false); setSearch(""); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <button onClick={openGroup}
              className="flex items-center gap-3 p-4 border-b border-gray-100 hover:bg-gray-50 text-left">
              <div className="w-10 h-10 rounded-full bg-[#3b1f6e] flex items-center justify-center shrink-0">
                <Users size={18} className="text-white" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-800">Message Everyone</p>
                <p className="text-xs text-gray-400">Send to all members</p>
              </div>
            </button>
            <div className="p-3 border-b border-gray-100">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                <Search size={14} className="text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search members..."
                  className="flex-1 bg-transparent text-sm outline-none" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {filteredMembers.map((m) => (
                <button key={m.id} onClick={() => openDirect(m)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left">
                  <div className="w-9 h-9 rounded-full bg-[#f0c940] flex items-center justify-center font-bold text-[#3b1f6e] text-sm shrink-0 overflow-hidden">
                    {m.photoURL
                      ? <img src={m.photoURL} alt="" className="w-full h-full object-cover" />
                      : m.displayName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800">{m.displayName}</p>
                    <p className="text-xs text-gray-400">{(ROLE_LABELS as Record<string, string>)[m.role] || m.role}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
