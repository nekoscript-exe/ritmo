import { useEffect, useReducer } from 'react';
import { clock } from '../domain';
import { initialTimer, timerReducer } from '../timer';
import { Icon } from './Icon';
export function FocusTimer() {
    const [{ minutes, remaining, running, finished }, dispatch] = useReducer(timerReducer, initialTimer);
    useEffect(() => {
        if (!running)
            return;
        const update = () => dispatch({ type: 'tick', now: Date.now() });
        const interval = window.setInterval(update, 250);
        document.addEventListener('visibilitychange', update);
        return () => { clearInterval(interval); document.removeEventListener('visibilitychange', update); };
    }, [running]);
    function toggle() {
        dispatch({ type: running ? 'pause' : 'start', now: Date.now() });
    }
    return <section className="card focus-card" id="focus" aria-labelledby="focus-title">
    <div className="card-heading"><h2 id="focus-title">Un momento de Focus</h2><span className="round-icon"><Icon name="focus"/></span></div>
    <p className="muted">Una cosa a la vez. El resto puede esperar.</p>
    <div className="timer-face" style={{ background: `conic-gradient(#3c9f85 ${(1 - remaining / (minutes * 60)) * 360}deg, #d9eae4 0deg)` }}><div><span className="timer-number" role="timer" aria-label={`${clock(remaining)} restantes`}>{clock(remaining)}</span><span className="eyebrow">TIEMPO PARA TI</span></div></div>
    <label className="duration-label">Duración<select value={minutes} disabled={running} onChange={e => dispatch({ type: 'configure', minutes: Number(e.target.value) })}><option value="15">15 minutos</option><option value="25">25 minutos</option><option value="45">45 minutos</option><option value="60">60 minutos</option></select></label>
    <div className="timer-actions"><button className="primary" onClick={toggle} disabled={!remaining}><Icon name={running ? 'pause' : 'play'} size={16}/>{running ? 'Pausar' : 'Iniciar'}</button><button className="icon-button reset-button" aria-label="Reiniciar temporizador" onClick={() => dispatch({ type: 'reset' })}><Icon name="reset"/></button></div>
    <p className="tiny muted" role="status">{finished ? 'Sesión terminada. Es momento de una pausa.' : 'Solo en esta pestaña · no se guarda al salir'}</p>
  </section>;
}
