import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, isUnauthorized } from './api';
import type { DayData, Section } from './models';
import { greeting, localDay, parseDay } from './domain';
import { Icon } from './components/Icon';
import { Landscape } from './components/Landscape';
import { Auth } from './components/Auth';
import { Calendar } from './components/Calendar';
import { FocusTimer } from './components/FocusTimer';
import { Habits } from './components/Habits';
import { Agenda } from './components/Agenda';
import { TasksPanel } from './components/TasksPanel';
const navigation: [
    Section,
    string
][] = [['Dashboard', 'dashboard'], ['Tareas', 'tasks'], ['Calendario', 'calendar'], ['Hábitos', 'habits'], ['Focus', 'focus'], ['Estadísticas', 'stats']];
export function App() {
    const [session, setSession] = useState<'checking' | 'signed' | 'anonymous'>('checking');
    const [identity, setIdentity] = useState('');
    const [day, setDay] = useState(localDay);
    const [now, setNow] = useState(new Date());
    const [epoch, setEpoch] = useState(0);
    const [result, setResult] = useState<{
        day: string;
        data: DayData;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [section, setSection] = useState<Section>('Dashboard');
    const [query, setQuery] = useState('');
    const lock = useRef(false);
    const data = result?.day === day ? result.data : null;
    const disabled = busy || loading || !data;
    useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
    function expire() { setSession('anonymous'); setResult(null); setIdentity(''); setQuery(''); setNotice(''); }
    useEffect(() => {
        if (session === 'anonymous')
            return;
        let active = true;
        setLoading(true);
        setResult(null);
        setError('');
        api.day(day).then(data => { if (active) {
            setResult({ day, data });
            setSession('signed');
        } }).catch(error => {
            if (!active)
                return;
            if (isUnauthorized(error))
                expire();
            else
                setError(errorMessage(error));
        }).finally(() => { if (active)
            setLoading(false); });
        return () => { active = false; };
        // epoch cambia al autenticar o reintentar; no se reconsulta por cada render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [day, epoch]);
    async function authenticate(action: 'login' | 'register', username: string, password: string) {
        if (lock.current)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        try {
            await api.account(action, username, password);
            setIdentity(username.toLowerCase());
            setSession('checking');
            setEpoch(value => value + 1);
        }
        catch (error) {
            setError(errorMessage(error));
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    }
    async function logout() {
        if (lock.current)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        try {
            await api.logout();
            expire();
            setSection('Dashboard');
        }
        catch (error) {
            setError(errorMessage(error));
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    }
    async function mutate(operation: () => Promise<unknown>, onSuccess?: () => void) {
        if (lock.current || !data)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        let saved = false;
        try {
            await operation();
            saved = true;
            onSuccess?.();
            const fresh = await api.day(day);
            setResult({ day, data: fresh });
        }
        catch (error) {
            if (isUnauthorized(error))
                expire();
            if (saved)
                setResult(null);
            setError((saved ? 'El cambio se guardó, pero no se pudo actualizar la vista. Recarga antes de repetir. ' : '') + errorMessage(error));
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    }
    function exportDay() {
        if (!data)
            return;
        const blob = new Blob([JSON.stringify({ day, ...data }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ritmo-${day}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('Se exportaron los hábitos y bloques de la fecha seleccionada.');
    }
    const alert = error && <div className="alert" role="alert">{error}{session !== 'anonymous' && <button className="text-button" disabled={busy || loading} onClick={() => setEpoch(v => v + 1)}>Reintentar consulta</button>}</div>;
    if (session === 'anonymous')
        return <>{alert}<Auth onSubmit={authenticate} busy={busy}/></>;
    if (session === 'checking')
        return <main className="checking"><span className="brand">ritmo.</span><p role="status">{loading ? 'Abriendo tu espacio…' : 'No se pudo consultar tu sesión.'}</p>{alert}<a href="/legacy.html">Interfaz anterior</a></main>;
    const completed = data?.habits.filter(h => h.done).length ?? 0;
    const isDashboard = section === 'Dashboard';
    return <div className="app-shell"><a className="skip-link" href="#main">Saltar al contenido</a>
    <aside className="sidebar"><a className="brand" href="/"><span className="brand-mark"><Icon name="leaf" size={27}/></span>ritmo<span className="brand-dot">.</span></a><p className="sidebar-caption">TU ESPACIO PERSONAL</p><nav aria-label="Navegación principal">{navigation.map(([name, icon]) => <button key={name} aria-label={name} className={section === name ? 'nav-item active' : 'nav-item'} aria-current={section === name ? 'page' : undefined} onClick={() => setSection(name)}><Icon name={icon}/><span>{name}</span></button>)}</nav><div className="sidebar-bottom"><div className="sidebar-note"><span className="small-leaf"><Icon name="leaf" size={24}/></span><strong>Lo pequeño también cuenta.</strong><p>Un paso cada día es una nueva forma de avanzar.</p></div><a className="legacy-link" href="/legacy.html">Interfaz anterior <Icon name="arrow" size={15}/></a><button className="nav-item" disabled={busy || loading} onClick={() => void logout()}><Icon name="logout"/>Cerrar sesión</button><span className="sidebar-version">RITMO 2.0 · UN DÍA A LA VEZ</span></div></aside>
    <div className="main-shell"><header className="topbar"><label className="search"><Icon name="search" size={18}/><span className="sr-only">Buscar hábitos y bloques del día</span><input type="search" placeholder="Buscar en tu día…" value={query} onChange={e => setQuery(e.target.value)}/></label><div className="topbar-actions"><button className="export-button" disabled={disabled} onClick={exportDay}><Icon name="export" size={17}/><span>Exportar día</span></button><button className="icon-button notification-button" aria-label="Notificaciones: información de disponibilidad" onClick={() => setNotice('Las notificaciones aún no están disponibles. No hay un servicio de avisos conectado.')}><Icon name="bell"/></button><details className="profile"><summary aria-label="Abrir perfil"><span className="avatar">{identity ? identity[0].toUpperCase() : <Icon name="leaf" size={18}/>}</span><span>{identity || 'Mi cuenta'}</span><span className="profile-chevron">⌄</span></summary><div className="profile-menu"><strong>{identity || 'Sesión activa'}</strong><p>La sesión se verifica en el servidor. El nombre aparece tras iniciar sesión en esta pestaña.</p><button className="text-button" disabled={busy || loading} onClick={() => void logout()}>Cerrar sesión</button></div></details></div></header>
    <main id="main" tabIndex={-1}><div className="page-heading"><div><p className="eyebrow">TU DÍA, CON INTENCIÓN</p><h1>{section === 'Dashboard' ? 'Mi dashboard' : section}</h1></div><span className="current-date"><span className="date-dot"/>{new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</span></div>
      {alert}{notice && <div className="notice" role="status">{notice}<button className="text-button" onClick={() => setNotice('')}>Cerrar</button></div>}
      <div className="dashboard-grid"><div className="content-column">
        {isDashboard && <section className="welcome-card"><div className="welcome-copy"><span className="welcome-label"><span />UN NUEVO MOMENTO PARA TI</span><h2>{greeting(now.getHours())}{identity ? `, ${identity}` : ''}<span className="welcome-wave">☀</span></h2><p>No necesitas hacerlo todo.<br />Solo empieza por lo que importa.</p><div className="welcome-summary">{data ? <><strong>{data.blocks.length}</strong> bloques en agenda <span>·</span><strong>{completed}/{data.habits.length}</strong> hábitos completados</> : 'Consultando tu actividad…'}</div><button className="welcome-link" onClick={() => setSection('Calendario')}>Vamos a tu día <Icon name="arrow" size={17}/></button></div><Landscape /></section>}
        {section === 'Tareas' && <label className="task-date-picker">Fecha para tareas y progreso<input type="date" min="0001-01-01" max="9999-12-31" value={day} disabled={busy || loading} onChange={e => { if (e.target.validity.valid && e.target.value) setDay(e.target.value); }}/></label>}
        {(isDashboard || section === 'Tareas') && <TasksPanel day={day} dashboard={isDashboard} blocked={busy || loading} onUnauthorized={expire} onBusyChange={setBusy}/>}
        {(isDashboard || section === 'Calendario') && <><div className="selected-date"><h2>{localDay(now) === day ? 'Hoy' : 'Día seleccionado'}</h2><label><span className="sr-only">Fecha de la agenda</span><input type="date" min="0001-01-01" max="9999-12-31" value={day} disabled={busy || loading} onChange={e => { if (e.target.validity.valid && e.target.value)
        setDay(e.target.value); }}/></label></div>{data ? <Agenda day={day} blocks={data.blocks} busy={disabled} query={query} mutate={mutate}/> : <div className="card loading-card" role="status">{loading ? 'Cargando agenda…' : 'La agenda no está disponible. Reintenta la consulta.'}</div>}</>}
        {(isDashboard || section === 'Hábitos') && (data ? <Habits day={day} habits={data.habits} busy={disabled} query={query} mutate={mutate}/> : <div className="card loading-card" role="status">{loading ? 'Cargando hábitos…' : 'Los hábitos no están disponibles.'}</div>)}
        {section === 'Estadísticas' && <section className="card stats-card"><span className="round-icon"><Icon name="stats"/></span><h2>Tu constancia, día a día</h2><p className="muted">Resumen de la fecha seleccionada, calculado con tus datos.</p>{data ? <div className="stats-values"><div><strong>{data.blocks.length}</strong><span>bloques de horario</span></div><div><strong>{completed}/{data.habits.length}</strong><span>hábitos completados</span></div></div> : <p>Resumen no disponible.</p>}<p className="tiny muted">Las tendencias y el historial estadístico están pendientes.</p></section>}
        {section === 'Focus' && <section className="card focus-intro"><span className="eyebrow">BAJA EL RUIDO</span><h2>Haz una pausa.<br />Encuentra tu concentración.</h2><p className="muted">Elige una duración en el temporizador y dedica este momento a una sola cosa.</p><Landscape /></section>}
      </div><aside className="right-column" aria-label="Calendario y concentración"><Calendar selected={day} disabled={busy || loading} onSelect={setDay}/><FocusTimer /><div className="daily-note"><Icon name="leaf" size={22}/><p>«No se trata de tener tiempo.<br />Se trata de hacer espacio.»</p><span>ENCUENTRA TU RITMO</span></div></aside></div>
      <footer className="page-footer"><span>Hecho para avanzar con calma.</span><span>Ritmo · Tu espacio, a tu ritmo.</span></footer>
    </main></div></div>;
}
