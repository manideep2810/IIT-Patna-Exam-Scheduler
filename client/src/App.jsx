import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Armchair, ArrowRight, BookOpenCheck, CalendarDays, CheckCircle2, ChevronDown,
  Clock3, Download, FileDown, FileSpreadsheet, GraduationCap, KeyRound, LayoutDashboard, LogOut, MapPin,
  Menu, Moon, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sun, Trash2, Upload, UsersRound, X
} from 'lucide-react';

import { api } from './api.js';

const LOGO_URL = 'https://www.iitp.ac.in/images/iitp-logo.png';
const EMPTY_IMPORT_RESULT = Object.freeze({ rows: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 } });

function normalizeImportResult(response) {
  return {
    ...response,
    rows: Array.isArray(response?.rows) ? response.rows : [],
    pagination: { ...EMPTY_IMPORT_RESULT.pagination, ...(response?.pagination ?? {}) }
  };
}

function displayDate(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}

function displaySession(slot) {
  if (slot?.startAt && slot?.endAt) {
    const formatter = new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
    });
    return `${formatter.format(new Date(slot.startAt))} – ${formatter.format(new Date(slot.endAt))}`;
  }

  return slot === 'MORNING' ? '09:30 – 12:30' : '14:30 – 17:30';
}

function displayPeriodSessionTimes(period) {
  const time = (value, fallback) => typeof value === 'string' && value.length >= 5 ? value.slice(0, 5) : fallback;
  return `Creates Morning ${time(period?.morningStartTime, '09:30')}–${time(period?.morningEndTime, '12:30')} and Afternoon ${time(period?.afternoonStartTime, '14:30')}–${time(period?.afternoonEndTime, '17:30')}.`;
}

function humanRole(role) {
  return role === 'SUPER_ADMIN' ? 'Super Administrator' : 'Department Administrator';
}

function friendlyError(error) {
  const clashes = error?.details?.conflictingRollNumbers;
  if (clashes?.length) return `${error.message} Conflicting roll numbers: ${clashes.join(', ')}${error.details.rollNumbersTruncated ? '…' : ''}`;
  return error?.message ?? 'Something went wrong. Please try again.';
}

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <img src={LOGO_URL} alt="Indian Institute of Technology Patna" className="iitp-logo" />
    {!compact && <div><p>Indian Institute of Technology Patna</p><strong>Examination Cell</strong></div>}
  </div>;
}

function ToastViewport({ toasts, onDismiss }) {
  return <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
    {toasts.map((toast) => <div className={`toast ${toast.type ?? 'info'}`} key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'}>
      <div className="toast-icon">{toast.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}</div>
      <div><strong>{toast.type === 'error' ? 'Action needs attention' : 'Update saved'}</strong><p>{toast.text}</p></div>
      <button className="icon-button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification"><X size={16} /></button>
    </div>)}
  </div>;
}

function ConfirmDialog({ title = 'Confirm deletion', description, detail, confirmLabel = 'Delete permanently', busy = false, onConfirm, onCancel }) {
  return <div className="modal-backdrop confirm-backdrop" role="presentation">
    <section className="modal-card confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description">
      <header className="confirm-dialog-header"><span className="confirm-warning-icon"><AlertCircle size={22}/></span><div><span className="eyebrow">Please confirm</span><h2 id="confirm-dialog-title">{title}</h2></div></header>
      <div className="confirm-dialog-copy"><p id="confirm-dialog-description">{description}</p>{detail && <div className="confirm-dialog-note">{detail}</div>}</div>
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Keep it</button><button className="danger-button" type="button" onClick={onConfirm} disabled={busy}><Trash2 size={16}/>{busy ? 'Deleting…' : confirmLabel}</button></div>
    </section>
  </div>;
}

function LoadingState({ label = 'Loading examination data…' }) {
  return <div className="loading-state"><span className="spinner" />{label}</div>;
}

function ContentSkeleton({ variant = 'rows' }) {
  const count = variant === 'board' ? 12 : variant === 'table' ? 5 : 3;
  return <div className={`content-skeleton ${variant}`} aria-label="Loading content" aria-busy="true">{Array.from({ length: count }, (_, index) => <span className="skeleton" key={index}/>)}</div>;
}

function DashboardSkeleton() {
  return <section className="dashboard-skeleton" aria-label="Loading timetable" aria-busy="true"><div className="skeleton eyebrow-line"/><div className="skeleton title-line"/><div className="skeleton subtitle-line"/><div className="skeleton-stat-grid">{[1, 2, 3].map((item) => <div className="skeleton-stat" key={item}><span className="skeleton skeleton-icon"/><div><span className="skeleton text-line"/><span className="skeleton number-line"/></div></div>)}</div><div className="skeleton-session"><div className="skeleton session-line"/><div className="skeleton-card-grid">{[1, 2, 3].map((item) => <div className="skeleton skeleton-card" key={item}/>)}</div></div></section>;
}

function SplashScreen() {
  return <main className="boot-screen"><div className="boot-orb"><img src={LOGO_URL} alt="Indian Institute of Technology Patna"/></div><Brand/><div className="boot-progress"><span/><i/></div><p>Preparing the examination workspace</p></main>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await onLogin(email, password);
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally { setBusy(false); }
  }

  return <main className="login-page">
    <section className="login-panel">
      <Brand />
      <div className="login-intro"><span className="eyebrow">Academic administration portal</span><h1>Examination timetable, with certainty.</h1><p>Plan exams confidently while protecting students from schedule clashes and rooms from over-allocation.</p></div>
      <div className="assurance"><ShieldCheck size={21} /><span>Secure access for authorised examination administrators.</span></div>
    </section>
    <section className="login-form-panel">
      <div className="mobile-login-brand"><Brand/></div>
      <form className="login-form" onSubmit={submit}>
        <div><span className="eyebrow">Secure sign in</span><h2>Welcome back</h2><p className="muted">Use your IIT Patna examination account.</p></div>
        {error && <div className="inline-error"><AlertCircle size={18} />{error}</div>}
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@iitp.ac.in" required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label>
        <button className="primary-button" disabled={busy}>{busy ? 'Signing in…' : <>Sign in <ArrowRight size={18} /></>}</button>
      </form>
      <p className="login-footer">For access or password assistance, contact the Examination Cell.</p>
    </section>
  </main>;
}

function PasswordChange({ token, user, onComplete }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError('');
    if (newPassword !== confirmPassword) { setError('The new password and confirmation do not match.'); return; }
    setBusy(true);
    try { const response = await api.changePassword(token, currentPassword, newPassword); onComplete(response.user); }
    catch (requestError) { setError(friendlyError(requestError)); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-panel"><Brand /><div className="login-intro"><span className="eyebrow">First sign in</span><h1>Set your personal password.</h1><p>Your administrator issued a temporary password. Create a secure replacement before accessing the timetable.</p></div></section><section className="login-form-panel"><form className="login-form" onSubmit={submit}><div><span className="eyebrow">Account security</span><h2>Change password</h2><p className="muted">Signed in as {user.email}</p></div>{error && <div className="inline-error"><AlertCircle size={18}/>{error}</div>}<label>Temporary password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label>New password<input type="password" minLength="8" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><label>Confirm new password<input type="password" minLength="8" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</button></form></section></main>;
}

function PasswordChangeDialog({ token, user, temporaryPassword, onComplete }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) { setError('The new password and confirmation do not match.'); return; }
    setBusy(true);
    try { const response = await api.changePassword(token, currentPassword || temporaryPassword, newPassword); onComplete(response.user); }
    catch (requestError) { setError(friendlyError(requestError)); }
    finally { setBusy(false); }
  }

  return <main className="password-gate"><div className="password-gate-workspace" aria-hidden="true"><div className="password-gate-rail"/><div className="password-gate-content"><span/><span/><span/></div></div><div className="modal-backdrop password-gate-modal"><form className="modal-card password-change-card" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="password-change-title"><header className="password-modal-header"><div className="password-dialog-icon"><KeyRound size={21}/></div><div><h2 id="password-change-title">Set your password</h2><p>Required before accessing the system</p></div></header><div className="password-modal-body"><div className="password-notice">Your temporary password must be replaced before you can continue.</div>{error && <div className="inline-error"><AlertCircle size={18}/>{error}</div>}{!temporaryPassword && <label>Current temporary password<input autoFocus type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>}<label>New password<input autoFocus={Boolean(temporaryPassword)} type="password" autoComplete="new-password" minLength="8" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" required /></label><label>Confirm password<input type="password" autoComplete="new-password" minLength="8" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label><button className="primary-button" disabled={busy}>{busy ? 'Saving password…' : 'Set password and continue'}</button></div></form></div></main>;
}

