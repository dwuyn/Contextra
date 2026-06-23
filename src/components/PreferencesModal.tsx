"use client";

import Image from "next/image";
import { type ChangeEvent, useRef, useState, useReducer } from "react";
import { User, Palette, Lock, Sun, Moon } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { FONT_OPTIONS, THEME_CARDS, toggleThemeDark } from "@/lib/appearance";
import { usePreferencesStore } from "@/store/usePreferencesStore";
import { updateProfile, changePassword } from "@/actions/auth";
import { logout } from "@/lib/auth-client";
import { useRouter } from "@/lib/i18n-client";
import { useTranslations, useLocale } from "next-intl";
import { usePathname } from "@/lib/i18n-client";
import { useSearchParams } from "next/navigation";
import { routing } from "@/lib/i18n-client";

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

export function PreferencesModal({ onClose, user }: PreferencesModalProps) {
  const [activeTab, setActiveTab] = useState<"appearance" | "account">("appearance");
  const pt = useTranslations("preferences");

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-text)]/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-4 z-50 mx-auto max-w-5xl overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl flex flex-col md:inset-10 focus:outline-none">
          <Dialog.Title className="sr-only">{pt("modalTitle")}</Dialog.Title>
          <div className="flex flex-col md:flex-row h-full">
            {/* Tabs */}
            <div className="flex flex-row md:flex-col shrink-0 gap-1 px-4 py-3 md:px-3 md:py-4 border-b md:border-b-0 md:border-r border-[var(--color-border)] overflow-x-auto">
              {[
                { id: "appearance" as const, icon: Palette, label: pt("appearance") },
                { id: "account" as const, icon: User, label: pt("account") },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    activeTab === tab.id
                      ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
                  )}
                >
                  <tab.icon className="size-4" />
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              {activeTab === "appearance" ? (
                <AppearanceTab />
              ) : (
                <AccountTab key={user.id} initialUser={user} />
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AppearanceTab() {
  const { theme, font, setTheme, setFont } = usePreferencesStore();
  const pt = useTranslations("preferences");

  return (
    <div className="space-y-10">
      <section>
        <h3 className="text-lg font-bold text-[var(--color-text)] mb-6">{pt("theme")}</h3>
        
        {/* Dark mode toggle */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium">{pt("darkMode")}</span>
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
            aria-label={pt("toggleDarkMode")}
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
        
        {/* Theme swatch grid */}
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
              aria-label={`${opt.name} ${pt("theme")}`}
              aria-pressed={theme === opt.id || theme === (opt.id + "-dark")}
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">{opt.name}</span>
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
        <h3 className="text-lg font-bold text-[var(--color-text)] mb-6">{pt("font")}</h3>
        <div className="grid grid-cols-2 gap-3">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
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
  );
}

type AccountState = {
  name: string;
  dob: string;
  profileImageUrl: string;
  isUpdating: boolean;
  profileError: string;
  profileSuccess: string;
  isUploadingAvatar: boolean;
  avatarError: string;
};

type AccountAction =
  | { type: "setField"; field: keyof AccountState; value: string | boolean }
  | { type: "startUpdate" }
  | { type: "updateSuccess"; message: string }
  | { type: "updateError"; error: string }
  | { type: "startAvatarUpload" }
  | { type: "avatarUploadSuccess"; url: string }
  | { type: "avatarUploadError"; error: string };

function accountReducer(state: AccountState, action: AccountAction): AccountState {
  switch (action.type) {
    case "setField":
      return { ...state, [action.field]: action.value };
    case "startUpdate":
      return { ...state, isUpdating: true, profileError: "", profileSuccess: "" };
    case "updateSuccess":
      return { ...state, isUpdating: false, profileSuccess: action.message };
    case "updateError":
      return { ...state, isUpdating: false, profileError: action.error };
    case "startAvatarUpload":
      return { ...state, isUploadingAvatar: true, avatarError: "" };
    case "avatarUploadSuccess":
      return { ...state, isUploadingAvatar: false, profileImageUrl: action.url };
    case "avatarUploadError":
      return { ...state, isUploadingAvatar: false, avatarError: action.error };
  }
}

type PasswordState = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
  isChangingPassword: boolean;
  passwordError: string;
  passwordSuccess: string;
};

type PasswordAction = 
  | { type: "setField"; field: keyof PasswordState; value: string }
  | { type: "startChange" }
  | { type: "changeSuccess"; message: string }
  | { type: "changeError"; error: string };

function passwordReducer(state: PasswordState, action: PasswordAction): PasswordState {
  switch (action.type) {
    case "setField":
      return { ...state, [action.field]: action.value };
    case "startChange":
      return { ...state, isChangingPassword: true, passwordError: "", passwordSuccess: "" };
    case "changeSuccess":
      return { ...state, isChangingPassword: false, passwordSuccess: action.message, oldPassword: "", newPassword: "", confirmPassword: "" };
    case "changeError":
      return { ...state, isChangingPassword: false, passwordError: action.error };
  }
}

function AccountTab({ initialUser }: { initialUser: { name: string; email: string; profileImageUrl?: string; dob?: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocale = useLocale();
  const t = useTranslations("auth");
  const ct = useTranslations("common");
  const pt = useTranslations("preferences");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // use a reducer with a lazy initializer to avoid derived useState warning
  const [state, dispatch] = useReducer(accountReducer, null, () => ({
    name: initialUser.name,
    dob: initialUser.dob || "",
    profileImageUrl: initialUser.profileImageUrl || "",
    isUpdating: false,
    profileError: "",
    profileSuccess: "",
    isUploadingAvatar: false,
    avatarError: "",
  }));

  const [pwdState, pwdDispatch] = useReducer(passwordReducer, {
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
    isChangingPassword: false,
    passwordError: "",
    passwordSuccess: "",
  });

  function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return pt("somethingWentWrong");
  }

  const handleUpdateProfile = async () => {
    dispatch({ type: "startUpdate" });
    try {
      await updateProfile({ name: state.name, dob: state.dob });
      dispatch({ type: "updateSuccess", message: pt("profileUpdated") });
      router.refresh();
    } catch (err) {
      console.error(err);
      dispatch({ type: "updateError", error: getErrorMessage(err) });
    }
  };

  const handleChangePassword = async () => {
    if (pwdState.newPassword !== pwdState.confirmPassword) {
      pwdDispatch({ type: "changeError", error: pt("passwordsDontMatch") });
      return;
    }
    pwdDispatch({ type: "startChange" });
    try {
      await changePassword(pwdState.oldPassword, pwdState.newPassword);
      pwdDispatch({ type: "changeSuccess", message: pt("passwordUpdated") });
    } catch (err) {
      pwdDispatch({ type: "changeError", error: getErrorMessage(err) });
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const handleLocaleChange = (nextLocale: string) => {
    if (!routing.locales.includes(nextLocale as "en" | "vi")) return;
    router.replace({ pathname, query: Object.fromEntries(searchParams.entries()) }, { locale: nextLocale });
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    dispatch({ type: "startAvatarUpload" });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(pt("avatarUploadFailed"));
      }

      const result = (await response.json()) as { profileImageUrl?: string };

      if (!result.profileImageUrl) {
        throw new Error(pt("avatarUploadFailed"));
      }

      dispatch({ type: "avatarUploadSuccess", url: result.profileImageUrl });
      router.refresh();
    } catch (error) {
      console.error(error);
      dispatch({ type: "avatarUploadError", error: getErrorMessage(error) });
    }
  };

  const displayName = state.name.trim() || initialUser.name;
  const displayEmail = initialUser.email;
  const avatarInitial = (displayName || displayEmail || "U").charAt(0).toUpperCase();

  return (
    <div className="space-y-12">
      <section>
        <h3 className="text-lg font-bold text-[var(--color-text)] mb-6">{pt("account")}</h3>
        <div className="flex flex-col gap-8 xl:flex-row xl:gap-12">
          <ProfileSummaryCard state={state} displayName={displayName} displayEmail={displayEmail} avatarInitial={avatarInitial} dispatch={dispatch} />
          <ProfileForm state={state} initialUser={initialUser} dispatch={dispatch} />
        </div>
      </section>

      <PasswordForm pwdState={pwdState} pwdDispatch={pwdDispatch} />
    </div>
  );
}

function ProfileSummaryCard({
  state,
  displayName,
  displayEmail,
  avatarInitial,
  dispatch
}: {
  state: AccountState;
  displayName: string;
  displayEmail: string;
  avatarInitial: string;
  dispatch: React.Dispatch<AccountAction>;
}) {
  const t = useTranslations("auth");
  const ct = useTranslations("common");
  const pt = useTranslations("preferences");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return pt("somethingWentWrong");
  }

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    dispatch({ type: "startAvatarUpload" });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(pt("avatarUploadFailed"));
      }

      const result = (await response.json()) as { profileImageUrl?: string };

      if (!result.profileImageUrl) {
        throw new Error(pt("avatarUploadFailed"));
      }

      dispatch({ type: "avatarUploadSuccess", url: result.profileImageUrl });
      router.refresh();
    } catch (error) {
      console.error(error);
      dispatch({ type: "avatarUploadError", error: getErrorMessage(error) });
    }
  };

  return (
    <div className="mx-auto flex min-h-72 w-56 shrink-0 flex-col items-center rounded-[32px] border border-[var(--color-border)] bg-[var(--background)] px-6 py-7 xl:mx-0">
      <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-3xl font-bold text-[var(--color-text-muted)]">
        {state.profileImageUrl ? (
          <Image
            src={state.profileImageUrl}
            alt={displayName}
            width={96}
            height={96}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          avatarInitial
        )}
      </div>
      <div className="w-full text-center">
        <h4 className="line-clamp-1 text-lg font-bold leading-tight tracking-tight text-[var(--color-text)]">
          {displayName}
        </h4>
        <p className="mt-1 truncate text-xs leading-4 text-[var(--color-text-secondary)]">
          {displayEmail}
        </p>
      </div>
      <div className="mt-auto w-full space-y-3 pt-6">
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={t("uploadPhoto")}
          onChange={handleAvatarUpload}
          className="sr-only"
        />
        <button
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={state.isUploadingAvatar}
          className="w-full rounded-full border border-[var(--color-border)] px-4 py-2.5 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-alt)] disabled:opacity-50"
        >
          {state.isUploadingAvatar ? ct("saving") : t("uploadPhoto")}
        </button>
        <p className="text-center text-[10px] text-[var(--color-text-muted)]">
          {t("avatarRequirements")}
        </p>
        {state.avatarError && (
          <p className="text-center text-xs font-bold text-[var(--color-destructive)]">
            {state.avatarError}
          </p>
        )}
      </div>
    </div>
  );
}

