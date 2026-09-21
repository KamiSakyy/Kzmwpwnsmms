import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { useUIActions } from "@/store/ui";
import { Icon, Logo, type IconName } from "./Icon";
import { IconButton } from "./ui";

const TABS: { to: string; label: string; icon: IconName; iconActive: IconName }[] = [
  { to: "/", label: "Главная", icon: "home_outline", iconActive: "home" },
  { to: "/search", label: "Поиск", icon: "search", iconActive: "search" },
  { to: "/browse", label: "Обзор", icon: "explore_outline", iconActive: "explore" },
  { to: "/library", label: "Медиатека", icon: "library_music_outline", iconActive: "library_music" },
];

/** iOS tab bar — solid, hairline top separator, no blur */
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-black hairline-t safe-bottom md:hidden" aria-label="Навигация">
      <div className="mx-auto flex h-[49px] max-w-lg items-stretch justify-around">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === "/"} className="tap flex flex-1 flex-col items-center justify-center gap-[3px] pt-1">
            {({ isActive }) => (
              <>
                <Icon name={isActive ? t.iconActive : t.icon} size={25} className={isActive ? "text-primary" : "text-on-surface-dim"} />
                <span className={cn("text-[10px] font-medium leading-none", isActive ? "text-primary" : "text-on-surface-dim")}>{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Desktop sidebar */
export function NavRail() {
  const { openSettings } = useUIActions();
  return (
    <nav className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col border-r border-white/[0.07] bg-surface-1 px-3 pt-5 md:flex" aria-label="Навигация">
      <NavLink to="/" className="mb-6 flex items-center gap-2.5 px-2">
        <Logo size={30} />
        <span className="text-[19px] font-bold tracking-[-0.02em] text-on-surface">AniBeat</span>
      </NavLink>
      <div className="flex flex-col gap-0.5">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === "/"} className="tap">
            {({ isActive }) => (
              <span className={cn("flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] font-medium transition-colors", isActive ? "bg-primary/18 text-primary" : "text-on-surface hover:bg-white/[0.06]")}>
                <Icon name={isActive ? t.iconActive : t.icon} size={22} />
                {t.label}
              </span>
            )}
          </NavLink>
        ))}
      </div>
      <button type="button" onClick={openSettings} className="tap mt-auto mb-5 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] font-medium text-on-surface-variant hover:bg-white/[0.06]">
        <Icon name="settings" size={22} />
        Настройки
      </button>
    </nav>
  );
}

/**
 * iOS navigation bar. With `large` it renders an inline large title that collapses
 * into the compact bar on scroll.
 */
export function TopBar({
  title,
  back,
  actions,
  transparent,
  large,
  children,
}: {
  title?: ReactNode;
  back?: boolean;
  actions?: ReactNode;
  transparent?: boolean;
  large?: boolean;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!large) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { rootMargin: "-52px 0px 0px 0px", threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [large]);

  return (
    <>
      <header className={cn("sticky top-0 z-30 safe-top", transparent ? "bg-transparent" : "bar", !transparent && (large ? scrolled && "hairline-b" : "hairline-b"))}>
        <div className="mx-auto flex h-[46px] max-w-6xl items-center gap-1 px-1.5 md:px-4">
          {back && (
            <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))} className={cn("tap flex h-10 items-center gap-0.5 rounded-full pl-1 pr-2 text-[17px] text-primary", transparent && "bg-black/45")} aria-label="Назад">
              <Icon name="arrow_back" size={22} />
              <span className="hidden sm:inline">Назад</span>
            </button>
          )}
          {title && (
            <h1 className={cn("min-w-0 flex-1 truncate text-center text-[17px] font-semibold text-on-surface transition-opacity duration-200", large && !scrolled && "opacity-0", !back && !large && "pl-3 text-left")}>{title}</h1>
          )}
          {children}
          <div className="flex min-w-[44px] items-center justify-end">{actions}</div>
        </div>
      </header>
      {large && (
        <>
          <div ref={sentinel} className="h-px" />
          <h1 className="mx-auto max-w-6xl px-4 pb-1 pt-1 text-[34px] font-bold leading-tight tracking-[-0.03em] text-on-surface md:px-6">{title}</h1>
        </>
      )}
    </>
  );
}

export { IconButton };
