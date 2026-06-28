"use client";
import { useEffect, useState, useRef } from "react";
import {
  collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, getDocs, where, or, and,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/roles";
import { Send, Users, User, Plus, ArrowLeft, Search } from "lucide-react";

type Member = { id: string; displayName: string; email: string; role: string };
type Message = {
  id: string; senderId: string; senderName: string;
  content: string; createdAt: any;
  type: "direct" | "group"; recipientId?: string; groupName?: string;
};

export default function MessagesPage() {
  const { user } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [view, setView] = useState<"inbox" | "chat">("inbox");
  const [activeChat, setActiveChat] = useState<{ type: "direct" | "group"; peerId?: string; peerName?: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDocs(collection(db, "members")).then((snap) => {
      setMembers(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Member))
          .filter((m) => m.role !== "pending" && m.role !== "rejected" && m.id !== user?.uid)
      );
    });
  }, [user]);

  useEffect(() => {
    if (!activeChat || !user) return;
    let q;
    if (activeChat.type === "group") {
      q = query(
        collection(db, "messages"),
        where("type", "==", "group"),
        orderBy("createdAt", "asc")
      );
    } else {
      q = query(
        collection(db, "messages"),
        where("type", "==", "direct"),
        where("participants", "array-contains", user.uid),
        orderBy("createdAt", "asc")
      );
    }
    const unsub = onSnapshot(q, (snap) => {
      let msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
      if (activeChat.type === "direct") {
        msgs = msgs.filter(
          (m) =>
            (m.senderId === user.uid && m.recipientId === activeChat.peerId) ||
            (m.senderId === activeChat.peerId && m.recipientId === user.uid)
        );
      }
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    return () => unsub();
  }, [activeChat, user]);

  const send = async () => {
    if (!text.trim() || !user || !activeChat) return;
    const payload: any = {
      senderId: user.uid,
      senderName: user.displayName,
      content: text.trim(),
      createdAt: serverTimestamp(),
      type: activeChat.type,
    };
    if (activeChat.type === "direct") {
      payload.recipientId = activeChat.peerId;
      payload.participants = [user.uid, activeChat.peerId];
    } else {
      payload.groupName = "Everyone";
    }
    await addDoc(collection(db, "messages"), payload);
    setText("");
  };

  const openDirect = (member: Member) => {
    setActiveChat({ type: "direct", peerId: member.id, peerName: member.displayName });
    setView("chat");
    setShowNewChat(false);
    setSearch("");
  };

  const openGroup = () => {
    setActiveChat({ type: "group", peerName: "Everyone" });
    setView("chat");
    setShowNewChat(false);
  };

  const filteredMembers = members.filter((m) =>
    m.displayName?.toLowerCase().includes(search.toLowerCase())
  );

  const formatTime = (ts: any) => {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (view === "chat" && activeChat) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-gray-200 mb-2">
          <button onClick={() => { setView("inbox"); setMessages([]); }}
            className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            activeChat.type === "group" ? "bg-[#3b1f6e]" : "bg-[#f0c940]"
          }`}>
            {activeChat.type === "group"
              ? <Users size={16} className="text-white" />
              : <span className="text-[#3b1f6e] font-bold text-sm">{activeChat.peerName?.charAt(0)}</span>}
          </div>
          <div>
            <p className="font-semibold text-gray-800">{activeChat.peerName}</p>
            <p className="text-xs text-gray-400">{activeChat.type === "group" ? "All members" : "Direct message"}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
          {messages.length === 0 && (
            <p className="text-center text-gray-400 text-sm pt-8">No messages yet. Say hello!</p>
          )}
          {messages.map((m) => {
            const isMine = m.senderId === user?.uid;
            return (
              <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                  {!isMine && (
                    <p className="text-xs text-gray-400 mb-1 px-1">{m.senderName}</p>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                    isMine
                      ? "bg-[#3b1f6e] text-white rounded-br-sm"
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
                  }`}>
                    {m.content}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 px-1">{formatTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 pt-3 border-t border-gray-200 mt-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message..."
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e] bg-white"
          />
          <button onClick={send} disabled={!text.trim()}
            className="bg-[#3b1f6e] text-white px-4 py-2.5 rounded-xl disabled:opacity-40 hover:bg-[#2a1550] transition-colors">
            <Send size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
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

      {/* Quick access */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={openGroup}
          className="bg-[#3b1f6e] text-white rounded-xl p-4 flex items-center gap-3 hover:bg-[#2a1550] transition-colors">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Users size={20} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm">Everyone</p>
            <p className="text-xs text-white/60">Message all members</p>
          </div>
        </button>
        <button onClick={() => setShowNewChat(true)}
          className="bg-[#f0c940] text-[#3b1f6e] rounded-xl p-4 flex items-center gap-3 hover:bg-[#e0b930] transition-colors">
          <div className="w-10 h-10 rounded-full bg-[#3b1f6e]/10 flex items-center justify-center">
            <User size={20} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm">Direct Message</p>
            <p className="text-xs text-[#3b1f6e]/60">Message one member</p>
          </div>
        </button>
      </div>

      {/* Member list */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <p className="font-semibold text-gray-800 text-sm">Members</p>
        </div>
        <div className="divide-y divide-gray-50">
          {members.map((m) => (
            <button key={m.id} onClick={() => openDirect(m)}
              className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left">
              <div className="w-10 h-10 rounded-full bg-[#f0c940] flex items-center justify-center font-bold text-[#3b1f6e] text-sm shrink-0">
                {m.displayName?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-800">{m.displayName}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(ROLE_COLORS as Record<string,string>)[m.role] || "bg-gray-100 text-gray-600"}`}>
                  {(ROLE_LABELS as Record<string,string>)[m.role] || m.role}
                </span>
              </div>
              <Send size={14} className="text-gray-300" />
            </button>
          ))}
          {members.length === 0 && (
            <p className="text-center py-8 text-gray-400 text-sm">No other members yet</p>
          )}
        </div>
      </div>

      {/* New chat modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">New Message</h3>
              <button onClick={() => { setShowNewChat(false); setSearch(""); }}
                className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
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
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search members..."
                  className="flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {filteredMembers.map((m) => (
                <button key={m.id} onClick={() => openDirect(m)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left">
                  <div className="w-9 h-9 rounded-full bg-[#f0c940] flex items-center justify-center font-bold text-[#3b1f6e] text-sm shrink-0">
                    {m.displayName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800">{m.displayName}</p>
                    <p className="text-xs text-gray-400">{(ROLE_LABELS as Record<string,string>)[m.role] || m.role}</p>
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
