"use client";

import { useState } from "react";
import { X, User, Palette, LogOut, Camera, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferencesStore, ThemeType, FontType } from "@/store/usePreferencesStore";
import { updateProfile, changePassword, logout } from "@/actions/auth";
import { useRouter } from "next/navigation";

interface PreferencesModalProps {
  onClose: () => void;
  user: {
    id: string;
    name: string;
    email: string;
    profileImageUrl?: string;
    dob?: string;
  };
}

const THEMES: { id: ThemeType; name: string; color: string; bgColor: string }[] = [
  { id: "notion", name: "Notion", color: "bg-blue-600", bgColor: "bg-[#f4f4f5]" },
  { id: "mist", name: "Mist", color: "bg-cyan-500", bgColor: "bg-[#f0f9ff]" },
  { id: "forest", name: "Forest", color: "bg-emerald-700", bgColor: "bg-[#f0fdf4]" },
  { id: "cream", name: "Cream", color: "bg-orange-700", bgColor: "bg-[#fffbeb]" },
  { id: "graphite", name: "Graphite", color: "bg-slate-700", bgColor: "bg-[#f8fafc]" },
  { id: "rose", name: "Rose", color: "bg-rose-500", bgColor: "bg-[#fff1f2]" },
  { id: "dark", name: "Dark", color: "bg-slate-900", bgColor: "bg-[#0f172a]" },
];

const FONTS: { id: FontType; name: string }[] = [
  { id: "notion-ui", name: "Notion UI" },
  { id: "manrope", name: "Manrope" },
  { id: "literata", name: "Literata" },
  { id: "space-grotesk", name: "Space Grotesk" },
  { id: "georgia", name: "Georgia" },
  { id: "verdana", name: "Verdana" },
  { id: "trebuchet-ms", name: "Trebuchet MS" },
  { id: "courier-new", name: "Courier New" },
];