function ProfileForm({
  state,
  initialUser,
  dispatch
}: {
  state: AccountState;
  initialUser: { name: string; email: string };
  dispatch: React.Dispatch<AccountAction>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocale = useLocale();
  const t = useTranslations("auth");
  const ct = useTranslations("common");
  const pt = useTranslations("preferences");

  function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return pt("somethingWentWrong");
  }

  const handleUpdateProfile = async () => {
    dispatch({ type: "startUpdate" });
    try {
      await updateProfile({ name: state.name, dob: state.dob });
      dispatch({ type: "updateSuccess", message: pt("profileUpdated") });
      router.refresh();
    } catch (err) {
      console.error(err);
      dispatch({ type: "updateError", error: getErrorMessage(err) });
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const handleLocaleChange = (nextLocale: string) => {
    if (!routing.locales.includes(nextLocale as "en" | "vi")) return;
    router.replace({ pathname, query: Object.fromEntries(searchParams.entries()) }, { locale: nextLocale });
  };

  return (
    <div className="flex-1 space-y-6">
      <div className="space-y-2">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">{t("name")}</span>
          <input 
            type="text" 
            value={state.name}
            onChange={(e) => dispatch({ type: "setField", field: "name", value: e.target.value })}
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
            value={initialUser.email}
            readOnly
            disabled
            placeholder={t("email")}
            className="w-full rounded-2xl border border-[var(--color-border)] px-6 py-4 text-sm font-medium focus:border-[var(--color-accent)] outline-none transition-colors bg-[var(--color-canvas)] text-[var(--color-text-secondary)] opacity-60 cursor-not-allowed"
          />
        </label>
      </div>
      <div className="relative">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">{t("dob")}</span>
          <input 
            type="date" 
            value={state.dob}
            onChange={(e) => dispatch({ type: "setField", field: "dob", value: e.target.value })}
            className="w-full rounded-2xl border border-[var(--color-border)] px-6 py-4 text-sm font-medium focus:border-[var(--color-accent)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
          />
        </label>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">{pt("languageLabel")}</span>
        <div className="flex gap-2">
          {routing.locales.map((locale) => (
            <button
              key={locale}
              type="button"
              onClick={() => handleLocaleChange(locale)}
              className={cn(
                "rounded-2xl border px-5 py-3 text-sm font-bold transition-colors",
                currentLocale === locale
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
              )}
            >
              {pt(locale)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button 
          type="button"
          onClick={handleUpdateProfile}
          disabled={state.isUpdating}
          className="px-8 py-3.5 rounded-full bg-[var(--color-text)] text-white text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50"
        >
          {state.isUpdating ? ct("saving") : ct("saveChanges")}
        </button>
        <button 
          type="button"
          onClick={handleLogout}
          className="px-6 py-3.5 rounded-full border border-[var(--color-destructive)]/30 text-[var(--color-destructive)] text-sm font-bold hover:bg-[var(--color-destructive)]/10 transition-colors"
        >
          {t("logout")}
        </button>
      </div>
      {state.profileError && <p className="text-xs font-bold text-[var(--color-destructive)] px-2">{state.profileError}</p>}
      {state.profileSuccess && <p className="text-xs font-bold text-[var(--color-success)] px-2">{state.profileSuccess}</p>}
    </div>
  );
}

function PasswordForm({
  pwdState,
  pwdDispatch
}: {
  pwdState: PasswordState;
  pwdDispatch: React.Dispatch<PasswordAction>;
}) {
  const t = useTranslations("auth");
  const ct = useTranslations("common");
  const pt = useTranslations("preferences");

  function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return pt("somethingWentWrong");
  }

  const handleChangePassword = async () => {
    if (pwdState.newPassword !== pwdState.confirmPassword) {
      pwdDispatch({ type: "changeError", error: pt("passwordsDontMatch") });
      return;
    }
    pwdDispatch({ type: "startChange" });
    try {
      await changePassword(pwdState.oldPassword, pwdState.newPassword);
      pwdDispatch({ type: "changeSuccess", message: pt("passwordUpdated") });
    } catch (err) {
      pwdDispatch({ type: "changeError", error: getErrorMessage(err) });
    }
  };

  return (
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
            value={pwdState.oldPassword}
            onChange={(e) => pwdDispatch({ type: "setField", field: "oldPassword", value: e.target.value })}
            className="w-full rounded-2xl border border-[var(--color-border)] px-6 py-4 text-sm font-medium focus:border-[var(--color-accent)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">{t("newPassword")}</span>
          <input 
            type="password" 
            placeholder={t("newPassword")} 
            value={pwdState.newPassword}
            onChange={(e) => pwdDispatch({ type: "setField", field: "newPassword", value: e.target.value })}
            className="w-full rounded-2xl border border-[var(--color-border)] px-6 py-4 text-sm font-medium focus:border-[var(--color-accent)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">{t("confirmPassword")}</span>
          <input 
            type="password" 
            placeholder={t("confirmPassword")} 
            value={pwdState.confirmPassword}
            onChange={(e) => pwdDispatch({ type: "setField", field: "confirmPassword", value: e.target.value })}
            className="w-full rounded-2xl border border-[var(--color-border)] px-6 py-4 text-sm font-medium focus:border-[var(--color-accent)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
          />
        </label>
        {pwdState.passwordError && <p className="text-xs font-bold text-[var(--color-destructive)] px-2">{pwdState.passwordError}</p>}
        {pwdState.passwordSuccess && <p className="text-xs font-bold text-[var(--color-success)] px-2">{pwdState.passwordSuccess}</p>}
        <button 
          type="button"
          onClick={handleChangePassword}
          disabled={pwdState.isChangingPassword}
          className="w-fit px-8 py-3.5 rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] text-sm font-bold hover:bg-[var(--color-surface-alt)] transition-all disabled:opacity-50"
        >
          {pwdState.isChangingPassword ? ct("saving") : ct("save")}
        </button>
      </div>
    </section>
  );
}