function PeriodPicker({ periods, selectedId, onSelect, superAdmin, onCreate, sidebar = false }) {
  const emptyForm = { name: '', startDate: '', endDate: '', morningStartTime: '09:30', morningEndTime: '12:30', afternoonStartTime: '14:30', afternoonEndTime: '17:30' };
  const [creating, setCreating] = useState(false); const [form, setForm] = useState(emptyForm); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false); const pickerRef = useRef(null);
  const selectedPeriod = periods.find((period) => period.id === selectedId);
  useEffect(() => {
    function closeOnOutsideClick(event) { if (pickerRef.current && !pickerRef.current.contains(event.target)) setOpen(false); }
    function closeOnEscape(event) { if (event.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', closeOnOutsideClick); document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('mousedown', closeOnOutsideClick); document.removeEventListener('keydown', closeOnEscape); };
  }, []);
  async function createPeriod(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onCreate({ ...form, timezone: 'Asia/Kolkata' }); setForm(emptyForm); setCreating(false); }
    catch (requestError) { setError(friendlyError(requestError)); } finally { setBusy(false); }
  }
  return <div className={`period-picker ${sidebar ? 'sidebar-period-picker' : ''}`} ref={pickerRef}>
    <button type="button" className="period-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}><CalendarDays size={18}/><span><strong>{selectedPeriod?.name ?? 'Select an examination period'}</strong>{selectedPeriod && <small>{displayDate(selectedPeriod.startDate)} – {displayDate(selectedPeriod.endDate)}</small>}</span><ChevronDown size={16} className={open ? 'chevron-up' : ''}/></button>
    {open && <div className="period-menu" role="listbox" aria-label="Examination periods"><span className="period-menu-label">Choose examination period</span>{periods.length === 0 ? <p>No periods have been created yet.</p> : periods.map((period) => <button type="button" key={period.id} role="option" aria-selected={period.id === selectedId} className={period.id === selectedId ? 'selected' : ''} onClick={() => { onSelect(period.id); setOpen(false); }}><CalendarDays size={15}/><span><strong>{period.name}</strong><small>{displayDate(period.startDate)} – {displayDate(period.endDate)}</small></span>{period.id === selectedId && <CheckCircle2 size={16}/>}</button>)}</div>}
    <div className="period-select"><CalendarDays size={18}/><select value={selectedId ?? ''} onChange={(event) => onSelect(event.target.value)} aria-label="Select exam period"><option value="">Select an examination period</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.name} · {displayDate(period.startDate)} – {displayDate(period.endDate)}</option>)}</select><ChevronDown size={16}/></div>
    {superAdmin && <button className="text-button" onClick={() => setCreating(true)}><Plus size={16}/>New period</button>}
    {creating && <div className="modal-backdrop"><form className="modal-card" onSubmit={createPeriod}><div className="modal-heading"><div><span className="eyebrow">Examination setup</span><h2>Create examination period</h2></div><button type="button" className="icon-button" onClick={() => setCreating(false)}><X/></button></div>{error && <div className="inline-error"><AlertCircle size={18}/>{error}</div>}<label>Period name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="End Semester Examination — Dec 2026" required /></label><div className="form-grid"><label>Start date<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required /></label><label>End date<input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required /></label></div><fieldset className="session-time-fields"><legend>Daily examination sessions</legend><div className="form-grid"><label>Morning starts<input type="time" value={form.morningStartTime} onChange={(event) => setForm({ ...form, morningStartTime: event.target.value })} required /></label><label>Morning ends<input type="time" value={form.morningEndTime} onChange={(event) => setForm({ ...form, morningEndTime: event.target.value })} required /></label><label>Afternoon starts<input type="time" value={form.afternoonStartTime} onChange={(event) => setForm({ ...form, afternoonStartTime: event.target.value })} required /></label><label>Afternoon ends<input type="time" value={form.afternoonEndTime} onChange={(event) => setForm({ ...form, afternoonEndTime: event.target.value })} required /></label></div></fieldset><p className="field-note">These two sessions apply to every date in this period, in Asia/Kolkata time.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCreating(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create period'}</button></div></form></div>}
  </div>;
}

function LegacySidebar({ user, view, onView, onLogout, mobileOpen, setMobileOpen }) {
  const superAdmin = user.role === 'SUPER_ADMIN';
  const nav = [{ id: 'overview', label: 'Timetable', icon: LayoutDashboard }, { id: 'schedule', label: 'Schedule exam', icon: CalendarDays }, ...(superAdmin ? [{ id: 'imports', label: 'Imports', icon: Upload }, { id: 'administration', label: 'Department admins', icon: UsersRound }] : [])];
  return <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}><div className="sidebar-top"><Brand compact/><button className="mobile-close icon-button" onClick={() => setMobileOpen(false)}><X/></button></div><div className="nav-label">Workspace</div><nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => { onView(id); setMobileOpen(false); }}><Icon size={19}/><span>{label}</span></button>)}</nav><div className="sidebar-footer"><div className="user-card"><div className="user-initial">{user.email[0].toUpperCase()}</div><div><strong>{user.email}</strong><span>{humanRole(user.role)}</span></div></div><button className="nav-item logout" onClick={onLogout}><LogOut size={19}/><span>Sign out</span></button></div></aside>;
}

function Sidebar({ user, view, onView, onLogout, mobileOpen, setMobileOpen, periods, selectedId, onPeriodSelect, onCreatePeriod, theme, onThemeChange }) {
  const superAdmin = user.role === 'SUPER_ADMIN';
  const nav = [{ id: 'overview', label: 'Timetable', icon: LayoutDashboard }, { id: 'schedule', label: 'Schedule exam', icon: CalendarDays }, { id: 'allocations', label: 'Allocations', icon: Armchair }, ...(superAdmin ? [{ id: 'imports', label: 'Imports', icon: Upload }, { id: 'administration', label: 'Administration', icon: Settings2 }] : [])];
  return <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}><div className="sidebar-top"><Brand/><button className="mobile-close icon-button" onClick={() => setMobileOpen(false)}><X/></button></div><section className="sidebar-period"><span className="nav-label">Active examination period</span><PeriodPicker sidebar periods={periods} selectedId={selectedId} onSelect={onPeriodSelect} superAdmin={superAdmin} onCreate={onCreatePeriod}/></section><div className="nav-label">Workspace</div><nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => { onView(id); setMobileOpen(false); }}><Icon size={19}/><span>{label}</span></button>)}</nav><div className="sidebar-footer"><button className="nav-item theme-toggle" type="button" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} aria-pressed={theme === 'dark'}>{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}<span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span></button><div className="user-card"><div className="user-initial">{user.email[0].toUpperCase()}</div><div><strong>{user.email}</strong><span>{humanRole(user.role)}</span></div></div><button className="nav-item logout" onClick={onLogout}><LogOut size={19}/><span>Sign out</span></button></div></aside>;
}

function LegacyOverview({ timetable, selectedPeriod, canDelete, onDelete, downloading, onDownload }) {
  if (!selectedPeriod) return <EmptyState icon={CalendarDays} title="Choose an examination period" text="Select a period above to view its timetable and scheduling status." />;
  const slots = timetable?.slots ?? []; const exams = slots.flatMap((slot) => slot.exams); const candidates = exams.reduce((total, exam) => total + Number(exam.candidateCount ?? 0), 0);
  return <><section className="welcome-row"><div><span className="eyebrow">{selectedPeriod.name}</span><h1>Examination timetable</h1><p>Two fixed sessions each day, with real-time room capacity and clash protection.</p></div><button className="secondary-button" onClick={onDownload} disabled={downloading}><Download size={17}/>{downloading ? 'Preparing…' : 'Export CSV'}</button></section><section className="stat-grid"><Stat icon={CalendarDays} label="Scheduled examinations" value={exams.length}/><Stat icon={Clock3} label="Active sessions" value={slots.length}/><Stat icon={UsersRound} label="Candidate instances" value={candidates}/></section>{slots.length === 0 ? <EmptyState icon={CalendarDays} title="No examinations scheduled yet" text="Use Schedule exam to add the first course to a morning or afternoon session."/> : <div className="timetable-list">{slots.map((slot) => <section className="slot-card" key={slot.id}><header><div className="slot-date"><span>{displayDate(slot.examDate)}</span><strong>{slot.session === 'MORNING' ? 'Morning session' : 'Afternoon session'}</strong></div><span className="time-pill"><Clock3 size={15}/>{displaySession(slot.session)}</span></header><div className="exam-grid">{slot.exams.map((exam) => <article className="exam-card" key={exam.id}><div className="exam-card-top"><div><span className="course-code">{exam.course.courseCode}</span><h3>{exam.course.courseName || 'Course examination'}</h3></div>{canDelete && <button className="delete-button" onClick={() => onDelete(exam)} aria-label={`Delete ${exam.course.courseCode}`}><Trash2 size={17}/></button>}</div><div className="exam-meta"><span><UsersRound size={15}/>{exam.candidateCount} candidates</span></div><div className="allocation-list">{exam.roomAllocations.map((room) => <span key={room.roomId}><MapPin size={14}/>{room.roomNumber}{room.location ? ` · ${room.location}` : ''}<b>{room.seatsReserved} seats</b></span>)}</div></article>)}</div></section>)}</div>}</>;
}

function Stat({ icon: Icon, label, value, detail }) { return <article className="stat-card"><div className="stat-icon"><Icon size={20}/></div><div><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div></article>; }
function EmptyState({ icon: Icon, title, text }) { return <section className="empty-state"><div className="empty-icon"><Icon size={28}/></div><h2>{title}</h2><p>{text}</p></section>; }

function ExamCard({ exam, canDelete, onDelete }) {
  return <article className="exam-card" key={exam.id}>
    <div className="exam-card-top"><div><span className="course-code">{exam.course.courseCode}</span><h3>{exam.course.courseName || 'Course examination'}</h3></div>{canDelete && <button className="delete-button" onClick={() => onDelete(exam)} aria-label={`Delete ${exam.course.courseCode}`}><Trash2 size={17}/></button>}</div>
    <div className="exam-meta"><span><UsersRound size={15}/>{exam.candidateCount} candidates</span></div>
    <div className="allocation-list">{exam.roomAllocations.map((room) => <span key={room.roomId}><MapPin size={14}/>{room.roomNumber}{room.location ? ` · ${room.location}` : ''}<b>{room.seatsReserved} seats</b></span>)}</div>
  </article>;
}

