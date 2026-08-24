import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { api } from "./api";
import {
  authErrorMetadata,
  safeAuthErrorMessage,
  type AuthOperation,
} from "./auth-errors";
import type {
  AppTab,
  College,
  CollegeCode,
  CourseCard,
  CourseDetail,
  CourseTab,
  Instructor,
  PlannerCourse,
  PlannerPlan,
  PlannerTerm,
  Requirement,
  Theme,
} from "./types";

const COLLEGE_NAMES: Record<CollegeCode, string> = {
  GW: "Golden West",
  OC: "Orange Coast",
  CL: "Coastline",
};
const THEME_STORAGE_KEY = "cccd-theme";
const ALL_STATUSES = ["OPEN", "Waitlisted", "CLOSED"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FAVORITES_STORAGE_KEY = "cccd-favorites";

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
function collegeName(code: CollegeCode) {
  return COLLEGE_NAMES[code] || code;
}
function rmpUrl(name: string) {
  return `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(name)}`;
}
function plural(value: number, singular: string) {
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}
function favoriteKey(
  college: CollegeCode,
  subject: string,
  courseNumber: string,
) {
  return `${college}|${subject}|${courseNumber}`;
}
function readFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function writeFavorites(favorites: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favorites]));
  } catch {
    /* ignore */
  }
}
function formatRelativeTime(isoLike: string): string {
  const normalized = isoLike.includes("T")
    ? isoLike
    : `${isoLike.replace(" ", "T")}Z`;
  const then = new Date(normalized);
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  return `${plural(Math.round(hours / 24), "day")} ago`;
}
function readTabFromUrl(): AppTab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "professors" || value === "planner" || value === "contact"
    ? value
    : "classes";
}