export function PreferencesModal({ onClose, user }: PreferencesModalProps) {
  const [activeTab, setActiveTab] = useState<"appearance" | "account">("appearance");
  const { theme, font, setTheme, setFont } = usePreferencesStore();
  const router = useRouter();

  // Account Form State
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [dob, setDob] = useState(user.dob || "");
  const [isUpdating, setIsUpdating] = useState(false);

  // Password Form State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const handleUpdateProfile = async () => {
    setIsUpdating(true);
    try {
      await updateProfile({ name, email, dob });
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    setIsChangingPassword(true);
    setPasswordError("");
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      alert("Password updated successfully");
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px]">
      <div className="flex w-full max-w-5xl h-[80vh] rounded-[32px] bg-white shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Sidebar */}
        <aside className="w-72 border-r border-slate-100 bg-[var(--background)] p-6 flex flex-col">
          <div className="mb-8 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-900 truncate">{user.name}</h3>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>

          <nav className="space-y-1 flex-1">
            <TabItem 
              icon={<Palette size={18} />} 
              label="Appearance" 
              active={activeTab === "appearance"} 
              onClick={() => setActiveTab("appearance")} 
            />
            <TabItem 
              icon={<User size={18} />} 
              label="Account" 
              active={activeTab === "account"} 
              onClick={() => setActiveTab("account")} 
            />
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="px-10 py-8 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Workspace</p>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Preferences</h2>
            </div>
            <button 
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-10 pb-12">
            {activeTab === "appearance" ? (
              <div className="space-y-10">
                <section>
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Theme</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={cn(
                          "flex flex-col items-start p-6 rounded-[24px] border-2 transition-all text-left",
                          theme === t.id ? "border-indigo-600 shadow-sm" : "border-slate-100 hover:border-slate-200",
                          t.bgColor
                        )}
                      >
                        <div className="flex gap-2 mb-4">
                          <div className={cn("w-4 h-4 rounded-full", t.color)} />
                          <div className="w-4 h-4 rounded-full bg-white border border-slate-200" />
                        </div>
                        <span className="font-bold text-slate-900">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Font</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {FONTS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setFont(f.id)}
                        className={cn(
                          "px-6 py-4 rounded-2xl border-2 text-left font-bold transition-all",
                          font === f.id ? "border-slate-900 bg-white" : "border-slate-100 hover:border-slate-200 text-slate-600"
                        )}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-12">
                <section>
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Account</h3>
                  <div className="flex gap-12">
                    {/* User Summary Card */}
                    <div className="w-56 h-72 rounded-[32px] border border-slate-100 bg-[var(--background)] flex flex-col items-center justify-center p-6 shrink-0">
                      <div className="w-24 h-24 rounded-full bg-white border border-slate-200 flex items-center justify-center text-3xl font-bold text-slate-300 mb-6">
                        {user.profileImageUrl ? (
                          <img src={user.profileImageUrl} alt={user.name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          user.name[0].toUpperCase()
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 text-center line-clamp-1">{user.name}</h4>
                      <p className="text-[10px] text-slate-400 text-center truncate w-full">{user.email}</p>
                    </div>

                    {/* Form Fields */}
                    <div className="flex-1 space-y-6">
                      <div className="space-y-2">
                        <label className="block">
                          <span className="sr-only">Your full name</span>
                          <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your full name"
                            className="w-full rounded-2xl border border-slate-200 px-6 py-4 text-sm font-medium focus:border-slate-900 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                          />
                        </label>
                      </div>
                      <div className="space-y-2">
                        <label className="block">
                          <span className="sr-only">Email address</span>
                          <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email address"
                            className="w-full rounded-2xl border border-slate-200 px-6 py-4 text-sm font-medium focus:border-slate-900 outline-none transition-colors bg-slate-50 text-slate-500 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                          />
                        </label>
                      </div>
                      <div className="relative">
                        <label className="block">
                          <span className="sr-only">Date of birth</span>
                          <input 
                            type="date" 
                            value={dob}
                            onChange={(e) => setDob(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 px-6 py-4 text-sm font-medium focus:border-slate-900 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                          />
                        </label>
                      </div>
                      
                      {/* Profile Image Upload */}
                      <div className="rounded-[24px] border-2 border-dashed border-slate-100 p-8 text-center bg-slate-50/50">
                        <p className="text-xs text-slate-400 mb-4">Profile image</p>
                        <button className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors">
                          <Camera size={14} />
                          Browse...
                        </button>
                        <span className="ml-3 text-[10px] text-slate-400">No file selected.</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <button 
                          onClick={handleUpdateProfile}
                          disabled={isUpdating}
                          className="px-8 py-3.5 rounded-full bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-all disabled:opacity-50"
                        >
                          {isUpdating ? "Saving..." : "Save account"}
                        </button>
                        <button 
                          onClick={handleLogout}
                          className="px-6 py-3.5 rounded-full border border-rose-100 text-rose-500 text-sm font-bold hover:bg-rose-50 transition-colors"
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t border-slate-100 pt-10">
                  <div className="flex items-center gap-2 mb-6">
                    <Lock size={18} className="text-slate-400" />
                    <h3 className="text-lg font-bold text-slate-900">Change Password</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-4 max-w-md">
                    <label className="block">
                      <span className="sr-only">Current Password</span>
                      <input 
                        type="password" 
                        placeholder="Current Password" 
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-6 py-4 text-sm font-medium focus:border-slate-900 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                      />
                    </label>
                    <label className="block">
                      <span className="sr-only">New Password</span>
                      <input 
                        type="password" 
                        placeholder="New Password" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-6 py-4 text-sm font-medium focus:border-slate-900 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                      />
                    </label>
                    <label className="block">
                      <span className="sr-only">Confirm New Password</span>
                      <input 
                        type="password" 
                        placeholder="Confirm New Password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-6 py-4 text-sm font-medium focus:border-slate-900 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                      />
                    </label>
                    {passwordError && <p className="text-xs font-bold text-rose-500 px-2">{passwordError}</p>}
                    <button 
                      onClick={handleChangePassword}
                      disabled={isChangingPassword}
                      className="w-fit px-8 py-3.5 rounded-full bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
                    >
                      {isChangingPassword ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function TabItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-bold transition-all",
        active ? "bg-white text-slate-900 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