function TimetableSession({ slot, canDelete, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const visibleExams = expanded ? slot.exams : slot.exams.slice(0, 4);
  const remaining = slot.exams.length - visibleExams.length;
  return <section className="slot-card" key={slot.id}>
    <header><div className="slot-date"><span>{displayDate(slot.examDate)}</span><strong>{slot.session === 'MORNING' ? 'Morning session' : 'Afternoon session'}</strong><b className="session-count">{slot.exams.length} {slot.exams.length === 1 ? 'exam' : 'exams'}</b></div><span className="time-pill"><Clock3 size={15}/>{displaySession(slot)}</span></header>
    <div className="exam-grid">{visibleExams.map((exam) => <ExamCard key={exam.id} exam={exam} canDelete={canDelete} onDelete={onDelete}/>)}</div>
    {slot.exams.length > 4 && <footer className="slot-footer"><button className="text-button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show fewer examinations' : `Show ${remaining} more examination${remaining === 1 ? '' : 's'}`}<ChevronDown size={16} className={expanded ? 'chevron-up' : ''}/></button></footer>}
  </section>;
}

function datesInPeriod(period) {
  if (!period?.startDate || !period?.endDate) return [];
  const dates = [];
  const cursor = new Date(`${period.startDate.slice(0, 10)}T00:00:00Z`);
  const end = period.endDate.slice(0, 10);
  while (cursor.toISOString().slice(0, 10) <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function TimetableDateNavigator({ period, selectedDate, onSelectDate }) {
  const dates = useMemo(() => datesInPeriod(period), [period?.id, period?.startDate, period?.endDate]);
  const selectedIndex = Math.max(0, dates.indexOf(selectedDate));
  const windowSize = 7;
  const start = Math.min(Math.max(0, selectedIndex - Math.floor(windowSize / 2)), Math.max(0, dates.length - windowSize));
  const visibleDates = dates.slice(start, start + windowSize);
  const dayFormatter = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' });
  const numberFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone: 'UTC' });
  const move = (offset) => { const target = dates[selectedIndex + offset]; if (target) onSelectDate(target); };

  return <section className="timetable-date-nav" aria-label="Choose timetable date">
    <div className="date-nav-title"><CalendarDays size={18}/><strong>{displayDate(selectedDate)}</strong><span>Selected date</span></div>
    <div className="date-nav-controls"><button className="date-nav-arrow" onClick={() => move(-1)} disabled={selectedIndex === 0} aria-label="Previous date"><ChevronDown size={18}/></button><div className="date-nav-days">{visibleDates.map((date) => <button key={date} className={date === selectedDate ? 'selected' : ''} onClick={() => onSelectDate(date)} aria-label={`View ${displayDate(date)}`}><span>{dayFormatter.format(new Date(`${date}T00:00:00Z`))}</span><strong>{numberFormatter.format(new Date(`${date}T00:00:00Z`))}</strong></button>)}</div><button className="date-nav-arrow next" onClick={() => move(1)} disabled={selectedIndex === dates.length - 1} aria-label="Next date"><ChevronDown size={18}/></button></div>
  </section>;
}

function Overview({ timetable, selectedPeriod, canDelete, onDelete, downloading, onDownload, onRefresh }) {
  const [selectedDate, setSelectedDate] = useState('');
  const slots = timetable?.slots ?? [];
  useEffect(() => {
    if (!selectedPeriod?.startDate || !selectedPeriod?.endDate) return;
    const startDate = selectedPeriod.startDate.slice(0, 10);
    const endDate = selectedPeriod.endDate.slice(0, 10);
    setSelectedDate((current) => current >= startDate && current <= endDate ? current : startDate);
  }, [selectedPeriod?.id, selectedPeriod?.startDate, selectedPeriod?.endDate]);
  if (!selectedPeriod) return <EmptyState icon={CalendarDays} title="Choose an examination period" text="Choose an examination period from the sidebar to view its timetable." />;
  const exams = slots.flatMap((slot) => slot.exams);
  const candidates = exams.reduce((total, exam) => total + Number(exam.candidateCount ?? 0), 0);
  const selectedSlots = slots.filter((slot) => slot.examDate?.slice(0, 10) === selectedDate);
  return <>
    <section className="welcome-row"><div><span className="eyebrow">{selectedPeriod.name}</span><h1>Examination timetable</h1><p>Live schedule, room capacity, and student-clash protection in one workspace.</p></div><div className="welcome-actions"><button className="icon-button outlined" onClick={onRefresh} aria-label="Refresh timetable" title="Refresh timetable"><RefreshCw size={17}/></button><button className="secondary-button" onClick={onDownload} disabled={downloading}><Download size={17}/>{downloading ? 'Preparing…' : 'Export CSV'}</button></div></section>
    <section className="stat-grid"><Stat icon={CalendarDays} label="Scheduled examinations" value={exams.length}/><Stat icon={Clock3} label="Active sessions" value={slots.length}/><Stat icon={UsersRound} label="Candidate instances" value={candidates}/></section>
    <TimetableDateNavigator period={selectedPeriod} selectedDate={selectedDate || selectedPeriod.startDate.slice(0, 10)} onSelectDate={setSelectedDate}/>
    {selectedSlots.length === 0 ? <EmptyState icon={CalendarDays} title={`No sessions on ${displayDate(selectedDate || selectedPeriod.startDate.slice(0, 10))}`} text="Select another date above, or create the morning and afternoon sessions before scheduling examinations."/> : <div className="timetable-list">{selectedSlots.map((slot) => <TimetableSession key={slot.id} slot={slot} canDelete={canDelete} onDelete={onDelete}/>)}</div>}
  </>;
}

const SEAT_COLOURS = ['teal', 'blue', 'amber', 'plum', 'coral', 'slate'];

function buildSeatPlan(capacity, courseAllocations) {
  const perRow = Math.ceil(capacity / 4);
  const rows = Array.from({ length: 4 }, (_, rowIndex) => Array.from({ length: Math.max(0, Math.min(perRow, capacity - (rowIndex * perRow))) }, (_, columnIndex) => ({ rowIndex, columnIndex, benchNumber: columnIndex + 1 })));
  const primary = [];
  const secondary = [];

  rows.forEach((row, rowIndex) => row.forEach((seat) => ((seat.columnIndex % 2 === rowIndex % 2) ? primary : secondary).push(seat)));
  const availableBenches = [primary, secondary];

  courseAllocations.forEach((course, courseIndex) => {
    course.students.forEach((rollNumber) => {
      const preferredBenches = availableBenches[courseIndex % 2];
      const alternateBenches = availableBenches[(courseIndex + 1) % 2];
      const seat = preferredBenches.shift() ?? alternateBenches.shift();
      if (seat) seat.student = { rollNumber, courseCode: course.courseCode, courseIndex };
    });
  });

  return { rows, perRow };
}

function AllocationSeatPlan({ allocation }) {
  const plan = useMemo(() => buildSeatPlan(allocation.room.capacity, allocation.courseAllocations), [allocation]);
  const renderBench = (seat) => <div key={`${seat.rowIndex}-${seat.columnIndex}`} className={`seat-bench ${seat.student ? `filled ${SEAT_COLOURS[seat.student.courseIndex % SEAT_COLOURS.length]}` : 'vacant'}`} title={seat.student ? `${seat.student.rollNumber} · ${seat.student.courseCode}` : `Bench ${seat.benchNumber} is vacant`}><small>Bench {seat.benchNumber}</small>{seat.student ? <><strong>{seat.student.rollNumber}</strong><span>{seat.student.courseCode}</span></> : <span>Vacant</span>}</div>;
  return <section className="seating-plan-card"><div className="seating-plan-heading"><div><span className="eyebrow">Visual seating plan</span><h2>Classroom bench layout</h2><p>Each seating column flows from the front of the classroom to the back. Students are arranged by sorted roll number on alternating benches.</p></div><span>{allocation.room.capacity} benches</span></div><div className="seat-legend">{allocation.courseAllocations.map((course, index) => <span key={course.examId}><i className={`seat-swatch ${SEAT_COLOURS[index % SEAT_COLOURS.length]}`}/>{course.courseCode}</span>)}<span><i className="seat-swatch vacant"/>Vacant</span></div><div className="classroom-layout vertical-classroom"><div className="classroom-front"><span>Front of classroom</span><strong>Board / Invigilator desk</strong></div><div className="classroom-rows">{plan.rows.map((row, rowIndex) => <div className="seat-row" key={rowIndex}><span className="seat-row-label">Column {rowIndex + 1}</span><div className="seat-row-benches">{row.map(renderBench)}</div></div>)}</div></div></section>;
}

function Allocations({ token, period, timetable, notify }) {
  const slots = timetable?.slots ?? [];
  const [slotId, setSlotId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [allocation, setAllocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const selectedSlot = slots.find((slot) => slot.id === slotId);
  const roomOptions = useMemo(() => {
    const rooms = new Map();
    selectedSlot?.exams.forEach((exam) => exam.roomAllocations.forEach((room) => rooms.set(room.roomId, room)));
    return [...rooms.values()].sort((first, second) => first.roomNumber.localeCompare(second.roomNumber));
  }, [selectedSlot]);

  useEffect(() => { setSlotId(slots[0]?.id ?? ''); }, [period?.id, slots.length]);
  useEffect(() => { setRoomId(roomOptions[0]?.roomId ?? ''); }, [slotId, roomOptions.length]);
  useEffect(() => {
    if (!period || !slotId || !roomId) { setAllocation(null); return; }
    let cancelled = false;
    setLoading(true);
    api.roomAllocation(token, period.id, slotId, roomId).then((response) => { if (!cancelled) setAllocation(response.allocation); }).catch((error) => { if (!cancelled) { setAllocation(null); notify('error', friendlyError(error)); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, period?.id, slotId, roomId]);

  if (!period) return <EmptyState icon={MapPin} title="Choose an examination period" text="Select an examination period from the sidebar to review room-wise allocations."/>;
  if (slots.length === 0) return <EmptyState icon={MapPin} title="No room allocations yet" text="Scheduled examinations will appear here with their room and student seating plans."/>;
  const representedSeats = allocation?.courseAllocations.reduce((total, course) => total + course.students.length, 0) ?? 0;

  return <><section className="welcome-row"><div><span className="eyebrow">Room management</span><h1>Room allocations</h1><p>Review scheduled courses, assigned students, and remaining capacity for each examination room.</p></div></section><section className="allocation-picker"><label>Examination session<select value={slotId} onChange={(event) => setSlotId(event.target.value)}>{slots.map((slot) => <option key={slot.id} value={slot.id}>{displayDate(slot.examDate)} · {slot.session === 'MORNING' ? 'Morning' : 'Afternoon'} ({displaySession(slot)})</option>)}</select></label><label>Room<select value={roomId} onChange={(event) => setRoomId(event.target.value)}>{roomOptions.map((room) => <option key={room.roomId} value={room.roomId}>{room.roomNumber}{room.location ? ` · ${room.location}` : ''}</option>)}</select></label></section>{loading || !allocation ? <ContentSkeleton variant="board"/> : <><section className="allocation-summary"><Stat icon={MapPin} label="Room" value={allocation.room.roomNumber} detail={allocation.room.location || 'Location not specified'}/><Stat icon={UsersRound} label="Seats allocated" value={`${allocation.room.reservedSeats} / ${allocation.room.capacity}`} detail={`${allocation.courseAllocations.length} scheduled course${allocation.courseAllocations.length === 1 ? '' : 's'}`}/><Stat icon={LayoutDashboard} label="Vacant benches" value={allocation.room.vacantSeats} detail={`${representedSeats} student${representedSeats === 1 ? '' : 's'} shown in the plan`}/></section><section className="allocation-course-card"><div className="section-heading"><div><span className="eyebrow">Scheduled in this room</span><h2>Course allocations</h2></div><span className="time-pill"><Clock3 size={15}/>{displaySession(allocation.slot)}</span></div><div className="allocation-course-grid">{allocation.courseAllocations.map((course, index) => <article key={course.examId} className={`allocation-course ${SEAT_COLOURS[index % SEAT_COLOURS.length]}`}><span className="course-code">{course.courseCode}</span><h3>{course.courseName}</h3><strong>{course.seatsReserved} seats reserved</strong><p>{course.students.length ? `${course.students[0]} – ${course.students[course.students.length - 1]}` : 'No students assigned'}</p></article>)}</div></section><AllocationSeatPlan allocation={allocation}/></>}</>;
}

function Scheduler({ token, period, slots, onDone, notify }) {
  const [courses, setCourses] = useState([]); const [courseId, setCourseId] = useState(''); const [slotId, setSlotId] = useState(''); const [rooms, setRooms] = useState([]); const [allocations, setAllocations] = useState({}); const [loading, setLoading] = useState(false); const [roomLoading, setRoomLoading] = useState(false); const [busy, setBusy] = useState(false);
  const selectedCourse = courses.find((course) => course.id === courseId); const selectedSlot = slots.find((slot) => slot.id === slotId);
  useEffect(() => { if (!period) return; setLoading(true); api.schedulableCourses(token, period.id).then((response) => setCourses(response.courses)).catch((error) => notify('error', friendlyError(error))).finally(() => setLoading(false)); }, [token, period?.id]);
  useEffect(() => { if (!period || !slotId) { setRooms([]); setAllocations({}); return; } setRoomLoading(true); api.rooms(token, period.id, slotId).then((response) => { setRooms(response.rooms); setAllocations({}); }).catch((error) => notify('error', friendlyError(error))).finally(() => setRoomLoading(false)); }, [token, period?.id, slotId]);
  function toggleRoom(room) {
    setAllocations((current) => {
      if (Object.hasOwn(current, room.id) && current[room.id] !== undefined) {
        return { ...current, [room.id]: undefined };
      }

      const alreadyReserved = Object.values(current).reduce((total, seats) => total + (Number(seats) || 0), 0);
      const remainingCandidates = Math.max(0, Number(selectedCourse?.candidateCount ?? 0) - alreadyReserved);

      return { ...current, [room.id]: Math.min(remainingCandidates, Number(room.availableSeats)) };
    });
  }
  function setSeats(roomId, value) { setAllocations((current) => ({ ...current, [roomId]: value === '' ? '' : Math.max(0, Number(value)) })); }
  const reserved = Object.values(allocations).reduce((sum, seats) => sum + (Number(seats) || 0), 0);
  const roomsByLocation = useMemo(() => {
    const groups = new Map();

    rooms.forEach((room) => {
      const location = room.location || 'Other rooms';
      groups.set(location, [...(groups.get(location) ?? []), room]);
    });

    return [...groups.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([location, groupedRooms]) => ({
        location,
        rooms: groupedRooms.sort((first, second) => first.roomNumber.localeCompare(second.roomNumber, undefined, { numeric: true }))
      }));
  }, [rooms]);
  async function submit(event) { event.preventDefault(); if (!selectedCourse || !selectedSlot) return; const roomAllocations = Object.entries(allocations).filter(([, seats]) => Number(seats) > 0).map(([roomId, seatsReserved]) => ({ roomId, seatsReserved: Number(seatsReserved) })); setBusy(true); try { await api.schedule(token, period.id, { courseId, examSlotId: slotId, roomAllocations }); notify('success', `${selectedCourse.courseCode} has been scheduled successfully.`); setCourseId(''); setSlotId(''); setAllocations({}); await onDone(); } catch (error) { notify('error', friendlyError(error)); } finally { setBusy(false); } }
  if (!period) return <EmptyState icon={CalendarDays} title="Choose an examination period" text="Select a period before scheduling an examination."/>;
  /* Retained temporarily while the readable scheduler markup below replaces it.
  return <><section className="welcome-row"><div><span className="eyebrow">Scheduling workspace</span><h1>Schedule an examination</h1><p>Allocate one or more rooms. The total reserved seats must equal the enrolled candidates.</p></div></section><form className="scheduler-layout" onSubmit={submit}><section className="form-card"><div className="section-heading"><div><span className="eyebrow">1. Course and session</span><h2>Select the examination</h2></div><BookOpenCheck size={22}/></div>{loading ? <LoadingState label="Loading permitted courses…"/> : <><label>Course<select value={courseId} onChange={(event) => setCourseId(event.target.value)} required><option value="">Select a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} — {course.courseName || 'Untitled course'} ({course.candidateCount} candidates)</option>)}</select></label>{courses.length === 0 && <p className="field-note">There are no unscheduled courses available to your account in this period.</p>}<label>Exam session<select value={slotId} onChange={(event) => setSlotId(event.target.value)} required><option value="">Select a date and session</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{displayDate(slot.examDate)} · {slot.session === 'MORNING' ? 'Morning (09:30 – 12:30)' : 'Afternoon (14:30 – 17:30)'}</option>)}</select></label>{slots.length === 0 && <p className="field-note">No sessions exist yet. A Super Administrator must add examination dates first.</p>}</>}</section><section className="form-card room-card"><div className="section-heading"><div><span className="eyebrow">2. Room allocation</span><h2>Reserve seats</h2></div>{selectedCourse && <span className="candidate-badge">{selectedCourse.candidateCount} candidates</span>}</div>{!slotId ? <p className="muted empty-copy">Choose an exam session to see current room availability.</p> : roomLoading ? <LoadingState label="Checking room availability…"/> : <>{rooms.length === 0 ? <p className="muted empty-copy">No active rooms are available.</p> : <div className="room-table"><div className="room-table-head"><span>Use</span><span>Room</span><span>Available</span><span>Reserve</span></div>{rooms.map((room) => <div className="room-row" key={room.id}><input type="checkbox" checked={Boolean(allocations[room.id])} onChange={() => toggleRoom(room)} aria-label={`Use room ${room.roomNumber}`} /><div><strong>{room.roomNumber}</strong><span>{room.location || 'Location not specified'}</span></div><span>{room.availableSeats} <small>/ {room.examCapacity}</small></span><input className="seat-input" type="number" min="1" max={room.availableSeats} disabled={!allocations[room.id]} value={allocations[room.id] ?? ''} onChange={(event) => setSeats(room.id, event.target.value)} /></div>)}</div><div className={`reservation-summary ${selectedCourse && reserved === Number(selectedCourse.candidateCount) ? 'ready' : ''}`}><span>Seats reserved</span><strong>{reserved} <small>/ {selectedCourse?.candidateCount ?? 0}</small></strong></div></>}<button className="primary-button schedule-button" disabled={busy || !courseId || !slotId || reserved !== Number(selectedCourse?.candidateCount)}>{busy ? 'Scheduling…' : <>Schedule examination <ArrowRight size={18}/></>}</button></>}</section></form></>;
  */
  /* Room capacity board replaces the list layout below.
  return <>
    <section className="welcome-row"><div><span className="eyebrow">Scheduling workspace</span><h1>Schedule an examination</h1><p>Allocate one or more rooms. The total reserved seats must equal the enrolled candidates.</p></div></section>
    <form className="scheduler-layout" onSubmit={submit}>
      <section className="form-card">
        <div className="section-heading"><div><span className="eyebrow">1. Course and session</span><h2>Select the examination</h2></div><BookOpenCheck size={22}/></div>
        {loading ? <LoadingState label="Loading permitted courses…"/> : <>
          <label>Course<select value={courseId} onChange={(event) => setCourseId(event.target.value)} required><option value="">Select a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} — {course.courseName || 'Untitled course'} ({course.candidateCount} candidates)</option>)}</select></label>
          {courses.length === 0 && <p className="field-note">There are no unscheduled courses available to your account in this period.</p>}
          <label>Exam session<select value={slotId} onChange={(event) => setSlotId(event.target.value)} required><option value="">Select a date and session</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{displayDate(slot.examDate)} · {slot.session === 'MORNING' ? 'Morning' : 'Afternoon'} ({displaySession(slot)})</option>)}</select></label>
          {slots.length === 0 && <p className="field-note">No sessions exist yet. A Super Administrator must add examination dates first.</p>}
          {selectedSlot && <div className="session-preview"><CalendarDays size={18}/><div><span>Selected examination session</span><strong>{displayDate(selectedSlot.examDate)} · {selectedSlot.session === 'MORNING' ? 'Morning' : 'Afternoon'}</strong></div><b>{displaySession(selectedSlot)}</b></div>}
        </>}
      </section>
      <section className="form-card room-card">
        <div className="section-heading"><div><span className="eyebrow">2. Room allocation</span><h2>Reserve seats</h2></div>{selectedCourse && <span className="candidate-badge">{selectedCourse.candidateCount} candidates</span>}</div>
        {!slotId && <p className="muted empty-copy">Choose an exam session to see current room availability.</p>}
        {slotId && roomLoading && <LoadingState label="Checking room availability…"/>}
        {slotId && !roomLoading && <>
          {rooms.length === 0 ? <p className="muted empty-copy">No active rooms are available.</p> : <div className="room-table"><div className="room-table-head"><span>Use</span><span>Room</span><span>Available</span><span>Reserve</span></div>{rooms.map((room) => <div className="room-row" key={room.id}><input type="checkbox" checked={Boolean(allocations[room.id])} onChange={() => toggleRoom(room)} aria-label={`Use room ${room.roomNumber}`} /><div><strong>{room.roomNumber}</strong><span>{room.location || 'Location not specified'}</span></div><span>{room.availableSeats} <small>/ {room.examCapacity}</small></span><input className="seat-input" type="number" min="1" max={room.availableSeats} disabled={!allocations[room.id]} value={allocations[room.id] ?? ''} onChange={(event) => setSeats(room.id, event.target.value)} /></div>)}</div>}
          <div className={`reservation-summary ${selectedCourse && reserved === Number(selectedCourse.candidateCount) ? 'ready' : ''}`}><span>Seats reserved</span><strong>{reserved} <small>/ {selectedCourse?.candidateCount ?? 0}</small></strong></div>
          <button className="primary-button schedule-button" disabled={busy || !courseId || !slotId || reserved !== Number(selectedCourse?.candidateCount)}>{busy ? 'Scheduling…' : <>Schedule examination <ArrowRight size={18}/></>}</button>
        </>}
      </section>
    </form>
  </>;
  */
  return <>
    <section className="welcome-row"><div><span className="eyebrow">Scheduling workspace</span><h1>Schedule an examination</h1><p>Choose an eligible course and session, then distribute candidates across rooms.</p></div></section>
    <form className="scheduler-layout capacity-layout" onSubmit={submit}>
      <section className="form-card course-selection-card">
        <div className="section-heading"><div><span className="eyebrow">1. Course and session</span><h2>Select the examination</h2></div><BookOpenCheck size={22}/></div>
        {loading ? <ContentSkeleton variant="rows"/> : <>
          <label>Course<select value={courseId} onChange={(event) => setCourseId(event.target.value)} required><option value="">Select a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} — {course.courseName || 'Untitled course'} ({course.candidateCount} candidates)</option>)}</select></label>
          <label>Exam session<select value={slotId} onChange={(event) => setSlotId(event.target.value)} required><option value="">Select a date and session</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{displayDate(slot.examDate)} · {slot.session === 'MORNING' ? 'Morning' : 'Afternoon'} ({displaySession(slot)})</option>)}</select></label>
          {slots.length === 0 && <p className="field-note">No sessions exist yet. A Super Administrator must add examination dates first.</p>}
          {selectedSlot && <div className="session-preview"><CalendarDays size={18}/><div><span>Selected examination session</span><strong>{displayDate(selectedSlot.examDate)} · {selectedSlot.session === 'MORNING' ? 'Morning' : 'Afternoon'}</strong></div><b>{displaySession(selectedSlot)}</b></div>}
        </>}
      </section>
      <section className="form-card capacity-board-card">
        <div className="section-heading"><div><span className="eyebrow">2. Room allocation</span><h2>Capacity board</h2></div>{selectedCourse && <span className="candidate-badge">{selectedCourse.candidateCount} candidates</span>}</div>
        {!slotId && <p className="muted empty-copy">Choose an exam session to see the room capacity board.</p>}
        {slotId && roomLoading && <ContentSkeleton variant="board"/>}
        {slotId && !roomLoading && <>
          <div className="capacity-legend"><span><i className="legend-open"/>Available</span><span><i className="legend-limited"/>Limited</span><span><i className="legend-full"/>Full</span><span><i className="legend-selected"/>Selected</span></div>
          {rooms.length === 0 ? <p className="muted empty-copy">No active rooms are available.</p> : <div className="capacity-groups">{roomsByLocation.map((group) => <section className="capacity-group" key={group.location}><header><MapPin size={16}/><strong>{group.location}</strong><span>{group.rooms.length} rooms</span></header><div className="room-capacity-grid">{group.rooms.map((room) => { const selected = Object.hasOwn(allocations, room.id) && allocations[room.id] !== undefined; const percentage = Math.round((Number(room.availableSeats) / Number(room.examCapacity)) * 100); const status = room.availableSeats === 0 ? 'full' : percentage <= 35 ? 'limited' : 'open'; const blocked = !selected && reserved >= Number(selectedCourse?.candidateCount ?? 0); return <article className={`capacity-tile ${status} ${selected ? 'selected' : ''}`} key={room.id}><button type="button" onClick={() => toggleRoom(room)} disabled={blocked || room.availableSeats === 0} aria-pressed={selected}><div><span className="room-number">{room.roomNumber}</span><span className="room-capacity-text">{room.availableSeats} of {room.examCapacity} seats free</span></div><span className="availability-percent">{percentage}%</span><div className="capacity-meter"><span style={{ width: `${percentage}%` }}/></div></button>{selected && <label className="tile-seat-input"><span>Reserve seats</span><input type="number" min="1" max={room.availableSeats} value={allocations[room.id] ?? ''} onChange={(event) => setSeats(room.id, event.target.value)} /></label>}</article>; })}</div></section>)}</div>}
          <section className={`allocation-tray ${selectedCourse && reserved === Number(selectedCourse.candidateCount) ? 'ready' : ''}`}><div className="allocation-tray-heading"><div><span>Allocation summary</span><strong>{reserved} / {selectedCourse?.candidateCount ?? 0} seats reserved</strong></div><b>{Math.max(0, Number(selectedCourse?.candidateCount ?? 0) - reserved)} remaining</b></div><div className="selected-room-chips">{Object.entries(allocations).filter(([, seats]) => Number(seats) > 0).map(([roomId, seats]) => { const room = rooms.find((item) => item.id === roomId); return room && <span key={roomId}>{room.roomNumber}<b>{seats}</b><button type="button" onClick={() => toggleRoom(room)} aria-label={`Remove room ${room.roomNumber}`}><X size={13}/></button></span>; })}{reserved === 0 && <span className="tray-empty">Select one or more room cards to begin allocating seats.</span>}</div></section>
          <button className="primary-button schedule-button" disabled={busy || !courseId || !slotId || reserved !== Number(selectedCourse?.candidateCount)}>{busy ? 'Scheduling…' : <>Schedule examination <ArrowRight size={18}/></>}</button>
        </>}
      </section>
    </form>
  </>;
}

function UploadCard({ title, description, accept, onUpload, busy, disabled = false, templateUrl }) { const [file, setFile] = useState(null); async function submit(event) { event.preventDefault(); if (file && !disabled) await onUpload(file); setFile(null); event.target.reset(); } return <form className="upload-card" onSubmit={submit}><div className="upload-icon"><FileSpreadsheet size={22}/></div><h2>{title}</h2><p>{description}</p>{templateUrl && <a className="template-link" href={templateUrl} download><FileDown size={15}/>Download sample CSV</a>}<label className="file-picker"><Upload size={17}/><span>{file?.name ?? 'Choose CSV or XLSX file'}</span><input type="file" accept={accept} disabled={disabled} onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label><button className="secondary-button" disabled={disabled || busy || !file}>{busy ? 'Importing…' : 'Import file'}</button></form>; }

function Imports({ token, period, notify }) { const [busy, setBusy] = useState(''); async function upload(key, path, file) { setBusy(key); try { const response = await api.upload(token, path, file); notify('success', response.message); } catch (error) { notify('error', friendlyError(error)); } finally { setBusy(''); } } return <><section className="welcome-row"><div><span className="eyebrow">Data management</span><h1>Import examination data</h1><p>Import validated source spreadsheets. Existing rooms and enrolments are safely synchronized.</p></div></section><div className="import-grid"><UploadCard title="Department access" description="Email in the first column, followed by course-code prefixes such as CS or EE." accept=".csv,.xlsx" busy={busy === 'permissions'} onUpload={(file) => upload('permissions', '/admin/imports/admin-course-permissions', file)}/><UploadCard title="Rooms and capacities" description="Import room number, location, and examination capacity. Room number is the unique key." accept=".csv,.xlsx" busy={busy === 'rooms'} onUpload={(file) => upload('rooms', '/admin/imports/rooms', file)}/><UploadCard title="Course enrolments" description={period ? `Upload enrolments for ${period.name}. Scheduled courses will be skipped.` : 'Choose an examination period above before uploading enrolments.'} accept=".csv,.xlsx" busy={busy === 'enrolments'} onUpload={(file) => upload('enrolments', `/admin/exam-periods/${period.id}/imports/course-enrollments`, file)}/></div></>; }

function ImportedDataExplorer({ token, period, reloadKey, notify, onRecordsChanged }) {
  const [tab, setTab] = useState('permissions');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [showAdminsWithoutPrefixes, setShowAdminsWithoutPrefixes] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [cachedResult, setResult] = useState({ tab: 'permissions', data: EMPTY_IMPORT_RESULT });
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState('');
  const [pendingDeletion, setPendingDeletion] = useState(null);
  const cacheRef = useRef(new Map());

  useEffect(() => { setSearch(''); setFilter(''); setShowAdminsWithoutPrefixes(false); setPage(1); }, [tab, period?.id]);

  const queryKey = useMemo(() => JSON.stringify({ reloadKey, tab, periodId: period?.id ?? '', page, pageSize, search: search.trim(), filter, showAdminsWithoutPrefixes }), [reloadKey, tab, period?.id, page, pageSize, search, filter, showAdminsWithoutPrefixes]);

  useEffect(() => {
    let cancelled = false;
    const cached = cacheRef.current.get(queryKey);
    if (cached) {
      setResult({ tab, data: cached });
      setLoading(false);
      return () => { cancelled = true; };
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const query = { page, pageSize, search };
        let response;
        if (tab === 'rooms') response = await api.importRoomsData(token, { ...query, location: filter });
        else if (tab === 'enrollments') response = await api.importEnrollmentData(token, period.id, query);
        else response = await api.importPermissionsData(token, { ...query, status: filter, showWithoutPrefixes: String(showAdminsWithoutPrefixes) });
        const normalizedResponse = normalizeImportResult(response);
        cacheRef.current.set(queryKey, normalizedResponse);
        if (!cancelled) setResult({ tab, data: normalizedResponse });
      } catch (error) {
        if (!cancelled) notify('error', friendlyError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [token, period?.id, tab, page, pageSize, search, filter, showAdminsWithoutPrefixes, queryKey]);

  const tabs = [
    { id: 'permissions', label: 'Department access', count: 'Prefix permissions' },
    { id: 'rooms', label: 'Rooms', count: 'Room capacities' },
    { id: 'enrollments', label: 'Course enrolments', count: period?.name }
  ];
  const result = cachedResult.tab === tab ? cachedResult.data : EMPTY_IMPORT_RESULT;
  const visibleResult = result;
  const totalPages = visibleResult.pagination.totalPages;

  function deleteRecord(row) {
    const isRoom = tab === 'rooms';
    const label = isRoom ? `room ${row.roomNumber}` : `${row.courseCode} enrolments`;
    const safeguard = isRoom ? ' Rooms assigned to an examination cannot be deleted.' : ' Courses with scheduled examinations cannot be deleted.';
    setPendingDeletion({ type: 'one', row, title: `Delete ${label}?`, description: `This action permanently removes ${label} from the imported data.`, detail: safeguard.trim() });
  }

  async function performDeleteRecord(row) {
    const isRoom = tab === 'rooms';
    setDeleting(row.id);
    try {
      const response = isRoom
        ? await api.deleteImportedRoom(token, row.id)
        : await api.deleteImportedCourseEnrollment(token, period.id, row.id);
      cacheRef.current.clear();
      onRecordsChanged();
      setPendingDeletion(null);
      notify('success', response.message);
    } catch (error) {
      notify('error', friendlyError(error));
    } finally {
      setDeleting('');
    }
  }

  function deleteAllRecords() {
    const isRoom = tab === 'rooms';
    const label = isRoom ? 'all imported rooms' : `all course enrolments for ${period.name}`;
    const safeguard = isRoom ? ' Rooms allocated to examinations will prevent this action.' : ' Scheduled examinations will prevent this action.';
    setPendingDeletion({ type: 'all', title: `Delete ${label}?`, description: `This permanently removes ${label}. This cannot be undone.`, detail: safeguard.trim() });
  }

  async function performDeleteAllRecords() {
    const isRoom = tab === 'rooms';
    setDeleting('all');
    try {
      const response = isRoom
        ? await api.deleteAllImportedRooms(token)
        : await api.deleteAllImportedCourseEnrollments(token, period.id);
      cacheRef.current.clear();
      onRecordsChanged();
      setPendingDeletion(null);
      notify('success', response.message);
    } catch (error) {
      notify('error', friendlyError(error));
    } finally {
      setDeleting('');
    }
  }

  return <><section className="import-data-section">
    <div className="import-data-heading"><div><span className="eyebrow">Imported data</span><h2>Review synchronized records</h2><p>Search and filter the data currently available to the scheduling engine.</p></div><span className="record-count">{visibleResult.pagination.total} records</span></div>
    <div className="data-tabs" role="tablist">{tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => { if (tab !== item.id) { setLoading(true); setTab(item.id); } }}><strong>{item.label}</strong><span>{item.count}</span></button>)}</div>
    <div className="data-toolbar"><label className="table-search"><Search size={18}/><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={tab === 'rooms' ? 'Search room or block' : tab === 'permissions' ? 'Search email or course prefix' : 'Search course code or name'} /></label>{tab === 'rooms' && <select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} aria-label="Filter by location"><option value="">All locations</option>{(visibleResult.filters?.locations ?? []).map((location) => <option key={location} value={location}>{location}</option>)}</select>}{tab === 'permissions' && <select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} aria-label="Filter by status"><option value="">All accounts</option><option value="active">Active</option><option value="inactive">Inactive</option></select>}<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Rows per page"><option value="10">10 per page</option><option value="25">25 per page</option><option value="50">50 per page</option></select>{(tab === 'rooms' || tab === 'enrollments') && <button className="danger-button" disabled={loading || deleting === 'all' || result.pagination.total === 0} onClick={deleteAllRecords}><Trash2 size={16}/>{deleting === 'all' ? 'Deleting…' : 'Delete all'}</button>}</div>
    {tab === 'permissions' && <div className="prefix-toggle-row"><label className="filter-toggle"><input type="checkbox" checked={showAdminsWithoutPrefixes} onChange={(event) => { setShowAdminsWithoutPrefixes(event.target.checked); setPage(1); }}/><span>Show administrators with no course prefixes</span></label><span>Hidden by default to focus on assigned course access.</span></div>}
    <div className="data-table-wrap">{loading ? <ContentSkeleton variant="table"/> : <table className="data-table">{tab === 'permissions' && <><thead><tr><th>Department Administrator</th><th>Status</th><th>Course prefixes</th></tr></thead><tbody>{result.rows.map((row) => { const prefixes = Array.isArray(row.coursePrefixes) ? row.coursePrefixes : []; return <tr key={row.id}><td><strong>{row.email}</strong></td><td><span className={`status-chip ${row.isActive ? 'active' : 'inactive'}`}>{row.isActive ? 'Active' : 'Inactive'}</span></td><td><div className="prefix-chips">{prefixes.length ? prefixes.map((prefix) => <span key={prefix}>{prefix}</span>) : <em>No prefixes imported</em>}</div></td></tr>; })}</tbody></>}{tab === 'rooms' && <><thead><tr><th>Room</th><th>Location / block</th><th>Exam capacity</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>{result.rows.map((row) => <tr key={row.id}><td><strong>{row.roomNumber}</strong></td><td>{row.location}</td><td><b>{row.examCapacity}</b> seats</td><td><span className={`status-chip ${row.isActive ? 'active' : 'inactive'}`}>{row.isActive ? 'Active' : 'Inactive'}</span></td><td><button className="table-delete-button" disabled={Boolean(deleting)} onClick={() => deleteRecord(row)} aria-label={`Delete room ${row.roomNumber}`} title={`Delete room ${row.roomNumber}`}><Trash2 size={16}/></button></td></tr>)}</tbody></>}{tab === 'enrollments' && <><thead><tr><th>Course code</th><th>Course name</th><th>Enrolled candidates</th><th aria-label="Actions"/></tr></thead><tbody>{result.rows.map((row) => <tr key={row.id}><td><strong>{row.courseCode}</strong></td><td>{row.courseName || '—'}</td><td><b>{row.candidateCount}</b> candidates</td><td><button className="table-delete-button" disabled={Boolean(deleting)} onClick={() => deleteRecord(row)} aria-label={`Delete ${row.courseCode} enrolments`} title={`Delete ${row.courseCode} enrolments`}><Trash2 size={16}/></button></td></tr>)}</tbody></>}</table>}{!loading && result.rows.length === 0 && <div className="table-empty">No matching records found.</div>}</div>
    <footer className="table-pagination"><span>Showing {result.rows.length ? ((result.pagination.page - 1) * result.pagination.pageSize) + 1 : 0}–{Math.min(result.pagination.page * result.pagination.pageSize, result.pagination.total)} of {result.pagination.total}</span><div><button className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="secondary-button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer>
  </section>{pendingDeletion && <ConfirmDialog title={pendingDeletion.title} description={pendingDeletion.description} detail={pendingDeletion.detail} busy={Boolean(deleting)} onCancel={() => setPendingDeletion(null)} onConfirm={() => pendingDeletion.type === 'one' ? performDeleteRecord(pendingDeletion.row) : performDeleteAllRecords()}/>}</>;
}

function ImportsExplorer({ token, period, notify }) {
  const [busy, setBusy] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  async function upload(key, path, file) { setBusy(key); try { const response = await api.upload(token, path, file); setReloadKey((value) => value + 1); notify('success', response.message); } catch (error) { notify('error', friendlyError(error)); } finally { setBusy(''); } }
  return <><section className="welcome-row"><div><span className="eyebrow">Data management</span><h1>Import examination data</h1><p>Each valid rooms or enrolments file replaces the corresponding imported dataset in full.</p></div></section><div className="import-grid"><UploadCard title="Department access" description="Email in the first column, followed by course-code prefixes such as CS or EE." templateUrl="/templates/department-access-template.csv" accept=".csv,.xlsx" busy={busy === 'permissions'} onUpload={(file) => upload('permissions', '/admin/imports/admin-course-permissions', file)}/><UploadCard title="Rooms and capacities" description="A valid file replaces every imported room. Existing exam allocations must be removed first." templateUrl="/templates/rooms-template.csv" accept=".csv,.xlsx" busy={busy === 'rooms'} onUpload={(file) => upload('rooms', '/admin/imports/rooms', file)}/><UploadCard title="Course enrolments" description={`A valid file replaces all enrolments for ${period.name}. Scheduled examinations must be removed first.`} templateUrl="/templates/course-enrolments-template.csv" accept=".csv,.xlsx" busy={busy === 'enrolments'} onUpload={(file) => upload('enrolments', `/admin/exam-periods/${period.id}/imports/course-enrollments`, file)}/></div><ImportedDataExplorer token={token} period={period} reloadKey={reloadKey} notify={notify} onRecordsChanged={() => setReloadKey((value) => value + 1)}/></>;
}

function Administration({ token, periods, period, onPeriodDataChanged, notify }) {
  const [admins, setAdmins] = useState([]); const [loading, setLoading] = useState(true); const [form, setForm] = useState({ email: '', password: '' }); const [slotDate, setSlotDate] = useState(''); const [busy, setBusy] = useState(''); const [passwordTarget, setPasswordTarget] = useState(null); const [temporaryPassword, setTemporaryPassword] = useState('');
  async function loadAdmins() { setLoading(true); try { const result = await api.departmentAdmins(token); setAdmins(result.users); } catch (error) { notify('error', friendlyError(error)); } finally { setLoading(false); } }
  useEffect(() => { loadAdmins(); }, [token]);
  async function addAdmin(event) { event.preventDefault(); setBusy('create'); try { await api.createDepartmentAdmin(token, form); setForm({ email: '', password: '' }); await loadAdmins(); notify('success', 'Department Admin created with a temporary password.'); } catch (error) { notify('error', friendlyError(error)); } finally { setBusy(''); } }
  async function toggleAdmin(admin) { setBusy(admin.id); try { await api.setDepartmentAdminStatus(token, admin.id, !admin.isActive); await loadAdmins(); notify('success', `${admin.email} is now ${admin.isActive ? 'inactive' : 'active'}.`); } catch (error) { notify('error', friendlyError(error)); } finally { setBusy(''); } }
  function resetPassword(admin) { setTemporaryPassword(''); setPasswordTarget(admin); }
  async function saveTemporaryPassword(event) { event.preventDefault(); if (!passwordTarget || temporaryPassword.length < 8) return; setBusy(passwordTarget.id); try { await api.setDepartmentAdminPassword(token, passwordTarget.id, temporaryPassword); notify('success', `Temporary password set for ${passwordTarget.email}.`); setPasswordTarget(null); setTemporaryPassword(''); } catch (error) { notify('error', friendlyError(error)); } finally { setBusy(''); } }
  async function generateSlots(event) { event.preventDefault(); if (!period || !slotDate) return; const selectedDate = slotDate; if (selectedDate < period.startDate || selectedDate > period.endDate) { notify('error', `Choose a date from ${displayDate(period.startDate)} to ${displayDate(period.endDate)}.`); return; } setBusy('slots'); try { const result = await api.createSlots(token, period.id, [selectedDate]); setSlotDate(''); await onPeriodDataChanged(); notify('success', `${result.slots.length} sessions created for ${displayDate(selectedDate)}.`); } catch (error) { notify('error', friendlyError(error)); } finally { setBusy(''); } }
  async function download(type, adminId) { if (!period) return; setBusy(type); try { if (type === 'consolidated') await api.exportConsolidated(token, period.id); else await api.exportDepartmentAdmin(token, period.id, adminId); } catch (error) { notify('error', friendlyError(error)); } finally { setBusy(''); } }
  /* Replaced by accessible, application-native modal markup below.
  return <><section className="welcome-row"><div><span className="eyebrow">Examination administration</span><h1>Administration centre</h1><p>Manage administrators, create fixed examination sessions, and export approved timetables.</p></div></section><div className="admin-layout"><section className="form-card"><div className="section-heading"><div><span className="eyebrow">Access control</span><h2>Add Department Admin</h2></div><UsersRound size={22}/></div><form onSubmit={addAdmin}><label>IIT Patna email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="department@iitp.ac.in" required/></label><label>Temporary password<input type="password" minLength="8" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Minimum 8 characters" required/></label><button className="primary-button" disabled={busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Create Department Admin'}</button></form></section><section className="form-card"><div className="section-heading"><div><span className="eyebrow">Session setup</span><h2>Add two fixed sessions</h2></div><Clock3 size={22}/></div>{period ? <form onSubmit={generateSlots}><label>Examination date<input type="date" min={period.startDate} max={period.endDate} value={slotDate} onChange={(event) => setSlotDate(event.target.value)} required/></label><p className="field-note">Creates Morning 09:30–12:30 and Afternoon 14:30–17:30.</p><button className="secondary-button" disabled={busy === 'slots'}>{busy === 'slots' ? 'Creating…' : 'Create sessions'}</button></form> : <p className="muted">Choose an examination period above to create sessions.</p>}</section><section className="form-card"><div className="section-heading"><div><span className="eyebrow">Timetable reports</span><h2>Export CSV</h2></div><Download size={22}/></div><p className="muted">Download a consolidated timetable or a prefix-scoped departmental timetable.</p><button className="secondary-button full-width" disabled={!period || busy === 'consolidated'} onClick={() => download('consolidated')}>{busy === 'consolidated' ? 'Preparing…' : <><Download size={17}/>Consolidated timetable</>}</button></section></div><section className="admin-list-section"><div className="section-heading"><div><span className="eyebrow">Department accounts</span><h2>Department Administrators</h2></div><button className="icon-button outlined" onClick={loadAdmins} aria-label="Refresh administrators"><RefreshCw size={17}/></button></div>{loading ? <LoadingState label="Loading Department Admin accounts…"/> : admins.length === 0 ? <p className="muted empty-copy">No Department Admin accounts have been created yet.</p> : <div className="admin-table"><div className="admin-head"><span>Administrator</span><span>Status</span><span>Access</span><span>Actions</span></div>{admins.map((admin) => <div className="admin-row" key={admin.id}><div><strong>{admin.email}</strong><small>{admin.departmentCode || 'Prefix-based course access'}</small></div><span className={`status-chip ${admin.isActive ? 'active' : 'inactive'}`}>{admin.isActive ? 'Active' : 'Inactive'}</span><span>{admin.mustChangePassword ? 'Password change required' : 'Password set'}</span><div className="row-actions"><button className="text-button" disabled={busy === admin.id} onClick={() => resetPassword(admin)}>Set password</button><button className="text-button" disabled={busy === admin.id} onClick={() => toggleAdmin(admin)}>{admin.isActive ? 'Deactivate' : 'Activate'}</button><button className="icon-button outlined" disabled={!period || busy === admin.id} onClick={() => download(`department-${admin.id}`, admin.id)} title="Export timetable"><Download size={16}/></button></div></div>)}</div>}</section></>;
  */
  return <>
    <section className="welcome-row"><div><span className="eyebrow">Access control</span><h1>Department administrators</h1><p>Create Department Admin accounts, issue temporary passwords, and manage their access to the examination workspace.</p></div></section>
    <div className="admin-layout">
      <section className="form-card"><div className="section-heading"><div><span className="eyebrow">New account</span><h2>Create Department Admin</h2></div><UsersRound size={22}/></div><form onSubmit={addAdmin}><label>IIT Patna email<input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="department@iitp.ac.in" required/></label><label>Temporary password<input type="password" autoComplete="new-password" minLength="8" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 8 characters" required/></label><p className="field-note">The administrator will be required to replace this temporary password at their first sign in.</p><button className="primary-button" disabled={busy === 'create'}>{busy === 'create' ? 'Creating…' : <><Plus size={17}/>Create Department Admin</>}</button></form></section>
      <section className="form-card"><div className="section-heading"><div><span className="eyebrow">Session setup</span><h2>Add two fixed sessions</h2></div><Clock3 size={22}/></div>{period ? <form onSubmit={generateSlots}><label>Examination date<input type="date" min={period.startDate} max={period.endDate} value={slotDate} onChange={(event) => setSlotDate(event.target.value)} required/></label><p className="field-note">{displayPeriodSessionTimes(period)}</p><button className="secondary-button" disabled={busy === 'slots'}>{busy === 'slots' ? 'Creating…' : 'Create sessions'}</button></form> : <p className="muted">Choose an examination period above to create sessions.</p>}</section>
      <section className="form-card"><div className="section-heading"><div><span className="eyebrow">Timetable reports</span><h2>Export CSV</h2></div><Download size={22}/></div><p className="muted">Download a consolidated timetable or a prefix-scoped departmental timetable.</p><button className="secondary-button full-width" disabled={!period || busy === 'consolidated'} onClick={() => download('consolidated')}>{busy === 'consolidated' ? 'Preparing…' : <><Download size={17}/>Consolidated timetable</>}</button></section>
    </div>
    <section className="admin-list-section"><div className="section-heading"><div><span className="eyebrow">Department accounts</span><h2>Department Administrators</h2></div><button className="icon-button outlined" onClick={loadAdmins} aria-label="Refresh administrators"><RefreshCw size={17}/></button></div>{loading ? <ContentSkeleton variant="table"/> : admins.length === 0 ? <p className="muted empty-copy">No Department Admin accounts have been created yet.</p> : <div className="admin-table"><div className="admin-head"><span>Administrator</span><span>Status</span><span>Access</span><span>Actions</span></div>{admins.map((admin) => <div className="admin-row" key={admin.id}><div><strong>{admin.email}</strong><small>{admin.departmentCode || 'Prefix-based course access'}</small></div><span className={`status-chip ${admin.isActive ? 'active' : 'inactive'}`}>{admin.isActive ? 'Active' : 'Inactive'}</span><span>{admin.mustChangePassword ? 'Password change required' : 'Password set'}</span><div className="row-actions"><button className="text-button" disabled={busy === admin.id} onClick={() => resetPassword(admin)}>Set password</button><button className="text-button" disabled={busy === admin.id} onClick={() => toggleAdmin(admin)}>{admin.isActive ? 'Deactivate' : 'Activate'}</button><button className="icon-button outlined" disabled={!period || busy === `department-${admin.id}`} onClick={() => download(`department-${admin.id}`, admin.id)} title="Export timetable"><Download size={16}/></button></div></div>)}</div>}</section>
    {passwordTarget && <div className="modal-backdrop" role="presentation"><form className="modal-card password-modal" onSubmit={saveTemporaryPassword} role="dialog" aria-modal="true" aria-labelledby="temporary-password-title"><div className="modal-heading"><div><span className="eyebrow">Account security</span><h2 id="temporary-password-title">Set temporary password</h2></div><button className="icon-button" type="button" onClick={() => setPasswordTarget(null)} aria-label="Close"><X/></button></div><p className="muted">{passwordTarget.email} will be required to change this password on their next sign in.</p><label>New temporary password<input autoFocus type="password" minLength="8" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} placeholder="At least 8 characters" required /></label><p className="field-note">Do not share this password in unsecured channels.</p><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setPasswordTarget(null)}>Cancel</button><button className="primary-button" disabled={busy === passwordTarget.id || temporaryPassword.length < 8}>{busy === passwordTarget.id ? 'Saving…' : 'Set temporary password'}</button></div></form></div>}
  </>;
}