type AuthContextValue = {
  client: SupabaseClient | null;
  user: User | null;
  loading: boolean;
  availability: "loading" | "ready" | "unavailable" | "error";
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue>({
  client: null,
  user: null,
  loading: true,
  availability: "loading",
  signOut: async () => undefined,
});
function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] =
    useState<AuthContextValue["availability"]>("loading");
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void api
      .config()
      .then(async (config) => {
        if (!active) return;
        if (
          !config.authConfigured ||
          !config.supabaseUrl ||
          !config.supabaseAnonKey
        ) {
          setAvailability("unavailable");
          return;
        }
        const nextClient = createClient(
          config.supabaseUrl,
          config.supabaseAnonKey,
        );
        setClient(nextClient);
        const { data, error } = await nextClient.auth.getSession();
        if (error) throw error;
        if (active) setUser(data.session?.user ?? null);
        const listener = nextClient.auth.onAuthStateChange(
          (_event, session) => {
            setUser(session?.user ?? null);
          },
        );
        unsubscribe = () => listener.data.subscription.unsubscribe();
        setAvailability("ready");
      })
      .catch(() => {
        if (active) setAvailability("error");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  const signOut = useCallback(async () => {
    if (client) await client.auth.signOut();
  }, [client]);
  return (
    <AuthContext.Provider
      value={{ client, user, loading, availability, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      try {
        if (!localStorage.getItem(THEME_STORAGE_KEY))
          setTheme(media.matches ? "dark" : "light");
      } catch {
        /* ignore */
      }
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const switchTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  };
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-pressed={theme === "dark"}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      onClick={switchTheme}
    >
      <span className="theme-toggle-icon" aria-hidden="true" />
    </button>
  );
}

function Modal({
  children,
  className = "",
  onClose,
}: {
  children: ReactNode;
  className?: string;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal ${className}`} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
function RatingSummary({
  avg_rating,
  rating_count,
}: {
  avg_rating: number | null;
  rating_count: number;
}) {
  return (
    <span className="rating">
      {avg_rating != null ? (
        <>
          <span className="stars">★ {avg_rating}</span>{" "}
          <span>({rating_count})</span>
        </>
      ) : (
        <span className="no-rating">No ratings yet</span>
      )}
    </span>
  );
}
function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const kind = normalized.includes("open")
    ? "open"
    : normalized.includes("closed")
      ? "closed"
      : normalized.includes("wait")
        ? "waitlist"
        : "";
  return <span className={`badge ${kind}`}>{status || "—"}</span>;
}
function ModalityBadge({ modality }: { modality: string }) {
  return (
    <span
      className={`badge modality-${(modality || "tba").toLowerCase().replace(/\s+/g, "-")}`}
    >
      {modality || "TBA"}
    </span>
  );
}

function AuthDialog({
  mode,
  onClose,
}: {
  mode: "signin" | "signup";
  onClose: () => void;
}) {
  const { client, availability } = useAuth();
  const [authMode, setAuthMode] = useState(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const handleAuthError = (authError: unknown, operation: AuthOperation) => {
    const metadata = authErrorMetadata(authError);
    // No email, password, provider message, tokens, or project details are logged.
    console.warn("Authentication request failed", { operation, ...metadata });
    setError(safeAuthErrorMessage(authError, operation));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!client || availability !== "ready") {
      setError(
        availability === "unavailable"
          ? "Sign-in is not configured for this deployment yet. Class search remains available without an account."
          : "Sign-in is temporarily unavailable. Please try again later.",
      );
      return;
    }
    if (!email || !password) {
      setError("Enter an email and password.");
      return;
    }
    setBusy(true);
    try {
      if (authMode === "signup") {
        const { data, error: authError } = await client.auth.signUp({
          email,
          password,
        });
        if (authError) {
          handleAuthError(authError, "signup");
        } else if (data.session) onClose();
        else
          setNotice(
            "If this address can be registered, you’ll receive an email with the next step.",
          );
      } else {
        const { error: authError } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) {
          handleAuthError(authError, "signin");
        } else onClose();
      }
    } catch (authError) {
      handleAuthError(authError, authMode);
    } finally {
      setBusy(false);
    }
  };
  const unavailableMessage =
    availability === "unavailable"
      ? "Sign-in is not configured for this deployment yet. Class search remains available without an account."
      : availability === "error"
        ? "Sign-in is temporarily unavailable. Please try again later."
        : availability === "loading"
          ? "Checking sign-in availability…"
          : "";
  return (
    <Modal onClose={onClose}>
      <h3>{authMode === "signup" ? "Sign up" : "Sign in"}</h3>
      {unavailableMessage && (
        <p className="auth-error" role="alert">
          {unavailableMessage}
        </p>
      )}
      {error && <p className="auth-error">{error}</p>}
      {notice && <p className="auth-notice">{notice}</p>}
      <form onSubmit={submit}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Email"
          className="auth-input"
          autoComplete="email"
          disabled={availability !== "ready"}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password"
          className="auth-input"
          autoComplete={
            authMode === "signup" ? "new-password" : "current-password"
          }
          disabled={availability !== "ready"}
        />
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || availability !== "ready"}
          >
            {busy
              ? "Please wait…"
              : authMode === "signup"
                ? "Sign up"
                : "Sign in"}
          </button>
        </div>
      </form>
      <p className="modal-note">
        <button
          className="text-button"
          onClick={() => {
            setAuthMode(authMode === "signin" ? "signup" : "signin");
            setError("");
            setNotice("");
          }}
        >
          {authMode === "signup"
            ? "Already have an account? Sign in"
            : "Don't have an account? Sign up"}
        </button>
      </p>
    </Modal>
  );
}

function RatingDialog({
  instructor,
  college,
  onClose,
  onRated,
}: {
  instructor: string;
  college: CollegeCode;
  onClose: () => void;
  onRated: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!rating) {
      setError("Pick a star rating first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.addRating({ instructor, college, rating, comment });
      onRated();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose}>
      <h3>Rate {instructor}</h3>
      {error && <p className="auth-error">{error}</p>}
      <div className="star-picker" aria-label="Rating out of five">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={value <= rating ? "filled" : ""}
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            onClick={() => setRating(value)}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment (visible to other students on this site)"
        maxLength={500}
      />
      <div className="modal-actions">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Submitting…" : "Submit rating"}
        </button>
      </div>
      <p className="modal-note">
        Ratings here are submitted by users of this site directly — not pulled
        from any other site.
      </p>
    </Modal>
  );
}

function readClassFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const statuses = params.get("statuses");
  return {
    q: params.get("q") ?? "",
    college: params.get("college") ?? "",
    requirement: params.get("requirement") ?? "",
    modality: params.get("modality") ?? "",
    min: params.has("units_min") ? Number(params.get("units_min")) : 0,
    max: params.has("units_max") ? Number(params.get("units_max")) : 5,
    statuses: statuses ? statuses.split(",").filter(Boolean) : ALL_STATUSES,
    sort: params.get("sort") ?? "relevance",
    favoritesOnly: params.get("favorites") === "1",
  };
}

function ClassesPage({
  colleges,
  requirements,
  onOpenCourse,
}: {
  colleges: College[];
  requirements: Requirement[];
  onOpenCourse: (course: CourseCard) => void;
}) {
  const [filters, setFilters] = useState(readClassFiltersFromUrl);
  const [cards, setCards] = useState<CourseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(readFavorites);
  const timer = useRef<number | undefined>(undefined);
  const search = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.college) params.set("college", filters.college);
    if (filters.requirement) params.set("requirement", filters.requirement);
    if (filters.modality) params.set("modality", filters.modality);
    if (filters.sort) params.set("sort", filters.sort);
    if (filters.min > 0) params.set("units_min", String(filters.min));
    if (filters.max < 5) params.set("units_max", String(filters.max));
    if (filters.statuses.length < ALL_STATUSES.length)
      params.set("statuses", filters.statuses.join(","));
    if (filters.favoritesOnly) params.set("favorites", "1");
    // Mirror filter state into the URL (replaceState, not pushState -- we
    // don't want every keystroke/checkbox toggle to add a back-button entry)
    // so a search/filter combination can be bookmarked or shared as a link.
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs}` : window.location.pathname,
    );
    try {
      setCards(await api.courseCards(params));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void search(), 250);
    return () => window.clearTimeout(timer.current);
  }, [search]);
  const update = <K extends keyof typeof filters>(
    key: K,
    value: (typeof filters)[K],
  ) => setFilters((current) => ({ ...current, [key]: value }));
  const toggleFavorite = (course: CourseCard) => {
    setFavorites((current) => {
      const key = favoriteKey(
        course.college,
        course.subject,
        course.course_number,
      );
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeFavorites(next);
      return next;
    });
  };
  const visibleCards = filters.favoritesOnly
    ? cards.filter((c) =>
        favorites.has(favoriteKey(c.college, c.subject, c.course_number)),
      )
    : cards;
  const statusChange = (status: string, checked: boolean) =>
    update(
      "statuses",
      checked
        ? [...filters.statuses, status]
        : filters.statuses.filter((item) => item !== status),
    );
  const rangePercent = {
    left: `${(filters.min / 5) * 100}%`,
    right: `${100 - (filters.max / 5) * 100}%`,
  };
  return (
    <div className="classes-layout">
      <aside className="sidebar">
        <h3 className="sidebar-title">Filters</h3>
        <div className="sidebar-block">
          <input
            value={filters.q}
            onChange={(e) => update("q", e.target.value)}
            type="text"
            placeholder="Search course, title, CRN, or instructor..."
          />
        </div>
        <div className="sidebar-block">
          <h4>College</h4>
          <select
            value={filters.college}
            onChange={(e) => update("college", e.target.value)}
          >
            <option value="">All Colleges</option>
            {colleges.map((college) => (
              <option key={college.code} value={college.code}>
                {college.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sidebar-block">
          <h4>Requirement</h4>
          <select
            value={filters.requirement}
            onChange={(e) => update("requirement", e.target.value)}
          >
            <option value="">Any Requirement</option>
            {requirements.map((requirement) => (
              <option key={requirement.key} value={requirement.key}>
                {requirement.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sidebar-block">
          <h4>Modality</h4>
          <select
            value={filters.modality}
            onChange={(e) => update("modality", e.target.value)}
          >
            <option value="">Any Modality</option>
            {["In-Person", "Online", "Live Online", "TBA"].map((modality) => (
              <option key={modality}>{modality}</option>
            ))}
          </select>
        </div>
        <div className="sidebar-block">
          <h4>Units</h4>
          <div className="unit-slider">
            <div className="unit-slider-track" />
            <div className="unit-slider-range" style={rangePercent} />
            <input
              type="range"
              min="0"
              max="5"
              step="0.5"
              value={filters.min}
              onChange={(e) =>
                update("min", Math.min(Number(e.target.value), filters.max))
              }
            />
            <input
              type="range"
              min="0"
              max="5"
              step="0.5"
              value={filters.max}
              onChange={(e) =>
                update("max", Math.max(Number(e.target.value), filters.min))
              }
            />
          </div>
          <div className="unit-slider-labels">
            <span>{filters.min}</span>
            <span>–</span>
            <span>{filters.max >= 5 ? "5+" : filters.max}</span>
            <span>units</span>
          </div>
        </div>
        <div className="sidebar-block">
          <h4>Enrollment status</h4>
          {ALL_STATUSES.map((status) => (
            <label className="checkbox" key={status}>
              <input
                type="checkbox"
                checked={filters.statuses.includes(status)}
                onChange={(e) => statusChange(status, e.target.checked)}
              />
              {status === "Waitlisted"
                ? "Waitlisted"
                : status[0] + status.slice(1).toLowerCase()}
            </label>
          ))}
        </div>
        <div className="sidebar-block">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={filters.favoritesOnly}
              onChange={(e) => update("favoritesOnly", e.target.checked)}
            />
            ★ Favorites only
          </label>
        </div>
        <div className="sidebar-block">
          <h4>Sort by</h4>
          <select
            value={filters.sort}
            onChange={(e) => update("sort", e.target.value)}
          >
            {[
              ["relevance", "Relevance"],
              ["units", "Units"],
              ["rating", "Rating"],
              ["seats", "Seats available"],
              ["requirements", "Requirements"],
              ["semester", "Semester"],
              ["datetime", "Date & time"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </aside>
      <div className="cards-col">
        <div className="status">
          <span>
            {loading
              ? "Searching…"
              : `${plural(visibleCards.length, "course")}${cards.length === 300 ? " (showing first 300 — narrow your search)" : ""}`}
          </span>
          {error && (
            <span className="inline-error">
              {error}{" "}
              <button className="text-button" onClick={() => void search()}>
                Retry
              </button>
            </span>
          )}
        </div>
        {!loading && !error && visibleCards.length === 0 && (
          <div className="planner-empty">No courses match these filters.</div>
        )}
        <div className="course-cards">
          {visibleCards.map((course) => (
            <CourseCardView
              key={`${course.college}-${course.subject}-${course.course_number}`}
              course={course}
              favorited={favorites.has(
                favoriteKey(
                  course.college,
                  course.subject,
                  course.course_number,
                ),
              )}
              onClick={() => onOpenCourse(course)}
              onToggleFavorite={() => toggleFavorite(course)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CourseCardView({
  course,
  favorited,
  onClick,
  onToggleFavorite,
}: {
  course: CourseCard;
  favorited: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;
}) {
  const units =
    course.units_min === course.units_max
      ? course.units_min
      : `${course.units_min}–${course.units_max}`;
  return (
    <div
      className="course-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="course-card-top">
        <div className="course-card-top-left">
          <span className="course-card-code">
            {course.subject} {course.course_number}
          </span>
          <span className="badge">
            {units} unit{course.units_max === 1 ? "" : "s"}
          </span>
        </div>
        <button
          type="button"
          className={`course-card-favorite${favorited ? " favorited" : ""}`}
          aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          {favorited ? "★" : "☆"}
        </button>
      </div>
      <div className="course-card-title">{course.title}</div>
      <div className="course-card-college">{collegeName(course.college)}</div>
      {course.description && (
        <p className="course-card-desc">{course.description}</p>
      )}
      <div className="course-card-bottom">
        <RatingSummary {...course} />
        <span className="course-card-sections">
          {plural(course.section_count, "section")}
        </span>
      </div>
      <div className="course-card-bottom">
        {course.seats_available > 0 ? (
          <span className="badge open">
            {plural(course.seats_available, "seat")} open
          </span>
        ) : (
          <span className="badge closed">Full</span>
        )}
        {course.requirement_count > 0 && (
          <span className="badge modality-in-person">
            {plural(course.requirement_count, "requirement")}
          </span>
        )}
      </div>
    </div>
  );
}

function ProfessorsPage({
  colleges,
  onRate,
}: {
  colleges: College[];
  onRate: (
    instructor: string,
    college: CollegeCode,
    refresh: () => void,
  ) => void;
}) {
  const [q, setQ] = useState("");
  const [college, setCollege] = useState("");
  const [rows, setRows] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const search = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (college) params.set("college", college);
    try {
      setRows(await api.instructors(params));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [q, college]);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void search(), 250);
    return () => window.clearTimeout(timer.current);
  }, [search]);
  return (
    <>
      <div className="filters">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="text"
          placeholder="Search professor name..."
        />
        <select value={college} onChange={(e) => setCollege(e.target.value)}>
          <option value="">All Colleges</option>
          {colleges.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="status">
        {loading ? "Searching…" : `${plural(rows.length, "instructor")}`}
        {error && (
          <span className="inline-error">
            {error}{" "}
            <button className="text-button" onClick={() => void search()}>
              Retry
            </button>
          </span>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Instructor</th>
              <th>College</th>
              <th>Sections</th>
              <th>Rating</th>
              <th>RateMyProfessor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.instructor}-${row.college}`}>
                <td>{row.instructor}</td>
                <td>{collegeName(row.college)}</td>
                <td>{row.section_count}</td>
                <td>
                  <RatingSummary {...row} />{" "}
                  <button
                    className="rate-btn"
                    onClick={() =>
                      onRate(row.instructor, row.college, () => void search())
                    }
                  >
                    Rate
                  </button>
                </td>
                <td>
                  <a
                    className="rmp-link"
                    href={row.rmp_search_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Search on RateMyProfessor →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SeatAlertDialog({
  college,
  subject,
  courseNumber,
  crn,
  term,
  onClose,
}: {
  college: CollegeCode;
  subject: string;
  courseNumber: string;
  crn: string;
  term: string;
  onClose: () => void;
}) {
  const { client, availability } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!EMAIL_RE.test(email)) {
      setError("Enter a valid email.");
      return;
    }
    if (!client || availability !== "ready") {
      setError(
        availability === "unavailable"
          ? "Seat alerts are not configured for this deployment yet."
          : "Seat alerts are temporarily unavailable. Please try again later.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: insertError } = await client.from("seat_alerts").insert({
        email,
        college,
        subject,
        course_number: courseNumber,
        crn,
        term,
      });
      if (insertError) throw insertError;
      setSuccess(true);
      window.setTimeout(onClose, 1500);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose}>
      <h3>Notify me when a seat opens</h3>
      <p className="modal-note">
        {subject} {courseNumber} · CRN {crn} · {collegeName(college)}
      </p>
      {error && <p className="auth-error">{error}</p>}
      {success && (
        <p className="auth-notice">
          You're set — we'll email you when a seat opens.
        </p>
      )}
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="Your email"
        className="auth-input"
        autoComplete="email"
        disabled={busy || success}
      />
      <div className="modal-actions">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={busy || success}
          onClick={() => void submit()}
        >
          {busy ? "Submitting…" : "Notify me"}
        </button>
      </div>
      <p className="modal-note">
        One-time email, sent as soon as this section flips to Open, then the
        alert is cleared.
      </p>
    </Modal>
  );
}

function CourseDetailDialog({
  course,
  onClose,
  onRate,
  onRefresh,
}: {
  course: Pick<CourseCard, "college" | "subject" | "course_number" | "term">;
  onClose: () => void;
  onRate: (
    instructor: string,
    college: CollegeCode,
    refresh: () => void,
  ) => void;
  onRefresh: () => void;
}) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<CourseTab>("overview");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [plan, setPlan] = useState<PlannerPlan>({ terms: [] });
  const [plannerError, setPlannerError] = useState("");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [alertSection, setAlertSection] = useState<
    CourseDetail["sections"][number] | null
  >(null);
  const { loadPlan, addCourse } = usePlanner();
  const load = useCallback(async () => {
    setError("");
    setSectionIndex(0);
    try {
      setDetail(
        await api.course(
          course.college,
          course.subject,
          course.course_number,
          course.term,
        ),
      );
    } catch (err) {
      setError(errorText(err));
    }
  }, [course]);
  useEffect(() => {
    void load();
  }, [load]);
  const openPlanner = async () => {
    if (!user) return;
    try {
      setPlan(await loadPlan());
      setPlannerError("");
      setMenuOpen(true);
    } catch (err) {
      setPlannerError(errorText(err));
      setMenuOpen(true);
    }
  };
  const saveNote = async () => {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      const response = await api.addRequirement({
        college: course.college,
        subject: course.subject,
        course_number: course.course_number,
        text: note.trim(),
      });
      setDetail((current) =>
        current ? { ...current, requirements: response.requirements } : current,
      );
      setNote("");
      onRefresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSavingNote(false);
    }
  };
  const selectedSection = detail?.sections[sectionIndex] ?? detail?.sections[0];
  const plannedCourse: PlannerCourse | null = detail
    ? {
        college: detail.college,
        subject: detail.subject,
        course_number: detail.course_number,
        title: detail.title,
        units: selectedSection ? Number(selectedSection.credits) : null,
        crn: selectedSection?.crn ?? null,
        term: detail.term,
        meeting_info: selectedSection?.meeting_info ?? null,
        location: selectedSection?.location ?? null,
      }
    : null;
  return (
    <>
      <Modal className="course-modal" onClose={onClose}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="course-modal-header">
          <h2>
            {detail
              ? `${detail.subject} ${detail.course_number} — ${detail.title || ""}`
              : `${course.subject} ${course.course_number}`}
          </h2>
          <p className="course-modal-subtitle">
            {detail
              ? `${collegeName(detail.college)} · ${detail.term_desc || ""}`
              : "Loading…"}
          </p>
          <div className="add-to-plan">
            {detail && detail.sections.length > 1 && (
              <select
                className="add-to-plan-section"
                value={sectionIndex}
                onChange={(e) => setSectionIndex(Number(e.target.value))}
              >
                {detail.sections.map((section, index) => (
                  <option key={section.crn} value={index}>
                    CRN {section.crn}
                    {section.instructor ? ` · ${section.instructor}` : ""}
                    {section.meeting_info
                      ? ` · ${section.meeting_info.slice(0, 40)}`
                      : ""}
                  </option>
                ))}
              </select>
            )}
            {user && (
              <button
                className="btn-secondary"
                onClick={() => void openPlanner()}
              >
                + Add to Plan
              </button>
            )}
            {menuOpen && (
              <div className="add-to-plan-menu">
                {plannerError ? (
                  <div className="add-to-plan-empty">{plannerError}</div>
                ) : plan.terms.length ? (
                  plan.terms.map((term) => {
                    const added = term.courses.some(
                      (item) =>
                        item.college === course.college &&
                        item.subject === course.subject &&
                        item.course_number === course.course_number,
                    );
                    return (
                      <button
                        className="add-to-plan-option"
                        key={term.id}
                        disabled={added || !plannedCourse}
                        onClick={() => {
                          if (plannedCourse)
                            void addCourse(term.id, plannedCourse).then(() =>
                              setMenuOpen(false),
                            );
                        }}
                      >
                        <span>{term.label}</span>
                        {added && <span className="added-check">Added ✓</span>}
                      </button>
                    );
                  })
                ) : (
                  <div className="add-to-plan-empty">
                    No semesters yet — go to the Planner tab to add one.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="course-modal-tabs">
          {(["overview", "sections", "requirements"] as CourseTab[]).map(
            (name) => (
              <button
                key={name}
                className={`course-tab-btn ${tab === name ? "active" : ""}`}
                onClick={() => setTab(name)}
              >
                {name[0].toUpperCase() + name.slice(1)}
              </button>
            ),
          )}
        </div>
        <div className="course-modal-body">
          {error && <p className="auth-error">{error}</p>}
          {!detail && !error && (
            <p className="no-rating">Loading course details…</p>
          )}
          {detail && tab === "overview" && (
            <div>
              {detail.description ? (
                <p>{detail.description}</p>
              ) : (
                <p className="no-rating">No description available.</p>
              )}
              {detail.corequisites && (
                <p>
                  <strong>Corequisites:</strong> {detail.corequisites}
                </p>
              )}
              {detail.transfer_credit && (
                <p>
                  <strong>Transfer credit:</strong> {detail.transfer_credit}
                </p>
              )}
              {detail.assist_url && (
                <p>
                  <a
                    className="rmp-link"
                    href={detail.assist_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    See what {collegeName(detail.college)} courses transfer as
                    on ASSIST.org →
                  </a>
                </p>
              )}
            </div>
          )}
          {detail && tab === "sections" && (
            <div className="section-cards">
              {detail.sections.map((section) => (
                <div className="section-card" key={section.crn}>
                  <div className="section-card-top">
                    <span className="section-card-crn">CRN {section.crn}</span>
                    <ModalityBadge modality={section.modality} />
                  </div>
                  <div className="section-card-instructor">
                    {section.instructor || "—"}
                  </div>
                  {section.instructor && (
                    <>
                      <div className="section-card-rating">
                        <RatingSummary {...section} />{" "}
                        <button
                          className="rate-btn"
                          onClick={() =>
                            onRate(
                              section.instructor,
                              section.college,
                              () => void load(),
                            )
                          }
                        >
                          Rate
                        </button>
                      </div>
                      <div className="section-card-links">
                        <a
                          className="rmp-link"
                          href={rmpUrl(section.instructor)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Search on RateMyProfessor →
                        </a>
                      </div>
                    </>
                  )}
                  <div className="section-card-row">
                    <span className="label">Meeting:</span>
                    {section.meeting_info || "—"}
                  </div>
                  <div className="section-card-row">
                    <span className="label">Location:</span>
                    {section.location || "—"}
                  </div>
                  <div className="section-card-bottom">
                    <span className="section-card-row">
                      <span className="label">Seats:</span>
                      {section.cap != null
                        ? `${section.act}/${section.cap}`
                        : "—"}
                    </span>
                    <StatusBadge status={section.status} />
                  </div>
                  {section.status !== "OPEN" && (
                    <button
                      className="alert-btn"
                      onClick={() => setAlertSection(section)}
                    >
                      🔔 Notify me when open
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {detail && tab === "requirements" && (
            <div>
              <div className="requirements-list">
                {detail.requirements.length ? (
                  detail.requirements.map((requirement) => (
                    <div className="requirement-item" key={requirement.id}>
                      <p>{requirement.requirement_text}</p>
                      <span className="requirement-date">
                        {new Date(
                          `${requirement.created_at}Z`,
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="no-rating">
                    No requirements submitted yet — be the first.
                  </p>
                )}
              </div>
              <div className="requirement-form">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a requirement or note for students (e.g. prior coursework, materials needed)..."
                  maxLength={500}
                />
                <button
                  className="btn-primary"
                  disabled={savingNote || !note.trim()}
                  onClick={() => void saveNote()}
                >
                  {savingNote ? "Saving…" : "Add requirement"}
                </button>
              </div>
              <p className="modal-note">
                Requirements here are submitted directly by users of this site.
              </p>
            </div>
          )}
        </div>
      </Modal>
      {alertSection && detail && (
        <SeatAlertDialog
          college={detail.college}
          subject={detail.subject}
          courseNumber={detail.course_number}
          crn={alertSection.crn}
          term={detail.term}
          onClose={() => setAlertSection(null)}
        />
      )}
    </>
  );
}

type PlannerContextValue = {
  plan: PlannerPlan;
  loading: boolean;
  error: string;
  loadPlan: () => Promise<PlannerPlan>;
  addSemester: (label: string) => Promise<void>;
  removeSemester: (id: string) => Promise<void>;
  renameSemester: (id: string, label: string) => Promise<void>;
  addCourse: (termId: string, course: PlannerCourse) => Promise<void>;
  removeCourse: (termId: string, course: PlannerCourse) => Promise<void>;
};
const PlannerContext = createContext<PlannerContextValue | null>(null);
function usePlanner() {
  const context = useContext(PlannerContext);
  if (!context) throw new Error("Planner provider missing");
  return context;
}
function PlannerProvider({ children }: { children: ReactNode }) {
  const { client, user } = useAuth();
  const [plan, setPlan] = useState<PlannerPlan>({ terms: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadPlan = useCallback(async () => {
    if (!client || !user) {
      const empty = { terms: [] };
      setPlan(empty);
      return empty;
    }
    setLoading(true);
    setError("");
    try {
      const [
        { data: terms, error: termsError },
        { data: courses, error: coursesError },
      ] = await Promise.all([
        client.from("planner_terms").select("*").order("position"),
        client.from("planner_courses").select("*"),
      ]);
      if (termsError || coursesError) throw termsError || coursesError;
      const next = {
        terms: (terms || []).map((term) => ({
          id: term.id as string,
          label: term.label as string,
          position: term.position as number,
          courses: (courses || [])
            .filter((course) => course.term_id === term.id)
            .map((course) => ({
              college: course.college as CollegeCode,
              subject: course.subject as string,
              course_number: course.course_number as string,
              title: course.title as string | null,
              units: course.units == null ? null : Number(course.units),
              crn: (course.crn as string | null) ?? null,
              term: (course.term as string | null) ?? null,
              meeting_info: (course.meeting_info as string | null) ?? null,
              location: (course.location as string | null) ?? null,
            })),
        })),
      };
      setPlan(next);
      return next;
    } catch (err) {
      setError(errorText(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, user]);
  useEffect(() => {
    void loadPlan().catch(() => undefined);
  }, [loadPlan]);
  const mutate = async (action: () => Promise<void>) => {
    setError("");
    try {
      await action();
      await loadPlan();
    } catch (err) {
      setError(errorText(err));
      throw err;
    }
  };
  const addSemester = (label: string) =>
    mutate(async () => {
      if (!client || !user) return;
      const position = plan.terms.length
        ? Math.max(...plan.terms.map((term) => term.position ?? 0)) + 1
        : 0;
      const { error: insertError } = await client
        .from("planner_terms")
        .insert({ user_id: user.id, label, position });
      if (insertError) throw insertError;
    });
  const removeSemester = (id: string) =>
    mutate(async () => {
      if (!client) return;
      const { error: deleteError } = await client
        .from("planner_terms")
        .delete()
        .eq("id", id);
      if (deleteError) throw deleteError;
    });
  const renameSemester = (id: string, label: string) =>
    mutate(async () => {
      if (!client || !label) return;
      const { error: updateError } = await client
        .from("planner_terms")
        .update({ label })
        .eq("id", id);
      if (updateError) throw updateError;
    });
  const addCourse = (termId: string, course: PlannerCourse) =>
    mutate(async () => {
      if (!client || !user) return;
      const { error: upsertError } = await client
        .from("planner_courses")
        .upsert(
          { term_id: termId, user_id: user.id, ...course },
          { onConflict: "term_id,college,subject,course_number" },
        );
      if (upsertError) throw upsertError;
    });
  const removeCourse = (termId: string, course: PlannerCourse) =>
    mutate(async () => {
      if (!client) return;
      const { error: deleteError } = await client
        .from("planner_courses")
        .delete()
        .eq("term_id", termId)
        .eq("college", course.college)
        .eq("subject", course.subject)
        .eq("course_number", course.course_number);
      if (deleteError) throw deleteError;
    });
  return (
    <PlannerContext.Provider
      value={{
        plan,
        loading,
        error,
        loadPlan,
        addSemester,
        removeSemester,
        renameSemester,
        addCourse,
        removeCourse,
      }}
    >
      {children}
    </PlannerContext.Provider>
  );
}

function PlannerPage({ onSignIn }: { onSignIn: () => void }) {
  const { user, loading: authLoading } = useAuth();
  const {
    plan,
    loading,
    error,
    addSemester,
    removeSemester,
    renameSemester,
    removeCourse,
  } = usePlanner();
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!user) {
      onSignIn();
      return;
    }
    setBusy(true);
    try {
      await addSemester(`Semester ${plan.terms.length + 1}`);
    } finally {
      setBusy(false);
    }
  };
  const total = plan.terms.reduce(
    (sum, term) =>
      sum +
      term.courses.reduce((units, course) => units + (course.units || 0), 0),
    0,
  );
  const [conflictsByTerm, setConflictsByTerm] = useState<
    Record<string, Set<string>>
  >({});
  useEffect(() => {
    let active = true;
    void Promise.all(
      plan.terms.map(async (term) => {
        const withMeetings = term.courses
          .filter((c) => c.meeting_info)
          .map((c) => ({
            key: `${c.college}|${c.subject}|${c.course_number}`,
            meeting_info: c.meeting_info ?? null,
          }));
        if (withMeetings.length < 2)
          return [term.id, new Set<string>()] as const;
        try {
          const response = await api.plannerConflicts(withMeetings);
          return [term.id, new Set(response.conflicts.flat())] as const;
        } catch {
          return [term.id, new Set<string>()] as const;
        }
      }),
    ).then((entries) => {
      if (active) setConflictsByTerm(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [plan]);
  return (
    <section>
      <div className="planner-header">
        <div>
          <h2 className="planner-title">Your Plan</h2>
          <p className="planner-subtitle">
            {user
              ? "Add classes to a semester from any course's Overview tab."
              : "Sign in to create and save your plan."}
          </p>
        </div>
        <div className="planner-header-right">
          {user && plan.terms.length > 0 && (
            <span className="planner-total">
              {plural(total, "total unit")} planned
            </span>
          )}
          <button
            className="btn-primary"
            disabled={authLoading || busy}
            onClick={() => void add()}
          >
            {busy ? "Adding…" : "+ Add Semester"}
          </button>
        </div>
      </div>
      {!authLoading && !user && (
        <div className="planner-empty">
          <strong>Sign in</strong> to create and save your plan — it’s tied to
          your account, so it’s there whenever and wherever you log back in.
        </div>
      )}
      {error && <p className="auth-error">{error}</p>}
      {user && !loading && plan.terms.length === 0 && (
        <div className="planner-empty">
          Nothing planned yet. Click <strong>+ Add Semester</strong> to start,
          then add classes from their Overview tab.
        </div>
      )}
      <div className="planner-terms">
        {plan.terms.map((term) => (
          <PlannerTermView
            key={term.id}
            term={term}
            conflictedKeys={conflictsByTerm[term.id] ?? new Set()}
            onRename={renameSemester}
            onRemove={removeSemester}
            onRemoveCourse={removeCourse}
          />
        ))}
      </div>
    </section>
  );
}

function PlannerTermView({
  term,
  conflictedKeys,
  onRename,
  onRemove,
  onRemoveCourse,
}: {
  term: PlannerTerm;
  conflictedKeys: Set<string>;
  onRename: (id: string, label: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onRemoveCourse: (id: string, course: PlannerCourse) => Promise<void>;
}) {
  const [label, setLabel] = useState(term.label);
  const [exporting, setExporting] = useState(false);
  const units = term.courses.reduce(
    (sum, course) => sum + (course.units || 0),
    0,
  );
  const withTime = term.courses.filter((c) => c.meeting_info);
  const exportIcs = async () => {
    const termCode = withTime.find((c) => c.term)?.term;
    if (!withTime.length || !termCode) return;
    setExporting(true);
    try {
      const blob = await api.plannerIcs(
        termCode,
        withTime.map((c) => ({
          crn: c.crn,
          subject: c.subject,
          course_number: c.course_number,
          title: c.title,
          meeting_info: c.meeting_info ?? null,
          location: c.location,
        })),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${term.label.replace(/[^\w -]/g, "")}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="planner-term">
      <div className="planner-term-top">
        <input
          className="planner-term-title"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => {
            if (label.trim() && label !== term.label)
              void onRename(term.id, label.trim());
          }}
        />
        <button
          className="planner-term-export"
          disabled={!withTime.length || exporting}
          title={
            withTime.length ? "Export as .ics" : "No timed sections to export"
          }
          onClick={() => void exportIcs()}
        >
          📅 Export
        </button>
        <button
          className="planner-term-remove"
          aria-label="Remove semester"
          onClick={() => void onRemove(term.id)}
        >
          ×
        </button>
      </div>
      <div className="planner-term-units">{plural(units, "unit")}</div>
      <div className="planner-course-list">
        {term.courses.length ? (
          term.courses.map((course) => {
            const key = `${course.college}|${course.subject}|${course.course_number}`;
            return (
              <div
                className="planner-course-item"
                key={`${course.college}-${course.subject}-${course.course_number}`}
              >
                <div className="planner-course-info">
                  <div className="planner-course-code">
                    {course.subject} {course.course_number}{" "}
                    <span className="planner-course-units">
                      ({course.units ?? "—"} units)
                    </span>
                  </div>
                  <div className="planner-course-title">
                    {course.title || ""} · {collegeName(course.college)}
                  </div>
                  {course.meeting_info && (
                    <div className="planner-course-meeting">
                      {course.crn ? `CRN ${course.crn} · ` : ""}
                      {course.meeting_info}
                    </div>
                  )}
                  {conflictedKeys.has(key) && (
                    <div className="planner-warning">
                      ⚠ Time conflicts with another class this semester
                    </div>
                  )}
                </div>
                <button
                  className="planner-course-remove"
                  aria-label="Remove class"
                  onClick={() => void onRemoveCourse(term.id, course)}
                >
                  ×
                </button>
              </div>
            );
          })
        ) : (
          <div className="planner-term-empty">No classes added yet.</div>
        )}
      </div>
    </div>
  );
}

function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess(false);
    if (!name.trim() || !EMAIL_RE.test(email) || !message.trim()) {
      setError("Enter your name, a valid email, and a message.");
      return;
    }
    setBusy(true);
    try {
      await api.contact({ name: name.trim(), email, message: message.trim() });
      setSuccess(true);
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="contact-form">
      <h2 className="planner-title">Contact</h2>
      <p className="planner-subtitle">
        Questions, bug reports, or feature requests — this goes straight to the
        person running this site.
      </p>
      {error && <p className="auth-error">{error}</p>}
      {success && (
        <p className="auth-notice">
          Sent — thanks! We'll get back to you at that email.
        </p>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          type="text"
          placeholder="Your name"
          className="auth-input"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Your email"
          className="auth-input"
          autoComplete="email"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Your question or message..."
          maxLength={5000}
          rows={6}
        />
        <button className="btn-primary" disabled={busy}>
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function AppContent() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<AppTab>(readTabFromUrl);
  const [colleges, setColleges] = useState<College[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [startupError, setStartupError] = useState("");
  const [course, setCourse] = useState<CourseCard | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [rating, setRating] = useState<{
    instructor: string;
    college: CollegeCode;
    refresh: () => void;
  } | null>(null);
  useEffect(() => {
    void Promise.all([api.colleges(), api.requirements()])
      .then(([nextColleges, nextRequirements]) => {
        setColleges(nextColleges);
        setRequirements(nextRequirements);
      })
      .catch((err) => setStartupError(errorText(err)));
    api
      .lastUpdated()
      .then((res) => setLastUpdated(res.updated_at))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (tab === "classes") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs}` : window.location.pathname,
    );
  }, [tab]);
  return (
    <>
      <header>
        <div className="header-account">
          {user ? (
            <>
              <span id="account-email">{user.email}</span>
              <button
                className="header-account-btn"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              className="header-account-btn"
              onClick={() => setAuthMode("signin")}
            >
              Sign in
            </button>
          )}
          <ThemeToggle />
        </div>
        <h1>Coast Colleges Class Finder</h1>
        <p className="subtitle">Golden West · Orange Coast · Coastline</p>
        {lastUpdated && (
          <p className="subtitle" id="last-updated">
            Class data updated {formatRelativeTime(lastUpdated)}
          </p>
        )}
      </header>
      <main>
        {startupError && <p className="auth-error">{startupError}</p>}
        <div className="tabs">
          {(["classes", "professors", "planner", "contact"] as AppTab[]).map(
            (name) => (
              <button
                className={`tab-btn ${tab === name ? "active" : ""}`}
                key={name}
                onClick={() => setTab(name)}
              >
                {name[0].toUpperCase() + name.slice(1)}
              </button>
            ),
          )}
        </div>
        {tab === "classes" && (
          <ClassesPage
            colleges={colleges}
            requirements={requirements}
            onOpenCourse={setCourse}
          />
        )}
        {tab === "professors" && (
          <ProfessorsPage
            colleges={colleges}
            onRate={(instructor, college, refresh) =>
              setRating({ instructor, college, refresh })
            }
          />
        )}
        {tab === "planner" && (
          <PlannerPage onSignIn={() => setAuthMode("signin")} />
        )}
        {tab === "contact" && <ContactPage />}
      </main>
      {course && (
        <CourseDetailDialog
          course={course}
          onClose={() => setCourse(null)}
          onRate={(instructor, college, refresh) =>
            setRating({ instructor, college, refresh })
          }
          onRefresh={() => undefined}
        />
      )}
      {authMode && (
        <AuthDialog mode={authMode} onClose={() => setAuthMode(null)} />
      )}
      {rating && (
        <RatingDialog
          instructor={rating.instructor}
          college={rating.college}
          onClose={() => setRating(null)}
          onRated={rating.refresh}
        />
      )}
      <footer>
        <p>
          Class data pulled from the official CCCD public schedule search. Not
          affiliated with Golden West College, Orange Coast College, Coastline
          Community College, or the Coast Community College District. Ratings
          are user-submitted on this site and are not sourced from
          RateMyProfessor or any third party.
        </p>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PlannerProvider>
        <AppContent />
      </PlannerProvider>
    </AuthProvider>
  );
}
