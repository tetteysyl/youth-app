"use client";
import { authFetch } from "@/lib/auth-fetch";
import { useState, useCallback, useRef } from "react";
import Cropper from "react-easy-crop";
import { X, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { useAuthStore } from "@/lib/store";

type Area = { x: number; y: number; width: number; height: number };

async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error("Canvas empty")), "image/jpeg", 0.9));
}

interface Props {
  onClose: () => void;
}

export default function ProfilePhotoModal({ onClose }: Props) {
  const { user, setUser } = useAuthStore();
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Image must be under 10MB."); return; }
    setError("");
    const reader = new FileReader();
    reader.onload = () => setImgSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = async () => {
    if (!imgSrc || !croppedAreaPixels || !user) return;
    setUploading(true);
    setError("");
    try {
      const blob = await getCroppedBlob(imgSrc, croppedAreaPixels);
      const fd = new FormData();
      fd.append("file", blob, "profile.jpg");
      fd.append("uid", user.uid);
      const res = await authFetch("/api/profile-photo", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      const { photoURL } = await res.json();
      setUser({ ...user, photoURL });
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 modal-overlay flex" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-auto my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Profile Picture</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {!imgSrc ? (
          /* Pick photo state */
          <div className="p-6 flex flex-col items-center gap-4">
            {user?.photoURL && (
              <img src={user.photoURL} alt="Current" className="w-24 h-24 rounded-full object-cover border-4 border-[#f0c940]" />
            )}
            {!user?.photoURL && (
              <div className="w-24 h-24 rounded-full flex items-center justify-center text-[#3b1f6e] font-bold text-3xl"
                style={{ background: "linear-gradient(135deg, #f0c940, #c9a52a)" }}>
                {user?.displayName?.charAt(0).toUpperCase()}
              </div>
            )}
            {error && <p className="text-red-500 text-xs text-center">{error}</p>}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 bg-[#3b1f6e] text-white py-2.5 rounded-xl font-medium text-sm hover:bg-[#2a1550] transition-colors"
            >
              <Upload size={16} /> Choose Photo
            </button>
            <p className="text-xs text-gray-400">JPG, PNG or GIF · Max 10MB</p>
          </div>
        ) : (
          /* Crop state */
          <div className="flex flex-col">
            {/* Crop area */}
            <div className="relative w-full" style={{ height: 300, background: "#111" }}>
              <Cropper
                image={imgSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            {/* Zoom slider */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
              <ZoomOut size={16} className="text-gray-400 shrink-0" />
              <input
                type="range" min={1} max={3} step={0.05} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-[#3b1f6e]"
              />
              <ZoomIn size={16} className="text-gray-400 shrink-0" />
            </div>

            {error && <p className="text-red-500 text-xs text-center px-5 pt-2">{error}</p>}

            {/* Actions */}
            <div className="flex gap-3 px-5 py-4">
              <button
                onClick={() => { setImgSrc(null); setZoom(1); setCrop({ x: 0, y: 0 }); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={uploading}
                className="flex-1 py-2.5 rounded-xl bg-[#3b1f6e] text-white text-sm font-medium hover:bg-[#2a1550] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {uploading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</> : "Save Photo"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