function Dashboard({ token, user, onLogout }) {
  const superAdmin = user.role === 'SUPER_ADMIN'; const [view, setView] = useState('overview'); const [periods, setPeriods] = useState([]); const [periodId, setPeriodId] = useState(localStorage.getItem('iitp.selected-period') ?? ''); const [timetable, setTimetable] = useState(null); const [slots, setSlots] = useState([]); const [loading, setLoading] = useState(true); const [toasts, setToasts] = useState([]); const [mobileOpen, setMobileOpen] = useState(false); const [downloadBusy, setDownloadBusy] = useState(false); const [theme, setTheme] = useState(() => localStorage.getItem('iitp.theme') ?? 'light'); const [examPendingDeletion, setExamPendingDeletion] = useState(null); const [deletingExam, setDeletingExam] = useState(false); const periodRequestRef = useRef(0); const toastSequenceRef = useRef(0);
  const period = periods.find((item) => item.id === periodId);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('iitp.theme', theme); }, [theme]);
  function dismissToast(id) { setToasts((current) => current.filter((toast) => toast.id !== id)); }
  function notify(type, text) { const id = ++toastSequenceRef.current; setToasts((current) => [...current.slice(-3), { id, type, text }]); window.setTimeout(() => dismissToast(id), type === 'error' ? 9000 : 5500); }
  async function loadPeriods() { const response = await api.examPeriods(token); setPeriods(response.examPeriods); setPeriodId((current) => response.examPeriods.some((item) => item.id === current) ? current : (response.examPeriods[0]?.id ?? '')); }
  async function loadPeriodData(id = periodId) {
    const requestId = ++periodRequestRef.current;
    if (!id) { setTimetable(null); setSlots([]); return; }

    const [timetableResult, slotsResult] = await Promise.allSettled([
      api.timetable(token, id),
      superAdmin ? api.adminSlots(token, id) : api.slots(token, id)
    ]);

    if (requestId !== periodRequestRef.current) return;

    if (timetableResult.status === 'fulfilled') {
      setTimetable(timetableResult.value);
    } else {
      throw timetableResult.reason;
    }

    if (slotsResult.status === 'fulfilled') {
      setSlots(slotsResult.value.slots);
    } else {
      setSlots([]);
      notify('error', `The timetable loaded, but exam sessions could not be loaded: ${friendlyError(slotsResult.reason)}`);
    }
  }
  useEffect(() => { setLoading(true); loadPeriods().catch((error) => notify('error', friendlyError(error))).finally(() => setLoading(false)); }, [token]);
  useEffect(() => { if (!periodId) return; localStorage.setItem('iitp.selected-period', periodId); loadPeriodData(periodId).catch((error) => notify('error', friendlyError(error))); }, [periodId]);
  async function createPeriod(data) { const result = await api.createExamPeriod(token, data); await loadPeriods(); setPeriodId(result.examPeriod.id); notify('success', `${result.examPeriod.name} was created.`); }
  function removeExam(exam) { setExamPendingDeletion(exam); }
  async function confirmRemoveExam() { if (!examPendingDeletion) return; setDeletingExam(true); try { await api.deleteExam(token, periodId, examPendingDeletion.id); await loadPeriodData(); notify('success', `${examPendingDeletion.course.courseCode} was deleted and its room capacity released.`); setExamPendingDeletion(null); } catch (error) { notify('error', friendlyError(error)); } finally { setDeletingExam(false); } }
  async function exportTimetable() { setDownloadBusy(true); try { if (superAdmin) await api.exportConsolidated(token, periodId); else await api.exportMyTimetable(token, periodId); } catch (error) { notify('error', friendlyError(error)); } finally { setDownloadBusy(false); } }
  /* Replaced by the readable markup below.
  return <div className="app-shell"><Sidebar user={user} view={view} onView={setView} onLogout={onLogout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/><main className="app-main"><header className="topbar"><button className="mobile-menu icon-button outlined" onClick={() => setMobileOpen(true)}><Menu/></button><PeriodPicker periods={periods} selectedId={periodId} onSelect={setPeriodId} superAdmin={superAdmin} onCreate={createPeriod}/><div className="topbar-role"><ShieldCheck size={17}/>{superAdmin ? 'Super Admin' : 'Department Admin'}</div></header><div className="content"><Notice notice={notice} onClose={() => setNotice(null)}/>{loading ? <LoadingState/> : <>{view === 'overview' && <Overview timetable={timetable} selectedPeriod={period} canDelete={Boolean(period)} onDelete={removeExam} downloading={downloadBusy} onDownload={exportTimetable}/>{view === 'schedule' && <Scheduler token={token} period={period} slots={slots} notify={notify} onDone={() => loadPeriodData()}/>{view === 'imports' && superAdmin && <Imports token={token} period={period} notify={notify}/>{view === 'administration' && superAdmin && <Administration token={token} periods={periods} period={period} onPeriodsChanged={loadPeriods} notify={notify}/>}</>}</div></main></div>;
  */
  return <div className="app-shell">
    <Sidebar user={user} view={view} onView={setView} onLogout={onLogout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} periods={periods} selectedId={periodId} onPeriodSelect={setPeriodId} onCreatePeriod={createPeriod} theme={theme} onThemeChange={setTheme}/>
    <main className="app-main">
      <header className="topbar">
        <button className="mobile-menu icon-button outlined" onClick={() => setMobileOpen(true)}><Menu/></button>
      </header>
      <div className="content">
        <ToastViewport toasts={toasts} onDismiss={dismissToast}/>
        {loading ? <DashboardSkeleton/> : <>
          {view === 'overview' && <Overview timetable={timetable} selectedPeriod={period} canDelete={Boolean(period)} onDelete={removeExam} downloading={downloadBusy} onDownload={exportTimetable} onRefresh={() => loadPeriodData()}/>} 
          {view === 'schedule' && <Scheduler token={token} period={period} slots={period ? slots.filter((slot) => slot.examDate >= period.startDate && slot.examDate <= period.endDate) : []} notify={notify} onDone={() => loadPeriodData()}/>} 
          {view === 'allocations' && <Allocations token={token} period={period} timetable={timetable} notify={notify}/>} 
          {view === 'imports' && superAdmin && (period ? <ImportsExplorer token={token} period={period} notify={notify}/> : <EmptyState icon={FileSpreadsheet} title="Create an examination period first" text="Course enrolments belong to an examination period. Use New period above before importing data."/>)} 
          {view === 'administration' && superAdmin && <Administration token={token} periods={periods} period={period} onPeriodDataChanged={() => loadPeriodData()} notify={notify}/>} 
        </>}
      </div>
    </main>{examPendingDeletion && <ConfirmDialog title={`Delete ${examPendingDeletion.course.courseCode} examination?`} description={`This removes ${examPendingDeletion.course.courseName} from the timetable and permanently releases its room reservations.`} detail="Students can be re-scheduled only by creating the examination again." busy={deletingExam} onCancel={() => setExamPendingDeletion(null)} onConfirm={confirmRemoveExam}/>} 
  </div>;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('iitp.access-token')); const [user, setUser] = useState(null); const [temporaryPassword, setTemporaryPassword] = useState(''); const [checking, setChecking] = useState(Boolean(token));
  useEffect(() => { if (!token) return; setChecking(true); api.me(token).then((result) => setUser(result.user)).catch(() => { localStorage.removeItem('iitp.access-token'); setToken(null); }).finally(() => setChecking(false)); }, [token]);
  async function login(email, password) { const result = await api.login(email, password); localStorage.setItem('iitp.access-token', result.accessToken); setTemporaryPassword(result.user.mustChangePassword ? password : ''); setUser(result.user); setToken(result.accessToken); }
  async function logout() { try { await api.logout(token); } catch { /* Client logout must still work if the server is unavailable. */ } localStorage.removeItem('iitp.access-token'); localStorage.removeItem('iitp.selected-period'); setUser(null); setToken(null); }
  if (checking) return <SplashScreen/>;
  if (checking) return <main className="boot-screen"><Brand/><LoadingState label="Opening the examination portal…"/></main>;
  if (!token || !user) return <Login onLogin={login}/>;
  if (user.mustChangePassword) return <PasswordChangeDialog token={token} user={user} temporaryPassword={temporaryPassword} onComplete={(updatedUser) => { setTemporaryPassword(''); setUser(updatedUser); }}/>;
  return <Dashboard token={token} user={user} onLogout={logout}/>;
}
