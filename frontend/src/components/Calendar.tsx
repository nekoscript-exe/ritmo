import { useEffect, useState } from 'react';
import { localDay, monthCells, parseDay } from '../domain';
import { Icon } from './Icon';
export function Calendar({ selected, onSelect, disabled }: {
    selected: string;
    onSelect: (day: string) => void;
    disabled: boolean;
}) {
    const [month, setMonth] = useState(() => { const d = parseDay(selected); d.setDate(1); return d; });
    useEffect(() => { const d = parseDay(selected); d.setDate(1); setMonth(d); }, [selected]);
    const cells = monthCells(month.getFullYear(), month.getMonth());
    const label = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(month);
    function move(offset: number) { const d = new Date(month); d.setMonth(d.getMonth() + offset); if (d.getFullYear() >= 1 && d.getFullYear() <= 9999)
        setMonth(d); }
    return <section className="card calendar-card" aria-labelledby="calendar-title">
    <div className="card-heading"><h2 id="calendar-title">Tu calendario</h2><span className="subtle-label">MES</span></div>
    <div className="month-nav"><strong aria-live="polite">{label}</strong><div><button className="icon-button" aria-label="Mes anterior" onClick={() => move(-1)} disabled={disabled || month.getFullYear() === 1 && month.getMonth() === 0}><Icon name="left" size={16}/></button><button className="icon-button" aria-label="Mes siguiente" onClick={() => move(1)} disabled={disabled || month.getFullYear() === 9999 && month.getMonth() === 11}><Icon name="right" size={16}/></button></div></div>
    <div className="calendar-grid"><div className="calendar-weekdays">{['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(d => <span key={d}>{d}</span>)}</div>
      <div className="calendar-dates">{cells.map((day, index) => day ? <button key={day} disabled={disabled} aria-pressed={day === selected} aria-current={day === localDay() ? 'date' : undefined} aria-label={new Intl.DateTimeFormat('es-MX', { dateStyle: 'full' }).format(parseDay(day))} className={`${day === selected ? 'selected' : ''} ${day === localDay() ? 'is-today' : ''}`} onClick={() => onSelect(day)}>{Number(day.slice(-2))}</button> : <span key={`empty-${index}`}/>)}</div>
    </div>
    <button className="text-button today-button" disabled={disabled} onClick={() => onSelect(localDay())}>Volver a hoy <Icon name="arrow" size={16}/></button>
  </section>;
}
