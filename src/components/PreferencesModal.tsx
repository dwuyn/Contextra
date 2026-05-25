"use client";

import Image from "next/image";
import { useState } from "react";
import { User, Palette, Lock, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FONT_OPTIONS, THEME_CARDS, toggleThemeDark } from "@/lib/appearance";
import { usePreferencesStore } from "@/store/usePreferencesStore";
import { updateProfile, changePassword, logout } from "@/actions/auth";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function PreferencesModal({ onClose, user }: PreferencesModalProps) {
  const [activeTab, setActiveTab] = useState<"appearance" | "account">("appearance");
  const { theme, font, setTheme, setFont } = usePreferencesStore();
  const router = useRouter();
  const t = useTranslations("auth");
  const ct = useTranslations("common");
  const nt = useTranslations("nav");

  // Account Form State
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [dob, setDob] = useState(user.dob || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  // Password Form State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const handleUpdateProfile = async () => {
    setIsUpdating(true);
    setProfileError("");
    setProfileSuccess("");
    try {
      await updateProfile({ name, email, dob });
      setProfileSuccess("Account updated.");
      router.refresh();
    } catch (err) {
      console.error(err);
      setProfileError(getErrorMessage(err));
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
    setPasswordSuccess("");
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password updated successfully.");
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-canvas)]/40 backdrop-blur-[2px]">
      <div className="flex w-full max-w-5xl h-[80vh] rounded-[32px] bg-[var(--color-surface)] shadow-2xl overflow-hidden border border-[var(--color-border)]">
        
        {/* Sidebar */}
        <aside className="w-72 border-r border-[var(--color-border)] bg-[var(--background)] p-6 flex flex-col">
          <div className="mb-8 p-4 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-sm">
            <h3 className="font-bold text-[var(--color-text)] truncate">{user.name}</h3>
            <p className="text-xs text-[var(--color-text-muted)] truncate">{user.email}</p>
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
              <h2 className="text-3xl font-extrabold text-[var(--color-text)] tracking-tight">{nt("settings")}</h2>
            </div>
            <button 
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-[var(--color-border)] text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] transition-colors"
            >
              {ct("close")}
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-10 pb-12">
            {activeTab === "appearance" ? (
              <div className="space-y-10">
                <section>
                  <h3 className="text-lg font-bold text-[var(--color-text)] mb-6">Theme</h3>
                  
                  {/* Dark mode toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium">Dark mode</span>
                    <button
                      type="button"
                      onClick={() => setTheme(toggleThemeDark(theme))}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        theme.endsWith("-dark")
                          ? "bg-[var(--color-accent)]"
                          : "bg-[var(--color-border)]"
                      )}
                      role="switch"
                      aria-checked={theme.endsWith("-dark")}
                      aria-label="Toggle dark mode"
                    >
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform",
                          theme.endsWith("-dark") ? "translate-x-5" : "translate-x-0.5"
                        )}
                      >
                        {theme.endsWith("-dark") ? (
                          <Moon className="h-3 w-3" />
                        ) : (
                          <Sun className="h-3 w-3 text-amber-500" />
                        )}
                      </span>
                    </button>
                  </div>
                  
                  {/* Theme swatch grid (shows only light family variants) */}
                  <div className="grid grid-cols-2 gap-2">
                    {THEME_CARDS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          const target = theme.endsWith("-dark")
                            ? (opt.id + "-dark") as typeof theme
                            : opt.id;
                          setTheme(target);
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-all",
                          theme === opt.id || theme === (opt.id + "-dark")
                            ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent-muted)]"
                            : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]"
                        )}
                        aria-label={`${opt.family} theme`}
                        aria-pressed={theme === opt.id || theme === (opt.id + "-dark")}
                      >
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium">{opt.family}</span>
                          <div className="flex gap-1">
                            {opt.swatches.map((color) => (
                              <div
                                key={color}
                                className="h-3 w-3 rounded-full border border-[var(--color-border)]"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-[var(--color-text)] mb-6">Font</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {FONT_OPTIONS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setFont(f.id)}
                        className={cn(
                          "rounded-2xl border-2 px-6 py-4 text-left transition-all",
                          font === f.id ? "border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border)]"
                        )}
                        style={{ fontFamily: f.stack }}
                      >
                        <span className="block font-bold">{f.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-12">
                <section>
                  <h3 className="text-lg font-bold text-[var(--color-text)] mb-6">Account</h3>
                  <div className="flex gap-12">
                    {/* User Summary Card */}
                    <div className="w-56 h-72 rounded-[32px] border border-[var(--color-border)] bg-[var(--background)] flex flex-col items-center justify-center p-6 shrink-0">
                      <div className="w-24 h-24 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-3xl font-bold text-[var(--color-text-muted)] mb-6">
                        {user.profileImageUrl ? (
                          <Image
                            src={user.profileImageUrl}
                            alt={user.name}
                            width={96}
                            height={96}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          user.name[0].toUpperCase()
                        )}
                      </div>
                      <h4 className="font-bold text-[var(--color-text)] text-center line-clamp-1">{user.name}</h4>
                      <p className="text-[10px] text-[var(--color-text-muted)] text-center truncate w-full">{user.email}</p>
                    </div>

                    {/* Form Fields */}
                    <div className="flex-1 space-y-6">
                      <div className="space-y-2">
                        <label className="block">
                          <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">{t("name")}</span>
                          <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t("name")}
                            className="w-full rounded-2xl border border-[var(--color-border)] px-6 py-4 text-sm font-medium focus:border-[var(--color-accent)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
                          />
                        </label>
                      </div>
                      <div className="space-y-2">
                        <label className="block">
                          <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">{t("email")}</span>
                          <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={t("email")}
                            className="w-full rounded-2xl border border-[var(--color-border)] px-6 py-4 text-sm font-medium focus:border-[var(--color-accent)] outline-none transition-colors bg-[var(--color-canvas)] text-[var(--color-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
                          />
                        </label>
                      </div>
                      <div className="relative">
                        <label className="block">
                          <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">{t("dob")}</span>
                          <input 
                            type="date" 
                            value={dob}
                            onChange={(e) => setDob(e.target.value)}
                            className="w-full rounded-2xl border border-[var(--color-border)] px-6 py-4 text-sm font-medium focus:border-[var(--color-accent)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
                          />
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <button 
                          onClick={handleUpdateProfile}
                          disabled={isUpdating}
                          className="px-8 py-3.5 rounded-full bg-[var(--color-text)] text-white text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50"
                        >
                          {isUpdating ? ct("saving") : ct("saveChanges")}
                        </button>
                        <button 
                          onClick={handleLogout}
                          className="px-6 py-3.5 rounded-full border border-[var(--color-destructive)]/30 text-[var(--color-destructive)] text-sm font-bold hover:bg-[var(--color-destructive)]/10 transition-colors"
                        >
                          {t("logout")}
                        </button>
                      </div>
                      {profileError && <p className="text-xs font-bold text-[var(--color-destructive)] px-2">{profileError}</p>}
                      {profileSuccess && <p className="text-xs font-bold text-[var(--color-success)] px-2">{profileSuccess}</p>}
                    </div>
                  </div>
                </section>

                <section className="border-t border-[var(--color-border)] pt-10">
                  <div className="flex items-center gap-2 mb-6">
                    <Lock size={18} className="text-[var(--color-text-muted)]" />
                    <h3 className="text-lg font-bold text-[var(--color-text)]">{t("changePassword")}</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-4 max-w-md">
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">{t("currentPassword")}</span>
                      <input 
                        type="password" 
                        placeholder={t("currentPassword")} 
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        className="w-full rounded-2xl border border-[var(--color-border)] px-6 py-4 text-sm font-medium focus:border-[var(--color-accent)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">{t("newPassword")}</span>
                      <input 
                        type="password" 
                        placeholder={t("newPassword")} 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-2xl border border-[var(--color-border)] px-6 py-4 text-sm font-medium focus:border-[var(--color-accent)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">{t("confirmPassword")}</span>
                      <input 
                        type="password" 
                        placeholder={t("confirmPassword")} 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-2xl border border-[var(--color-border)] px-6 py-4 text-sm font-medium focus:border-[var(--color-accent)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
                      />
                    </label>
                    {passwordError && <p className="text-xs font-bold text-[var(--color-destructive)] px-2">{passwordError}</p>}
                    {passwordSuccess && <p className="text-xs font-bold text-[var(--color-success)] px-2">{passwordSuccess}</p>}
                    <button 
                      onClick={handleChangePassword}
                      disabled={isChangingPassword}
                      className="w-fit px-8 py-3.5 rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] text-sm font-bold hover:bg-[var(--color-surface-alt)] transition-all disabled:opacity-50"
                    >
                      {isChangingPassword ? ct("saving") : ct("save")}
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
        active ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm border border-[var(--color-border)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
