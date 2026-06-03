import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n-client";
import { FileQuestion } from "lucide-react";

export default async function NotFound() {
  const t = await getTranslations("routeErrors");

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-[#f7f7f5] p-6 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
        <FileQuestion size={40} />
      </div>
      <h2 className="mb-2 text-3xl font-extrabold text-slate-900 tracking-tight">{t("projectNotFoundTitle")}</h2>
      <p className="mb-8 text-sm text-slate-500 max-w-md">{t("projectNotFoundDescription")}</p>
      <Link
        href="/"
        className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-105 active:scale-95"
      >
        {t("backToDashboard")}
      </Link>
    </div>
  );
}
